from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db import models

from .managers import UserManager


def verification_upload_path(instance, filename: str) -> str:
	return f"verification/user_{instance.user_id}/{filename}"


def validate_identity_file_size(file):
	if file.size > 10 * 1024 * 1024:
		raise ValidationError("Identity files must be 10MB or smaller.")


def validate_video_file_size(file):
	if file.size > 50 * 1024 * 1024:
		raise ValidationError("Video files must be 50MB or smaller.")


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


def validate_identity_file_content(file):
	signature = _read_signature(file)
	allowed = signature.startswith(b"%PDF") or signature.startswith(b"\xff\xd8\xff") or signature.startswith(b"\x89PNG\r\n\x1a\n")
	if not allowed:
		raise ValidationError("Identity files must be valid PDF, JPG, or PNG files.")


def validate_video_file_content(file):
	signature = _read_signature(file)
	allowed = signature.startswith(b"\x1a\x45\xdf\xa3") or (len(signature) >= 12 and signature[4:8] == b"ftyp")
	if not allowed:
		raise ValidationError("Proof videos must be valid MP4/MOV/WebM files.")


class User(AbstractUser):
	class Roles(models.TextChoices):
		ENTREPRENEUR = "entrepreneur", "Entrepreneur"
		INVESTOR = "investor", "Investor"
		ADMIN = "admin", "Admin"

	username = None
	email = models.EmailField(unique=True)
	role = models.CharField(max_length=20, choices=Roles.choices, default=Roles.ENTREPRENEUR)

	verified = models.BooleanField(default=False)
	frozen = models.BooleanField(default=False)

	business_idea = models.TextField(blank=True)
	funding_required = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
	startup_documents = models.CharField(max_length=255, blank=True)

	investment_interest = models.CharField(max_length=255, blank=True)
	budget_range = models.CharField(max_length=120, blank=True)

	USERNAME_FIELD = "email"
	REQUIRED_FIELDS = []

	objects = UserManager()

	def __str__(self):
		return f"{self.email} ({self.role})"


class EntrepreneurVerification(models.Model):
	class IdentityType(models.TextChoices):
		CNIC = "cnic", "CNIC"
		PASSPORT = "passport", "Passport"

	class Status(models.TextChoices):
		DRAFT = "draft", "Draft"
		SUBMITTED = "submitted", "Submitted"
		APPROVED = "approved", "Approved"
		REJECTED = "rejected", "Rejected"

	identity_file_validator = FileExtensionValidator(allowed_extensions=["jpg", "jpeg", "png", "pdf"])
	video_file_validator = FileExtensionValidator(allowed_extensions=["mp4", "mov", "webm"])

	user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="verification_profile")
	phone_number = models.CharField(max_length=40, blank=True)
	address = models.TextField(blank=True)
	identity_type = models.CharField(max_length=20, choices=IdentityType.choices, default=IdentityType.CNIC)
	identity_number = models.CharField(max_length=80, blank=True)
	identity_front = models.FileField(upload_to=verification_upload_path, validators=[identity_file_validator, validate_identity_file_size, validate_identity_file_content], blank=True)
	identity_back = models.FileField(upload_to=verification_upload_path, validators=[identity_file_validator, validate_identity_file_size, validate_identity_file_content], blank=True)
	passport_photo = models.FileField(upload_to=verification_upload_path, validators=[identity_file_validator, validate_identity_file_size, validate_identity_file_content], blank=True)
	bank_statement = models.FileField(upload_to=verification_upload_path, validators=[identity_file_validator, validate_identity_file_size, validate_identity_file_content], blank=True)
	startup_website_url = models.URLField(blank=True)
	proof_video_url = models.URLField(blank=True)
	proof_video_file = models.FileField(upload_to=verification_upload_path, validators=[video_file_validator, validate_video_file_size, validate_video_file_content], blank=True)
	linkedin_url = models.URLField(blank=True)
	twitter_url = models.URLField(blank=True)
	facebook_url = models.URLField(blank=True)
	instagram_url = models.URLField(blank=True)
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
	admin_message = models.TextField(blank=True)
	submitted_at = models.DateTimeField(null=True, blank=True)
	reviewed_by = models.ForeignKey(
		User,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="reviewed_verifications",
	)
	reviewed_at = models.DateTimeField(null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-updated_at"]

	def __str__(self):
		return f"Verification for {self.user.email}: {self.status}"


class EmailVerificationCode(models.Model):
	"""Stores a one-time 6-digit code for email verification after signup."""
	user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="email_verification")
	code = models.CharField(max_length=6)
	verified = models.BooleanField(default=False)
	created_at = models.DateTimeField(auto_now=True)

	def __str__(self):
		return f"EmailVerificationCode for {self.user.email} (verified={self.verified})"
