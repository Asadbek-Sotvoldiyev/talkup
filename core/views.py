from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import redirect, get_object_or_404
from django.urls import reverse_lazy
from django.utils import timezone
from django.views import View, generic
from django.views.generic import ListView, TemplateView
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import Q, Count, OuterRef, Subquery, IntegerField, Exists
from django.contrib.admin.views.decorators import staff_member_required
from django.utils.decorators import method_decorator
from django.db.models.functions import Coalesce
from django.core.cache import cache
from django.contrib.auth import get_user_model
from django.contrib import messages

from .models import Message
from .mixins import LoginNoRequiredMixin
from .forms import UserForm

User = get_user_model()


def display_name(u):
    return (u.get_full_name() or "").strip() or u.username


class ChatListView(LoginRequiredMixin, ListView):
    model = User
    template_name = "chat-list.html"
    context_object_name = "users"

    def get_queryset(self):
        me = self.request.user

        conv_exists = Message.objects.filter(
            Q(sender=OuterRef("pk"), receiver=me) |
            Q(sender=me, receiver=OuterRef("pk"))
        )

        unread_sq = (
            Message.objects
            .filter(sender=OuterRef("pk"), receiver=me, is_read=False)
            .values("sender")
            .annotate(c=Count("id"))
            .values("c")[:1]
        )

        return (
            User.objects
            .exclude(id=me.id)
            .annotate(has_chat=Exists(conv_exists))
            .filter(has_chat=True)
            .annotate(unread_count=Coalesce(Subquery(unread_sq, output_field=IntegerField()), 0))
            .order_by("username")
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        users = []

        for user in context["users"]:
            users.append({
                "id": user.id,
                "name": display_name(user),
                "username": user.username,
                "image": user.image,
                "online": bool(cache.get(f"online:{user.id}")),
                "unread": user.unread_count,
                "is_verified": user.is_verified,
            })

        context["form"] = UserForm(instance=self.request.user)
        context["users"] = users
        return context


class SearchUsersView(LoginRequiredMixin, View):
    def get(self, request):
        q = (request.GET.get("q") or "").strip()
        if q.startswith("@"):
            q = q[1:]

        if len(q) < 2:
            return JsonResponse({"results": []})

        me = request.user

        qs = (
            User.objects
            .exclude(id=me.id)
            .filter(username__icontains=q)
            .order_by("username")[:20]
        )

        results = []
        for user in qs:
            results.append({
                "username": user.username,
                "name": display_name(user),
                "is_verified": bool(getattr(user, "is_verified", False)),
                "online": bool(cache.get(f"online:{user.id}")),
            })

        return JsonResponse({"results": results})


class ChatDeleteView(LoginRequiredMixin, View):
    def post(self, request, username):
        me = request.user
        other = get_object_or_404(User, username=username)

        if other.id == me.id:
            messages.error(request, "O'zing bilan chatni o'chirib bo'lmaydi.")
            return redirect("chat-list")

        with transaction.atomic():
            qs = Message.objects.filter(
                Q(sender=me, receiver=other) | Q(sender=other, receiver=me)
            )
            deleted_count, _ = qs.delete()

        if deleted_count:
            messages.success(request, "Chat o'chirildi.")
        else:
            messages.info(request, "Chat topilmadi.")

        return redirect("chat-list")


class PrivateChatView(LoginRequiredMixin, TemplateView):
    template_name = "chat-room.html"

    def dispatch(self, request, *args, **kwargs):
        self.receiver = get_object_or_404(User, username=kwargs["username"])

        if self.receiver.id == request.user.id:
            return redirect("chat-list")

        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        receiver = self.receiver

        context.update({
            "receiver_id": receiver.id,
            "receiver_name": display_name(receiver),
            "receiver_image": receiver.image,
            "receiver_status": (
                "onlayn"
                if bool(cache.get(f"online:{receiver.id}"))
                else "yaqinda onlayn edi"
            ),
            "me_id": self.request.user.id,
            "receiver_is_verified": receiver.is_verified,
        })

        return context


class HomePageView(LoginNoRequiredMixin, TemplateView):
    template_name = "index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        context['year'] = timezone.now().year

        return context


class LoginPageView(LoginNoRequiredMixin, TemplateView):
    template_name = "registration/login.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        context['year'] = timezone.now().year

        return context


class TermsPageView(TemplateView):
    template_name = "registration/terms.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        context['updated_at'] = timezone.now()

        return context


class ProfileUpdateView(LoginRequiredMixin, generic.UpdateView):
    model = User
    form_class = UserForm
    template_name = "chat-list.html"
    success_url = reverse_lazy("chat-list")

    def get_object(self, queryset=None):
        return self.request.user

    def get_chat_users_queryset(self):
        me = self.get_object()

        conv_exists = Message.objects.filter(
            Q(sender=OuterRef("pk"), receiver=me) |
            Q(sender=me, receiver=OuterRef("pk"))
        )

        unread_sq = (
            Message.objects
            .filter(sender=OuterRef("pk"), receiver=me, is_read=False)
            .values("sender")
            .annotate(c=Count("id"))
            .values("c")[:1]
        )

        return (
            User.objects
            .exclude(id=me.id)
            .annotate(has_chat=Exists(conv_exists))
            .filter(has_chat=True)
            .annotate(unread_count=Coalesce(Subquery(unread_sq, output_field=IntegerField()), 0))
            .order_by("username")
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        users = []
        for user in self.get_chat_users_queryset():
            users.append({
                "id": user.id,
                "name": display_name(user),
                "username": user.username,
                "image": user.image,
                "online": bool(cache.get(f"online:{user.id}")),
                "unread": user.unread_count,
                "is_verified": user.is_verified,
            })

        context["users"] = users
        return context

    def form_valid(self, form):

        if form.has_changed():
            messages.success(self.request, "Ma'lumotlar yangilandi.")
        else:
            messages.info(self.request, "Hech qanday o'zgarish kiritilmadi.")

        return super().form_valid(form)

    def form_invalid(self, form):
        msg = "Ma'lumot yangilanmadi."
        if form.errors:
            first_field = next(iter(form.errors))
            msg = form.errors[first_field][0]
        messages.error(self.request, msg)

        return redirect("chat-list")


@method_decorator(staff_member_required, name='dispatch')
class ToggleVerifyView(View):

    def post(self, request, username, *args, **kwargs):
        user = get_object_or_404(User, username=username)

        user.is_verified = not user.is_verified
        user.save()

        return JsonResponse({
            "is_verified": user.is_verified
        })