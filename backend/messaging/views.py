from django.db.models import Count, Q
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from common.responses import list_envelope
from marketplace.models import Proposal
from .models import ChatRoom, Message, MessageNotification
from .serializers import ChatRoomSerializer, MessageSerializer


def _is_participant(user, proposal: Proposal) -> bool:
	return proposal.entrepreneur_id == user.id or proposal.signals.filter(investor_id=user.id, status="accepted").exists()


class MessageSendView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def post(self, request):
		proposal_id = request.data.get("proposal")
		content = (request.data.get("content") or "").strip()
		if not proposal_id or not content:
			return Response({"detail": "proposal and content are required"}, status=status.HTTP_400_BAD_REQUEST)

		proposal = Proposal.objects.get(pk=proposal_id)
		if not _is_participant(request.user, proposal):
			raise PermissionDenied("You are not a participant in this chat.")

		accepted_signal = proposal.signals.filter(status="accepted").order_by("-created_at").first()
		if not accepted_signal and not hasattr(proposal, "chat_room"):
			raise ValidationError("No accepted investor signal exists for this proposal yet.")

		room, _ = ChatRoom.objects.get_or_create(
			proposal=proposal,
			defaults={
				"investor": request.user if request.user.role == "investor" else accepted_signal.investor,
				"entrepreneur": proposal.entrepreneur,
			},
		)
		recipient = room.entrepreneur if request.user.id == room.investor_id else room.investor
		message = Message.objects.create(
			chat_room=room,
			proposal=proposal,
			sender=request.user,
			recipient=recipient,
			content=content,
		)
		MessageNotification.objects.create(user=recipient, message=message, proposal=proposal)
		return Response(MessageSerializer(message).data, status=status.HTTP_201_CREATED)


class ProposalMessagesView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request, proposal_id: int):
		proposal = Proposal.objects.get(pk=proposal_id)
		if not _is_participant(request.user, proposal):
			raise PermissionDenied("You are not a participant in this chat.")

		queryset = Message.objects.filter(proposal=proposal).select_related("sender", "recipient")
		Message.objects.filter(proposal=proposal, recipient=request.user, is_read=False).update(is_read=True)
		MessageNotification.objects.filter(proposal=proposal, user=request.user, is_read=False).update(is_read=True)

		serializer = MessageSerializer(queryset, many=True)
		return list_envelope(serializer.data, count=queryset.count())


class MarkMessageReadView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def post(self, request, message_id: int):
		message = Message.objects.get(pk=message_id)
		if message.recipient_id != request.user.id:
			raise PermissionDenied("Only recipient can mark message read.")
		message.is_read = True
		message.save(update_fields=["is_read"])
		MessageNotification.objects.filter(message=message, user=request.user).update(is_read=True)
		return Response({"status": "ok"})


class UnreadCountView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		unread_qs = Message.objects.filter(recipient=request.user, is_read=False)
		by_proposal = unread_qs.values("proposal_id").annotate(count=Count("id"))
		return Response(
			{
				"total": unread_qs.count(),
				"by_proposal": [{"proposal": row["proposal_id"], "count": row["count"]} for row in by_proposal],
			}
		)


class ChatRoomsView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		rooms = ChatRoom.objects.filter(Q(investor=request.user) | Q(entrepreneur=request.user)).select_related("proposal")
		payload = []
		for room in rooms:
			last_message = room.messages.order_by("-created_at").first()
			unread = room.messages.filter(recipient=request.user, is_read=False).count()
			payload.append(
				{
					**ChatRoomSerializer(room).data,
					"last_message": last_message.content if last_message else "",
					"last_message_at": last_message.created_at if last_message else None,
					"unread_count": unread,
				}
			)

		return list_envelope(payload, count=len(payload))
