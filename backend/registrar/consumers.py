from __future__ import annotations

import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from .staff_presence import STAFF_CHAT_PRESENCE_GROUP


@database_sync_to_async
def _touch_staff_presence_on_ws_connect(user):
    from .staff_presence import touch_staff_activity

    touch_staff_activity(user, min_interval_seconds=0)


@database_sync_to_async
def _staff_chat_ws_incr(user_id: int):
    from .staff_presence import staff_chat_ws_connection_incr

    staff_chat_ws_connection_incr(user_id)


@database_sync_to_async
def _staff_chat_ws_decr(user_id: int) -> int:
    from .staff_presence import staff_chat_ws_connection_decr

    return staff_chat_ws_connection_decr(user_id)


@database_sync_to_async
def _mark_staff_presence_offline_if_last_ws(user_id: int, remaining_connections: int):
    if remaining_connections > 0:
        return
    from .staff_presence import mark_staff_presence_offline

    mark_staff_presence_offline(user_id, reset_ws_counter=False)


class StaffChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get('user')
        if getattr(user, 'is_authenticated', False) and (user.is_staff or user.is_superuser):
            self.group_name = f'staffchat_user_{user.id}'
            await self.channel_layer.group_add(STAFF_CHAT_PRESENCE_GROUP, self.channel_name)
            self.joined_presence_group = True
            await self.channel_layer.group_add(self.group_name, self.channel_name)
            await self.accept()
            await _staff_chat_ws_incr(user.id)
            self._staff_chat_ws_tracked = True
            await _touch_staff_presence_on_ws_connect(user)
            return
        await self.close(code=4003)

    async def disconnect(self, code):
        user = self.scope.get('user')
        if getattr(self, '_staff_chat_ws_tracked', False) and getattr(user, 'is_authenticated', False):
            uid = user.id
            remaining = await _staff_chat_ws_decr(uid)
            await _mark_staff_presence_offline_if_last_ws(uid, remaining)

        if getattr(self, 'joined_presence_group', False):
            await self.channel_layer.group_discard(STAFF_CHAT_PRESENCE_GROUP, self.channel_name)
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def notify_presence(self, event):
        await self.send(text_data=json.dumps(event['payload']))

    async def notify_message(self, event):
        await self.send(text_data=json.dumps(event['payload']))
