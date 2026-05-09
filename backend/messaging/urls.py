from django.urls import path

from .views import ChatRoomsView, MarkMessageReadView, MessageSendView, ProposalMessagesView, UnreadCountView

urlpatterns = [
    path("messages/send/", MessageSendView.as_view(), name="message-send"),
    path("messages/proposal/<int:proposal_id>/", ProposalMessagesView.as_view(), name="proposal-messages"),
    path("messages/<int:message_id>/read/", MarkMessageReadView.as_view(), name="message-read"),
    path("messages/unread-count/", UnreadCountView.as_view(), name="message-unread-count"),
    path("messages/chats/", ChatRoomsView.as_view(), name="chat-rooms"),
]
