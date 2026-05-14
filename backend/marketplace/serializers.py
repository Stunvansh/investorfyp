from decimal import Decimal

from rest_framework import serializers

from accounts.models import User
from .models import InvestmentAgreement, InvestorSignal, Proposal, WalletTransaction


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
            "document_file",
            "pitch_video_url",
            "startup_website_url",
            "proof_video_url",
            "admin_message",
            "status",
            "milestone",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "entrepreneur", "created_at", "updated_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if instance.document_file:
            path = f"/api/proposals/{instance.id}/document/"
            data["document_file"] = request.build_absolute_uri(path) if request else path
        else:
            data["document_file"] = ""
        return data


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


class InvestmentAgreementSerializer(serializers.ModelSerializer):
    investor_email = serializers.EmailField(source="investor.email", read_only=True)
    entrepreneur_email = serializers.EmailField(source="entrepreneur.email", read_only=True)

    class Meta:
        model = InvestmentAgreement
        fields = [
            "id",
            "proposal",
            "investor",
            "investor_email",
            "entrepreneur",
            "entrepreneur_email",
            "amount",
            "payment_method",
            "equity_percentage",
            "profit_share_percentage",
            "expected_return_note",
            "term_months",
            "terms_snapshot",
            "accepted",
            "accepted_name",
            "accepted_at",
            "ip_address",
            "user_agent",
            "status",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "investor",
            "entrepreneur",
            "terms_snapshot",
            "accepted",
            "accepted_at",
            "ip_address",
            "user_agent",
            "status",
            "created_at",
        ]

    def validate_amount(self, value: Decimal):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value
