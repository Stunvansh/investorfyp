from django.contrib import admin

from .models import PaymentAttempt, ProcessedStripeEvent

admin.site.register(PaymentAttempt)
admin.site.register(ProcessedStripeEvent)
