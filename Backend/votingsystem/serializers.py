from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers

from .models import Announcement, Candidate, Department, Election, Position, Section, Vote
from .services import build_election_stats, build_winner_announcement, visible_announcements

User = get_user_model()


def _normalize_integrity_error(error):
    message = str(error)
    lowered = message.lower()

    if "username" in lowered:
        return {"username": "This username is already in use."}
    if "email" in lowered:
        return {"email": "This email is already in use."}
    if "google_id" in lowered:
        return {"detail": "This account is already linked to a Google identity."}
    if "unique_candidate_per_position" in lowered:
        return {"detail": "This user is already registered as a candidate for that position."}
    if "unique_position_scope_per_election" in lowered:
        return {"position_name": "A position with this name already exists for the selected election scope."}
    return {
        "detail": (
            "The submitted data conflicts with an existing record. Use a different username, "
            "email, or position details and try again."
        )
    }


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
    auth_provider = serializers.CharField(read_only=True)


class RegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, style={"input_type": "password"})
    confirm_password = serializers.CharField(
        write_only=True,
        min_length=8,
        style={"input_type": "password"},
    )
    full_name = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = (
            "username",
            "email",
            "password",
            "confirm_password",
            "full_name",
            "first_name",
            "last_name",
            "staff_id",
            "registration_number",
        )
        extra_kwargs = {
            "email": {"required": False, "allow_blank": True},
            "first_name": {"required": False, "allow_blank": True},
            "last_name": {"required": False, "allow_blank": True},
            "staff_id": {"required": False, "allow_blank": True},
            "registration_number": {"required": False, "allow_blank": True},
        }

    default_role = None

    def validate(self, attrs):
        password = attrs.get("password")
        confirm_password = attrs.pop("confirm_password", "")
        full_name = attrs.pop("full_name", "").strip()

        if password != confirm_password:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        if full_name and not attrs.get("first_name") and not attrs.get("last_name"):
            name_parts = full_name.split()
            attrs["first_name"] = name_parts[0]
            attrs["last_name"] = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.role = self.default_role
        user.set_password(password)
        user.full_clean()
        user.save()
        return user


class AdminRegistrationSerializer(RegistrationSerializer):
    class Meta(RegistrationSerializer.Meta):
        fields = (
            "username",
            "email",
            "password",
            "confirm_password",
            "full_name",
            "staff_id",
        )

    default_role = User.Role.ADMIN

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get("staff_id"):
            raise serializers.ValidationError({"staff_id": "Staff ID is required."})
        return attrs


class VoterRegistrationSerializer(RegistrationSerializer):
    class Meta(RegistrationSerializer.Meta):
        fields = (
            "username",
            "email",
            "password",
            "confirm_password",
            "first_name",
            "last_name",
            "registration_number",
        )

    default_role = User.Role.STUDENT

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get("first_name"):
            raise serializers.ValidationError({"first_name": "First name is required."})
        if not attrs.get("last_name"):
            raise serializers.ValidationError({"last_name": "Last name is required."})
        if not attrs.get("registration_number"):
            raise serializers.ValidationError(
                {"registration_number": "Registration number is required."}
            )
        return attrs


class GoogleAuthSerializer(serializers.Serializer):
    credential = serializers.CharField(required=False, allow_blank=True)
    code = serializers.CharField(required=False, allow_blank=True)
    role = serializers.ChoiceField(
        choices=("admin", "voter", "candidate"),
        required=False,
        allow_null=True,
    )

    def validate(self, attrs):
        credential = (attrs.get("credential") or "").strip()
        code = (attrs.get("code") or "").strip()
        if not credential and not code:
            raise serializers.ValidationError("Google sign-in data is required.")
        return attrs


class PasswordResetSerializer(serializers.Serializer):
    identity = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs


class AdminCreateVoterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(
        choices=(
            User.Role.STUDENT,
            User.Role.STAFF,
            User.Role.OFFICER,
        ),
        default=User.Role.STUDENT,
    )

    class Meta:
        model = User
        fields = (
            "username",
            "email",
            "first_name",
            "last_name",
            "registration_number",
            "staff_id",
            "password",
            "confirm_password",
            "role",
        )
        extra_kwargs = {
            "email": {"required": False, "allow_blank": True},
            "registration_number": {"required": False, "allow_blank": True},
            "staff_id": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("confirm_password"):
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        if attrs["role"] == User.Role.STUDENT and not attrs.get("registration_number"):
            raise serializers.ValidationError(
                {"registration_number": "Registration number is required for student voters."}
            )
        if attrs["role"] in {User.Role.STAFF, User.Role.OFFICER} and not attrs.get("staff_id"):
            raise serializers.ValidationError(
                {"staff_id": "Staff ID is required for staff and officer voters."}
            )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.full_clean()
        try:
            user.save()
        except IntegrityError as exc:
            raise serializers.ValidationError(_normalize_integrity_error(exc)) from exc
        return user


class AdminCreateCandidateSerializer(serializers.Serializer):
    election_id = serializers.IntegerField()
    position_id = serializers.IntegerField(required=False)
    position_name = serializers.CharField(required=False, allow_blank=True)
    username = serializers.CharField()
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, min_length=8)
    slogan = serializers.CharField(required=False, allow_blank=True)
    manifesto = serializers.CharField(required=False, allow_blank=True)
    photo = serializers.ImageField(required=False, allow_null=True)
    approved = serializers.BooleanField(required=False, default=True)

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("confirm_password"):
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        try:
            election = Election.objects.get(pk=attrs["election_id"])
        except Election.DoesNotExist as exc:
            raise serializers.ValidationError({"election_id": "Election was not found."}) from exc
        position = None
        position_id = attrs.get("position_id")
        position_name = (attrs.get("position_name") or "").strip()
        if position_id:
            try:
                position = Position.objects.get(pk=position_id)
            except Position.DoesNotExist as exc:
                raise serializers.ValidationError({"position_id": "Position was not found."}) from exc
        elif position_name:
            position = Position.objects.filter(election=election, name__iexact=position_name).first()
            if not position:
                position = Position(
                    election=election,
                    name=position_name,
                    voter_group=Position.VoterGroup.ALL,
                    max_winners=1,
                )
                position.full_clean()
        else:
            raise serializers.ValidationError(
                {"position_name": "Position is required."}
            )
        if position.election_id != election.id:
            raise serializers.ValidationError({"position_id": "Position does not belong to the selected election."})
        attrs["election"] = election
        attrs["position"] = position
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        election = validated_data.pop("election")
        position = validated_data.pop("position")
        approved = validated_data.pop("approved", True)
        slogan = validated_data.pop("slogan", "")
        manifesto = validated_data.pop("manifesto", "")
        photo = validated_data.pop("photo", None)

        try:
            with transaction.atomic():
                if position.pk is None:
                    position.save()
                user = User(
                    username=validated_data["username"],
                    email=validated_data.get("email", ""),
                    first_name=validated_data["first_name"],
                    last_name=validated_data["last_name"],
                    role=(
                        User.Role.STAFF
                        if position.voter_group in {Position.VoterGroup.STAFF, Position.VoterGroup.STAFF_AND_OFFICER}
                        else User.Role.STUDENT
                    ),
                    department=position.department,
                    section=position.section,
                )
                user.set_password(password)
                user.full_clean()
                user.save()

                candidate = Candidate(
                    election=election,
                    position=position,
                    user=user,
                    department=position.department,
                    section=position.section,
                    slogan=slogan,
                    manifesto=manifesto,
                    photo=photo,
                    approved=approved,
                )
                candidate.full_clean()
                candidate.save()
        except IntegrityError as exc:
            raise serializers.ValidationError(_normalize_integrity_error(exc)) from exc

        return candidate


class ElectionScheduleUpdateSerializer(serializers.ModelSerializer):
    SCHEDULE_FIELDS = {
        "campaign_start_at",
        "campaign_end_at",
        "voting_start_at",
        "voting_end_at",
    }

    class Meta:
        model = Election
        fields = (
            "title",
            "description",
            "campaign_start_at",
            "campaign_end_at",
            "voting_start_at",
            "voting_end_at",
            "allow_live_results",
            "announce_winners_automatically",
            "is_published",
        )

    def validate(self, attrs):
        if not self.SCHEDULE_FIELDS.intersection(attrs):
            return attrs

        for field, value in attrs.items():
            setattr(self.instance, field, value)
        try:
            self.instance.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc
        return attrs


class AnnouncementCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = (
            "title",
            "message",
            "announcement_type",
            "publish_at",
            "is_pinned",
        )

    def create(self, validated_data):
        try:
            return super().create(validated_data)
        except IntegrityError as exc:
            raise serializers.ValidationError(_normalize_integrity_error(exc)) from exc


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
