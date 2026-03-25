import json

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count, F, Q
from django.utils import timezone

from .models import Candidate, CustomUser, Election, Position, Vote


VOTING_ROLES = (
    CustomUser.Role.STUDENT,
    CustomUser.Role.STAFF,
    CustomUser.Role.OFFICER,
)


def eligible_users_for_position(position: Position):
    queryset = CustomUser.objects.filter(is_active=True, role__in=VOTING_ROLES)
    if position.voter_group == Position.VoterGroup.STUDENT:
        queryset = queryset.filter(role=CustomUser.Role.STUDENT)
    elif position.voter_group == Position.VoterGroup.STAFF:
        queryset = queryset.filter(role=CustomUser.Role.STAFF)
    elif position.voter_group == Position.VoterGroup.STAFF_AND_OFFICER:
        queryset = queryset.filter(
            role__in=(CustomUser.Role.STAFF, CustomUser.Role.OFFICER)
        )
    if position.department_id:
        queryset = queryset.filter(department_id=position.department_id)
    if position.section_id:
        queryset = queryset.filter(section_id=position.section_id)
    return queryset.distinct()


def eligible_positions_for_user(election: Election, user: CustomUser):
    positions = election.positions.select_related("department", "section").all()
    return [position for position in positions if position.is_user_eligible(user)]


def visible_announcements(election: Election):
    now = timezone.now()
    return election.announcements.filter(Q(publish_at__isnull=True) | Q(publish_at__lte=now))


def results_visible(election: Election, user=None):
    if election.status == Election.Status.ENDED or election.allow_live_results:
        return True
    if not user or not getattr(user, "is_authenticated", False):
        return False
    return user.role in {CustomUser.Role.ADMIN, CustomUser.Role.OFFICER}


def cast_vote(*, voter: CustomUser, candidate: Candidate):
    vote = Vote(
        voter=voter,
        candidate=candidate,
        election=candidate.election,
        position=candidate.position,
    )
    vote.full_clean()
    try:
        with transaction.atomic():
            vote.save()
    except IntegrityError as exc:
        raise ValidationError(
            {"detail": "You have already voted for this position in this election."}
        ) from exc
    return vote


def _ordered_candidates_for_position(position: Position):
    return (
        position.candidates.filter(approved=True)
        .select_related("user", "department", "section")
        .annotate(total_votes=Count("votes"))
        .order_by("-total_votes", "featured_order", "user__first_name", "user__username")
    )


def _safe_media_url(file_field):
    if not file_field:
        return None
    storage = getattr(file_field, "storage", None)
    name = getattr(file_field, "name", "")
    if not storage or not name or not storage.exists(name):
        return None
    return file_field.url


def build_position_ranking(position: Position):
    candidates = list(_ordered_candidates_for_position(position))
    results = []
    last_total = None
    current_rank = 0
    winner_ids = {candidate.id for candidate in candidates[: position.max_winners]}
    for index, candidate in enumerate(candidates, start=1):
        if last_total != candidate.total_votes:
            current_rank = index
            last_total = candidate.total_votes
        results.append(
            {
                "candidate_id": candidate.id,
                "candidate_name": candidate.user.display_name,
                "user_id": candidate.user_id,
                "department": candidate.department.name if candidate.department else None,
                "section": candidate.section.name if candidate.section else None,
                "slogan": candidate.slogan,
                "vote_total": candidate.total_votes,
                "rank": current_rank,
                "is_winner": candidate.id in winner_ids,
                "photo_url": _safe_media_url(candidate.photo),
            }
        )
    return results


def _registered_voter_ids(election: Election):
    voter_ids = set()
    for position in election.positions.all():
        voter_ids.update(eligible_users_for_position(position).values_list("id", flat=True))
    return voter_ids


def _votes_by_group(queryset, lookup: str):
    rows = (
        queryset.exclude(**{f"{lookup}__isnull": True})
        .values(label=F(lookup))
        .annotate(total_votes=Count("id"))
        .order_by("-total_votes", "label")
    )
    return list(rows)


def build_election_stats(election: Election):
    registered_voter_ids = _registered_voter_ids(election)
    registered_voters = len(registered_voter_ids)
    voter_turnout = election.votes.values("voter").distinct().count()
    turnout_percentage = round((voter_turnout / registered_voters) * 100, 2) if registered_voters else 0
    position_summaries = []
    for position in election.positions.select_related("department", "section").all():
        ranking = build_position_ranking(position)
        leader = ranking[0] if ranking else None
        position_summaries.append(
            {
                "id": position.id,
                "name": position.name,
                "department": position.department.name if position.department else None,
                "section": position.section.name if position.section else None,
                "max_winners": position.max_winners,
                "voter_group": position.get_voter_group_display(),
                "votes_cast": position.votes.count(),
                "registered_voters": eligible_users_for_position(position).count(),
                "leader": leader,
                "results": ranking,
            }
        )
    return {
        "election_id": election.id,
        "status": election.status,
        "allow_live_results": election.allow_live_results,
        "registered_voters": registered_voters,
        "votes_cast": election.votes.count(),
        "turnout_voters": voter_turnout,
        "turnout_percentage": turnout_percentage,
        "candidate_count": election.candidates.filter(approved=True).count(),
        "position_count": election.positions.count(),
        "seconds_until_start": election.seconds_until_start(),
        "seconds_until_end": election.seconds_until_end(),
        "positions": position_summaries,
        "votes_by_department": _votes_by_group(election.votes, "candidate__department__name"),
        "votes_by_section": _votes_by_group(election.votes, "candidate__section__name"),
    }


def build_winner_announcement(election: Election):
    announcements = []
    for position in election.positions.select_related("department", "section").all():
        ranking = build_position_ranking(position)
        winners = [result for result in ranking if result["is_winner"]]
        if not winners:
            continue
        scope = position.section.name if position.section else (
            position.department.name if position.department else "Campus"
        )
        winner_names = ", ".join(winner["candidate_name"] for winner in winners)
        announcements.append(
            {
                "position": position.name,
                "scope": scope,
                "winner_names": winner_names,
            }
        )
    return announcements


def serialize_stats_event(election: Election):
    payload = {
        "stats": build_election_stats(election),
        "winners": build_winner_announcement(election),
    }
    return json.dumps(payload)
