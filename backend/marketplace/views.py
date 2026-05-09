from decimal import Decimal
import os

from django.db.models import Q, Sum
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from common.responses import list_envelope
from messaging.models import ChatRoom
from .models import InvestorSignal, Proposal, WalletTransaction
from .serializers import (
	InvestorSignalSerializer,
	MilestoneUpdateSerializer,
	ProposalSerializer,
	SignalStatusSerializer,
	WalletActionSerializer,
	WalletTransactionSerializer,
)


def _current_escrow(proposal: Proposal) -> Decimal:
	return WalletTransaction.escrow_for_proposal(proposal.id)


def _remaining_funding(proposal: Proposal) -> Decimal:
	invested = (
		WalletTransaction.objects.filter(proposal=proposal, action=WalletTransaction.Action.INVEST).aggregate(total=Sum("amount"))["total"]
		or Decimal("0")
	)
	return Decimal(proposal.required_funding) - invested


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

		serializer = ProposalSerializer(queryset, many=True)
		return list_envelope(serializer.data, count=queryset.count())

	def post(self, request):
		if request.user.role != User.Roles.ENTREPRENEUR:
			raise PermissionDenied("Only entrepreneurs can create proposals.")

		serializer = ProposalSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		proposal = serializer.save(entrepreneur=request.user, status=Proposal.Status.PENDING)
		return Response(ProposalSerializer(proposal).data, status=status.HTTP_201_CREATED)


class ProposalDetailView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get_object(self, pk):
		try:
			return Proposal.objects.get(pk=pk)
		except Proposal.DoesNotExist as exc:
			raise ValidationError("Proposal not found") from exc

	def get(self, request, pk):
		proposal = self.get_object(pk)
		return Response(ProposalSerializer(proposal).data)

	def patch(self, request, pk):
		proposal = self.get_object(pk)
		if request.user.role != User.Roles.ADMIN and proposal.entrepreneur_id != request.user.id:
			raise PermissionDenied("Not allowed to update this proposal.")

		serializer = ProposalSerializer(proposal, data=request.data, partial=True)
		serializer.is_valid(raise_exception=True)
		serializer.save()
		return Response(serializer.data)


class ProposalApproveView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def post(self, request, pk):
		if request.user.role != User.Roles.ADMIN:
			raise PermissionDenied("Only admin can approve proposals.")
		proposal = Proposal.objects.get(pk=pk)
		proposal.status = Proposal.Status.APPROVED
		proposal.save(update_fields=["status", "updated_at"])
		return Response(ProposalSerializer(proposal).data)


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
		return Response(ProposalSerializer(proposal).data)


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

			escrow = _current_escrow(proposal)
			if amount > escrow:
				raise ValidationError("Amount exceeds current escrow.")

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
			escrow = _current_escrow(proposal)
			total_escrow += escrow
			proposal_items.append(
				{
					"proposal_id": proposal.id,
					"title": proposal.title,
					"entrepreneur_id": proposal.entrepreneur_id,
					"escrow": escrow,
				}
			)

		return Response({"total_escrow": total_escrow, "proposals": proposal_items})
