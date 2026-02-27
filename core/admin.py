from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Message

admin.site.register(Message)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        "username",
        "email",
        "first_name",
        "last_name",
        "is_verified",
        "is_staff",
        "is_active",
    )

    list_filter = (
        "is_verified",
        "is_staff",
        "is_superuser",
        "is_active",
    )

    search_fields = ("username", "email", "first_name", "last_name")
    ordering = ("-date_joined",)

    list_editable = ("is_verified",)

    fieldsets = BaseUserAdmin.fieldsets + (
        ("Qo‘shimcha ma'lumotlar", {
            "fields": ("image", "is_verified",),
        }),
    )