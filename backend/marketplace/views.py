from decimal import Decimal
import os

from django.http import FileResponse
from django.db.models import Q, Sum
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from common.responses import list_envelope
from messaging.models import ChatRoom
from .models import InvestmentAgreement, InvestorSignal, Proposal, WalletTransaction
from .serializers import (
	InvestmentAgreementSerializer,
	InvestorSignalSerializer,
	MilestoneUpdateSerializer,
	ProposalSerializer,
	SignalStatusSerializer,
	WalletActionSerializer,
	WalletTransactionSerializer,
)


MILESTONE_RELEASE_CAPS = {
	Proposal.Milestone.NOT_STARTED: Decimal("0.00"),
	Proposal.Milestone.IN_PROGRESS: Decimal("0.60"),
	Proposal.Milestone.COMPLETED: Decimal("1.00"),
}


def _current_escrow(proposal: Proposal) -> Decimal:
	return WalletTransaction.escrow_for_proposal(proposal.id)


def _remaining_funding(proposal: Proposal) -> Decimal:
	invested = (
		WalletTransaction.objects.filter(proposal=proposal, action=WalletTransaction.Action.INVEST).aggregate(total=Sum("amount"))["total"]
		or Decimal("0")
	)
	return Decimal(proposal.required_funding) - invested


def _proposal_ledger_totals(proposal: Proposal) -> dict[str, Decimal]:
	totals = WalletTransaction.objects.filter(proposal=proposal).values("action").annotate(total=Sum("amount"))
	mapped = {item["action"]: item["total"] or Decimal("0") for item in totals}
	invested = mapped.get(WalletTransaction.Action.INVEST, Decimal("0"))
	released = mapped.get(WalletTransaction.Action.RELEASE, Decimal("0"))
	refunded = mapped.get(WalletTransaction.Action.REFUND, Decimal("0"))
	escrow = invested - released - refunded
	return {
		"invested": invested,
		"released": released,
		"refunded": refunded,
		"escrow": max(Decimal("0"), escrow),
	}


def _release_capacity_for_milestone(proposal: Proposal) -> dict[str, Decimal]:
	ledger = _proposal_ledger_totals(proposal)
	cap_percent = MILESTONE_RELEASE_CAPS.get(proposal.milestone, Decimal("0.00"))
	stage_cap_amount = ledger["invested"] * cap_percent
	remaining_by_stage = stage_cap_amount - ledger["released"]
	max_release_now = min(ledger["escrow"], remaining_by_stage)
	max_release_now = max(Decimal("0"), max_release_now)
	return {
		**ledger,
		"cap_percent": cap_percent,
		"stage_cap_amount": stage_cap_amount,
		"remaining_by_stage": max(Decimal("0"), remaining_by_stage),
		"max_release_now": max_release_now,
	}


def _client_ip(request) -> str | None:
	forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
	if forwarded:
		return forwarded.split(",")[0].strip()
	return request.META.get("REMOTE_ADDR")


def _agreement_terms_snapshot(proposal: Proposal, data: dict) -> str:
	return (
		f"Investor accepted VentureLedger funding terms for proposal '{proposal.title}'. "
		f"Amount: {data.get('amount')}. Payment method: {data.get('payment_method')}. "
		f"Equity percentage: {data.get('equity_percentage') or 'N/A'}. "
		f"Profit share percentage: {data.get('profit_share_percentage') or 'N/A'}. "
		f"Term months: {data.get('term_months') or 'N/A'}. "
		f"Expected return note: {data.get('expected_return_note') or 'No guaranteed return; returns depend on startup performance and agreed milestones.'}"
	)


def _has_accepted_agreement(proposal: Proposal, investor: User, amount: Decimal, method: str) -> bool:
	return InvestmentAgreement.objects.filter(
		proposal=proposal,
		investor=investor,
		amount=amount,
		payment_method=method,
		accepted=True,
		status=InvestmentAgreement.AgreementStatus.ACCEPTED,
	).exists()


class ProposalListCreateView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		user = request.user
		queryset = Proposal.objects.all()

		if user.role == User.Roles.ENTREPRENEUR:
			queryset = queryset.filter(entrepreneur=user)
		elif user.role == User.Roles.INVESTOR:
			queryset = queryset.filter(status=Proposal.Status.APPROVED)

		category = request.query_params.get("category")
		if category:
			queryset = queryset.filter(category__iexact=category)

		max_budget = request.query_params.get("max_budget")
		if max_budget:
			queryset = queryset.filter(required_funding__lte=max_budget)

		serializer = ProposalSerializer(queryset, many=True, context={"request": request})
		return list_envelope(serializer.data, count=queryset.count())

	def post(self, request):
		if request.user.role != User.Roles.ENTREPRENEUR:
			raise PermissionDenied("Only entrepreneurs can create proposals.")

		serializer = ProposalSerializer(data=request.data, context={"request": request})
		serializer.is_valid(raise_exception=True)
		proposal = serializer.save(entrepreneur=request.user, status=Proposal.Status.PENDING)
		return Response(ProposalSerializer(proposal, context={"request": request}).data, status=status.HTTP_201_CREATED)


