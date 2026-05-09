import json
import os

import stripe
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from marketplace.models import Proposal, WalletTransaction
from .models import PaymentAttempt, ProcessedStripeEvent
from .serializers import CreateIntentSerializer, PaymentAttemptSerializer


stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")


def _stripe_payload_to_dict(payload):
	if hasattr(payload, "to_dict_recursive"):
		return payload.to_dict_recursive()
	if hasattr(payload, "to_dict"):
		return payload.to_dict()
	if isinstance(payload, dict):
		return payload
	try:
		return dict(payload)
	except Exception:
		return {"value": str(payload)}


def _sync_successful_payment(attempt: PaymentAttempt):
	if WalletTransaction.objects.filter(external_reference=attempt.intent_id).exists():
		return

	WalletTransaction.objects.create(
		proposal=attempt.proposal,
		investor=attempt.investor,
		entrepreneur=attempt.proposal.entrepreneur,
		processed_by=attempt.investor,
		action=WalletTransaction.Action.INVEST,
		method=WalletTransaction.Method.STRIPE,
		amount=attempt.amount,
		external_reference=attempt.intent_id,
		notes="Stripe investment",
	)


class CreatePaymentIntentView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def post(self, request):
		if request.user.role != User.Roles.INVESTOR:
			raise PermissionDenied("Only investors can create payment intents.")

		if not stripe.api_key:
			return Response({"detail": "Stripe is not configured."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

		serializer = CreateIntentSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		proposal = Proposal.objects.get(pk=serializer.validated_data["proposal"])
		if proposal.status != Proposal.Status.APPROVED:
			raise ValidationError("Only approved proposals can be funded.")

		amount = serializer.validated_data["amount"]
		intent = stripe.PaymentIntent.create(
			amount=int(float(amount) * 100),
			currency="usd",
			automatic_payment_methods={"enabled": True},
			metadata={"proposal_id": proposal.id, "investor_id": request.user.id},
		)
		attempt = PaymentAttempt.objects.create(
			investor=request.user,
			proposal=proposal,
			amount=amount,
			intent_id=intent.id,
			client_secret=intent.client_secret or "",
			status=PaymentAttempt.Status.PENDING,
			raw_payload=_stripe_payload_to_dict(intent),
		)
		return Response(PaymentAttemptSerializer(attempt).data, status=status.HTTP_201_CREATED)


class PaymentStatusView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request, intent_id: str):
		try:
			attempt = PaymentAttempt.objects.get(intent_id=intent_id)
		except PaymentAttempt.DoesNotExist as exc:
			raise ValidationError("Payment intent not found.") from exc

		if request.user.role != User.Roles.ADMIN and attempt.investor_id != request.user.id:
			raise PermissionDenied("Not authorized to view this payment attempt.")

		if stripe.api_key:
			intent = stripe.PaymentIntent.retrieve(intent_id)
			stripe_status = intent.status
			mapped_status = {
				"requires_payment_method": PaymentAttempt.Status.PENDING,
				"requires_confirmation": PaymentAttempt.Status.PENDING,
				"processing": PaymentAttempt.Status.PROCESSING,
				"succeeded": PaymentAttempt.Status.SUCCEEDED,
				"canceled": PaymentAttempt.Status.CANCELED,
			}.get(stripe_status, PaymentAttempt.Status.FAILED)
			attempt.status = mapped_status
			attempt.raw_payload = _stripe_payload_to_dict(intent)
			attempt.save(update_fields=["status", "raw_payload", "updated_at"])

			if mapped_status == PaymentAttempt.Status.SUCCEEDED:
				_sync_successful_payment(attempt)

		return Response(PaymentAttemptSerializer(attempt).data)


@csrf_exempt
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def stripe_webhook(request):
	payload = request.body
	sig_header = request.META.get("HTTP_STRIPE_SIGNATURE")
	secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

	try:
		if secret and sig_header:
			event = stripe.Webhook.construct_event(payload=payload, sig_header=sig_header, secret=secret)
		else:
			event = json.loads(payload.decode("utf-8"))
	except Exception:
		return HttpResponse(status=400)

	event_id = event.get("id")
	if event_id and ProcessedStripeEvent.objects.filter(event_id=event_id).exists():
		return HttpResponse(status=200)

	event_type = event.get("type")
	data_object = event.get("data", {}).get("object", {})

	if event_type == "payment_intent.succeeded":
		intent_id = data_object.get("id")
		try:
			attempt = PaymentAttempt.objects.get(intent_id=intent_id)
			attempt.status = PaymentAttempt.Status.SUCCEEDED
			attempt.raw_payload = event
			attempt.save(update_fields=["status", "raw_payload", "updated_at"])
			_sync_successful_payment(attempt)
		except PaymentAttempt.DoesNotExist:
			pass

	if event_id:
		ProcessedStripeEvent.objects.create(event_id=event_id)
	return HttpResponse(status=200)
