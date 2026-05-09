from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
	ordering = ("email",)
	list_display = ("email", "role", "verified", "frozen", "is_active")
	fieldsets = (
		(None, {"fields": ("email", "password")}),
		("Profile", {"fields": ("first_name", "last_name", "role", "verified", "frozen")}),
		(
			"Business/Investor",
			{"fields": ("business_idea", "funding_required", "startup_documents", "investment_interest", "budget_range")},
		),
		("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
		("Important dates", {"fields": ("last_login", "date_joined")}),
	)
	add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "password1", "password2", "role")}),)
	search_fields = ("email",)
