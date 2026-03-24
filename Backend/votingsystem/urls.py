from django.urls import path

from . import views


urlpatterns = [
    path("health/", views.HealthCheckView.as_view(), name="health"),
    path("auth/login/", views.AuthLoginView.as_view(), name="auth-login"),
    path("auth/google/", views.GoogleAuthView.as_view(), name="auth-google"),
    path("auth/forgot-password/", views.PasswordResetView.as_view(), name="auth-forgot-password"),
    path("auth/register/admin/", views.AdminRegistrationView.as_view(), name="auth-register-admin"),
    path("auth/register/voter/", views.VoterRegistrationView.as_view(), name="auth-register-voter"),
    path("admin/voters/", views.AdminCreateVoterView.as_view(), name="admin-create-voter"),
    path("admin/candidates/", views.AdminCreateCandidateView.as_view(), name="admin-create-candidate"),
    path(
        "admin/elections/<int:pk>/schedule/",
        views.AdminElectionScheduleUpdateView.as_view(),
        name="admin-election-schedule-update",
    ),
    path(
        "admin/elections/<int:pk>/schedule/save/",
        views.AdminElectionScheduleSaveView.as_view(),
        name="admin-election-schedule-save",
    ),
    path(
        "admin/elections/<int:pk>/announcements/",
        views.AdminElectionAnnouncementCreateView.as_view(),
        name="admin-election-announcement-create",
    ),
    path(
        "admin/elections/<int:pk>/notices/save/",
        views.AdminElectionNoticeSaveView.as_view(),
        name="admin-election-notice-save",
    ),
    path("auth/logout/", views.AuthLogoutView.as_view(), name="auth-logout"),
    path("auth/me/", views.CurrentUserView.as_view(), name="auth-me"),
    path("elections/", views.ElectionListView.as_view(), name="election-list"),
    path("elections/<int:pk>/", views.ElectionDetailView.as_view(), name="election-detail"),
    path("elections/<int:pk>/campaigns/", views.ElectionCampaignView.as_view(), name="election-campaigns"),
    path("elections/<int:pk>/ballot/", views.ElectionBallotView.as_view(), name="election-ballot"),
    path("elections/<int:pk>/results/", views.ElectionResultsView.as_view(), name="election-results"),
    path("elections/<int:pk>/stats/", views.ElectionStatsView.as_view(), name="election-stats"),
    path(
        "elections/<int:pk>/stats-stream/",
        views.election_stats_stream,
        name="election-stats-stream",
    ),
    path("votes/", views.CastVoteView.as_view(), name="vote-cast"),
]
