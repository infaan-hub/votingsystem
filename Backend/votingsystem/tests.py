from datetime import timedelta

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

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


class VotingApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.department = Department.objects.create(name="Information Technology", code="IT")
        self.section = Section.objects.create(
            department=self.department,
            name="Year 3",
            code="Y3",
        )
        self.election = Election.objects.create(
            title="University Leadership Election 2026",
            description="Digital voting for students and staff with real-time campaign visibility.",
            campaign_start_at=timezone.now() - timedelta(days=3),
            campaign_end_at=timezone.now() + timedelta(days=1),
            voting_start_at=timezone.now() - timedelta(hours=2),
            voting_end_at=timezone.now() + timedelta(hours=4),
            allow_live_results=True,
        )
        self.hidden_results_election = Election.objects.create(
            title="Hidden Results Election",
            description="Results should stay hidden to guests while voting is active.",
            campaign_start_at=timezone.now() - timedelta(days=1),
            campaign_end_at=timezone.now() + timedelta(days=1),
            voting_start_at=timezone.now() - timedelta(hours=1),
            voting_end_at=timezone.now() + timedelta(hours=1),
            allow_live_results=False,
        )
        self.position = Position.objects.create(
            election=self.election,
            name="President",
            department=self.department,
            section=self.section,
            voter_group=Position.VoterGroup.STUDENT,
        )
        self.hidden_position = Position.objects.create(
            election=self.hidden_results_election,
            name="Chairperson",
            voter_group=Position.VoterGroup.STUDENT,
        )
        self.admin_user = CustomUser.objects.create_user(
            username="admin",
            password="Admin123!",
            first_name="System",
            last_name="Admin",
            role=CustomUser.Role.ADMIN,
        )
        self.voter = CustomUser.objects.create_user(
            username="student_a",
            password="Pass1234!",
            first_name="Asha",
            last_name="Noor",
            role=CustomUser.Role.STUDENT,
            department=self.department,
            section=self.section,
        )
        self.candidate_user = CustomUser.objects.create_user(
            username="candidate_a",
            password="Pass1234!",
            first_name="Juma",
            last_name="Ali",
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
            slogan="Forward together",
            approved=True,
        )
        self.hidden_candidate = Candidate.objects.create(
            user=CustomUser.objects.create_user(
                username="hidden_candidate",
                password="Pass1234!",
                first_name="Sami",
                last_name="Omar",
                role=CustomUser.Role.STUDENT,
            ),
            election=self.hidden_results_election,
            position=self.hidden_position,
            slogan="Quiet progress",
            approved=True,
        )
        self.token = Token.objects.create(user=self.voter)

    def auth_client(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        return client

    def test_health_endpoint(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_public_election_endpoints(self):
        list_response = self.client.get("/api/elections/")
        self.assertEqual(list_response.status_code, 200)
        self.assertGreaterEqual(len(list_response.json()), 2)

        detail_response = self.client.get(f"/api/elections/{self.election.id}/")
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.json()["id"], self.election.id)

        campaigns_response = self.client.get(f"/api/elections/{self.election.id}/campaigns/")
        self.assertEqual(campaigns_response.status_code, 200)
        self.assertEqual(campaigns_response.json()["positions"][0]["name"], "President")

        stats_response = self.client.get(f"/api/elections/{self.election.id}/stats/")
        self.assertEqual(stats_response.status_code, 200)
        self.assertEqual(stats_response.json()["election_id"], self.election.id)

        results_response = self.client.get(f"/api/elections/{self.election.id}/results/")
        self.assertEqual(results_response.status_code, 200)
        self.assertIn("stats", results_response.json())

    def test_hidden_results_are_blocked_for_guest(self):
        response = self.client.get(f"/api/elections/{self.hidden_results_election.id}/results/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["detail"],
            "Results are hidden until the election closes.",
        )

    def test_auth_login_me_logout_flow(self):
        login_response = self.client.post(
            "/api/auth/login/",
            {"username": "student_a", "password": "Pass1234!"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        token = login_response.json()["token"]

        me_client = APIClient()
        me_client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        me_response = me_client.get("/api/auth/me/")
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.json()["username"], "student_a")

        logout_response = me_client.post("/api/auth/logout/")
        self.assertEqual(logout_response.status_code, 204)

    def test_ballot_and_vote_endpoints(self):
        client = self.auth_client()
        ballot_response = client.get(f"/api/elections/{self.election.id}/ballot/")
        self.assertEqual(ballot_response.status_code, 200)
        self.assertTrue(ballot_response.json()["is_voting_open"])
        self.assertEqual(ballot_response.json()["positions"][0]["name"], "President")

        vote_response = client.post(
            "/api/votes/",
            {"candidate_id": self.candidate.id},
            format="json",
        )
        self.assertEqual(vote_response.status_code, 201)
        self.assertEqual(vote_response.json()["candidate"], self.candidate_user.display_name)

        second_vote_response = client.post(
            "/api/votes/",
            {"candidate_id": self.candidate.id},
            format="json",
        )
        self.assertEqual(second_vote_response.status_code, 400)
        self.assertIn("already voted", str(second_vote_response.json()).lower())

    def test_hidden_live_stats_are_blocked_for_guest(self):
        response = self.client.get(f"/api/elections/{self.hidden_results_election.id}/stats/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["detail"],
            "Live statistics are not visible right now.",
        )
