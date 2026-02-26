from django.urls import path
from .consumers import MessageConsumer

websocket_urlpatterns = [
    path("ws/private/<int:receiver_id>/", MessageConsumer.as_asgi())
]
