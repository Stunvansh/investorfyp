from decimal import Decimal

from rest_framework import serializers

from accounts.models import User
from .models import InvestorSignal, Proposal, WalletTransaction


class ProposalSerializer(serializers.ModelSerializer):
    entrepreneur_email = serializers.EmailField(source="entrepreneur.email", read_only=True)

    class Meta:
        model = Proposal
        fields = [
            "id",
            "entrepreneur",
            "entrepreneur_email",
            "title",
            "startup_details",
            "description",
            "category",
            "required_funding",
            "timeline",
            "document_name",
            "pitch_video_url",
            "status",
            "milestone",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "entrepreneur", "status", "created_at", "updated_at"]


class InvestorSignalSerializer(serializers.ModelSerializer):
    investor_email = serializers.EmailField(source="investor.email", read_only=True)
    entrepreneur_email = serializers.EmailField(source="entrepreneur.email", read_only=True)

    class Meta:
        model = InvestorSignal
        fields = [
            "id",
            "proposal",
            "investor",
            "investor_email",
            "entrepreneur",
            "entrepreneur_email",
            "signal_type",
            "status",
            "message",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "investor", "entrepreneur", "created_at", "updated_at"]


class WalletTransactionSerializer(serializers.ModelSerializer):
    investor_email = serializers.EmailField(source="investor.email", read_only=True)
    entrepreneur_email = serializers.EmailField(source="entrepreneur.email", read_only=True)

    class Meta:
        model = WalletTransaction
        fields = [
            "id",
            "proposal",
            "investor",
            "investor_email",
            "entrepreneur",
            "entrepreneur_email",
            "processed_by",
            "action",
            "method",
            "amount",
            "external_reference",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "investor", "entrepreneur", "processed_by", "created_at", "external_reference"]

    def validate_amount(self, value: Decimal):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value


class MilestoneUpdateSerializer(serializers.Serializer):
    milestone = serializers.ChoiceField(choices=Proposal.Milestone.choices)


class WalletActionSerializer(serializers.Serializer):
    proposal = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    action = serializers.ChoiceField(choices=WalletTransaction.Action.choices)
    method = serializers.ChoiceField(choices=WalletTransaction.Method.choices, default=WalletTransaction.Method.VIRTUAL_ESCROW)
    notes = serializers.CharField(required=False, allow_blank=True)


class SignalStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=InvestorSignal.SignalStatus.choices)
