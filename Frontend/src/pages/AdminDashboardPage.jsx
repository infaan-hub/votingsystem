import { useEffect, useState } from "react";

import {
  adminCreateAnnouncement,
  adminCreateCandidate,
  adminCreateVoter,
  adminUpdateElectionSchedule,
  fetchElectionDetail,
  fetchResults,
  fetchStats,
  openStatsStream,
} from "../api";
import ElectionSelector from "../components/ElectionSelector";
import RequireAuth from "../components/RequireAuth";
import ScreenCard from "../components/ScreenCard";
import { formatDateTime, formatStatus, useCountdown } from "../utils";

const INITIAL_VOTER_FORM = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  registration_number: "",
  staff_id: "",
  password: "",
  confirm_password: "",
  role: "student",
};

const INITIAL_CANDIDATE_FORM = {
  position_name: "",
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  password: "",
  confirm_password: "",
  slogan: "",
  manifesto: "",
  approved: true,
};

const INITIAL_ANNOUNCEMENT_FORM = {
  title: "",
  message: "",
  announcement_type: "notice",
  publish_at: "",
  is_pinned: false,
};

export default function AdminDashboardPage({
  user,
  token,
  elections,
  selectedElectionId,
  onSelectElection,
}) {
  const [detail, setDetail] = useState(null);
  const [stats, setStats] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [voterForm, setVoterForm] = useState(INITIAL_VOTER_FORM);
  const [candidateForm, setCandidateForm] = useState(INITIAL_CANDIDATE_FORM);
  const [scheduleForm, setScheduleForm] = useState({
    title: "",
    description: "",
    campaign_start_at: "",
    campaign_end_at: "",
    voting_start_at: "",
    voting_end_at: "",
    allow_live_results: true,
    announce_winners_automatically: true,
    is_published: true,
  });
  const [announcementForm, setAnnouncementForm] = useState(INITIAL_ANNOUNCEMENT_FORM);
  const [submitting, setSubmitting] = useState("");

  const selectedElection =
    elections.find((item) => String(item.id) === String(selectedElectionId)) || elections[0] || null;
  const countdown = useCountdown(
    selectedElection?.status === "upcoming"
      ? selectedElection?.voting_start_at
      : selectedElection?.status === "active"
        ? selectedElection?.voting_end_at
        : null,
  );

  async function loadElectionData(electionId) {
    const [detailResult, statsResult, resultsResult] = await Promise.allSettled([
      fetchElectionDetail(electionId),
      fetchStats(electionId, token),
      fetchResults(electionId, token),
    ]);
    setDetail(detailResult.status === "fulfilled" ? detailResult.value : null);
    setStats(statsResult.status === "fulfilled" ? statsResult.value : null);
    setResults(resultsResult.status === "fulfilled" ? resultsResult.value : null);
    const firstFailure = [detailResult, statsResult, resultsResult].find((item) => item.status === "rejected");
    setError(firstFailure?.reason?.message || "");

    if (detailResult.status === "fulfilled") {
      const electionDetail = detailResult.value;
      setScheduleForm({
        title: electionDetail.title || "",
        description: electionDetail.description || "",
        campaign_start_at: electionDetail.campaign_start_at?.slice(0, 16) || "",
        campaign_end_at: electionDetail.campaign_end_at?.slice(0, 16) || "",
        voting_start_at: electionDetail.voting_start_at?.slice(0, 16) || "",
        voting_end_at: electionDetail.voting_end_at?.slice(0, 16) || "",
        allow_live_results: Boolean(electionDetail.allow_live_results),
        announce_winners_automatically: Boolean(electionDetail.announce_winners_automatically),
        is_published: electionDetail.is_published ?? true,
      });
    }
  }

  useEffect(() => {
    if (!selectedElection || !token) {
      return;
    }
    let ignore = false;
    loadElectionData(selectedElection.id).catch((requestError) => {
      if (!ignore) {
        setError(requestError.message);
      }
    });
    return () => {
      ignore = true;
    };
  }, [selectedElection, token]);

  useEffect(() => {
    if (!selectedElection) {
      return;
    }
    const stream = openStatsStream(selectedElection.id);

    stream.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.stats) {
          setStats(payload.stats);
        }
        if (payload.winners) {
          setResults((current) => ({ ...(current || {}), winners: payload.winners }));
        }
      } catch {
        // Ignore malformed stream events.
      }
    };

    stream.onerror = () => {
      stream.close();
    };

    return () => {
      stream.close();
    };
  }, [selectedElection]);

  async function handleCreateVoter(event) {
    event.preventDefault();
    setSubmitting("voter");
    setError("");
    setSuccess("");
    try {
      const response = await adminCreateVoter(voterForm, token);
      setSuccess(`Voter account created for ${response.user.full_name || response.user.username}.`);
      setVoterForm(INITIAL_VOTER_FORM);
      if (selectedElection) {
        await loadElectionData(selectedElection.id);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting("");
    }
  }

  async function handleCreateCandidate(event) {
    event.preventDefault();
    if (!selectedElection) {
      return;
    }
    setSubmitting("candidate");
    setError("");
    setSuccess("");
    try {
      const matchedPosition = detail?.positions?.find(
        (position) => position.name.trim().toLowerCase() === candidateForm.position_name.trim().toLowerCase(),
      );
      if (!matchedPosition) {
        throw new Error("Enter a valid position name for the selected election.");
      }
      const response = await adminCreateCandidate(
        {
          ...candidateForm,
          position_id: matchedPosition.id,
          election_id: selectedElection.id,
        },
        token,
      );
      setSuccess(`Candidate ${response.user.full_name} was registered successfully.`);
      setCandidateForm(INITIAL_CANDIDATE_FORM);
      await loadElectionData(selectedElection.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting("");
    }
  }

  async function handleUpdateSchedule(event) {
    event.preventDefault();
    if (!selectedElection) {
      return;
    }
    setSubmitting("schedule");
    setError("");
    setSuccess("");
    try {
      await adminUpdateElectionSchedule(selectedElection.id, scheduleForm, token);
      setSuccess("Election schedule updated successfully.");
      await loadElectionData(selectedElection.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting("");
    }
  }

  async function handleCreateAnnouncement(event) {
    event.preventDefault();
    if (!selectedElection) {
      return;
    }
    setSubmitting("announcement");
    setError("");
    setSuccess("");
    try {
      await adminCreateAnnouncement(selectedElection.id, announcementForm, token);
      setSuccess("Election notice posted successfully.");
      setAnnouncementForm(INITIAL_ANNOUNCEMENT_FORM);
      await loadElectionData(selectedElection.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting("");
    }
  }

  return (
    <RequireAuth user={user} allowAdmin loginPath="/admin/login">
      <div className="page-stack">
        <ScreenCard
          step={3}
          section="Administration"
          title="Admin Dashboard"
          subtitle="Register candidates, register voters, set election time and review published data."
        >
          <div className="panel-grid two-col">
            <div className="soft-panel">
              <label className="field-label" htmlFor="admin-election-select">
                Current Election
              </label>
              <ElectionSelector
                elections={elections}
                selectedElectionId={selectedElectionId}
                onSelectElection={onSelectElection}
                inputId="admin-election-select"
                inputName="admin_election"
              />
              <div className="metric-list top-space">
                <div className="metric-card">
                  <span>Countdown</span>
                  <strong>{countdown}</strong>
                </div>
                <div className="metric-card">
                  <span>Status</span>
                  <strong>{formatStatus(selectedElection?.status)}</strong>
                </div>
                <div className="metric-card">
                  <span>Voting Deadline</span>
                  <strong>{formatDateTime(selectedElection?.voting_end_at)}</strong>
                </div>
              </div>
            </div>
            <div className="soft-panel">
              <h3>Admin Functions</h3>
              <div className="action-note-list">
                <div className="info-note">Register candidates for each election position.</div>
                <div className="info-note">Register voters and prepare them for election access.</div>
                <div className="info-note">Set election date, time, and deadline for all users.</div>
                <div className="info-note">Post election notices and guide the shared countdown.</div>
              </div>
            </div>
          </div>
          {success ? <div className="success-banner top-space">{success}</div> : null}
          {error ? <div className="error-banner top-space">{error}</div> : null}
        </ScreenCard>

        <ScreenCard
          step={4}
          section="Administration"
          title="Manage Election"
          subtitle="Create voter and candidate accounts, update election timing, and post announcements."
        >
          <div className="panel-grid two-col">
            <form className="soft-panel form-stack" onSubmit={handleCreateVoter}>
              <h3>Register Voter</h3>
              <label className="field-label" htmlFor="admin-voter-username">Username</label>
              <input
                id="admin-voter-username"
                name="username"
                className="field-input"
                placeholder="Username"
                autoComplete="username"
                value={voterForm.username}
                onChange={(event) => setVoterForm((current) => ({ ...current, username: event.target.value }))}
                required
              />
              <label className="field-label" htmlFor="admin-voter-email">Email</label>
              <input
                id="admin-voter-email"
                name="email"
                className="field-input"
                placeholder="Email"
                type="email"
                autoComplete="email"
                value={voterForm.email}
                onChange={(event) => setVoterForm((current) => ({ ...current, email: event.target.value }))}
              />
              <label className="field-label" htmlFor="admin-voter-first-name">First Name</label>
              <input
                id="admin-voter-first-name"
                name="first_name"
                className="field-input"
                placeholder="First Name"
                autoComplete="given-name"
                value={voterForm.first_name}
                onChange={(event) => setVoterForm((current) => ({ ...current, first_name: event.target.value }))}
                required
              />
              <label className="field-label" htmlFor="admin-voter-last-name">Last Name</label>
              <input
                id="admin-voter-last-name"
                name="last_name"
                className="field-input"
                placeholder="Last Name"
                autoComplete="family-name"
                value={voterForm.last_name}
                onChange={(event) => setVoterForm((current) => ({ ...current, last_name: event.target.value }))}
                required
              />
              <label className="field-label" htmlFor="admin-voter-role">Role</label>
              <select
                id="admin-voter-role"
                name="role"
                className="field-input"
                value={voterForm.role}
                onChange={(event) => setVoterForm((current) => ({ ...current, role: event.target.value }))}
              >
                <option value="student">Student</option>
                <option value="staff">Staff</option>
                <option value="officer">Election Officer</option>
              </select>
              <label className="field-label" htmlFor="admin-voter-registration-number">Registration Number</label>
              <input
                id="admin-voter-registration-number"
                name="registration_number"
                className="field-input"
                placeholder="Registration Number"
                value={voterForm.registration_number}
                onChange={(event) =>
                  setVoterForm((current) => ({ ...current, registration_number: event.target.value }))
                }
              />
              <label className="field-label" htmlFor="admin-voter-staff-id">Staff ID</label>
              <input
                id="admin-voter-staff-id"
                name="staff_id"
                className="field-input"
                placeholder="Staff ID"
                value={voterForm.staff_id}
                onChange={(event) => setVoterForm((current) => ({ ...current, staff_id: event.target.value }))}
              />
              <label className="field-label" htmlFor="admin-voter-password">Password</label>
              <input
                id="admin-voter-password"
                name="password"
                className="field-input"
                placeholder="Password"
                type="password"
                autoComplete="new-password"
                value={voterForm.password}
                onChange={(event) => setVoterForm((current) => ({ ...current, password: event.target.value }))}
                required
              />
              <label className="field-label" htmlFor="admin-voter-confirm-password">Confirm Password</label>
              <input
                id="admin-voter-confirm-password"
                name="confirm_password"
                className="field-input"
                placeholder="Confirm Password"
                type="password"
                autoComplete="new-password"
                value={voterForm.confirm_password}
                onChange={(event) =>
                  setVoterForm((current) => ({ ...current, confirm_password: event.target.value }))
                }
                required
              />
              <button className="primary-button" type="submit" disabled={submitting === "voter"}>
                {submitting === "voter" ? "Registering Voter..." : "Register Voter"}
              </button>
            </form>

            <form className="soft-panel form-stack" onSubmit={handleCreateCandidate}>
              <h3>Register Candidate</h3>
              <label className="field-label" htmlFor="admin-candidate-position">Position</label>
              <input
                id="admin-candidate-position"
                name="position_name"
                className="field-input"
                list="candidate-position-options"
                placeholder="Type Position"
                value={candidateForm.position_name}
                onChange={(event) =>
                  setCandidateForm((current) => ({ ...current, position_name: event.target.value }))
                }
                required
              />
              <datalist id="candidate-position-options">
                {detail?.positions?.map((position) => (
                  <option key={position.id} value={position.name} />
                ))}
              </datalist>
              <label className="field-label" htmlFor="admin-candidate-username">Username</label>
              <input
                id="admin-candidate-username"
                name="username"
                className="field-input"
                placeholder="Username"
                autoComplete="username"
                value={candidateForm.username}
                onChange={(event) => setCandidateForm((current) => ({ ...current, username: event.target.value }))}
                required
              />
              <label className="field-label" htmlFor="admin-candidate-email">Email</label>
              <input
                id="admin-candidate-email"
                name="email"
                className="field-input"
                placeholder="Email"
                type="email"
                autoComplete="email"
                value={candidateForm.email}
                onChange={(event) => setCandidateForm((current) => ({ ...current, email: event.target.value }))}
              />
              <label className="field-label" htmlFor="admin-candidate-first-name">First Name</label>
              <input
                id="admin-candidate-first-name"
                name="first_name"
                className="field-input"
                placeholder="First Name"
                autoComplete="given-name"
                value={candidateForm.first_name}
                onChange={(event) => setCandidateForm((current) => ({ ...current, first_name: event.target.value }))}
                required
              />
              <label className="field-label" htmlFor="admin-candidate-last-name">Last Name</label>
              <input
                id="admin-candidate-last-name"
                name="last_name"
                className="field-input"
                placeholder="Last Name"
                autoComplete="family-name"
                value={candidateForm.last_name}
                onChange={(event) => setCandidateForm((current) => ({ ...current, last_name: event.target.value }))}
                required
              />
              <label className="field-label" htmlFor="admin-candidate-password">Password</label>
              <input
                id="admin-candidate-password"
                name="password"
                className="field-input"
                placeholder="Password"
                type="password"
                autoComplete="new-password"
                value={candidateForm.password}
                onChange={(event) => setCandidateForm((current) => ({ ...current, password: event.target.value }))}
                required
              />
              <label className="field-label" htmlFor="admin-candidate-confirm-password">Confirm Password</label>
              <input
                id="admin-candidate-confirm-password"
                name="confirm_password"
                className="field-input"
                placeholder="Confirm Password"
                type="password"
                autoComplete="new-password"
                value={candidateForm.confirm_password}
                onChange={(event) =>
                  setCandidateForm((current) => ({ ...current, confirm_password: event.target.value }))
                }
                required
              />
              <label className="field-label" htmlFor="admin-candidate-slogan">Campaign Slogan</label>
              <input
                id="admin-candidate-slogan"
                name="slogan"
                className="field-input"
                placeholder="Campaign Slogan"
                value={candidateForm.slogan}
                onChange={(event) => setCandidateForm((current) => ({ ...current, slogan: event.target.value }))}
              />
              <label className="field-label" htmlFor="admin-candidate-manifesto">Manifesto</label>
              <textarea
                id="admin-candidate-manifesto"
                name="manifesto"
                className="field-input field-textarea"
                placeholder="Manifesto"
                value={candidateForm.manifesto}
                onChange={(event) => setCandidateForm((current) => ({ ...current, manifesto: event.target.value }))}
              />
              <button className="primary-button" type="submit" disabled={submitting === "candidate"}>
                {submitting === "candidate" ? "Registering Candidate..." : "Register Candidate"}
              </button>
            </form>

            <form className="soft-panel form-stack" onSubmit={handleUpdateSchedule}>
              <h3>Set Election Schedule</h3>
              <label className="field-label" htmlFor="admin-schedule-title">Election Title</label>
              <input
                id="admin-schedule-title"
                name="title"
                className="field-input"
                placeholder="Election Title"
                value={scheduleForm.title}
                onChange={(event) => setScheduleForm((current) => ({ ...current, title: event.target.value }))}
                required
              />
              <label className="field-label" htmlFor="admin-schedule-description">Election Description</label>
              <textarea
                id="admin-schedule-description"
                name="description"
                className="field-input field-textarea"
                placeholder="Election Description"
                value={scheduleForm.description}
                onChange={(event) => setScheduleForm((current) => ({ ...current, description: event.target.value }))}
              />
              <label className="field-label" htmlFor="admin-schedule-campaign-start">Campaign Start</label>
              <input
                id="admin-schedule-campaign-start"
                name="campaign_start_at"
                className="field-input"
                type="datetime-local"
                value={scheduleForm.campaign_start_at}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, campaign_start_at: event.target.value }))
                }
                required
              />
              <label className="field-label" htmlFor="admin-schedule-campaign-end">Campaign End</label>
              <input
                id="admin-schedule-campaign-end"
                name="campaign_end_at"
                className="field-input"
                type="datetime-local"
                value={scheduleForm.campaign_end_at}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, campaign_end_at: event.target.value }))
                }
                required
              />
              <label className="field-label" htmlFor="admin-schedule-voting-start">Voting Start</label>
              <input
                id="admin-schedule-voting-start"
                name="voting_start_at"
                className="field-input"
                type="datetime-local"
                value={scheduleForm.voting_start_at}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, voting_start_at: event.target.value }))
                }
                required
              />
              <label className="field-label" htmlFor="admin-schedule-voting-end">Voting End</label>
              <input
                id="admin-schedule-voting-end"
                name="voting_end_at"
                className="field-input"
                type="datetime-local"
                value={scheduleForm.voting_end_at}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, voting_end_at: event.target.value }))
                }
                required
              />
              <button className="primary-button" type="submit" disabled={submitting === "schedule"}>
                {submitting === "schedule" ? "Saving Schedule..." : "Save Election Schedule"}
              </button>
            </form>

            <form className="soft-panel form-stack" onSubmit={handleCreateAnnouncement}>
              <h3>Post Election Notice</h3>
              <label className="field-label" htmlFor="admin-announcement-title">Announcement Title</label>
              <input
                id="admin-announcement-title"
                name="title"
                className="field-input"
                placeholder="Announcement Title"
                value={announcementForm.title}
                onChange={(event) =>
                  setAnnouncementForm((current) => ({ ...current, title: event.target.value }))
                }
                required
              />
              <label className="field-label" htmlFor="admin-announcement-message">Announcement Message</label>
              <textarea
                id="admin-announcement-message"
                name="message"
                className="field-input field-textarea"
                placeholder="Announcement Message"
                value={announcementForm.message}
                onChange={(event) =>
                  setAnnouncementForm((current) => ({ ...current, message: event.target.value }))
                }
                required
              />
              <label className="field-label" htmlFor="admin-announcement-type">Announcement Type</label>
              <select
                id="admin-announcement-type"
                name="announcement_type"
                className="field-input"
                value={announcementForm.announcement_type}
                onChange={(event) =>
                  setAnnouncementForm((current) => ({
                    ...current,
                    announcement_type: event.target.value,
                  }))
                }
              >
                <option value="notice">Notice</option>
                <option value="campaign">Campaign</option>
                <option value="result">Result</option>
              </select>
              <label className="field-label" htmlFor="admin-announcement-publish-at">Publish At</label>
              <input
                id="admin-announcement-publish-at"
                name="publish_at"
                className="field-input"
                type="datetime-local"
                value={announcementForm.publish_at}
                onChange={(event) =>
                  setAnnouncementForm((current) => ({ ...current, publish_at: event.target.value }))
                }
              />
              <button className="primary-button" type="submit" disabled={submitting === "announcement"}>
                {submitting === "announcement" ? "Posting Notice..." : "Post Election Notice"}
              </button>
            </form>
          </div>
        </ScreenCard>

        <ScreenCard
          step={5}
          section="Oversight"
          title="Election Overview"
          subtitle="Read the published election structure, candidates, and visible totals."
        >
          <div className="panel-grid two-col">
            <div className="soft-panel">
              <h3>Election Detail</h3>
              <p>{detail?.description || "No description available."}</p>
              <div className="stack-sm top-space">
                {detail?.positions?.map((position) => (
                  <div className="list-row" key={position.id}>
                    <strong>{position.name}</strong>
                    <span>{position.candidates.length} candidates</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="soft-panel">
              <h3>Results Snapshot</h3>
              <div className="stack-sm">
                {results?.winners?.length ? (
                  results.winners.map((winner, index) => (
                    <div className="list-row" key={`${winner.position}-${index}`}>
                      <strong>{winner.position}</strong>
                      <span>{winner.winner_names}</span>
                    </div>
                  ))
                ) : (
                  <div className="info-note">Results are hidden or not yet available.</div>
                )}
              </div>
              {stats ? (
                <div className="metric-card top-space">
                  <span>Total Votes</span>
                  <strong>{stats.votes_cast}</strong>
                </div>
              ) : null}
            </div>
          </div>
        </ScreenCard>
      </div>
    </RequireAuth>
  );
}
