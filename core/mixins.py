from django.contrib.auth.mixins import AccessMixin
from django.shortcuts import redirect


class LoginNoRequiredMixin(AccessMixin):
    login_url = 'chat-list'

    def dispatch(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            return redirect(self.get_login_url())
        return super().dispatch(request, *args, **kwargs)