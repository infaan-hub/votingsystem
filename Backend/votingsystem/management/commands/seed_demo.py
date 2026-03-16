from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from votingsystem.models import Announcement, Candidate, Department, Election, Position, Section
from votingsystem.services import cast_vote


class Command(BaseCommand):
    help = "Seed demo departments, users, candidates, elections, and votes."

    def handle(self, *args, **options):
        user_model = get_user_model()
        cs_department, _ = Department.objects.get_or_create(
            code="CS",
            defaults={
                "name": "Computer Science",
                "description": "School of computing and software engineering.",
            },
        )
        business_department, _ = Department.objects.get_or_create(
            code="BUS",
            defaults={
                "name": "Business Administration",
                "description": "Business and entrepreneurship studies.",
            },
        )
        staff_department, _ = Department.objects.get_or_create(
            code="ADM",
            defaults={
                "name": "Administration",
                "description": "Administrative and support staff.",
            },
        )
        cs_year_two, _ = Section.objects.get_or_create(
            department=cs_department,
            code="Y2A",
            defaults={"name": "Year 2 A", "description": "Second year class A."},
        )
        now = timezone.now()
        election, _ = Election.objects.get_or_create(
            title="University Leadership Election 2026",
            defaults={
                "description": (
                    "Digital voting for students and staff with real-time campaign, "
                    "turnout, and ranking visibility."
                ),
                "campaign_start_at": now - timedelta(days=5),
                "campaign_end_at": now + timedelta(days=2),
                "voting_start_at": now - timedelta(hours=1),
                "voting_end_at": now + timedelta(days=1),
                "allow_live_results": True,
                "announce_winners_automatically": True,
                "is_published": True,
            },
        )
        class_leader, _ = Position.objects.get_or_create(
            election=election,
            name="Class Leader",
            section=cs_year_two,
            defaults={
                "department": cs_department,
                "description": "Leader for the Year 2 A Computer Science section.",
                "voter_group": Position.VoterGroup.STUDENT,
            },
        )
        staff_representative, _ = Position.objects.get_or_create(
            election=election,
            name="Workers Representative",
            department=staff_department,
            defaults={
                "description": "Representative seat for workers and other university staff.",
                "voter_group": Position.VoterGroup.STAFF_AND_OFFICER,
            },
        )
        admin_user, created = user_model.objects.get_or_create(
            username="admin",
            defaults={
                "first_name": "System",
                "last_name": "Admin",
                "email": "admin@campus.local",
                "role": user_model.Role.ADMIN,
                "is_staff": True,
                "is_superuser": True,
            },
        )
        if created:
            admin_user.set_password("Admin123!")
            admin_user.save()

        sample_users = [
            {
                "username": "student_a",
                "password": "Pass1234!",
                "first_name": "Asha",
                "last_name": "Kassim",
                "role": user_model.Role.STUDENT,
                "department": cs_department,
                "section": cs_year_two,
                "registration_number": "CS2026/001",
            },
            {
                "username": "student_b",
                "password": "Pass1234!",
                "first_name": "Bakari",
                "last_name": "Juma",
                "role": user_model.Role.STUDENT,
                "department": cs_department,
                "section": cs_year_two,
                "registration_number": "CS2026/002",
            },
            {
                "username": "staff_a",
                "password": "Pass1234!",
                "first_name": "David",
                "last_name": "Mrema",
                "role": user_model.Role.STAFF,
                "department": staff_department,
                "staff_id": "STF/011",
            },
            {
                "username": "staff_b",
                "password": "Pass1234!",
                "first_name": "Rehema",
                "last_name": "Selemani",
                "role": user_model.Role.STAFF,
                "department": staff_department,
                "staff_id": "STF/012",
            },
        ]
        created_users = {}
        for payload in sample_users:
            password = payload.pop("password")
            user, created = user_model.objects.get_or_create(
                username=payload["username"],
                defaults=payload,
            )
            if created:
                user.set_password(password)
                user.save()
            created_users[user.username] = user

        candidates = [
            {
                "user": created_users["student_a"],
                "position": class_leader,
                "department": cs_department,
                "section": cs_year_two,
                "slogan": "Build a stronger class voice",
                "manifesto": "Open feedback channels, study groups, and transparent representation.",
            },
            {
                "user": created_users["student_b"],
                "position": class_leader,
                "department": cs_department,
                "section": cs_year_two,
                "slogan": "Action that students can feel",
                "manifesto": "Better communication with lecturers and improved event planning.",
            },
            {
                "user": created_users["staff_a"],
                "position": staff_representative,
                "department": staff_department,
                "slogan": "Respect every worker",
                "manifesto": "Stronger staff welfare communication and fair representation.",
            },
            {
                "user": created_users["staff_b"],
                "position": staff_representative,
                "department": staff_department,
                "slogan": "Support staff, improve service",
                "manifesto": "Practical support channels for staff and facility teams.",
            },
        ]
        created_candidates = []
        for candidate_data in candidates:
            candidate, _ = Candidate.objects.get_or_create(
                election=election,
                position=candidate_data["position"],
                user=candidate_data["user"],
                defaults={
                    "department": candidate_data.get("department"),
                    "section": candidate_data.get("section"),
                    "slogan": candidate_data["slogan"],
                    "manifesto": candidate_data["manifesto"],
                    "approved": True,
                },
            )
            if not candidate.approved:
                candidate.approved = True
                candidate.save(update_fields=["approved"])
            created_candidates.append(candidate)

        Announcement.objects.get_or_create(
            election=election,
            title="Voting is now open",
            defaults={
                "message": (
                    "Students and staff can now review campaigns, cast votes, and "
                    "monitor live turnout in real time."
                ),
                "announcement_type": Announcement.AnnouncementType.NOTICE,
                "is_pinned": True,
            },
        )

        vote_pairs = [
            ("student_b", "student_a"),
            ("student_a", "student_b"),
            ("staff_b", "staff_a"),
        ]
        candidate_by_username = {candidate.user.username: candidate for candidate in created_candidates}
        for voter_username, candidate_username in vote_pairs:
            voter = created_users[voter_username]
            candidate = candidate_by_username[candidate_username]
            if not voter.votes.filter(position=candidate.position, election=election).exists():
                try:
                    cast_vote(voter=voter, candidate=candidate)
                except Exception:
                    continue

        self.stdout.write(self.style.SUCCESS("Demo election data seeded successfully."))
