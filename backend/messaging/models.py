from django.conf import settings
from django.db import models

from marketplace.models import Proposal


class ChatRoom(models.Model):
	proposal = models.OneToOneField(Proposal, on_delete=models.CASCADE, related_name="chat_room")
	investor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="investor_chat_rooms")
	entrepreneur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="entrepreneur_chat_rooms")
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-created_at"]


class Message(models.Model):
	chat_room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name="messages")
	proposal = models.ForeignKey(Proposal, on_delete=models.CASCADE, related_name="messages")
	sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sent_messages")
	recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="received_messages")
	content = models.TextField()
	is_read = models.BooleanField(default=False)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["created_at"]


class MessageNotification(models.Model):
	user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="message_notifications")
	message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="notifications")
	proposal = models.ForeignKey(Proposal, on_delete=models.CASCADE)
	is_read = models.BooleanField(default=False)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-created_at"]
