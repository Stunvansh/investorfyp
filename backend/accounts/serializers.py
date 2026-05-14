from rest_framework import serializers

from .models import EntrepreneurVerification, User


class EntrepreneurVerificationSerializer(serializers.ModelSerializer):
    protected_file_fields = ["identity_front", "identity_back", "passport_photo", "proof_video_file"]

    class Meta:
        model = EntrepreneurVerification
        fields = [
            "id",
            "user",
            "phone_number",
            "address",
            "identity_type",
            "identity_number",
            "identity_front",
            "identity_back",
            "passport_photo",
            "startup_website_url",
            "proof_video_url",
            "proof_video_file",
            "linkedin_url",
            "twitter_url",
            "facebook_url",
            "instagram_url",
            "status",
            "admin_message",
            "submitted_at",
            "reviewed_by",
            "reviewed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "status",
            "admin_message",
            "submitted_at",
            "reviewed_by",
            "reviewed_at",
            "created_at",
            "updated_at",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        for field in self.protected_file_fields:
            if getattr(instance, field):
                path = f"/api/auth/users/{instance.user_id}/verification-files/{field}/"
                data[field] = request.build_absolute_uri(path) if request else path
            else:
                data[field] = ""
        return data


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["id", "email", "password", "first_name", "last_name", "role"]

    def validate_role(self, value):
        if value == User.Roles.ADMIN:
            raise serializers.ValidationError("Admin role cannot be self-assigned.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)


class UserSerializer(serializers.ModelSerializer):
    verification = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "verified",
            "frozen",
            "business_idea",
            "funding_required",
            "startup_documents",
            "investment_interest",
            "budget_range",
            "date_joined",
            "verification",
        ]
        read_only_fields = ["id", "email", "role", "verified", "frozen", "date_joined", "verification"]

    def get_verification(self, obj):
        verification = getattr(obj, "verification_profile", None)
        if not verification:
            return None
        return EntrepreneurVerificationSerializer(verification, context=self.context).data


class AdminVerificationReviewSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[("approved", "Approved"), ("rejected", "Rejected")])
    admin_message = serializers.CharField(required=False, allow_blank=True)


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "first_name",
            "last_name",
            "business_idea",
            "funding_required",
            "startup_documents",
            "investment_interest",
            "budget_range",
        ]
