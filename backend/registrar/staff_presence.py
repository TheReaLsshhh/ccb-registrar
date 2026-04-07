"""Staff presence for peer lists (online / away / offline)."""

from __future__ import annotations

from django.utils import timezone

from .models import UserProfile

# Active within this window → "online".
ONLINE_SECONDS = 30

# "Offline" is not time-based: it applies when the user has no remaining live
# staff-chat websocket sessions, or when logout explicitly clears presence.
# Long idle while still connected → stays "away".

# Channels group: all connected staff-chat WebSockets join this to receive presence fan-out.
STAFF_CHAT_PRESENCE_GROUP = 'staffchat_all_staff'

_STAFF_WS_COUNT_KEY = 'staffchat_ws_count:{user_id}'


def staff_chat_ws_count_key(user_id: int) -> str:
    return _STAFF_WS_COUNT_KEY.format(user_id=user_id)


def staff_chat_ws_connection_incr(user_id: int) -> None:
    """Best-effort count of open staff-chat WebSockets for this user."""
    from django.core.cache import cache

    key = staff_chat_ws_count_key(user_id)
    try:
        cache.incr(key)
    except ValueError:
        cache.add(key, 1, timeout=None)


def staff_chat_ws_connection_decr(user_id: int) -> int:
    """Returns remaining connections after decrement (0 if none)."""
    from django.core.cache import cache

    key = staff_chat_ws_count_key(user_id)
    try:
        n = cache.decr(key)
        if n <= 0:
            cache.delete(key)
            return 0
        return n
    except ValueError:
        cache.delete(key)
        return 0


def staff_chat_ws_connection_get(user_id: int) -> int:
    from django.core.cache import cache

    v = cache.get(staff_chat_ws_count_key(user_id))
    return int(v) if v is not None else 0


def staff_chat_ws_count_reset(user_id: int) -> None:
    from django.core.cache import cache

    cache.delete(staff_chat_ws_count_key(user_id))


def mark_staff_presence_offline(user_id: int, *, reset_ws_counter: bool = False) -> None:
    """
    Clear last activity and fan out offline when the user truly has no live chat session.

    `reset_ws_counter=True` is used for explicit logout/logout-all. Best-effort tab-close
    pings should not force offline while the same account is still active elsewhere.
    """
    if reset_ws_counter:
        staff_chat_ws_count_reset(user_id)
    elif staff_chat_ws_connection_get(user_id) > 0:
        broadcast_staff_presence_for_user_id(user_id)
        return

    UserProfile.objects.filter(user_id=user_id).update(last_activity_at=None)
    broadcast_staff_presence_for_user_id(user_id)


def broadcast_staff_presence_for_user_id(user_id: int) -> None:
    """Push updated presence to every connected staff chat client (real-time dots)."""
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer
    from django.contrib.auth import get_user_model

    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    User = get_user_model()
    user = User.objects.filter(pk=user_id).select_related('profile').first()
    if not user or not (user.is_staff or user.is_superuser):
        return

    presence = staff_presence_status(user)
    profile = getattr(user, 'profile', None)
    at_iso = None
    if profile and profile.last_activity_at:
        at_iso = profile.last_activity_at.isoformat()

    payload = {
        'type': 'staff_chat.presence',
        'user_id': user_id,
        'presence': presence,
        'last_activity_at': at_iso,
    }
    async_to_sync(channel_layer.group_send)(
        STAFF_CHAT_PRESENCE_GROUP,
        {'type': 'notify_presence', 'payload': payload},
    )


def touch_staff_activity(user, *, min_interval_seconds: int = 25) -> None:
    """Record activity for registrar staff (used for peer presence)."""
    if not getattr(user, 'is_authenticated', False) or not (user.is_staff or user.is_superuser):
        return

    profile = UserProfile.objects.filter(user_id=user.pk).only('id', 'last_activity_at').first()
    now = timezone.now()
    if profile is None:
        UserProfile.objects.create(user=user, last_activity_at=now)
        broadcast_staff_presence_for_user_id(user.pk)
        return
    if min_interval_seconds > 0 and profile.last_activity_at:
        elapsed = (now - profile.last_activity_at).total_seconds()
        if elapsed < min_interval_seconds:
            return
    UserProfile.objects.filter(pk=profile.pk).update(last_activity_at=now)
    broadcast_staff_presence_for_user_id(user.pk)


def staff_presence_status(user) -> str:
    """
    Return 'online', 'away', or 'offline' (expects profile prefetched when possible).

    - online: last activity within ONLINE_SECONDS.
    - away: still connected/logged in, but idle longer than ONLINE_SECONDS.
    - offline: no live staff-chat websocket session, no last_activity_at, or no profile.
    """
    if not hasattr(user, 'profile'):
        return 'offline'
    profile = user.profile
    ws_connections = staff_chat_ws_connection_get(user.pk)
    if ws_connections <= 0:
        return 'offline'
    if not profile.last_activity_at:
        return 'offline'

    delta = (timezone.now() - profile.last_activity_at).total_seconds()
    if delta < ONLINE_SECONDS:
        return 'online'
    return 'away'
