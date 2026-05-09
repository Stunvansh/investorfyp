from django.contrib import admin

from .models import InvestorSignal, Proposal, WalletTransaction

admin.site.register(Proposal)
admin.site.register(InvestorSignal)
admin.site.register(WalletTransaction)
