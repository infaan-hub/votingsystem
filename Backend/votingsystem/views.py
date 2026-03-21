import time

from django.contrib.auth import authenticate
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Candidate, Election
from .serializers import (
    ElectionDetailSerializer,
    ElectionListSerializer,
    PositionSerializer,
    ResultsSerializer,
    UserSummarySerializer,
    VoteCreateSerializer,
    VoteSerializer,
)
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
    }


def _normalize_vote_error(detail):
    if isinstance(detail, str) and "already exists" in detail.lower():
        return "You have already voted for this position in this election."
    return detail


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
                "election": ElectionListSerializer(election).data,
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
                "election": ElectionListSerializer(election).data,
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
                "election": ElectionListSerializer(election).data,
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
