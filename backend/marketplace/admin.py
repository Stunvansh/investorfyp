from django.contrib import admin

from .models import InvestmentAgreement, InvestorSignal, Proposal, WalletTransaction

admin.site.register(Proposal)
admin.site.register(InvestorSignal)


@admin.register(WalletTransaction)
class WalletTransactionAdmin(admin.ModelAdmin):
	list_display = ("id", "proposal", "investor", "action", "method", "amount", "created_at")
	readonly_fields = [field.name for field in WalletTransaction._meta.fields]
	actions = None

	def has_add_permission(self, request):
		return False

	def has_delete_permission(self, request, obj=None):
		return False


@admin.register(InvestmentAgreement)
class InvestmentAgreementAdmin(admin.ModelAdmin):
	list_display = ("id", "proposal", "investor", "amount", "payment_method", "accepted_at", "status")
	readonly_fields = [field.name for field in InvestmentAgreement._meta.fields]
	actions = None

	def has_add_permission(self, request):
		return False

	def has_delete_permission(self, request, obj=None):
		return False
