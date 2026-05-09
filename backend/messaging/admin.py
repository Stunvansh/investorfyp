from django.contrib import admin

from .models import ChatRoom, Message, MessageNotification

admin.site.register(ChatRoom)
admin.site.register(Message)
admin.site.register(MessageNotification)
