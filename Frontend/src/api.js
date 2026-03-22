const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000/api"
    : "/api");

const REQUEST_TIMEOUT_MS = 12000;

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
      throw new Error("Backend request timed out. Check that the API server is reachable.");
    }
    throw new Error("Backend server is not reachable. Start Django on http://127.0.0.1:8000.");
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
      data?.detail ||
        (response.status >= 500
          ? "Backend server error. Check the Django terminal for the traceback."
          : "Request failed."),
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
export const login = (credentials) => request("/auth/login/", { method: "POST", body: credentials });
export const logout = (token) => request("/auth/logout/", { method: "POST", token });
export const fetchCurrentUser = (token) => request("/auth/me/", { token });
export const voteForCandidate = (candidateId, token) =>
  request("/votes/", { method: "POST", body: { candidate_id: candidateId }, token });
