from django.db import models
from django.contrib.auth.models import AbstractUser

from .utils import user_image_path

class User(AbstractUser):
    image = models.ImageField(upload_to=user_image_path, null=True, blank=True)
    is_verified = models.BooleanField(default=False)
    public_key = models.TextField(blank=True, default="")
    encrypted_private_key = models.TextField(blank=True, default="")


class Message(models.Model):
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sent_messages")
    receiver = models.ForeignKey(User, on_delete=models.CASCADE, related_name="received_messages")
    reply_to = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="replies")
    text = models.TextField()
    is_read = models.BooleanField(default=False)
    is_edited = models.BooleanField(default=False)
    edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["sender", "receiver", "created_at"]),
            models.Index(fields=["receiver", "is_read"]),
        ]

    def __str__(self):
        return f"{self.sender} - {self.receiver}"
