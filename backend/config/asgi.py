import os

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import OriginValidator
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

django_asgi_app = get_asgi_application()

from django.conf import settings

from registrar.routing import websocket_urlpatterns
from registrar.ws_auth import JWTQueryParamAuthMiddleware

websocket_stack = JWTQueryParamAuthMiddleware(URLRouter(websocket_urlpatterns))

application = ProtocolTypeRouter(
    {
        'http': django_asgi_app,
        'websocket': OriginValidator(websocket_stack, settings.CHANNELS_WS_ORIGINS),
    }
)
