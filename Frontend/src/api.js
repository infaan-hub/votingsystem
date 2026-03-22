const PRODUCTION_API_BASE = "https://votingsystem-1-urbz.onrender.com/api";

const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000/api"
    : PRODUCTION_API_BASE);

const REQUEST_TIMEOUT_MS = 12000;

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
    throw new Error(
      getErrorMessage(
        data,
        response.status >= 500
          ? "Election Hub is experiencing a server error. Please try again shortly."
          : "Request failed.",
      ),
    );
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
export const adminCreateCandidate = (payload, token) =>
  request("/admin/candidates/", { method: "POST", body: payload, token });
export const adminUpdateElectionSchedule = (id, payload, token) =>
  request(`/admin/elections/${id}/schedule/`, { method: "PATCH", body: payload, token });
export const adminCreateAnnouncement = (id, payload, token) =>
  request(`/admin/elections/${id}/announcements/`, { method: "POST", body: payload, token });
export const registerAdmin = (payload) =>
  request("/auth/register/admin/", { method: "POST", body: payload });
export const registerVoter = (payload) =>
  request("/auth/register/voter/", { method: "POST", body: payload });
export const logout = (token) => request("/auth/logout/", { method: "POST", token });
export const fetchCurrentUser = (token) => request("/auth/me/", { token });
export const voteForCandidate = (candidateId, token) =>
  request("/votes/", { method: "POST", body: { candidate_id: candidateId }, token });
