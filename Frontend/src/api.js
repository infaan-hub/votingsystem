const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000/api"
    : "/api");

async function request(path, options = {}) {
  const { method = "GET", body, token, headers = {} } = options;
  const finalHeaders = { ...headers };
  let finalBody = body;

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
    });
  } catch (error) {
    throw new Error(
      "Backend server is not reachable. Start Django on http://127.0.0.1:8000.",
    );
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
    const detail =
      data?.detail ||
      data?.candidate?.[0] ||
      data?.voter?.[0] ||
      data?.election?.[0] ||
      (response.status >= 500
        ? "Backend server error. Check the Django terminal for the traceback."
        : null) ||
      "Request failed.";
    throw new Error(detail);
  }

  return data;
}

export function fetchElections() {
  return request("/elections/");
}

export function fetchElectionDetail(electionId) {
  return request(`/elections/${electionId}/`);
}

export function fetchCampaigns(electionId) {
  return request(`/elections/${electionId}/campaigns/`);
}

export function fetchBallot(electionId, token) {
  return request(`/elections/${electionId}/ballot/`, { token });
}

export function fetchResults(electionId, token) {
  return request(`/elections/${electionId}/results/`, { token });
}

export function fetchStats(electionId, token) {
  return request(`/elections/${electionId}/stats/`, { token });
}

export function voteForCandidate(candidateId, token) {
  return request("/votes/", {
    method: "POST",
    body: { candidate_id: candidateId },
    token,
  });
}

export function login(credentials) {
  return request("/auth/login/", {
    method: "POST",
    body: credentials,
  });
}

export function logout(token) {
  return request("/auth/logout/", {
    method: "POST",
    token,
  });
}

export function fetchCurrentUser(token) {
  return request("/auth/me/", { token });
}

export function subscribeToStats(electionId, onMessage, onError) {
  const source = new EventSource(`${API_BASE}/elections/${electionId}/stats-stream/`);
  source.onmessage = (event) => {
    onMessage(JSON.parse(event.data));
  };
  source.onerror = (error) => {
    onError?.(error);
  };
  return () => source.close();
}
