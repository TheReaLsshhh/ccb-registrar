from __future__ import annotations

from datetime import datetime, timezone

from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import UserProfile


class JWTAuthenticationWithGlobalLogout(JWTAuthentication):
    """
    Adds server-side token invalidation to SimpleJWT using a per-user timestamp.

    If a user triggers "logout all devices", we store a cutoff time in UserProfile.
    Any JWT with iat < cutoff is rejected, forcing all devices to re-authenticate.
    """

    def authenticate(self, request):
        result = super().authenticate(request)
        if not result:
            return None

        user, validated_token = result

        try:
            profile, _ = UserProfile.objects.get_or_create(user=user)
        except Exception:
            return result

        cutoff = profile.token_invalid_before
        if not cutoff:
            return result

        iat = validated_token.get('iat')
        if not iat:
            return result

        issued_at = datetime.fromtimestamp(int(iat), tz=timezone.utc)
        cutoff_utc = cutoff.astimezone(timezone.utc)
        if issued_at < cutoff_utc:
            raise AuthenticationFailed('Session expired. Please log in again.', code='token_not_valid')

        return result

