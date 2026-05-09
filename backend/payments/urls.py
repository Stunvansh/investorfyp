from django.urls import path

from .views import CreatePaymentIntentView, PaymentStatusView, stripe_webhook

urlpatterns = [
    path("payments/create-intent/", CreatePaymentIntentView.as_view(), name="payment-create-intent"),
    path("payments/status/<str:intent_id>/", PaymentStatusView.as_view(), name="payment-status"),
    path("payments/webhook/", stripe_webhook, name="payment-webhook"),
]
