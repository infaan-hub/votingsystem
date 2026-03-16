from rest_framework import serializers

from .models import Announcement, Candidate, Department, Election, Position, Section, Vote
from .services import build_election_stats, build_winner_announcement, visible_announcements


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ("id", "name", "code", "description")


class SectionSerializer(serializers.ModelSerializer):
    department = DepartmentSerializer(read_only=True)

    class Meta:
        model = Section
        fields = ("id", "name", "code", "description", "department")


class UserSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    full_name = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    role = serializers.CharField(read_only=True)
    department = DepartmentSerializer(read_only=True)
    section = SectionSerializer(read_only=True)
    registration_number = serializers.CharField(read_only=True)
    staff_id = serializers.CharField(read_only=True)


class AnnouncementSerializer(serializers.ModelSerializer):
    is_visible = serializers.BooleanField(read_only=True)

    class Meta:
        model = Announcement
        fields = (
            "id",
            "title",
            "message",
            "announcement_type",
            "publish_at",
            "is_pinned",
            "is_visible",
            "created_at",
        )


class CandidateSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    department = DepartmentSerializer(read_only=True)
    section = SectionSerializer(read_only=True)
    photo_url = serializers.SerializerMethodField()
    vote_total = serializers.IntegerField(read_only=True)

    class Meta:
        model = Candidate
        fields = (
            "id",
            "user",
            "department",
            "section",
            "slogan",
            "manifesto",
            "approved",
            "photo_url",
            "vote_total",
        )

    def get_user(self, obj):
        return {
            "id": obj.user_id,
            "username": obj.user.username,
            "full_name": obj.user.display_name,
            "email": obj.user.email,
            "role": obj.user.role,
            "department": DepartmentSerializer(obj.user.department).data if obj.user.department else None,
            "section": SectionSerializer(obj.user.section).data if obj.user.section else None,
            "registration_number": obj.user.registration_number,
            "staff_id": obj.user.staff_id,
        }

    def get_photo_url(self, obj):
        if not obj.photo:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.photo.url)
        return obj.photo.url


class PositionSerializer(serializers.ModelSerializer):
    department = DepartmentSerializer(read_only=True)
    section = SectionSerializer(read_only=True)
    voter_group_label = serializers.CharField(source="get_voter_group_display", read_only=True)
    candidates = serializers.SerializerMethodField()

    class Meta:
        model = Position
        fields = (
            "id",
            "name",
            "description",
            "department",
            "section",
            "voter_group",
            "voter_group_label",
            "max_winners",
            "candidates",
        )

    def get_candidates(self, obj):
        queryset = obj.candidates.filter(approved=True).select_related(
            "user",
            "department",
            "section",
            "user__department",
            "user__section",
        )
        return CandidateSerializer(queryset, many=True, context=self.context).data


class ElectionListSerializer(serializers.ModelSerializer):
    status = serializers.CharField(read_only=True)
    seconds_until_start = serializers.SerializerMethodField()
    seconds_until_end = serializers.SerializerMethodField()

    class Meta:
        model = Election
        fields = (
            "id",
            "title",
            "description",
            "campaign_start_at",
            "campaign_end_at",
            "voting_start_at",
            "voting_end_at",
            "allow_live_results",
            "announce_winners_automatically",
            "status",
            "seconds_until_start",
            "seconds_until_end",
        )

    def get_seconds_until_start(self, obj):
        return obj.seconds_until_start()

    def get_seconds_until_end(self, obj):
        return obj.seconds_until_end()


class ElectionDetailSerializer(ElectionListSerializer):
    positions = PositionSerializer(many=True, read_only=True)
    announcements = serializers.SerializerMethodField()

    class Meta(ElectionListSerializer.Meta):
        fields = ElectionListSerializer.Meta.fields + ("positions", "announcements")

    def get_announcements(self, obj):
        queryset = visible_announcements(obj)
        return AnnouncementSerializer(queryset, many=True).data


class VoteCreateSerializer(serializers.Serializer):
    candidate_id = serializers.IntegerField()


class VoteSerializer(serializers.ModelSerializer):
    candidate = serializers.CharField(source="candidate.user.display_name", read_only=True)
    position = serializers.CharField(source="position.name", read_only=True)
    election = serializers.CharField(source="election.title", read_only=True)

    class Meta:
        model = Vote
        fields = ("id", "candidate", "position", "election", "created_at")


class ResultsSerializer(serializers.Serializer):
    election = ElectionListSerializer(read_only=True)
    stats = serializers.SerializerMethodField()
    winners = serializers.SerializerMethodField()

    def get_stats(self, obj):
        return build_election_stats(obj)

    def get_winners(self, obj):
        return build_winner_announcement(obj)
