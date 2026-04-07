from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from registrar.jwt_serializers import RegistrarTokenObtainPairSerializer, RegistrarTokenRefreshSerializer

urlpatterns = [
    path('admin/', admin.site.urls),
    path(
        'api/auth/login/',
        TokenObtainPairView.as_view(serializer_class=RegistrarTokenObtainPairSerializer),
        name='token_obtain_pair',
    ),
    path(
        'api/auth/refresh/',
        TokenRefreshView.as_view(serializer_class=RegistrarTokenRefreshSerializer),
        name='token_refresh',
    ),
    path('api/', include('registrar.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
