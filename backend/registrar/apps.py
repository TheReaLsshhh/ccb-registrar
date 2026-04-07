from django.apps import AppConfig


class RegistrarConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'registrar'

    def ready(self):
        # Register signal handlers (e.g. User → UserProfile for all creation paths).
        from . import signals  # noqa: F401