class ProposalDetailView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get_object(self, pk):
		try:
			return Proposal.objects.get(pk=pk)
		except Proposal.DoesNotExist as exc:
			raise ValidationError("Proposal not found") from exc

	def get(self, request, pk):
		proposal = self.get_object(pk)
		if request.user.role == User.Roles.INVESTOR and proposal.status != Proposal.Status.APPROVED:
			raise PermissionDenied("Investors can view approved proposals only.")
		if request.user.role == User.Roles.ENTREPRENEUR and proposal.entrepreneur_id != request.user.id:
			raise PermissionDenied("Not allowed to view this proposal.")
		return Response(ProposalSerializer(proposal, context={"request": request}).data)

	def patch(self, request, pk):
		proposal = self.get_object(pk)
		if request.user.role != User.Roles.ADMIN and proposal.entrepreneur_id != request.user.id:
			raise PermissionDenied("Not allowed to update this proposal.")

		data = request.data.copy()
		if request.user.role != User.Roles.ADMIN:
			data.pop("status", None)
			data.pop("admin_message", None)

		serializer = ProposalSerializer(proposal, data=data, partial=True, context={"request": request})
		serializer.is_valid(raise_exception=True)
		serializer.save()
		return Response(serializer.data)

	def delete(self, request, pk):
		proposal = self.get_object(pk)
		if request.user.role != User.Roles.ADMIN and proposal.entrepreneur_id != request.user.id:
			raise PermissionDenied("Not allowed to delete this proposal.")
		if proposal.transactions.exists() or proposal.payment_attempts.exists() or proposal.agreements.exists():
			raise ValidationError("Proposal cannot be deleted after investment, payment, or agreement activity exists.")
		proposal.delete()
		return Response(status=status.HTTP_204_NO_CONTENT)


class ProposalDocumentDownloadView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request, pk):
		try:
			proposal = Proposal.objects.get(pk=pk)
		except Proposal.DoesNotExist as exc:
			raise ValidationError("Proposal not found") from exc

		allowed = request.user.role == User.Roles.ADMIN or proposal.entrepreneur_id == request.user.id or (
			request.user.role == User.Roles.INVESTOR and proposal.status == Proposal.Status.APPROVED
		)
		if not allowed:
			raise PermissionDenied("Not allowed to download this proposal document.")
		if not proposal.document_file:
			return Response({"detail": "Document not found."}, status=404)

		response = FileResponse(proposal.document_file.open("rb"), as_attachment=True, filename=proposal.document_file.name.rsplit("/", 1)[-1])
		response["X-Content-Type-Options"] = "nosniff"
		return response


class ProposalApproveView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def post(self, request, pk):
		if request.user.role != User.Roles.ADMIN:
			raise PermissionDenied("Only admin can approve proposals.")
		proposal = Proposal.objects.get(pk=pk)
		proposal.status = Proposal.Status.APPROVED
		proposal.admin_message = ""
		proposal.save(update_fields=["status", "admin_message", "updated_at"])
		return Response(ProposalSerializer(proposal, context={"request": request}).data)


class ProposalSetMilestoneView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def post(self, request, pk):
		proposal = Proposal.objects.get(pk=pk)
		if request.user.role != User.Roles.ADMIN and proposal.entrepreneur_id != request.user.id:
			raise PermissionDenied("Only owner entrepreneur or admin can update milestones.")

		serializer = MilestoneUpdateSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		proposal.milestone = serializer.validated_data["milestone"]
		proposal.save(update_fields=["milestone", "updated_at"])
		return Response(ProposalSerializer(proposal, context={"request": request}).data)


