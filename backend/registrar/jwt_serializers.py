from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer

from .staff_presence import touch_staff_activity

User = get_user_model()


class RegistrarTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        touch_staff_activity(self.user, min_interval_seconds=0)
        return data


class RegistrarTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        refresh = self.token_class(attrs['refresh'])
        user_id = refresh.get('user_id')
        data = super().validate(attrs)
        if user_id is not None:
            user = User.objects.filter(pk=user_id).only('id', 'is_staff', 'is_superuser').first()
            if user and (user.is_staff or user.is_superuser):
                touch_staff_activity(user, min_interval_seconds=0)
        return data
