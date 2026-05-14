from django.contrib import admin

from .models import PaymentAttempt, ProcessedStripeEvent

admin.site.register(ProcessedStripeEvent)


@admin.register(PaymentAttempt)
class PaymentAttemptAdmin(admin.ModelAdmin):
	list_display = ("id", "investor", "proposal", "amount", "intent_id", "status", "created_at")
	readonly_fields = [field.name for field in PaymentAttempt._meta.fields]
	actions = None

	def has_add_permission(self, request):
		return False

	def has_delete_permission(self, request, obj=None):
		return False
