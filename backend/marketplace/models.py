from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Q, Sum


class Proposal(models.Model):
	class Status(models.TextChoices):
		PENDING = "pending", "Pending"
		APPROVED = "approved", "Approved"

	class Milestone(models.TextChoices):
		NOT_STARTED = "Not Started", "Not Started"
		IN_PROGRESS = "In Progress", "In Progress"
		COMPLETED = "Completed", "Completed"

	entrepreneur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="proposals")
	title = models.CharField(max_length=255)
	startup_details = models.CharField(max_length=255)
	description = models.TextField(blank=True)
	category = models.CharField(max_length=120)
	required_funding = models.DecimalField(max_digits=12, decimal_places=2)
	timeline = models.CharField(max_length=120, blank=True)
	document_name = models.CharField(max_length=255)
	pitch_video_url = models.URLField(blank=True)
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
	milestone = models.CharField(max_length=20, choices=Milestone.choices, default=Milestone.NOT_STARTED)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-created_at"]

	def __str__(self):
		return f"{self.title} ({self.status})"


class InvestorSignal(models.Model):
	class SignalType(models.TextChoices):
		INTEREST = "interest", "Interest"
		CONTACT = "contact", "Contact"
		MEETING = "meeting", "Meeting"

	class SignalStatus(models.TextChoices):
		PENDING = "pending", "Pending"
		ACCEPTED = "accepted", "Accepted"
		REJECTED = "rejected", "Rejected"

	proposal = models.ForeignKey(Proposal, on_delete=models.CASCADE, related_name="signals")
	investor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sent_signals")
	entrepreneur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="received_signals")
	signal_type = models.CharField(max_length=20, choices=SignalType.choices, default=SignalType.INTEREST)
	status = models.CharField(max_length=20, choices=SignalStatus.choices, default=SignalStatus.PENDING)
	message = models.TextField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		constraints = [
			models.UniqueConstraint(
				fields=["proposal", "investor", "signal_type"],
				condition=Q(status="pending"),
				name="unique_pending_signal_per_type",
			)
		]
		ordering = ["-created_at"]


class WalletTransaction(models.Model):
	class Action(models.TextChoices):
		INVEST = "invest", "Invest"
		RELEASE = "release", "Release"
		REFUND = "refund", "Refund"

	class Method(models.TextChoices):
		VIRTUAL_ESCROW = "virtual-escrow", "Virtual Escrow"
		STRIPE = "stripe", "Stripe"
		JAZZCASH = "jazzcash", "JazzCash"
		EASYPAISA = "easypaisa", "Easypaisa"

	proposal = models.ForeignKey(Proposal, on_delete=models.CASCADE, related_name="transactions")
	investor = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		related_name="investor_transactions",
		null=True,
		blank=True,
	)
	entrepreneur = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		related_name="entrepreneur_transactions",
		null=True,
		blank=True,
	)
	processed_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		related_name="processed_transactions",
		null=True,
		blank=True,
	)
	action = models.CharField(max_length=20, choices=Action.choices)
	method = models.CharField(max_length=20, choices=Method.choices, default=Method.VIRTUAL_ESCROW)
	amount = models.DecimalField(max_digits=12, decimal_places=2)
	external_reference = models.CharField(max_length=120, blank=True, null=True, unique=True)
	notes = models.TextField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-created_at"]

	@staticmethod
	def escrow_for_proposal(proposal_id: int) -> Decimal:
		totals = WalletTransaction.objects.filter(proposal_id=proposal_id).values("action").annotate(total=Sum("amount"))
		mapped = {item["action"]: item["total"] or Decimal("0") for item in totals}
		return (mapped.get("invest") or Decimal("0")) - (mapped.get("release") or Decimal("0")) - (mapped.get("refund") or Decimal("0"))
