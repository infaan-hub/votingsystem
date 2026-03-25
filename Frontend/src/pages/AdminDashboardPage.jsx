import { useEffect, useState } from "react";

import {
  adminCreateAnnouncement,
  adminCreateCandidate,
  adminDeleteCandidate,
  adminDeleteUser,
  adminUpdateCandidate,
  adminUpdateUser,
  adminCreateVoter,
  adminUpdateElectionSchedule,
  fetchAdminUsers,
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
  photo: null,
  approved: true,
};

const INITIAL_ANNOUNCEMENT_FORM = {
  title: "",
  message: "",
  announcement_type: "notice",
  publish_at: "",
  is_pinned: false,
};

const CUSTOM_POSITION_VALUE = "__custom_position__";
const MAX_CANDIDATE_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

function normalizeText(value) {
  return value.trim();
}

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
  const [users, setUsers] = useState([]);
  const [voterForm, setVoterForm] = useState(INITIAL_VOTER_FORM);
  const [editingUserId, setEditingUserId] = useState(null);
  const [candidateForm, setCandidateForm] = useState(INITIAL_CANDIDATE_FORM);
  const [candidateElectionId, setCandidateElectionId] = useState(selectedElectionId || "");
  const [candidateElectionDetail, setCandidateElectionDetail] = useState(null);
  const [candidateUsesCustomPosition, setCandidateUsesCustomPosition] = useState(false);
  const [editingCandidateId, setEditingCandidateId] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    title: "",
    description: "",
    image: null,
    image_url: "",
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
        image: null,
        image_url: electionDetail.image_url || "",
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

  async function loadUsers() {
    const response = await fetchAdminUsers(token);
    setUsers(response.users || []);
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
    if (!token) {
      setUsers([]);
      return;
    }
    let ignore = false;
    loadUsers().catch((requestError) => {
      if (!ignore) {
        setError(requestError.message);
      }
    });
    return () => {
      ignore = true;
    };
  }, [token]);

  useEffect(() => {
    if (!elections.length) {
      setCandidateElectionId("");
      return;
    }
    if (candidateElectionId && elections.some((item) => String(item.id) === String(candidateElectionId))) {
      return;
    }
    setCandidateElectionId(String(selectedElectionId || elections[0].id));
  }, [candidateElectionId, elections, selectedElectionId]);

  useEffect(() => {
    if (!candidateElectionId) {
      setCandidateElectionDetail(null);
      return;
    }
    let ignore = false;
    fetchElectionDetail(candidateElectionId)
      .then((result) => {
        if (!ignore) {
          setCandidateElectionDetail(result);
        }
      })
      .catch(() => {
        if (!ignore) {
          setCandidateElectionDetail(null);
        }
      });
    return () => {
      ignore = true;
    };
  }, [candidateElectionId]);

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

  useEffect(() => {
    setCandidateUsesCustomPosition(false);
    setEditingCandidateId(null);
    setCandidateForm((current) => ({
      ...current,
      position_name: "",
    }));
  }, [candidateElectionId]);

  async function handleCreateVoter(event) {
    event.preventDefault();
    setSubmitting("voter");
    setError("");
    setSuccess("");
    try {
      const payload = editingUserId
        ? {
            username: voterForm.username,
            email: voterForm.email,
            first_name: voterForm.first_name,
            last_name: voterForm.last_name,
            registration_number: voterForm.registration_number,
            staff_id: voterForm.staff_id,
            role: voterForm.role,
          }
        : voterForm;
      const response = editingUserId
        ? await adminUpdateUser(editingUserId, payload, token)
        : await adminCreateVoter(payload, token);
      setSuccess(
        editingUserId
          ? `User ${response.user.full_name || response.user.username} was updated successfully.`
          : `Voter account created for ${response.user.full_name || response.user.username}.`,
      );
      setVoterForm(INITIAL_VOTER_FORM);
      setEditingUserId(null);
      await loadUsers();
      if (selectedElection) {
        await loadElectionData(selectedElection.id);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting("");
    }
  }

  function handleEditUser(managedUser) {
    setEditingUserId(managedUser.id);
    setVoterForm({
      username: managedUser.username || "",
      email: managedUser.email || "",
      first_name: managedUser.full_name?.split(" ")[0] || "",
      last_name: managedUser.full_name?.split(" ").slice(1).join(" ") || "",
      registration_number: managedUser.registration_number || "",
      staff_id: managedUser.staff_id || "",
      password: "",
      confirm_password: "",
      role: managedUser.role || "student",
    });
  }

  async function handleDeleteUser(userId) {
    setSubmitting(`delete-user-${userId}`);
    setError("");
    setSuccess("");
    try {
      await adminDeleteUser(userId, token);
      setSuccess("User deleted successfully.");
      if (editingUserId === userId) {
        setEditingUserId(null);
        setVoterForm(INITIAL_VOTER_FORM);
      }
      await loadUsers();
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
    const candidateElection =
      elections.find((item) => String(item.id) === String(candidateElectionId)) || null;

    if (!candidateElection) {
      setError("Select an election before registering a candidate.");
      setSuccess("");
      return;
    }

    const normalizedCustomPosition = normalizeText(candidateForm.position_name);
    const normalizedUsername = normalizeText(candidateForm.username);
    const normalizedFirstName = normalizeText(candidateForm.first_name);
    const normalizedLastName = normalizeText(candidateForm.last_name);

    if (!normalizedCustomPosition) {
      setError("Select or enter a position name.");
      setSuccess("");
      return;
    }
    if (!normalizedUsername || !normalizedFirstName || !normalizedLastName) {
      setError("Username, first name, and last name are required.");
      setSuccess("");
      return;
    }
    if (candidateForm.password !== candidateForm.confirm_password) {
      setError("Candidate passwords do not match.");
      setSuccess("");
      return;
    }
    if (candidateForm.photo) {
      if (!candidateForm.photo.type.startsWith("image/")) {
        setError("Candidate photo must be a valid image file.");
        setSuccess("");
        return;
      }
      if (candidateForm.photo.size > MAX_CANDIDATE_PHOTO_SIZE_BYTES) {
        setError("Candidate photo must be 5MB or smaller.");
        setSuccess("");
        return;
      }
    }

    setSubmitting("candidate");
    setError("");
    setSuccess("");
    try {
      const payload = {
        ...candidateForm,
        position_name: normalizedCustomPosition,
        username: normalizedUsername,
        first_name: normalizedFirstName,
        last_name: normalizedLastName,
        email: normalizeText(candidateForm.email),
        slogan: normalizeText(candidateForm.slogan),
        manifesto: normalizeText(candidateForm.manifesto),
      };
      const response = editingCandidateId
        ? await adminUpdateCandidate(candidateElection.id, editingCandidateId, payload, token)
        : await adminCreateCandidate(candidateElection.id, payload, token);
      setSuccess(
        editingCandidateId
          ? `Candidate ${response.user.full_name} was updated successfully.`
          : `Candidate ${response.user.full_name} was registered successfully.`,
      );
      setCandidateForm(INITIAL_CANDIDATE_FORM);
      setCandidateUsesCustomPosition(false);
      setEditingCandidateId(null);
      const refreshTasks = [
        fetchElectionDetail(candidateElection.id).then((result) => setCandidateElectionDetail(result)),
      ];
      if (selectedElection) {
        refreshTasks.push(loadElectionData(selectedElection.id));
      }
      await Promise.all(refreshTasks);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting("");
    }
  }

  function handleEditCandidate(candidate, positionName) {
    setCandidateElectionId(String(selectedElection?.id || candidateElectionId));
    setEditingCandidateId(candidate.id);
    setCandidateUsesCustomPosition(
      !candidateElectionDetail?.positions?.some((position) => position.name === positionName),
    );
    setCandidateForm({
      position_name: positionName,
      username: candidate.user.username || "",
      email: candidate.user.email || "",
      first_name: candidate.user.full_name?.split(" ")[0] || "",
      last_name: candidate.user.full_name?.split(" ").slice(1).join(" ") || "",
      password: "",
      confirm_password: "",
      slogan: candidate.slogan || "",
      manifesto: candidate.manifesto || "",
      photo: null,
      approved: Boolean(candidate.approved),
    });
  }

  async function handleDeleteCandidate(candidateId) {
    if (!selectedElection) {
      return;
    }
    setSubmitting(`delete-candidate-${candidateId}`);
    setError("");
    setSuccess("");
    try {
      await adminDeleteCandidate(selectedElection.id, candidateId, token);
      setSuccess("Candidate deleted successfully.");
      if (editingCandidateId === candidateId) {
        setEditingCandidateId(null);
        setCandidateForm(INITIAL_CANDIDATE_FORM);
        setCandidateUsesCustomPosition(false);
      }
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
    if (scheduleForm.image) {
      if (!scheduleForm.image.type.startsWith("image/")) {
        setError("Election image must be a valid image file.");
        setSuccess("");
        return;
      }
      if (scheduleForm.image.size > MAX_CANDIDATE_PHOTO_SIZE_BYTES) {
        setError("Election image must be 5MB or smaller.");
        setSuccess("");
        return;
      }
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
          {success ? <div className="success-banner top-space">{success}</div> : null}
          {error ? <div className="error-banner top-space">{error}</div> : null}
        </ScreenCard>

        <ScreenCard
          step={4}
          section="Administration"
          title="Manage Election"
          subtitle="Create voter and candidate accounts, update election timing, and post announcements."
        >
          {success ? <div className="success-banner top-space">{success}</div> : null}
          {error ? <div className="error-banner top-space">{error}</div> : null}
          <div className="panel-grid two-col">
            <form className="soft-panel form-stack" onSubmit={handleCreateVoter}>
              <h3>{editingUserId ? "Edit User" : "Register Voter"}</h3>
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
                required={!editingUserId}
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
                required={!editingUserId}
              />
              <button className="primary-button" type="submit" disabled={submitting === "voter"}>
                {submitting === "voter"
                  ? editingUserId
                    ? "Saving User..."
                    : "Registering Voter..."
                  : editingUserId
                    ? "Save User"
                    : "Register Voter"}
              </button>
              {editingUserId ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setEditingUserId(null);
                    setVoterForm(INITIAL_VOTER_FORM);
                  }}
                >
                  Cancel Edit
                </button>
              ) : null}
            </form>

            <form className="soft-panel form-stack" onSubmit={handleCreateCandidate}>
              <h3>Register Candidate</h3>
              <label className="field-label" htmlFor="admin-candidate-election-select">Election</label>
              <ElectionSelector
                elections={elections}
                selectedElectionId={candidateElectionId}
                onSelectElection={setCandidateElectionId}
                inputId="admin-candidate-election-select"
                inputName="admin_candidate_election"
              />
              <div className="info-note">
                This candidate will be registered only under the selected election above.
              </div>
              <label className="field-label" htmlFor="admin-candidate-position">Position</label>
              <select
                id="admin-candidate-position"
                name="position_choice"
                className="field-input"
                value={candidateUsesCustomPosition ? CUSTOM_POSITION_VALUE : candidateForm.position_name}
                onChange={(event) => {
                  if (event.target.value === CUSTOM_POSITION_VALUE) {
                    setCandidateUsesCustomPosition(true);
                    setCandidateForm((current) => ({
                      ...current,
                      position_name: "",
                    }));
                    return;
                  }
                  setCandidateUsesCustomPosition(false);
                  setCandidateForm((current) => ({
                    ...current,
                    position_name: event.target.value,
                  }));
                }}
                disabled={submitting === "candidate"}
              >
                <option value="">Select position</option>
                {candidateElectionDetail?.positions?.map((position) => (
                  <option key={position.id} value={position.name}>
                    {position.name}
                  </option>
                ))}
                <option value={CUSTOM_POSITION_VALUE}>Create custom position</option>
              </select>
              {candidateUsesCustomPosition ? (
                <input
                  id="admin-candidate-custom-position"
                  name="position_name"
                  className="field-input"
                  placeholder="Type new position name"
                  value={candidateForm.position_name}
                  onChange={(event) =>
                    setCandidateForm((current) => ({
                      ...current,
                      position_name: event.target.value,
                    }))
                  }
                  required
                  disabled={submitting === "candidate"}
                />
              ) : null}
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
                disabled={submitting === "candidate"}
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
                disabled={submitting === "candidate"}
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
                disabled={submitting === "candidate"}
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
                disabled={submitting === "candidate"}
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
                disabled={submitting === "candidate"}
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
                disabled={submitting === "candidate"}
              />
              <label className="field-label" htmlFor="admin-candidate-slogan">Campaign Slogan</label>
              <input
                id="admin-candidate-slogan"
                name="slogan"
                className="field-input"
                placeholder="Campaign Slogan"
                value={candidateForm.slogan}
                onChange={(event) => setCandidateForm((current) => ({ ...current, slogan: event.target.value }))}
                disabled={submitting === "candidate"}
              />
              <label className="field-label" htmlFor="admin-candidate-manifesto">Manifesto</label>
              <textarea
                id="admin-candidate-manifesto"
                name="manifesto"
                className="field-input field-textarea"
                placeholder="Manifesto"
                value={candidateForm.manifesto}
                onChange={(event) => setCandidateForm((current) => ({ ...current, manifesto: event.target.value }))}
                disabled={submitting === "candidate"}
              />
              <label className="field-label" htmlFor="admin-candidate-photo">Candidate Image</label>
              <input
                id="admin-candidate-photo"
                name="photo"
                className="field-input"
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setCandidateForm((current) => ({
                    ...current,
                    photo: event.target.files?.[0] || null,
                  }))
                }
                disabled={submitting === "candidate"}
              />
              <button className="primary-button" type="submit" disabled={submitting === "candidate"}>
                {submitting === "candidate"
                  ? editingCandidateId
                    ? "Saving Candidate..."
                    : "Registering Candidate..."
                  : editingCandidateId
                    ? "Update Candidate"
                    : "Register Candidate"}
              </button>
              {editingCandidateId ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setEditingCandidateId(null);
                    setCandidateForm(INITIAL_CANDIDATE_FORM);
                    setCandidateUsesCustomPosition(false);
                  }}
                >
                  Cancel Edit
                </button>
              ) : null}
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
                disabled={submitting === "schedule"}
              />
              <label className="field-label" htmlFor="admin-schedule-description">Election Description</label>
              <textarea
                id="admin-schedule-description"
                name="description"
                className="field-input field-textarea"
                placeholder="Election Description"
                value={scheduleForm.description}
                onChange={(event) => setScheduleForm((current) => ({ ...current, description: event.target.value }))}
                disabled={submitting === "schedule"}
              />
              <label className="field-label" htmlFor="admin-schedule-image">Election Image</label>
              <input
                id="admin-schedule-image"
                name="image"
                className="field-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) =>
                  setScheduleForm((current) => ({
                    ...current,
                    image: event.target.files?.[0] || null,
                  }))
                }
                disabled={submitting === "schedule"}
              />
              {scheduleForm.image_url ? (
                <div className="info-note">Saved image is available for this election.</div>
              ) : null}
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
                disabled={submitting === "schedule"}
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
                disabled={submitting === "schedule"}
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
                disabled={submitting === "schedule"}
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
                disabled={submitting === "schedule"}
              />
              <label className="field-label" htmlFor="admin-schedule-live-results">
                <input
                  id="admin-schedule-live-results"
                  name="allow_live_results"
                  type="checkbox"
                  checked={scheduleForm.allow_live_results}
                  onChange={(event) =>
                    setScheduleForm((current) => ({ ...current, allow_live_results: event.target.checked }))
                  }
                  disabled={submitting === "schedule"}
                />
                Allow live results
              </label>
              <label className="field-label" htmlFor="admin-schedule-auto-winners">
                <input
                  id="admin-schedule-auto-winners"
                  name="announce_winners_automatically"
                  type="checkbox"
                  checked={scheduleForm.announce_winners_automatically}
                  onChange={(event) =>
                    setScheduleForm((current) => ({
                      ...current,
                      announce_winners_automatically: event.target.checked,
                    }))
                  }
                  disabled={submitting === "schedule"}
                />
                Announce winners automatically
              </label>
              <label className="field-label" htmlFor="admin-schedule-published">
                <input
                  id="admin-schedule-published"
                  name="is_published"
                  type="checkbox"
                  checked={scheduleForm.is_published}
                  onChange={(event) =>
                    setScheduleForm((current) => ({ ...current, is_published: event.target.checked }))
                  }
                  disabled={submitting === "schedule"}
                />
                Publish this election
              </label>
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
                disabled={submitting === "announcement"}
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
                disabled={submitting === "announcement"}
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
                disabled={submitting === "announcement"}
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
                disabled={submitting === "announcement"}
              />
              <label className="field-label" htmlFor="admin-announcement-pinned">
                <input
                  id="admin-announcement-pinned"
                  name="is_pinned"
                  type="checkbox"
                  checked={announcementForm.is_pinned}
                  onChange={(event) =>
                    setAnnouncementForm((current) => ({ ...current, is_pinned: event.target.checked }))
                  }
                  disabled={submitting === "announcement"}
                />
                Pin this notice
              </label>
              <button className="primary-button" type="submit" disabled={submitting === "announcement"}>
                {submitting === "announcement" ? "Posting Notice..." : "Post Election Notice"}
              </button>
            </form>
          </div>
        </ScreenCard>

        <ScreenCard
          step={5}
          section="Administration"
          title="Manage Users"
          subtitle="Edit or delete non-admin user accounts."
        >
          <div className="soft-panel">
            <h3>User Accounts</h3>
            <div className="stack-sm top-space">
              {users.length ? (
                users.map((managedUser) => (
                  <div className="list-row" key={managedUser.id}>
                    <div>
                      <strong>{managedUser.full_name || managedUser.username}</strong>
                      <div className="info-note">
                        {managedUser.username} | {formatStatus(managedUser.role)}
                      </div>
                    </div>
                    <div className="candidate-admin-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => handleEditUser(managedUser)}
                      >
                        Edit
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={submitting === `delete-user-${managedUser.id}`}
                        onClick={() => handleDeleteUser(managedUser.id)}
                      >
                        {submitting === `delete-user-${managedUser.id}` ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="info-note">No managed users found.</div>
              )}
            </div>
          </div>
        </ScreenCard>

        <ScreenCard
          step={6}
          section="Administration"
          title="Manage Candidates"
          subtitle="Review all candidates for the selected election, update them, or delete them."
        >
          <div className="stack-sm">
            {detail?.positions?.flatMap((position) =>
              position.candidates.map((candidate) => (
                <div className="list-row" key={`${position.id}-${candidate.id}`}>
                  <div>
                    <strong>{candidate.user.full_name}</strong>
                    <div className="info-note">{position.name}</div>
                  </div>
                  <div className="candidate-admin-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => handleEditCandidate(candidate, position.name)}
                    >
                      Edit
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={submitting === `delete-candidate-${candidate.id}`}
                      onClick={() => handleDeleteCandidate(candidate.id)}
                    >
                      {submitting === `delete-candidate-${candidate.id}` ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              )),
            )}
            {!detail?.positions?.some((position) => position.candidates.length) ? (
              <div className="info-note">No candidates found for the selected election.</div>
            ) : null}
          </div>
        </ScreenCard>

        <ScreenCard
          step={7}
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
