from django.conf import settings
from django.db import models

from marketplace.models import Proposal


class PaymentAttempt(models.Model):
	class Status(models.TextChoices):
		PENDING = "pending", "Pending"
		PROCESSING = "processing", "Processing"
		SUCCEEDED = "succeeded", "Succeeded"
		FAILED = "failed", "Failed"
		CANCELED = "canceled", "Canceled"

	investor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payment_attempts")
	proposal = models.ForeignKey(Proposal, on_delete=models.CASCADE, related_name="payment_attempts")
	amount = models.DecimalField(max_digits=12, decimal_places=2)
	intent_id = models.CharField(max_length=120, unique=True)
	client_secret = models.CharField(max_length=255, blank=True)
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
	last_error = models.TextField(blank=True)
	raw_payload = models.JSONField(default=dict, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-created_at"]


class ProcessedStripeEvent(models.Model):
	event_id = models.CharField(max_length=255, unique=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-created_at"]
