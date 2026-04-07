from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken

from .models import UserProfile

User = get_user_model()


@database_sync_to_async
def get_user_from_websocket_token(token_string: str):
    try:
        validated = AccessToken(token_string)
        user_id = validated.get('user_id')
        if not user_id:
            return AnonymousUser()
        user = User.objects.get(pk=user_id)
    except Exception:
        return AnonymousUser()

    if not user.is_active:
        return AnonymousUser()

    profile = UserProfile.objects.filter(user=user).first()
    if profile and profile.token_invalid_before:
        iat = validated.get('iat')
        if iat is not None:
            issued_at = datetime.fromtimestamp(int(iat), tz=timezone.utc)
            cutoff = profile.token_invalid_before.astimezone(timezone.utc)
            if issued_at < cutoff:
                return AnonymousUser()
    return user


class JWTQueryParamAuthMiddleware:
    """Populates scope['user'] from ?token=<access_jwt>."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        raw_qs = scope.get('query_string', b'') or b''
        params = parse_qs(raw_qs.decode())
        tokens = params.get('token') or []
        if not tokens:
            scope = dict(scope)
            scope['user'] = AnonymousUser()
            return await self.inner(scope, receive, send)

        scope = dict(scope)
        scope['user'] = await get_user_from_websocket_token(tokens[0])
        return await self.inner(scope, receive, send)


