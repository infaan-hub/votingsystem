from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Announcement, Candidate, CustomUser, Department, Election, Position, Section, Vote


class SectionInline(admin.TabularInline):
    model = Section
    extra = 1


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "code")
    search_fields = ("name", "code")
    inlines = [SectionInline]


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "department")
    list_filter = ("department",)
    search_fields = ("name", "code")


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        (
            "Voting profile",
            {
                "fields": (
                    "role",
                    "department",
                    "section",
                    "registration_number",
                    "staff_id",
                    "phone_number",
                )
            },
        ),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        (
            "Voting profile",
            {
                "fields": (
                    "role",
                    "department",
                    "section",
                    "registration_number",
                    "staff_id",
                    "phone_number",
                )
            },
        ),
    )
    list_display = ("username", "email", "first_name", "last_name", "role", "department", "section")
    list_filter = ("role", "department", "section", "is_staff", "is_superuser", "is_active")


class PositionInline(admin.TabularInline):
    model = Position
    extra = 1


@admin.register(Election)
class ElectionAdmin(admin.ModelAdmin):
    list_display = ("title", "voting_start_at", "voting_end_at", "allow_live_results", "is_published")
    list_filter = ("allow_live_results", "is_published")
    search_fields = ("title",)
    inlines = [PositionInline]


@admin.register(Position)
class PositionAdmin(admin.ModelAdmin):
    list_display = ("name", "election", "department", "section", "voter_group", "max_winners")
    list_filter = ("election", "voter_group", "department")
    search_fields = ("name", "election__title")


@admin.register(Candidate)
class CandidateAdmin(admin.ModelAdmin):
    list_display = ("user", "position", "election", "approved", "department", "section")
    list_filter = ("approved", "election", "position", "department")
    search_fields = ("user__username", "user__first_name", "user__last_name", "position__name")


@admin.register(Vote)
class VoteAdmin(admin.ModelAdmin):
    list_display = ("voter", "candidate", "position", "election", "created_at")
    list_filter = ("election", "position")
    search_fields = ("voter__username", "candidate__user__username", "position__name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ("title", "announcement_type", "election", "is_pinned", "publish_at")
    list_filter = ("announcement_type", "is_pinned", "election")
    search_fields = ("title", "message")

# Register your models here.
