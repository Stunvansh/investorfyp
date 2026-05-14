from django.urls import path

from .views import (
    EscrowSummaryView,
    InvestmentAgreementListCreateView,
    ProposalApproveView,
    ProposalDetailView,
    ProposalDocumentDownloadView,
    ProposalListCreateView,
    ProposalSetMilestoneView,
    SignalListCreateView,
    SignalUpdateView,
    TransactionListCreateView,
    WalletBalanceView,
)

urlpatterns = [
    path("proposals/", ProposalListCreateView.as_view(), name="proposal-list-create"),
    path("proposals/<int:pk>/", ProposalDetailView.as_view(), name="proposal-detail"),
    path("proposals/<int:pk>/document/", ProposalDocumentDownloadView.as_view(), name="proposal-document"),
    path("proposals/<int:pk>/approve/", ProposalApproveView.as_view(), name="proposal-approve"),
    path("proposals/<int:pk>/set_milestone/", ProposalSetMilestoneView.as_view(), name="proposal-set-milestone"),
    path("signals/", SignalListCreateView.as_view(), name="signal-list-create"),
    path("agreements/", InvestmentAgreementListCreateView.as_view(), name="agreement-list-create"),
    path("signals/<int:pk>/", SignalUpdateView.as_view(), name="signal-update"),
    path("transactions/", TransactionListCreateView.as_view(), name="transaction-list-create"),
    path("wallet/balance/", WalletBalanceView.as_view(), name="wallet-balance"),
    path("escrow-summary/", EscrowSummaryView.as_view(), name="escrow-summary"),
]
