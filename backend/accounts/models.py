from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


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
