from django.utils import timezone
from django.http import FileResponse
from rest_framework import generics, permissions, status
from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError

from .models import EntrepreneurVerification, User
from .serializers import (
	AdminVerificationReviewSerializer,
	EntrepreneurVerificationSerializer,
	RegisterSerializer,
	UserSerializer,
	UserUpdateSerializer,
)


VERIFICATION_FILE_FIELDS = {"identity_front", "identity_back", "passport_photo", "proof_video_file"}


class RegisterView(generics.CreateAPIView):
	queryset = User.objects.all()
	serializer_class = RegisterSerializer
	permission_classes = [permissions.AllowAny]


class MeView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		return Response(UserSerializer(request.user, context={"request": request}).data)

	def patch(self, request):
		serializer = UserUpdateSerializer(request.user, data=request.data, partial=True)
		serializer.is_valid(raise_exception=True)
		serializer.save()
		return Response(UserSerializer(request.user, context={"request": request}).data)


class VerificationView(APIView):
	permission_classes = [permissions.IsAuthenticated]
	parser_classes = [MultiPartParser, FormParser, JSONParser]

	def get_object(self, user):
		verification, _ = EntrepreneurVerification.objects.get_or_create(user=user)
		return verification

	def get(self, request):
		if request.user.role != User.Roles.ENTREPRENEUR:
			return Response({"detail": "Verification profile is available for entrepreneurs only."}, status=403)
		return Response(EntrepreneurVerificationSerializer(self.get_object(request.user), context={"request": request}).data)

	def patch(self, request):
		if request.user.role != User.Roles.ENTREPRENEUR:
			return Response({"detail": "Only entrepreneurs can submit verification details."}, status=403)

		verification = self.get_object(request.user)
		serializer = EntrepreneurVerificationSerializer(
			verification,
			data=request.data,
			partial=True,
			context={"request": request},
		)
		serializer.is_valid(raise_exception=True)
		verification = serializer.save()

		should_submit = str(request.data.get("submit", "")).lower() in {"1", "true", "yes", "on"}
		if should_submit:
			verification.status = EntrepreneurVerification.Status.SUBMITTED
			verification.submitted_at = timezone.now()
			verification.admin_message = ""
			verification.save(update_fields=["status", "submitted_at", "admin_message", "updated_at"])

		return Response(EntrepreneurVerificationSerializer(verification, context={"request": request}).data)


class AdminUsersView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		if request.user.role != User.Roles.ADMIN:
			return Response({"detail": "Forbidden"}, status=403)
		users = User.objects.all().order_by("-date_joined")
		return Response(
			{
				"data": UserSerializer(users, many=True, context={"request": request}).data,
				"count": users.count(),
				"next": None,
				"previous": None,
			}
		)


class AdminUserDetailView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def patch(self, request, user_id: int):
		if request.user.role != User.Roles.ADMIN:
			return Response({"detail": "Forbidden"}, status=403)

		target = get_object_or_404(User, pk=user_id)
		for field in ["verified", "frozen"]:
			if field in request.data:
				setattr(target, field, bool(request.data[field]))
		target.save(update_fields=["verified", "frozen"])
		return Response(UserSerializer(target, context={"request": request}).data)

	def delete(self, request, user_id: int):
		if request.user.role != User.Roles.ADMIN:
			return Response({"detail": "Forbidden"}, status=403)
		if request.user.id == user_id:
			return Response({"detail": "Admins cannot delete their own account from this endpoint."}, status=400)

		target = get_object_or_404(User, pk=user_id)
		from marketplace.models import InvestmentAgreement, Proposal, WalletTransaction
		from payments.models import PaymentAttempt

		linked_financial_activity = (
			WalletTransaction.objects.filter(investor=target).exists()
			or WalletTransaction.objects.filter(entrepreneur=target).exists()
			or WalletTransaction.objects.filter(processed_by=target).exists()
			or PaymentAttempt.objects.filter(investor=target).exists()
			or InvestmentAgreement.objects.filter(investor=target).exists()
			or InvestmentAgreement.objects.filter(entrepreneur=target).exists()
			or Proposal.objects.filter(entrepreneur=target, transactions__isnull=False).exists()
			or Proposal.objects.filter(entrepreneur=target, payment_attempts__isnull=False).exists()
			or Proposal.objects.filter(entrepreneur=target, agreements__isnull=False).exists()
		)
		if linked_financial_activity:
			return Response({"detail": "Cannot hard-delete users with proposal, payment, agreement, or escrow activity. Freeze/deactivate instead."}, status=400)
		for proposal in list(Proposal.objects.filter(entrepreneur=target)):
			proposal.delete()
		target.delete()
		return Response(status=status.HTTP_204_NO_CONTENT)


class AdminUserVerificationView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request, user_id: int):
		if request.user.role != User.Roles.ADMIN:
			return Response({"detail": "Forbidden"}, status=403)
		target = get_object_or_404(User, pk=user_id)
		verification, _ = EntrepreneurVerification.objects.get_or_create(user=target)
		return Response(EntrepreneurVerificationSerializer(verification, context={"request": request}).data)

	def patch(self, request, user_id: int):
		if request.user.role != User.Roles.ADMIN:
			return Response({"detail": "Forbidden"}, status=403)

		target = get_object_or_404(User, pk=user_id)
		verification, _ = EntrepreneurVerification.objects.get_or_create(user=target)
		serializer = AdminVerificationReviewSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		decision = serializer.validated_data["status"]
		verification.status = decision
		verification.admin_message = serializer.validated_data.get("admin_message", "")
		verification.reviewed_by = request.user
		verification.reviewed_at = timezone.now()
		verification.save(update_fields=["status", "admin_message", "reviewed_by", "reviewed_at", "updated_at"])

		target.verified = decision == EntrepreneurVerification.Status.APPROVED
		target.save(update_fields=["verified"])

		return Response(EntrepreneurVerificationSerializer(verification, context={"request": request}).data)


class VerificationFileDownloadView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request, user_id: int, field_name: str):
		if field_name not in VERIFICATION_FILE_FIELDS:
			raise ValidationError("Unsupported verification file field.")
		target = get_object_or_404(User, pk=user_id)
		if request.user.role != User.Roles.ADMIN and request.user.id != target.id:
			return Response({"detail": "Forbidden"}, status=403)
		verification = get_object_or_404(EntrepreneurVerification, user=target)
		stored_file = getattr(verification, field_name)
		if not stored_file:
			return Response({"detail": "File not found."}, status=404)
		response = FileResponse(stored_file.open("rb"), as_attachment=True, filename=stored_file.name.rsplit("/", 1)[-1])
		response["X-Content-Type-Options"] = "nosniff"
		return response


class DemoCredentialsView(APIView):
	permission_classes = [permissions.AllowAny]

	def get(self, request):
		"""Return demo credentials for testing (development only)."""
		return Response({
			"demo_users": [
				{
					"role": "admin",
					"email": "admin@demo.local",
					"password": "DemoPass123!",
				},
				{
					"role": "entrepreneur",
					"email": "entrepreneur@demo.local",
					"password": "DemoPass123!",
				},
				{
					"role": "investor",
					"email": "investor@demo.local",
					"password": "DemoPass123!",
				},
			],
			"note": "Demo credentials for testing purposes only",
		})
