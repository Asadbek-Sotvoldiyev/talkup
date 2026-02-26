from cryptography.fernet import Fernet
from django.conf import settings

fernet = Fernet(settings.MESSAGE_ENCRYPTION_KEY)


def encrypt_text(text: str) -> str:
    return fernet.encrypt(text.encode()).decode()


def decrypt_text(token: str) -> str:
    return fernet.decrypt(token.encode()).decode()


def user_image_path(instance, filename):
    return f"images/{instance.pk}/{filename}"
