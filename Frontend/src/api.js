const PRODUCTION_API_BASE = "https://votingsystem-1-urbz.onrender.com/api";

const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000/api"
    : PRODUCTION_API_BASE);

const REQUEST_TIMEOUT_MS = 12000;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function serializeDateTime(value) {
  if (!value) {
    return null;
  }
  const parsedValue = new Date(value);
  if (Number.isNaN(parsedValue.getTime())) {
    return null;
  }
  return parsedValue.toISOString();
}

function getErrorMessage(data, fallbackMessage) {
  if (!data) {
    return fallbackMessage;
  }
  if (typeof data.detail === "string") {
    return data.detail;
  }
  if (typeof data === "string") {
    return data;
  }
  if (typeof data === "object") {
    const firstEntry = Object.values(data).find((value) => value);
    if (typeof firstEntry === "string") {
      return firstEntry;
    }
    if (Array.isArray(firstEntry) && firstEntry.length) {
      return String(firstEntry[0]);
    }
  }
  return fallbackMessage;
}

async function request(path, options = {}) {
  const { method = "GET", body, token, headers = {} } = options;
  const finalHeaders = { ...headers };
  let finalBody = body;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  if (token) {
    finalHeaders.Authorization = `Token ${token}`;
  }

  if (body && !(body instanceof FormData)) {
    finalHeaders["Content-Type"] = "application/json";
    finalBody = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: finalHeaders,
      body: finalBody,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Election Hub is taking too long to respond. Please try again.");
    }
    throw new Error("Election Hub is not reachable right now. Please try again shortly.");
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (response.status === 204) {
    return null;
  }

  const rawText = await response.text();
  let data = null;

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { detail: rawText };
    }
  }

  if (!response.ok) {
    const error = new Error(
      getErrorMessage(
        data,
        response.status >= 500
          ? "Election Hub is experiencing a server error. Please try again shortly."
          : "Request failed.",
      ),
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const fetchHealth = () => request("/health/");
export const fetchElections = () => request("/elections/");
export const fetchElectionDetail = (id) => request(`/elections/${id}/`);
export const fetchCampaigns = (id) => request(`/elections/${id}/campaigns/`);
export const fetchBallot = (id, token) => request(`/elections/${id}/ballot/`, { token });
export const fetchResults = (id, token) => request(`/elections/${id}/results/`, { token });
export const fetchStats = (id, token) => request(`/elections/${id}/stats/`, { token });
export const openStatsStream = (id) => new EventSource(`${API_BASE}/elections/${id}/stats-stream/`);
export const login = (credentials) => request("/auth/login/", { method: "POST", body: credentials });
export const loginWithGoogle = (payload) => request("/auth/google/", { method: "POST", body: payload });
export const resetPassword = (payload) =>
  request("/auth/forgot-password/", { method: "POST", body: payload });
export const adminCreateVoter = (payload, token) =>
  request("/admin/voters/", { method: "POST", body: payload, token });
export function serializeAdminCandidatePayload(electionId, form) {
  const payload = new FormData();
  payload.append("position_name", normalizeText(form.position_name));
  payload.append("username", normalizeText(form.username));
  payload.append("first_name", normalizeText(form.first_name));
  payload.append("last_name", normalizeText(form.last_name));
  payload.append("password", form.password);
  payload.append("confirm_password", form.confirm_password);
  payload.append("approved", String(Boolean(form.approved)));

  const email = normalizeText(form.email);
  const slogan = normalizeText(form.slogan);
  const manifesto = normalizeText(form.manifesto);

  if (email) {
    payload.append("email", email);
  }
  if (slogan) {
    payload.append("slogan", slogan);
  }
  if (manifesto) {
    payload.append("manifesto", manifesto);
  }
  if (form.photo instanceof File) {
    payload.append("photo", form.photo);
  }

  return payload;
}

export function serializeElectionSchedulePayload(form) {
  return {
    title: normalizeText(form.title),
    description: normalizeText(form.description),
    campaign_start_at: serializeDateTime(form.campaign_start_at),
    campaign_end_at: serializeDateTime(form.campaign_end_at),
    voting_start_at: serializeDateTime(form.voting_start_at),
    voting_end_at: serializeDateTime(form.voting_end_at),
    allow_live_results: Boolean(form.allow_live_results),
    announce_winners_automatically: Boolean(form.announce_winners_automatically),
    is_published: Boolean(form.is_published),
  };
}

export function serializeAnnouncementPayload(form) {
  return {
    title: normalizeText(form.title),
    message: normalizeText(form.message),
    announcement_type: form.announcement_type,
    publish_at: serializeDateTime(form.publish_at),
    is_pinned: Boolean(form.is_pinned),
  };
}

export function serializeCandidateCampaignPayload(form) {
  return {
    slogan: normalizeText(form.campaign_title),
    manifesto: normalizeText(form.campaign_manifesto),
    campaign_video_url: normalizeText(form.campaign_video_link),
  };
}

export const adminCreateCandidate = (electionId, form, token) =>
  request(`/admin/elections/${electionId}/candidates/`, {
    method: "POST",
    body: serializeAdminCandidatePayload(electionId, form),
    token,
  });
export const adminUpdateElectionSchedule = (id, form, token) =>
  request(`/admin/elections/${id}/schedule/save/`, {
    method: "POST",
    body: serializeElectionSchedulePayload(form),
    token,
  }).catch((error) => {
    if (error?.status !== 404) {
      throw error;
    }
    return request(`/admin/elections/${id}/schedule/`, {
      method: "PATCH",
      body: serializeElectionSchedulePayload(form),
      token,
    });
  });
export const adminCreateAnnouncement = (id, form, token) =>
  request(`/admin/elections/${id}/notices/save/`, {
    method: "POST",
    body: serializeAnnouncementPayload(form),
    token,
  }).catch((error) => {
    if (error?.status !== 404) {
      throw error;
    }
    return request(`/admin/elections/${id}/announcements/`, {
      method: "POST",
      body: serializeAnnouncementPayload(form),
      token,
    });
  });
export const updateCandidateCampaign = (id, form, token) =>
  request(`/candidate/elections/${id}/campaign/`, {
    method: "PATCH",
    body: serializeCandidateCampaignPayload(form),
    token,
  });
export const registerAdmin = (payload) =>
  request("/auth/register/admin/", { method: "POST", body: payload });
export const registerVoter = (payload) =>
  request("/auth/register/voter/", { method: "POST", body: payload });
export const logout = (token) => request("/auth/logout/", { method: "POST", token });
export const fetchCurrentUser = (token) => request("/auth/me/", { token });
export const voteForCandidate = (candidateId, token) =>
  request("/votes/", { method: "POST", body: { candidate_id: candidateId }, token });
