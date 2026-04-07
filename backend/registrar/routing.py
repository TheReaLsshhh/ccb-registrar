from django.urls import path

from .consumers import StaffChatConsumer

websocket_urlpatterns = [path('ws/staff-chat/', StaffChatConsumer.as_asgi())]