class InvestmentAgreementListCreateView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		queryset = InvestmentAgreement.objects.select_related("proposal", "investor", "entrepreneur")
		if request.user.role == User.Roles.INVESTOR:
			queryset = queryset.filter(investor=request.user)
		elif request.user.role == User.Roles.ENTREPRENEUR:
			queryset = queryset.filter(entrepreneur=request.user)
		elif request.user.role != User.Roles.ADMIN:
			queryset = queryset.none()
		serializer = InvestmentAgreementSerializer(queryset, many=True)
		return list_envelope(serializer.data, count=queryset.count())

	def post(self, request):
		if request.user.role != User.Roles.INVESTOR:
			raise PermissionDenied("Only investors can accept investment agreements.")

		serializer = InvestmentAgreementSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		proposal = Proposal.objects.get(pk=serializer.validated_data["proposal"].id)
		if proposal.status != Proposal.Status.APPROVED:
			raise ValidationError("Agreement can be accepted for approved proposals only.")

		agreement = serializer.save(
			investor=request.user,
			entrepreneur=proposal.entrepreneur,
			terms_snapshot=_agreement_terms_snapshot(proposal, serializer.validated_data),
			accepted=True,
			ip_address=_client_ip(request),
			user_agent=request.META.get("HTTP_USER_AGENT", ""),
			status=InvestmentAgreement.AgreementStatus.ACCEPTED,
		)
		return Response(InvestmentAgreementSerializer(agreement).data, status=status.HTTP_201_CREATED)


class SignalListCreateView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		user = request.user
		queryset = InvestorSignal.objects.all()
		if user.role == User.Roles.INVESTOR:
			queryset = queryset.filter(investor=user)
		elif user.role == User.Roles.ENTREPRENEUR:
			queryset = queryset.filter(entrepreneur=user)

		serializer = InvestorSignalSerializer(queryset, many=True)
		return list_envelope(serializer.data, count=queryset.count())

	def post(self, request):
		if request.user.role != User.Roles.INVESTOR:
			raise PermissionDenied("Only investors can send signals.")

		serializer = InvestorSignalSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		proposal = Proposal.objects.get(pk=serializer.validated_data["proposal"].id)

		if proposal.status != Proposal.Status.APPROVED:
			raise ValidationError("Signals are allowed only for approved proposals.")

		duplicate = InvestorSignal.objects.filter(
			proposal=proposal,
			investor=request.user,
			signal_type=serializer.validated_data["signal_type"],
			status=InvestorSignal.SignalStatus.PENDING,
		).exists()
		if duplicate:
			raise ValidationError("Duplicate pending signal exists.")

		signal = serializer.save(investor=request.user, entrepreneur=proposal.entrepreneur)
		return Response(InvestorSignalSerializer(signal).data, status=status.HTTP_201_CREATED)


class SignalUpdateView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def patch(self, request, pk):
		signal = InvestorSignal.objects.get(pk=pk)
		if request.user.role != User.Roles.ADMIN and signal.entrepreneur_id != request.user.id:
			raise PermissionDenied("Only target entrepreneur or admin can update signal status.")

		serializer = SignalStatusSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		signal.status = serializer.validated_data["status"]
		signal.save(update_fields=["status", "updated_at"])

		if signal.status == InvestorSignal.SignalStatus.ACCEPTED:
			ChatRoom.objects.get_or_create(
				proposal=signal.proposal,
				defaults={
					"investor": signal.investor,
					"entrepreneur": signal.entrepreneur,
				},
			)

		return Response(InvestorSignalSerializer(signal).data)


