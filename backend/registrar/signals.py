"""Model signals — keep cross-cutting invariants for every user account."""

from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import UserProfile

User = get_user_model()


@receiver(post_save, sender=User)
def ensure_user_profile_exists(sender, instance, **kwargs):
    """
    Every Django user gets a UserProfile row (registrar API, admin, fixtures, future flows).

    MeSerializer, staff-chat unread totals, JWT invalidation, and presence rely on this existing
    or being created lazily; the signal removes gaps for newly created accounts before first /me/.
    """
    UserProfile.objects.get_or_create(user=instance)
