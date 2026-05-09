from rest_framework import serializers

from .models import ChatRoom, Message


class MessageSerializer(serializers.ModelSerializer):
    sender_email = serializers.EmailField(source="sender.email", read_only=True)
    recipient_email = serializers.EmailField(source="recipient.email", read_only=True)

    class Meta:
        model = Message
        fields = [
            "id",
            "chat_room",
            "proposal",
            "sender",
            "sender_email",
            "recipient",
            "recipient_email",
            "content",
            "is_read",
            "created_at",
        ]
        read_only_fields = ["id", "sender", "recipient", "chat_room", "proposal", "is_read", "created_at"]


class ChatRoomSerializer(serializers.ModelSerializer):
    proposal_title = serializers.CharField(source="proposal.title", read_only=True)

    class Meta:
        model = ChatRoom
        fields = ["id", "proposal", "proposal_title", "investor", "entrepreneur", "created_at"]
