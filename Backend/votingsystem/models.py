from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Department(TimestampedModel):
    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name


class Section(TimestampedModel):
    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name="sections",
    )
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=30)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ("department__name", "name")
        constraints = [
            models.UniqueConstraint(
                fields=("department", "code"),
                name="unique_section_code_per_department",
            )
        ]

    def __str__(self):
        return f"{self.department.code} - {self.name}"


class CustomUser(AbstractUser):
    class AuthProvider(models.TextChoices):
        LOCAL = "local", "Local"
        GOOGLE = "google", "Google"

    class Role(models.TextChoices):
        STUDENT = "student", "Student"
        STAFF = "staff", "Staff"
        OFFICER = "officer", "Election Officer"
        ADMIN = "admin", "Admin"

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.STUDENT,
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        related_name="users",
        blank=True,
        null=True,
    )
    section = models.ForeignKey(
        Section,
        on_delete=models.SET_NULL,
        related_name="users",
        blank=True,
        null=True,
    )
    registration_number = models.CharField(max_length=60, blank=True)
    staff_id = models.CharField(max_length=60, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    google_id = models.CharField(max_length=255, blank=True, unique=True, null=True)
    auth_provider = models.CharField(
        max_length=20,
        choices=AuthProvider.choices,
        default=AuthProvider.LOCAL,
    )

    class Meta:
        ordering = ("username",)

    def __str__(self):
        return self.get_full_name() or self.username

    @property
    def display_name(self):
        return self.get_full_name() or self.username

    def clean(self):
        super().clean()
        if self.section and self.department_id != self.section.department_id:
            raise ValidationError(
                {"section": "The selected section must belong to the selected department."}
            )


class Election(TimestampedModel):
    class Status(models.TextChoices):
        UPCOMING = "upcoming", "Upcoming"
        ACTIVE = "active", "Active"
        ENDED = "ended", "Ended"

    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    campaign_start_at = models.DateTimeField()
    campaign_end_at = models.DateTimeField()
    voting_start_at = models.DateTimeField()
    voting_end_at = models.DateTimeField()
    allow_live_results = models.BooleanField(default=True)
    announce_winners_automatically = models.BooleanField(default=True)
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ("-voting_start_at",)

    def __str__(self):
        return self.title

    @property
    def status(self):
        now = timezone.now()
        if now < self.voting_start_at:
            return self.Status.UPCOMING
        if self.voting_start_at <= now <= self.voting_end_at:
            return self.Status.ACTIVE
        return self.Status.ENDED

    def is_campaign_live(self, now=None):
        now = now or timezone.now()
        return self.campaign_start_at <= now <= self.campaign_end_at

    def is_voting_open(self, now=None):
        now = now or timezone.now()
        return self.voting_start_at <= now <= self.voting_end_at

    def seconds_until_start(self, now=None):
        now = now or timezone.now()
        return max(0, int((self.voting_start_at - now).total_seconds()))

    def seconds_until_end(self, now=None):
        now = now or timezone.now()
        return max(0, int((self.voting_end_at - now).total_seconds()))

    def clean(self):
        super().clean()
        if self.campaign_start_at >= self.campaign_end_at:
            raise ValidationError(
                {"campaign_end_at": "Campaign end time must be after campaign start time."}
            )
        if self.voting_start_at >= self.voting_end_at:
            raise ValidationError(
                {"voting_end_at": "Voting end time must be after voting start time."}
            )
        if self.campaign_start_at > self.voting_start_at:
            raise ValidationError(
                {
                    "campaign_start_at": (
                        "Campaign start time must not be after voting start time."
                    )
                }
            )
        if self.campaign_end_at > self.voting_end_at:
            raise ValidationError(
                {
                    "campaign_end_at": (
                        "Campaign end time must not be after voting end time."
                    )
                }
            )


class Position(TimestampedModel):
    class VoterGroup(models.TextChoices):
        ALL = "all", "All eligible voters"
        STUDENT = "student", "Students"
        STAFF = "staff", "Staff"
        STAFF_AND_OFFICER = "staff_and_officer", "Staff and Election Officers"

    election = models.ForeignKey(
        Election,
        on_delete=models.CASCADE,
        related_name="positions",
    )
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        related_name="positions",
        blank=True,
        null=True,
    )
    section = models.ForeignKey(
        Section,
        on_delete=models.SET_NULL,
        related_name="positions",
        blank=True,
        null=True,
    )
    voter_group = models.CharField(
        max_length=30,
        choices=VoterGroup.choices,
        default=VoterGroup.ALL,
    )
    max_winners = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(
                fields=("election", "name", "department", "section"),
                name="unique_position_scope_per_election",
            )
        ]

    def __str__(self):
        return f"{self.name} - {self.election.title}"

    def clean(self):
        super().clean()
        if self.section and self.department_id != self.section.department_id:
            raise ValidationError(
                {"section": "The selected section must belong to the selected department."}
            )

    def is_user_eligible(self, user):
        if not getattr(user, "is_authenticated", False) or not user.is_active:
            return False
        if user.role == CustomUser.Role.ADMIN:
            return False
        if self.voter_group == self.VoterGroup.STUDENT and user.role != CustomUser.Role.STUDENT:
            return False
        if self.voter_group == self.VoterGroup.STAFF and user.role != CustomUser.Role.STAFF:
            return False
        if (
            self.voter_group == self.VoterGroup.STAFF_AND_OFFICER
            and user.role not in {CustomUser.Role.STAFF, CustomUser.Role.OFFICER}
        ):
            return False
        if self.department_id and user.department_id != self.department_id:
            return False
        if self.section_id and user.section_id != self.section_id:
            return False
        return True


