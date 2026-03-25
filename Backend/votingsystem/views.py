import time
import logging

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404, HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
import requests
from rest_framework import generics, permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Candidate, Election
from .serializers import (
    AdminElectionNoticeSaveSerializer,
    AdminElectionScheduleSaveSerializer,
    AdminCreateCandidateSerializer,
    AdminCreateVoterSerializer,
    AdminRegistrationSerializer,
    AnnouncementSerializer,
    AnnouncementCreateSerializer,
    CandidateSerializer,
    CandidateCampaignUpdateSerializer,
    ElectionDetailSerializer,
    ElectionListSerializer,
    ElectionScheduleUpdateSerializer,
    GoogleAuthSerializer,
    PasswordResetSerializer,
    PositionSerializer,
    ResultsSerializer,
    UserSummarySerializer,
    VoterRegistrationSerializer,
    VoteCreateSerializer,
    VoteSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)
from .services import (
    build_election_stats,
    cast_vote,
    eligible_positions_for_user,
    results_visible,
    serialize_stats_event,
)


def _serialize_user(user):
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.display_name,
        "email": user.email,
        "role": user.role,
        "department": user.department,
        "section": user.section,
        "registration_number": user.registration_number,
        "staff_id": user.staff_id,
        "auth_provider": user.auth_provider,
    }


def _username_from_email(email):
    base_username = (email or "").split("@")[0] or "google-user"
    candidate = base_username
    suffix = 1
    while User.objects.filter(username=candidate).exists():
        candidate = f"{base_username}{suffix}"
        suffix += 1
    return candidate


def _verify_google_identity(*, credential="", code=""):
    if credential:
        return google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.GOOGLE_OAUTH_CLIENT_ID,
        )

    token_response = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "redirect_uri": "postmessage",
            "grant_type": "authorization_code",
        },
        timeout=15,
    )
    if token_response.status_code != 200:
        raise ValueError("Google token exchange failed.")
    token_payload = token_response.json()
    id_token_value = token_payload.get("id_token")
    if not id_token_value:
        raise ValueError("Google did not return an ID token.")
    return google_id_token.verify_oauth2_token(
        id_token_value,
        google_requests.Request(),
        settings.GOOGLE_OAUTH_CLIENT_ID,
    )


def _normalize_vote_error(detail):
    if isinstance(detail, str) and "already exists" in detail.lower():
        return "You have already voted for this position in this election."
    return detail


class IsAdminRole(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.ADMIN
        )


class HealthCheckView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        return Response({"status": "ok"})


class AuthLoginView(ObtainAuthToken):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        username = request.data.get("username", "")
        password = request.data.get("password", "")
        user = authenticate(request=request, username=username, password=password)
        if not user:
            return Response(
                {"detail": "Invalid username or password."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSummarySerializer(_serialize_user(user)).data})


