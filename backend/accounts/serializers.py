from rest_framework import serializers

from .models import User


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
        ]
        read_only_fields = ["id", "email", "role", "verified", "frozen"]


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
