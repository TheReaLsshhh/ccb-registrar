from __future__ import annotations

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth.models import User
from django.db.models import Q

from .models import StaffChatConversation, StaffChatMessageHidden, StaffChatReadState

logger = logging.getLogger(__name__)

_channel_layer_missing_logged = False

_IMAGE_SUFFIXES = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp')


def staff_chat_attachment_kind(message) -> str | None:
    """Return 'image', 'file', or None — mirrors StaffChatMessageSerializer logic."""

    if not message.attachment or not message.attachment.name:
        return None
    name = (message.attachment_original_name or message.attachment.name or '').lower()
    if name.endswith(_IMAGE_SUFFIXES):
        return 'image'
    return 'file'


def staff_chat_delete_list_preview(*, actor_username: str, message) -> str:
    """Human-readable conversation-list line after delete-for-everyone (hard delete)."""

    u = (actor_username or 'someone').strip() or 'someone'
    body = (message.body or '').strip()
    has_text = bool(body)
    kind = staff_chat_attachment_kind(message)
    if kind == 'image':
        if has_text:
            return f'{u} deleted a message and photo'
        return f'{u} deleted a photo'
    if kind == 'file':
        if has_text:
            return f'{u} deleted a message and file'
        return f'{u} deleted a file'
    return f'{u} deleted a message'


def set_thread_list_preview_for_participants(
    *,
    conversation: StaffChatConversation,
    body: str,
    at,
    sender_id: int | None,
    source_message,
) -> None:
    for uid in (conversation.user_a_id, conversation.user_b_id):
        rs, _ = StaffChatReadState.objects.get_or_create(conversation=conversation, user_id=uid)
        rs.thread_list_preview_body = body
        rs.thread_list_preview_at = at
        rs.thread_list_preview_sender_id = sender_id
        rs.thread_list_preview_message = source_message
        rs.save()


def set_thread_list_preview_for_user(
    *,
    conversation: StaffChatConversation,
    user_id: int,
    body: str,
    at,
    sender_id: int | None,
    source_message,
) -> None:
    rs, _ = StaffChatReadState.objects.get_or_create(conversation=conversation, user_id=user_id)
    rs.thread_list_preview_body = body
    rs.thread_list_preview_at = at
    rs.thread_list_preview_sender_id = sender_id
    rs.thread_list_preview_message = source_message
    rs.save()


def clear_thread_list_preview_for_conversation(conversation: StaffChatConversation) -> None:
    StaffChatReadState.objects.filter(conversation=conversation).update(
        thread_list_preview_body='',
        thread_list_preview_at=None,
        thread_list_preview_sender_id=None,
        thread_list_preview_message_id=None,
    )


def staff_chat_reaction_list_preview(*, viewer_id: int, actor_id: int, actor_username: str, message, emoji: str) -> str:
    actor_name = (actor_username or 'Someone').strip() or 'Someone'
    if viewer_id == actor_id:
        return f'You reacted {emoji} to a message'
    if viewer_id == getattr(message, 'sender_id', None):
        return f'Reacted {emoji} to your message'
    return f'{actor_name} reacted {emoji} to a message'


def messages_visible_to_user_qs(conversation: StaffChatConversation, user: User):
    hidden_ids = StaffChatMessageHidden.objects.filter(user=user).values('message_id')
    return conversation.messages.exclude(id__in=hidden_ids)


def broadcast_staff_chat_payload(payload: dict, user_ids: list[int] | tuple[int, ...]) -> None:
    layer = get_channel_layer()
    if not layer:
        global _channel_layer_missing_logged
        if not _channel_layer_missing_logged:
            _channel_layer_missing_logged = True
            logger.warning(
                'Staff chat realtime: channel layer is not configured (Redis / CHANNEL_LAYERS). '
                'Live message notifications will not reach browsers until this is fixed.'
            )
        return
    try:
        for uid in {int(x) for x in user_ids}:
            async_to_sync(layer.group_send)(
                f'staffchat_user_{uid}',
                {'type': 'notify.message', 'payload': payload},
            )
    except Exception as exc:
        logger.warning('Staff chat realtime broadcast skipped: %s', exc)


def ordered_staff_pair(user_one: User, user_two: User) -> tuple[User, User]:
    if user_one.pk == user_two.pk:
        raise ValueError('Cannot open a staff chat with yourself.')
    if user_one.pk < user_two.pk:
        return user_one, user_two
    return user_two, user_one


def get_or_create_staff_conversation(user_one: User, user_two: User) -> tuple[StaffChatConversation, bool]:
    a, b = ordered_staff_pair(user_one, user_two)
    return StaffChatConversation.objects.get_or_create(user_a=a, user_b=b)


def sync_staff_chat_read_state(conversation: StaffChatConversation, viewer: User) -> None:
    """Mark everything currently in the thread as read for viewer (latest message cursor)."""
    latest = messages_visible_to_user_qs(conversation, viewer).order_by('-created_at', '-id').first()
    state, _ = StaffChatReadState.objects.get_or_create(conversation=conversation, user=viewer)
    state.last_read_message = latest
    state.save(update_fields=['last_read_message', 'updated_at'])


def staff_chat_unread_count_for_viewer(conversation: StaffChatConversation, viewer: User) -> int:
    """Messages sent by the other participant that viewer has not read yet (respects hidden-for-me)."""
    qs = messages_visible_to_user_qs(conversation, viewer).exclude(sender=viewer)
    state = StaffChatReadState.objects.filter(conversation=conversation, user=viewer).first()
    if not state or not state.last_read_message_id:
        return qs.count()
    lr = state.last_read_message
    if lr is None:
        return qs.count()
    return qs.filter(Q(created_at__gt=lr.created_at) | Q(created_at=lr.created_at, id__gt=lr.id)).count()


def staff_chat_total_unread_for_user(user: User) -> int:
    """Sum of unread incoming messages across all staff chat threads (staff accounts only)."""

    if not user.is_authenticated or not user.is_active or not (user.is_staff or user.is_superuser):
        return 0
    total = 0
    convs = StaffChatConversation.objects.filter(Q(user_a=user) | Q(user_b=user)).only(
        'id', 'user_a_id', 'user_b_id', 'created_at', 'updated_at'
    )
    for conv in convs:
        total += staff_chat_unread_count_for_viewer(conv, user)
    return total


# Reactions: validate against this set in the message-reaction API.
STAFF_CHAT_ALLOWED_REACTION_EMOJIS = frozenset({'👍', '❤️', '😂', '😮', '😢', '🙏'})


def broadcast_staff_chat_message(*, conversation_id: int, message_payload: dict, user_a_id: int, user_b_id: int) -> None:
    """Push new message to WebSocket subscribers. Fails quietly if Redis/channel layer is down."""
    envelope = {'type': 'staff_chat.message', 'conversation_id': conversation_id, 'message': message_payload}
    broadcast_staff_chat_payload(envelope, [user_a_id, user_b_id])
