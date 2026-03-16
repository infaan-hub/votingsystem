from datetime import timedelta

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from .models import Candidate, CustomUser, Department, Election, Position, Section
from .services import build_position_ranking, cast_vote


class VotingWorkflowTests(TestCase):
    def setUp(self):
        self.department = Department.objects.create(name="Computer Science", code="CS")
        self.section = Section.objects.create(
            department=self.department,
            name="Year 2",
            code="Y2",
        )
        self.election = Election.objects.create(
            title="Campus Leaders 2026",
            description="Department and class leadership elections.",
            campaign_start_at=timezone.now() - timedelta(days=2),
            campaign_end_at=timezone.now() + timedelta(days=1),
            voting_start_at=timezone.now() - timedelta(hours=1),
            voting_end_at=timezone.now() + timedelta(hours=3),
            allow_live_results=True,
        )
        self.position = Position.objects.create(
            election=self.election,
            name="Class Representative",
            department=self.department,
            section=self.section,
            voter_group=Position.VoterGroup.STUDENT,
        )
        self.candidate_user = CustomUser.objects.create_user(
            username="candidate1",
            password="Pass1234!",
            first_name="Amina",
            last_name="Ali",
            role=CustomUser.Role.STUDENT,
            department=self.department,
            section=self.section,
        )
        self.voter = CustomUser.objects.create_user(
            username="student1",
            password="Pass1234!",
            first_name="Ibrahim",
            last_name="Said",
            role=CustomUser.Role.STUDENT,
            department=self.department,
            section=self.section,
        )
        self.other_candidate_user = CustomUser.objects.create_user(
            username="candidate2",
            password="Pass1234!",
            first_name="Halima",
            last_name="Omari",
            role=CustomUser.Role.STUDENT,
            department=self.department,
            section=self.section,
        )
        self.candidate = Candidate.objects.create(
            user=self.candidate_user,
            election=self.election,
            position=self.position,
            department=self.department,
            section=self.section,
            slogan="Lead with transparency",
            approved=True,
        )
        self.other_candidate = Candidate.objects.create(
            user=self.other_candidate_user,
            election=self.election,
            position=self.position,
            department=self.department,
            section=self.section,
            slogan="Students first",
            approved=True,
        )

    def test_user_can_vote_once_per_position(self):
        vote = cast_vote(voter=self.voter, candidate=self.candidate)
        self.assertEqual(vote.position, self.position)
        with self.assertRaises(ValidationError):
            cast_vote(voter=self.voter, candidate=self.other_candidate)

    def test_candidate_rankings_are_ordered_by_vote_count(self):
        second_voter = CustomUser.objects.create_user(
            username="student2",
            password="Pass1234!",
            first_name="Mariam",
            last_name="Yusuf",
            role=CustomUser.Role.STUDENT,
            department=self.department,
            section=self.section,
        )
        cast_vote(voter=self.voter, candidate=self.candidate)
        cast_vote(voter=second_voter, candidate=self.candidate)
        ranking = build_position_ranking(self.position)
        self.assertEqual(ranking[0]["candidate_name"], self.candidate_user.display_name)
        self.assertEqual(ranking[0]["vote_total"], 2)
        self.assertTrue(ranking[0]["is_winner"])

# Create your tests here.
