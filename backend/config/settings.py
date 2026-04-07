import os
from datetime import timedelta
from pathlib import Path
import socket

from dotenv import load_dotenv

def _dedupe_keep_order(values):
    return list(dict.fromkeys(values))

def parse_csv_env(name, default=None):
    raw = os.getenv(name, '')
    values = [item.strip() for item in raw.split(',') if item.strip()]
    if values:
        return values
    return list(default or [])

def get_lan_ips():
    ips = {"127.0.0.1"}

    # Primary routed local IP.
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
    except Exception:
        pass
    finally:
        s.close()

    # Additional IPv4 addresses for multi-NIC environments.
    try:
        hostname = socket.gethostname()
        for item in socket.getaddrinfo(hostname, None, family=socket.AF_INET):
            candidate = item[4][0]
            if candidate:
                ips.add(candidate)
    except Exception:
        pass

    return _dedupe_keep_order(list(ips))

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR.parent / '.env')

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'dev-only-insecure-secret')
DEBUG = os.getenv('DJANGO_DEBUG', 'True') == 'True'
LAN_IPS = get_lan_ips()
DEFAULT_ALLOWED_HOSTS = ["127.0.0.1", "localhost", *LAN_IPS]
ALLOWED_HOSTS = _dedupe_keep_order(parse_csv_env('DJANGO_ALLOWED_HOSTS', DEFAULT_ALLOWED_HOSTS) + DEFAULT_ALLOWED_HOSTS)

INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'channels',
    'corsheaders',
    'rest_framework',
    'registrar',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {'context_processors': [
            'django.template.context_processors.request',
            'django.contrib.auth.context_processors.auth',
            'django.contrib.messages.context_processors.messages',
        ]},
    }
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.getenv('MYSQL_DATABASE', 'enrollment_system'),
        'USER': os.getenv('MYSQL_USER', 'root'),
        'PASSWORD': os.getenv('MYSQL_PASSWORD', ''),
        'HOST': os.getenv('MYSQL_HOST', 'localhost'),
        'PORT': os.getenv('MYSQL_PORT', '3306'),
        'OPTIONS': {'charset': 'utf8mb4'},
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Manila'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'  # Used by collectstatic for deployment
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

DEFAULT_FRONTEND_ORIGINS = _dedupe_keep_order(
    [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        *[f"http://{ip}:5173" for ip in LAN_IPS if ip != "127.0.0.1"],
    ]
)

CORS_ALLOWED_ORIGINS = _dedupe_keep_order(
    parse_csv_env('CORS_ALLOWED_ORIGINS', DEFAULT_FRONTEND_ORIGINS) + DEFAULT_FRONTEND_ORIGINS
)

CSRF_TRUSTED_ORIGINS = _dedupe_keep_order(
    parse_csv_env('CSRF_TRUSTED_ORIGINS', CORS_ALLOWED_ORIGINS) + CORS_ALLOWED_ORIGINS
)

CORS_ALLOW_CREDENTIALS = True

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'registrar.authentication.JWTAuthenticationWithGlobalLogout',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=int(os.getenv('JWT_ACCESS_DAYS', '1'))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
}

CELERY_BROKER_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = CELERY_BROKER_URL

# Channels (prefer Redis DB 1 so Celery and the channel layer do not share keyspace)
def _channel_redis_url():
    explicit = os.getenv('CHANNEL_REDIS_URL', '').strip()
    if explicit:
        return explicit
    broker = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    if broker.endswith('/0'):
        return broker[:-1] + '1'
    return broker.rstrip('/') + '/1'


CHANNEL_LAYERS = {
    'default': {'BACKEND': 'channels_redis.core.RedisChannelLayer', 'CONFIG': {'hosts': [_channel_redis_url()]}},
}

# Shared cache for cross-process keys (e.g. staff-chat WebSocket connection counts). Optional: defaults to LocMem.
_cache_url = os.getenv('CACHE_REDIS_URL', '').strip()
if _cache_url:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': _cache_url,
        }
    }

# WebSocket Origin — mirror frontend dev/prod URLs (same hosts as CORS)
CHANNELS_WS_ORIGINS = _dedupe_keep_order(list(CORS_ALLOWED_ORIGINS))
