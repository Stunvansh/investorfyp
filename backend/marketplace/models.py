from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db import models
from django.db.models.deletion import ProtectedError
from django.db.models import Q, Sum


def proposal_document_upload_path(instance, filename: str) -> str:
	return f"proposals/{instance.entrepreneur_id}/{filename}"


def _read_signature(file, length=16) -> bytes:
	position = file.tell() if hasattr(file, "tell") else 0
	try:
		file.seek(0)
		signature = file.read(length)
	finally:
		try:
			file.seek(position)
		except Exception:
			pass
	return signature or b""


def validate_proposal_document_size(file):
	if file.size > 15 * 1024 * 1024:
		raise ValidationError("Proposal documents must be 15MB or smaller.")


def validate_proposal_document_content(file):
	signature = _read_signature(file)
	allowed = (
		signature.startswith(b"%PDF")
		or signature.startswith(b"\xff\xd8\xff")
		or signature.startswith(b"\x89PNG\r\n\x1a\n")
		or signature.startswith(b"PK\x03\x04")
		or signature.startswith(b"\xd0\xcf\x11\xe0")
	)
	if not allowed:
		raise ValidationError("Unsupported or invalid proposal document content.")


class Proposal(models.Model):
	class Status(models.TextChoices):
		PENDING = "pending", "Pending"
		APPROVED = "approved", "Approved"
		REJECTED = "rejected", "Rejected"

	class Milestone(models.TextChoices):
		NOT_STARTED = "Not Started", "Not Started"
		IN_PROGRESS = "In Progress", "In Progress"
		COMPLETED = "Completed", "Completed"

	entrepreneur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="proposals")
	title = models.CharField(max_length=255)
	startup_details = models.CharField(max_length=255)
	description = models.TextField(blank=True)
	category = models.CharField(max_length=120)
	required_funding = models.DecimalField(max_digits=12, decimal_places=2)
	timeline = models.CharField(max_length=120, blank=True)
	document_name = models.CharField(max_length=255)
	document_file = models.FileField(
		upload_to=proposal_document_upload_path,
		validators=[
			FileExtensionValidator(allowed_extensions=["pdf", "doc", "docx", "ppt", "pptx", "jpg", "jpeg", "png"]),
			validate_proposal_document_size,
			validate_proposal_document_content,
		],
		blank=True,
	)
	pitch_video_url = models.URLField(blank=True)
	startup_website_url = models.URLField(blank=True)
	proof_video_url = models.URLField(blank=True)
	admin_message = models.TextField(blank=True)
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

	proposal = models.ForeignKey(Proposal, on_delete=models.PROTECT, related_name="transactions")
	investor = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		related_name="investor_transactions",
		null=True,
		blank=True,
	)
	entrepreneur = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		related_name="entrepreneur_transactions",
		null=True,
		blank=True,
	)
	processed_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
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

	def delete(self, *args, **kwargs):
		raise ProtectedError("Wallet transactions are immutable ledger records and cannot be deleted.", {self})


class InvestmentAgreement(models.Model):
	class AgreementStatus(models.TextChoices):
		ACCEPTED = "accepted", "Accepted"
		CANCELLED = "cancelled", "Cancelled"

	proposal = models.ForeignKey(Proposal, on_delete=models.PROTECT, related_name="agreements")
	investor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="investment_agreements")
	entrepreneur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="received_investment_agreements")
	amount = models.DecimalField(max_digits=12, decimal_places=2)
	payment_method = models.CharField(max_length=20, choices=WalletTransaction.Method.choices, default=WalletTransaction.Method.VIRTUAL_ESCROW)
	equity_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
	profit_share_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
	expected_return_note = models.TextField(blank=True)
	term_months = models.PositiveIntegerField(null=True, blank=True)
	terms_snapshot = models.TextField()
	accepted = models.BooleanField(default=True)
	accepted_name = models.CharField(max_length=160)
	accepted_at = models.DateTimeField(auto_now_add=True)
	ip_address = models.GenericIPAddressField(null=True, blank=True)
	user_agent = models.TextField(blank=True)
	status = models.CharField(max_length=20, choices=AgreementStatus.choices, default=AgreementStatus.ACCEPTED)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-created_at"]

	def __str__(self):
		return f"Agreement {self.id} for {self.proposal_id} by {self.investor_id}"

	def delete(self, *args, **kwargs):
		raise ProtectedError("Investment agreements are legal/audit records and cannot be deleted.", {self})