class TransactionListCreateView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		user = request.user
		queryset = WalletTransaction.objects.select_related("proposal", "investor", "entrepreneur")
		if user.role == User.Roles.INVESTOR:
			queryset = queryset.filter(investor=user)
		elif user.role == User.Roles.ENTREPRENEUR:
			queryset = queryset.filter(entrepreneur=user)

		serializer = WalletTransactionSerializer(queryset, many=True)
		return list_envelope(serializer.data, count=queryset.count())

	def post(self, request):
		serializer = WalletActionSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		proposal = Proposal.objects.get(pk=serializer.validated_data["proposal"])
		amount = serializer.validated_data["amount"]
		action = serializer.validated_data["action"]
		method = serializer.validated_data["method"]
		notes = serializer.validated_data.get("notes", "")

		user = request.user
		investor = None
		entrepreneur = proposal.entrepreneur

		if action == WalletTransaction.Action.INVEST:
			if user.role != User.Roles.INVESTOR:
				raise PermissionDenied("Only investors can invest.")
			if proposal.status != Proposal.Status.APPROVED:
				raise ValidationError("Investments allowed only for approved proposals.")
			if not _has_accepted_agreement(proposal, user, amount, method):
				raise ValidationError("Accepted investment agreement is required before funding escrow.")

			remaining = _remaining_funding(proposal)
			if amount > remaining:
				raise ValidationError("Amount exceeds remaining funding requirement.")

			baseline = Decimal(os.getenv("INVESTOR_BASE_CAPITAL", "300000"))
			invested_total = (
				WalletTransaction.objects.filter(investor=user, action=WalletTransaction.Action.INVEST).aggregate(total=Sum("amount"))["total"]
				or Decimal("0")
			)
			refunded_total = (
				WalletTransaction.objects.filter(investor=user, action=WalletTransaction.Action.REFUND).aggregate(total=Sum("amount"))["total"]
				or Decimal("0")
			)
			balance = baseline - invested_total + refunded_total
			if amount > balance:
				raise ValidationError("Investment amount exceeds available balance.")
			investor = user

		elif action in {WalletTransaction.Action.RELEASE, WalletTransaction.Action.REFUND}:
			if user.role != User.Roles.ADMIN:
				raise PermissionDenied("Only admin can release or refund funds.")
			if proposal.status != Proposal.Status.APPROVED:
				raise ValidationError("Settlement actions are allowed only for approved proposals.")
			if not str(notes).strip():
				raise ValidationError("Admin notes are required for release/refund settlements.")

			settlement = _release_capacity_for_milestone(proposal)
			if amount > settlement["escrow"]:
				raise ValidationError("Amount exceeds current escrow.")
			if action == WalletTransaction.Action.RELEASE:
				max_release_now = settlement["max_release_now"]
				if max_release_now <= 0:
					raise ValidationError(
						f"Release blocked by milestone policy. Milestone '{proposal.milestone}' currently allows no additional release."
					)
				if amount > max_release_now:
					raise ValidationError(f"Release exceeds stage limit. Max releasable now is {max_release_now}.")

			latest_investor_tx = WalletTransaction.objects.filter(proposal=proposal, action=WalletTransaction.Action.INVEST).order_by("-created_at").first()
			if latest_investor_tx:
				investor = latest_investor_tx.investor

		tx = WalletTransaction.objects.create(
			proposal=proposal,
			investor=investor,
			entrepreneur=entrepreneur,
			processed_by=user,
			action=action,
			method=method,
			amount=amount,
			notes=notes,
		)
		return Response(WalletTransactionSerializer(tx).data, status=status.HTTP_201_CREATED)


class WalletBalanceView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		if request.user.role != User.Roles.INVESTOR:
			raise PermissionDenied("Wallet balance is available for investors only.")

		baseline = Decimal(os.getenv("INVESTOR_BASE_CAPITAL", "300000"))
		invested_total = (
			WalletTransaction.objects.filter(investor=request.user, action=WalletTransaction.Action.INVEST).aggregate(total=Sum("amount"))["total"]
			or Decimal("0")
		)
		refunded_total = (
			WalletTransaction.objects.filter(investor=request.user, action=WalletTransaction.Action.REFUND).aggregate(total=Sum("amount"))["total"]
			or Decimal("0")
		)
		in_escrow = (
			WalletTransaction.objects.filter(investor=request.user, action=WalletTransaction.Action.INVEST).aggregate(total=Sum("amount"))["total"]
			or Decimal("0")
		) - (
			WalletTransaction.objects.filter(investor=request.user, action__in=[WalletTransaction.Action.RELEASE, WalletTransaction.Action.REFUND]).aggregate(total=Sum("amount"))["total"]
			or Decimal("0")
		)

		balance = baseline - invested_total + refunded_total
		return Response(
			{
				"max_balance": baseline,
				"invested_total": invested_total,
				"refunded_total": refunded_total,
				"in_escrow": in_escrow,
				"available_balance": balance,
			}
		)


class EscrowSummaryView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		user = request.user
		proposals = Proposal.objects.all()

		if user.role == User.Roles.ENTREPRENEUR:
			proposals = proposals.filter(entrepreneur=user)
		elif user.role == User.Roles.INVESTOR:
			investor_proposal_ids = WalletTransaction.objects.filter(investor=user).values_list("proposal_id", flat=True)
			proposals = proposals.filter(id__in=investor_proposal_ids)

		proposal_items = []
		total_escrow = Decimal("0")
		for proposal in proposals:
			settlement = _release_capacity_for_milestone(proposal)
			escrow = settlement["escrow"]
			total_escrow += escrow
			proposal_items.append(
				{
					"proposal_id": proposal.id,
					"title": proposal.title,
					"entrepreneur_id": proposal.entrepreneur_id,
					"milestone": proposal.milestone,
					"invested_total": settlement["invested"],
					"released_total": settlement["released"],
					"refunded_total": settlement["refunded"],
					"stage_cap_percent": settlement["cap_percent"],
					"max_release_now": settlement["max_release_now"],
					"escrow": escrow,
				}
			)

		return Response({"total_escrow": total_escrow, "proposals": proposal_items})
