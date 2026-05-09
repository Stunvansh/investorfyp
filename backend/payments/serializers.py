from rest_framework import serializers

from .models import PaymentAttempt


class CreateIntentSerializer(serializers.Serializer):
    proposal = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class PaymentAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentAttempt
        fields = [
            "id",
            "investor",
            "proposal",
            "amount",
            "intent_id",
            "client_secret",
            "status",
            "last_error",
            "created_at",
            "updated_at",
        ]
