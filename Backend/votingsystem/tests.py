from datetime import timedelta
from unittest.mock import patch

import requests
from django.core.exceptions import ValidationError
from django.test import override_settings
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

    def admin_client(self):
        token = Token.objects.create(user=self.admin_user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
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

    def test_admin_registration_endpoint(self):
        response = self.client.post(
            "/api/auth/register/admin/",
            {
                "full_name": "Election Master",
                "username": "chief_admin",
                "email": "chief@example.com",
                "staff_id": "ADM-100",
                "password": "AdminPass123!",
                "confirm_password": "AdminPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["user"]["role"], CustomUser.Role.ADMIN)
        self.assertEqual(payload["user"]["username"], "chief_admin")
        self.assertTrue(payload["token"])

    def test_voter_registration_endpoint(self):
        response = self.client.post(
            "/api/auth/register/voter/",
            {
                "first_name": "Neema",
                "last_name": "Suleiman",
                "username": "neema_2026",
                "email": "neema@example.com",
                "registration_number": "REG-909",
                "password": "VotePass123!",
                "confirm_password": "VotePass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["user"]["role"], CustomUser.Role.STUDENT)
        self.assertEqual(payload["user"]["registration_number"], "REG-909")
        self.assertTrue(payload["token"])

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="google-client-id")
    @patch("votingsystem.views.google_id_token.verify_oauth2_token")
    def test_google_auth_creates_voter_when_email_is_new(self, verify_mock):
        verify_mock.return_value = {
            "sub": "google-user-1",
            "email": "googlevoter@example.com",
            "email_verified": True,
            "name": "Google Voter",
        }

        response = self.client.post(
            "/api/auth/google/",
            {"credential": "google-token", "role": "voter"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["user"]["email"], "googlevoter@example.com")
        self.assertEqual(payload["user"]["role"], CustomUser.Role.STUDENT)
        self.assertEqual(payload["user"]["auth_provider"], CustomUser.AuthProvider.GOOGLE)

    @override_settings(
        GOOGLE_OAUTH_CLIENT_ID="google-client-id",
        GOOGLE_OAUTH_CLIENT_SECRET="google-client-secret",
    )
    @patch("votingsystem.views.requests.post")
    @patch("votingsystem.views.google_id_token.verify_oauth2_token")
    def test_google_auth_accepts_popup_code_flow(self, verify_mock, requests_post_mock):
        requests_post_mock.return_value.status_code = 200
        requests_post_mock.return_value.json.return_value = {"id_token": "id-token-from-google"}
        verify_mock.return_value = {
            "sub": "google-user-code-flow",
            "email": "popupvoter@example.com",
            "email_verified": True,
            "name": "Popup Voter",
        }

        response = self.client.post(
            "/api/auth/google/",
            {"code": "google-popup-code", "role": "voter"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["email"], "popupvoter@example.com")

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="google-client-id")
    @patch("votingsystem.views.google_id_token.verify_oauth2_token")
    def test_google_auth_links_existing_candidate_by_email(self, verify_mock):
        verify_mock.return_value = {
            "sub": "candidate-google-id",
            "email": self.candidate_user.email or "candidate_link@example.com",
            "email_verified": True,
            "name": self.candidate_user.display_name,
        }
        if not self.candidate_user.email:
            self.candidate_user.email = "candidate_link@example.com"
            self.candidate_user.save(update_fields=["email"])

        response = self.client.post(
            "/api/auth/google/",
            {"credential": "google-token", "role": "candidate"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.candidate_user.refresh_from_db()
        self.assertEqual(self.candidate_user.google_id, "candidate-google-id")
        self.assertEqual(response.json()["user"]["id"], self.candidate_user.id)

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="google-client-id")
    @patch("votingsystem.views.google_id_token.verify_oauth2_token")
    def test_google_auth_rejects_new_admin_creation(self, verify_mock):
        verify_mock.return_value = {
            "sub": "new-admin-google-id",
            "email": "newadmin@example.com",
            "email_verified": True,
            "name": "New Admin",
        }

        response = self.client.post(
            "/api/auth/google/",
            {"credential": "google-token", "role": "admin"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("not linked", response.json()["detail"].lower())

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="google-client-id")
    @patch("votingsystem.views.google_id_token.verify_oauth2_token")
    def test_google_auth_rejects_admin_on_voter_portal(self, verify_mock):
        self.admin_user.email = "admin-portal@example.com"
        self.admin_user.save(update_fields=["email"])
        verify_mock.return_value = {
            "sub": "admin-google-id",
            "email": "admin-portal@example.com",
            "email_verified": True,
            "name": self.admin_user.display_name,
        }

        response = self.client.post(
            "/api/auth/google/",
            {"credential": "google-token", "role": "voter"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("admin portal", response.json()["detail"].lower())

    @override_settings(
        GOOGLE_OAUTH_CLIENT_ID="google-client-id",
        GOOGLE_OAUTH_CLIENT_SECRET="google-client-secret",
    )
    @patch("votingsystem.views.requests.post", side_effect=requests.RequestException("network down"))
    def test_google_auth_handles_token_exchange_failure(self, requests_post_mock):
        response = self.client.post(
            "/api/auth/google/",
            {"code": "google-popup-code", "role": "voter"},
            format="json",
        )
        self.assertEqual(response.status_code, 503)
        self.assertIn("temporarily unavailable", response.json()["detail"].lower())

    def test_forgot_password_endpoint(self):
        response = self.client.post(
            "/api/auth/forgot-password/",
            {
                "identity": "student_a",
                "new_password": "NewPass123!",
                "confirm_password": "NewPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["detail"], "Password updated successfully.")

        login_response = self.client.post(
            "/api/auth/login/",
            {"username": "student_a", "password": "NewPass123!"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)

    def test_admin_can_create_voter_candidate_update_schedule_and_post_announcement(self):
        client = self.admin_client()

        voter_response = client.post(
            "/api/admin/voters/",
            {
                "username": "new_voter",
                "email": "newvoter@example.com",
                "first_name": "New",
                "last_name": "Voter",
                "registration_number": "REG-101",
                "password": "VotePass123!",
                "confirm_password": "VotePass123!",
                "role": CustomUser.Role.STUDENT,
            },
            format="json",
        )
        self.assertEqual(voter_response.status_code, 201)
        self.assertEqual(voter_response.json()["user"]["username"], "new_voter")

        candidate_response = client.post(
            "/api/admin/candidates/",
            {
                "election_id": self.election.id,
                "position_id": self.position.id,
                "username": "new_candidate",
                "email": "candidate@example.com",
                "first_name": "New",
                "last_name": "Candidate",
                "password": "Candidate123!",
                "confirm_password": "Candidate123!",
                "slogan": "Forward now",
                "manifesto": "Serve the students well.",
                "approved": True,
            },
            format="json",
        )
        self.assertEqual(candidate_response.status_code, 201)
        self.assertEqual(candidate_response.json()["user"]["username"], "new_candidate")

        candidate_by_name_response = client.post(
            "/api/admin/candidates/",
            {
                "election_id": self.election.id,
                "position_name": self.position.name,
                "username": "candidate_by_name",
                "email": "candidatebyname@example.com",
                "first_name": "Typed",
                "last_name": "Position",
                "password": "Candidate123!",
                "confirm_password": "Candidate123!",
                "slogan": "Typed flow",
                "manifesto": "Serve through typed position.",
                "approved": True,
            },
            format="json",
        )
        self.assertEqual(candidate_by_name_response.status_code, 201)
        self.assertEqual(candidate_by_name_response.json()["user"]["username"], "candidate_by_name")

        candidate_new_position_response = client.post(
            "/api/admin/candidates/",
            {
                "election_id": self.election.id,
                "position_name": "Secretary General",
                "username": "candidate_new_position",
                "email": "newposition@example.com",
                "first_name": "New",
                "last_name": "Office",
                "password": "Candidate123!",
                "confirm_password": "Candidate123!",
                "slogan": "New office",
                "manifesto": "Serve in a newly created office.",
                "approved": True,
            },
            format="json",
        )
        self.assertEqual(candidate_new_position_response.status_code, 201)
        self.assertEqual(candidate_new_position_response.json()["user"]["username"], "candidate_new_position")
        self.assertTrue(Position.objects.filter(election=self.election, name="Secretary General").exists())

        schedule_response = client.patch(
            f"/api/admin/elections/{self.election.id}/schedule/",
            {
                "title": "Updated University Leadership Election 2026",
                "description": "Updated election schedule.",
            },
            format="json",
        )
        self.assertEqual(schedule_response.status_code, 200)
        self.assertEqual(schedule_response.json()["title"], "Updated University Leadership Election 2026")

        announcement_response = client.post(
            f"/api/admin/elections/{self.election.id}/announcements/",
            {
                "title": "Voting Notice",
                "message": "Voting begins soon.",
                "announcement_type": "notice",
                "is_pinned": True,
            },
            format="json",
        )
        self.assertEqual(announcement_response.status_code, 201)
        self.assertEqual(announcement_response.json()["title"], "Voting Notice")

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
