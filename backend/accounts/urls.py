from django.urls import path

from .views import (
    AdminUserDetailView,
    AdminUserVerificationView,
    AdminUsersView,
    MeView,
    RegisterView,
    DemoCredentialsView,
    RequestEmailCodeView,
    VerificationFileDownloadView,
    VerificationView,
    VerifyEmailCodeView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("me/", MeView.as_view(), name="me"),
    path("verification/", VerificationView.as_view(), name="verification"),
    path("demo-credentials/", DemoCredentialsView.as_view(), name="demo-credentials"),
    path("request-email-code/", RequestEmailCodeView.as_view(), name="request-email-code"),
    path("verify-email-code/", VerifyEmailCodeView.as_view(), name="verify-email-code"),
    path("users/", AdminUsersView.as_view(), name="admin-users"),
    path("users/<int:user_id>/", AdminUserDetailView.as_view(), name="admin-user-detail"),
    path("users/<int:user_id>/verification/", AdminUserVerificationView.as_view(), name="admin-user-verification"),
    path("users/<int:user_id>/verification-files/<str:field_name>/", VerificationFileDownloadView.as_view(), name="verification-file-download"),
]
