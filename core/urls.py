from django.urls import path
from .views import *

urlpatterns = [
    path("", HomePageView.as_view(), name="home"),
    path("profile/update/", ProfileUpdateView.as_view(), name="profile-update"),
    path("chats/", ChatListView.as_view(), name="chat-list"),
    path("chats/<str:username>/", PrivateChatView.as_view(), name="private-chat"),
    path("chats/<str:username>/delete/", ChatDeleteView.as_view(), name="chat-delete"),
    path("chats/<str:username>/verify/", ToggleVerifyView.as_view(), name="toggle-verify"),
    path("search/", SearchUsersView.as_view(), name="search-users"),
    path("api/keys/setup/", KeySetupView.as_view(), name="key-setup"),
    path("api/keys/user/<int:user_id>/", GetPublicKeyView.as_view(), name="get-public-key"),
    path("api/keys/my-private/", GetMyPrivateKeyView.as_view(), name="get-my-private-key"),
]