class GoogleAuthView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = GoogleAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not settings.GOOGLE_OAUTH_CLIENT_ID:
            return Response(
                {"detail": "Google sign-in is not configured on the server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        if serializer.validated_data.get("code") and not settings.GOOGLE_OAUTH_CLIENT_SECRET:
            return Response(
                {"detail": "Google sign-in secret is not configured on the server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            idinfo = _verify_google_identity(
                credential=serializer.validated_data.get("credential", ""),
                code=serializer.validated_data.get("code", ""),
            )
        except ValueError:
            return Response(
                {"detail": "Google sign-in could not be verified."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except requests.RequestException:
            return Response(
                {"detail": "Google sign-in is temporarily unavailable. Please try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception:
            logger.exception("Google sign-in failed unexpectedly.")
            return Response(
                {"detail": "Google sign-in could not be completed right now."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if not idinfo.get("email_verified"):
            return Response(
                {"detail": "Google account email is not verified."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = (idinfo.get("email") or "").strip().lower()
        google_id = idinfo.get("sub", "")
        full_name = (idinfo.get("name") or "").strip()
        requested_role = serializer.validated_data.get("role") or "voter"

        if not email or not google_id:
            return Response(
                {"detail": "Google sign-in did not return a valid account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(email__iexact=email).first()
        if not user and requested_role in {"admin", "candidate"}:
            return Response(
                {
                    "detail": (
                        "This Google account is not linked to an existing admin or candidate record."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user:
            if user.google_id and user.google_id != google_id:
                return Response(
                    {"detail": "This email is already linked to a different Google account."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if requested_role == "admin" and user.role != User.Role.ADMIN:
                return Response(
                    {"detail": "This Google account does not have admin access."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if requested_role == "voter" and user.role == User.Role.ADMIN:
                return Response(
                    {"detail": "Admin accounts must use the admin portal."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if requested_role == "candidate" and user.role == User.Role.ADMIN:
                return Response(
                    {"detail": "Admin accounts must use the admin portal."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            user.google_id = google_id
            user.auth_provider = User.AuthProvider.GOOGLE
            if not user.first_name and full_name:
                name_parts = full_name.split()
                user.first_name = name_parts[0]
                user.last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""
            user.save(update_fields=["google_id", "auth_provider", "first_name", "last_name"])
        else:
            name_parts = full_name.split()
            user = User.objects.create_user(
                username=_username_from_email(email),
                email=email,
                first_name=name_parts[0] if name_parts else "",
                last_name=" ".join(name_parts[1:]) if len(name_parts) > 1 else "",
                role=User.Role.STUDENT,
                google_id=google_id,
                auth_provider=User.AuthProvider.GOOGLE,
            )

        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSummarySerializer(_serialize_user(user)).data})


class PasswordResetView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        identity = serializer.validated_data["identity"].strip()
        user = User.objects.filter(username__iexact=identity).first() or User.objects.filter(
            email__iexact=identity
        ).first()
        if not user:
            return Response(
                {"detail": "No account was found with that username or email."},
                status=status.HTTP_404_NOT_FOUND,
            )

        user.set_password(serializer.validated_data["new_password"])
        if user.auth_provider == User.AuthProvider.GOOGLE:
            user.auth_provider = User.AuthProvider.LOCAL
        user.save(update_fields=["password", "auth_provider"])
        return Response({"detail": "Password updated successfully."})


class AdminRegistrationView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = AdminRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {"token": token.key, "user": UserSummarySerializer(_serialize_user(user)).data},
            status=status.HTTP_201_CREATED,
        )


class VoterRegistrationView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = VoterRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {"token": token.key, "user": UserSummarySerializer(_serialize_user(user)).data},
            status=status.HTTP_201_CREATED,
        )


class AdminCreateVoterView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, *args, **kwargs):
        serializer = AdminCreateVoterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {"user": UserSummarySerializer(_serialize_user(user)).data},
            status=status.HTTP_201_CREATED,
        )


class AdminCreateCandidateView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk=None, *args, **kwargs):
        if pk is None:
            return Response(
                {"detail": "Election selection is required for candidate registration."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        election = get_object_or_404(Election, pk=pk)
        serializer = AdminCreateCandidateSerializer(
            data=request.data,
            context={"request": request, "election": election},
        )
        serializer.is_valid(raise_exception=True)
        candidate = serializer.save()
        return Response(
            CandidateSerializer(candidate, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class CandidateCampaignUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk, *args, **kwargs):
        election = get_object_or_404(Election, pk=pk, is_published=True)
        candidate = get_object_or_404(
            Candidate.objects.select_related("user", "position", "department", "section"),
            election=election,
            user=request.user,
        )
        serializer = CandidateCampaignUpdateSerializer(candidate, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(CandidateSerializer(candidate, context={"request": request}).data)


class AdminElectionScheduleUpdateView(APIView):
    permission_classes = [IsAdminRole]

    def patch(self, request, pk, *args, **kwargs):
        election = get_object_or_404(Election, pk=pk)
        serializer = ElectionScheduleUpdateSerializer(election, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ElectionDetailSerializer(election, context={"request": request}).data)


class AdminElectionScheduleSaveView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk, *args, **kwargs):
        election = get_object_or_404(Election, pk=pk)
        serializer = AdminElectionScheduleSaveSerializer(
            data=request.data,
            context={"election": election},
        )
        serializer.is_valid(raise_exception=True)
        election = serializer.save()
        return Response(ElectionDetailSerializer(election, context={"request": request}).data)


class AdminElectionAnnouncementCreateView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk, *args, **kwargs):
        election = get_object_or_404(Election, pk=pk)
        serializer = AnnouncementCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        announcement = serializer.save(election=election)
        return Response(AnnouncementSerializer(announcement).data, status=status.HTTP_201_CREATED)


class AdminElectionNoticeSaveView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk, *args, **kwargs):
        election = get_object_or_404(Election, pk=pk)
        serializer = AdminElectionNoticeSaveSerializer(
            data=request.data,
            context={"election": election},
        )
        serializer.is_valid(raise_exception=True)
        announcement = serializer.save()
        return Response(AnnouncementSerializer(announcement).data, status=status.HTTP_201_CREATED)


class AuthLogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        if request.auth:
            request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        return Response(UserSummarySerializer(_serialize_user(request.user)).data)


class ElectionListView(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    queryset = Election.objects.filter(is_published=True).order_by("voting_start_at")
    serializer_class = ElectionListSerializer


class ElectionDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.AllowAny]
    queryset = Election.objects.filter(is_published=True).prefetch_related(
        "announcements",
        "positions__department",
        "positions__section",
        "positions__candidates__user__department",
        "positions__candidates__user__section",
        "positions__candidates__department",
        "positions__candidates__section",
    )
    serializer_class = ElectionDetailSerializer


class ElectionCampaignView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk, *args, **kwargs):
        election = get_object_or_404(Election, pk=pk, is_published=True)
        positions = (
            election.positions.select_related("department", "section")
            .prefetch_related(
                "candidates__user__department",
                "candidates__user__section",
                "candidates__department",
                "candidates__section",
            )
            .all()
        )
        return Response(
            {
                "election": ElectionListSerializer(election, context={"request": request}).data,
                "positions": PositionSerializer(
                    positions,
                    many=True,
                    context={"request": request},
                ).data,
            }
        )


class ElectionBallotView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        election = get_object_or_404(Election, pk=pk, is_published=True)
        positions = eligible_positions_for_user(election, request.user)
        voted_position_ids = list(
            request.user.votes.filter(election=election).values_list("position_id", flat=True)
        )
        return Response(
            {
                "election": ElectionListSerializer(election, context={"request": request}).data,
                "positions": PositionSerializer(
                    positions,
                    many=True,
                    context={"request": request},
                ).data,
                "voted_position_ids": voted_position_ids,
                "is_voting_open": election.is_voting_open(),
            }
        )


class CastVoteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = VoteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        candidate = get_object_or_404(
            Candidate.objects.select_related("election", "position"),
            pk=serializer.validated_data["candidate_id"],
        )
        try:
            vote = cast_vote(voter=request.user, candidate=candidate)
        except DjangoValidationError as exc:
            if hasattr(exc, "message_dict") and exc.message_dict:
                detail = exc.message_dict
                if "__all__" in detail and detail["__all__"]:
                    detail = {"detail": _normalize_vote_error(detail["__all__"][0])}
            else:
                detail = {
                    "detail": _normalize_vote_error(exc.messages[0])
                    if exc.messages
                    else "Vote could not be recorded."
                }
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)
        return Response(VoteSerializer(vote).data, status=status.HTTP_201_CREATED)


class ElectionResultsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk, *args, **kwargs):
        election = get_object_or_404(Election, pk=pk, is_published=True)
        if not results_visible(election, request.user):
            return Response(
                {"detail": "Results are hidden until the election closes."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ResultsSerializer({"election": election})
        return Response(
            {
                "election": ElectionListSerializer(election, context={"request": request}).data,
                "stats": build_election_stats(election),
                "winners": serializer.get_winners(election),
            }
        )


class ElectionStatsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk, *args, **kwargs):
        election = get_object_or_404(Election, pk=pk, is_published=True)
        if not results_visible(election, request.user):
            return Response(
                {"detail": "Live statistics are not visible right now."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(build_election_stats(election))


class ElectionImageView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk, *args, **kwargs):
        election = get_object_or_404(Election, pk=pk, is_published=True)
        if election.image_data:
            return HttpResponse(
                bytes(election.image_data),
                content_type=election.image_content_type or "image/jpeg",
            )
        if election.image:
            return Response({"detail": "Election image is stored outside database media."}, status=302)
        raise Http404


class CandidatePhotoView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk, *args, **kwargs):
        candidate = get_object_or_404(
            Candidate.objects.select_related("election"),
            pk=pk,
            election__is_published=True,
            approved=True,
        )
        if candidate.photo_data:
            return HttpResponse(
                bytes(candidate.photo_data),
                content_type=candidate.photo_content_type or "image/jpeg",
            )
        if candidate.photo:
            return Response({"detail": "Candidate photo is stored outside database media."}, status=302)
        raise Http404


class CandidateCampaignVideoView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk, *args, **kwargs):
        candidate = get_object_or_404(
            Candidate.objects.select_related("election"),
            pk=pk,
            election__is_published=True,
            approved=True,
        )
        if candidate.campaign_video_data:
            response = HttpResponse(
                bytes(candidate.campaign_video_data),
                content_type=candidate.campaign_video_content_type or "video/mp4",
            )
            response["Accept-Ranges"] = "bytes"
            return response
        if candidate.campaign_video:
            return Response({"detail": "Campaign video is stored outside database media."}, status=302)
        raise Http404


def election_stats_stream(request, pk):
    try:
        election = Election.objects.get(pk=pk, is_published=True)
    except Election.DoesNotExist as exc:
        raise Http404 from exc
    if not results_visible(election):
        return StreamingHttpResponse(status=status.HTTP_403_FORBIDDEN)

    def event_stream():
        while True:
            yield "retry: 5000\n"
            yield f"data: {serialize_stats_event(election)}\n\n"
            time.sleep(5)

    response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