class Candidate(TimestampedModel):
    election = models.ForeignKey(
        Election,
        on_delete=models.CASCADE,
        related_name="candidates",
    )
    position = models.ForeignKey(
        Position,
        on_delete=models.CASCADE,
        related_name="candidates",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="candidate_profiles",
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        related_name="candidates",
        blank=True,
        null=True,
    )
    section = models.ForeignKey(
        Section,
        on_delete=models.SET_NULL,
        related_name="candidates",
        blank=True,
        null=True,
    )
    slogan = models.CharField(max_length=180, blank=True)
    manifesto = models.TextField(blank=True)
    photo = models.ImageField(upload_to="candidate_photos/", blank=True, null=True)
    approved = models.BooleanField(default=False)
    featured_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("position__name", "featured_order", "user__username")
        constraints = [
            models.UniqueConstraint(
                fields=("election", "position", "user"),
                name="unique_candidate_per_position",
            )
        ]

    def __str__(self):
        return f"{self.user.display_name} - {self.position.name}"

    def clean(self):
        super().clean()
        if self.position_id and self.election_id and self.position.election_id != self.election_id:
            raise ValidationError({"position": "The position must belong to the selected election."})
        if self.section and self.department_id != self.section.department_id:
            raise ValidationError(
                {"section": "The selected section must belong to the selected department."}
            )
        if self.position_id and self.user_id:
            if self.position.department_id and self.user.department_id != self.position.department_id:
                raise ValidationError(
                    {"user": "The candidate must belong to the position department."}
                )
            if self.position.section_id and self.user.section_id != self.position.section_id:
                raise ValidationError({"user": "The candidate must belong to the position section."})

    def save(self, *args, **kwargs):
        if self.position_id and not self.election_id:
            self.election = self.position.election
        if self.user_id and not self.department_id:
            self.department = self.user.department
        if self.user_id and not self.section_id:
            self.section = self.user.section
        super().save(*args, **kwargs)


class Vote(TimestampedModel):
    voter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="votes",
    )
    candidate = models.ForeignKey(
        Candidate,
        on_delete=models.CASCADE,
        related_name="votes",
    )
    election = models.ForeignKey(
        Election,
        on_delete=models.CASCADE,
        related_name="votes",
    )
    position = models.ForeignKey(
        Position,
        on_delete=models.CASCADE,
        related_name="votes",
    )

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("voter", "election", "position"),
                name="unique_vote_per_voter_position",
            )
        ]

    def __str__(self):
        return f"{self.voter.display_name} -> {self.candidate.user.display_name}"

    def clean(self):
        super().clean()
        if self.candidate_id:
            self.election = self.candidate.election
            self.position = self.candidate.position
        if not self.election_id or not self.position_id:
            raise ValidationError("A vote must be linked to a valid election position.")
        if not self.candidate.approved:
            raise ValidationError({"candidate": "This candidate is not approved for voting yet."})
        if not self.election.is_voting_open():
            raise ValidationError({"election": "Voting is not currently open for this election."})
        if not self.position.is_user_eligible(self.voter):
            raise ValidationError(
                {"voter": "You are not eligible to vote for this department or section position."}
            )

    def save(self, *args, **kwargs):
        if self.candidate_id:
            self.election = self.candidate.election
            self.position = self.candidate.position
        super().save(*args, **kwargs)


class Announcement(TimestampedModel):
    class AnnouncementType(models.TextChoices):
        NOTICE = "notice", "Notice"
        CAMPAIGN = "campaign", "Campaign"
        RESULT = "result", "Result"

    election = models.ForeignKey(
        Election,
        on_delete=models.CASCADE,
        related_name="announcements",
        blank=True,
        null=True,
    )
    title = models.CharField(max_length=180)
    message = models.TextField()
    announcement_type = models.CharField(
        max_length=20,
        choices=AnnouncementType.choices,
        default=AnnouncementType.NOTICE,
    )
    publish_at = models.DateTimeField(blank=True, null=True)
    is_pinned = models.BooleanField(default=False)

    class Meta:
        ordering = ("-is_pinned", "-created_at")

    def __str__(self):
        return self.title

    @property
    def is_visible(self):
        return self.publish_at is None or self.publish_at <= timezone.now()
