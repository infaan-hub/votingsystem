import { useEffect, useMemo, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  fetchCampaigns,
  fetchCurrentUser,
  fetchElectionDetail,
  fetchElections,
  fetchResults,
  fetchStats,
  login,
  logout,
} from "./api";
import CandidateCard from "./components/CandidateCard";
import CountdownPanel from "./components/CountdownPanel";
import StatCard from "./components/StatCard";
import { formatDateTime, getScopeLabel, getStatusLabel } from "./utils";

const TOKEN_KEY = "campus-voting-token";
const LOCAL_SESSION_KEY = "campus-voting-local-session";
const WORKSPACE_KEY = "campus-voting-workspace";

function createInitialWorkspace() {
  return {
    users: [],
    candidateProfiles: [],
    voterRequests: [],
    announcements: [],
    electionOverrides: {},
  };
}

function readStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function useStoredState(key, fallbackFactory) {
  const [value, setValue] = useState(() => readStorage(key, fallbackFactory()));

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function applyElectionOverride(election, override) {
  if (!override) {
    return election;
  }

  const merged = {
    ...election,
    ...override,
  };
  const now = Date.now();
  const votingStart = new Date(merged.voting_start_at).getTime();
  const votingEnd = new Date(merged.voting_end_at).getTime();
  const status = now < votingStart ? "upcoming" : now <= votingEnd ? "active" : "ended";

  return {
    ...merged,
    status,
    seconds_until_start: Math.max(0, Math.floor((votingStart - now) / 1000)),
    seconds_until_end: Math.max(0, Math.floor((votingEnd - now) / 1000)),
  };
}

function normalizeBackendUser(user) {
  return {
    ...user,
    auth_source: "backend",
    app_role: user.role,
  };
}

function normalizeLocalUser(user) {
  return {
    ...user,
    auth_source: "local",
    app_role: user.role,
    department: user.department || null,
    section: user.section || null,
  };
}

function getPortalTarget(user) {
  if (!user) {
    return "/";
  }
  if (user.app_role === "admin") {
    return "/admin/dashboard";
  }
  if (user.app_role === "candidate") {
    return "/candidate/dashboard";
  }
  return "/voter/dashboard";
}

function canUsePortal(user, portal) {
  if (!user) {
    return false;
  }
  if (portal === "admin") {
    return user.app_role === "admin";
  }
  if (portal === "candidate") {
    return user.app_role === "candidate" || user.auth_source === "backend";
  }
  return user.app_role !== "admin";
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatRole(role) {
  if (!role) {
    return "Guest";
  }
  return role
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function toDateTimeLocal(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60000);
  return localDate.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value, fallback) {
  return value ? new Date(value).toISOString() : fallback;
}

function flattenResults(resultsPayload) {
  return (
    resultsPayload?.stats?.positions?.flatMap((position) =>
      position.results.map((result) => ({
        ...result,
        positionId: position.id,
        positionName: position.name,
        scope: position.section || position.department || "Entire campus",
      })),
    ) || []
  );
}

function RoleTabs({ items }) {
  return (
    <nav className="tab-dock">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `tab-link${isActive ? " active" : ""}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function PhonePage({ eyebrow, title, subtitle, user, accent = "blue", tabs, children, actions }) {
  return (
    <div className="web-app">
      <div className="backdrop-glow glow-a" />
      <div className="backdrop-glow glow-b" />
      <section className={`web-shell accent-${accent}`}>
        <section className="hero-panel">
          <div className="hero-brand">
            <span className="brand-mark">i</span>
            <span className="brand-text">VOTE</span>
          </div>
          <div className="hero-meta">
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
            </div>
            <span className="role-pill">{user ? formatRole(user.app_role) : "Guest"}</span>
          </div>
          {subtitle ? <p className="hero-text">{subtitle}</p> : null}
          {actions ? <div className="hero-actions">{actions}</div> : null}
          {tabs?.length ? <RoleTabs items={tabs} /> : null}
        </section>

        <main className="page-body">{children}</main>
      </section>
    </div>
  );
}

function HomeScreen({ elections, selectedElectionId, onSelectElection, user }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const selectedElection =
    elections.find((entry) => String(entry.id) === String(selectedElectionId)) || elections[0] || null;

  return (
    <PhonePage
      eyebrow="Voting System"
      title="Role Portals"
      subtitle="Independent system-style pages for admin, voter, and candidate users with a shared election countdown."
      accent="blue"
      user={user}
      actions={
        <div className="home-action-wrap">
          <button
            className="menu-toggle"
            type="button"
            onClick={() => setSidebarOpen((current) => !current)}
            aria-label="Toggle sidebar"
            aria-expanded={sidebarOpen}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="hero-actions-grid">
            <Link className="primary-link" to="/admin/login">
              Admin
            </Link>
            <Link className="ghost-link" to="/voter/login">
              Voter
            </Link>
            <Link className="ghost-link" to="/candidate/login">
              Candidate
            </Link>
          </div>
        </div>
      }
    >
      <section className="home-layout">
        <aside className={`home-sidebar${sidebarOpen ? " open" : ""}`}>
          <div className="sidebar-card">
            <p className="eyebrow">Quick Access</p>
            <Link className="sidebar-link" to="/home">
              Home
            </Link>
            <Link className="sidebar-link" to="/admin/register">
              Admin Register
            </Link>
            <Link className="sidebar-link" to="/admin/login">
              Admin Login
            </Link>
            <Link className="sidebar-link" to="/voter/register">
              Voter Register
            </Link>
            <Link className="sidebar-link" to="/voter/login">
              Voter Login
            </Link>
            <Link className="sidebar-link" to="/voter/dashboad">
              Voter Dashboard
            </Link>
            <Link className="sidebar-link" to="/voter/compain">
              Voter Compain
            </Link>
            <Link className="sidebar-link" to="/candidate/login">
              Candidate Login
            </Link>
            <Link className="sidebar-link" to="/candidate/dashboad">
              Candidate Dashboard
            </Link>
            <Link className="sidebar-link" to="/candidate/compaindetails">
              Candidate Compaindetails
            </Link>
          </div>
        </aside>

        <div className="stack-grid">
        <article className="sheet-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Election Picker</p>
              <h2>Shared schedule</h2>
            </div>
          </div>
          <label className="field">
            <span>Current election</span>
            <select
              className="input"
              value={selectedElectionId ?? ""}
              onChange={(event) => onSelectElection(event.target.value)}
            >
              {elections.map((election) => (
                <option key={election.id} value={election.id}>
                  {election.title}
                </option>
              ))}
            </select>
          </label>
          {selectedElection ? <CountdownPanel election={selectedElection} /> : null}
        </article>

        <section className="portal-grid">
          <Link className="portal-card admin-card" to="/admin/dashboard">
            <span className="portal-kicker">Admin workspace</span>
            <strong>Register voters and candidates</strong>
            <p>Update election timing, publish announcements, and control the shared countdown.</p>
          </Link>
          <Link className="portal-card voter-card" to="/voter/dashboard">
            <span className="portal-kicker">Voter flow</span>
            <strong>See all elections</strong>
            <p>Select an election and move to campaign pages before voting time starts.</p>
          </Link>
          <Link className="portal-card candidate-card-lite" to="/candidate/dashboard">
            <span className="portal-kicker">Candidate space</span>
            <strong>Watch results and post campaign</strong>
            <p>Track countdown, vote totals, winner status, and campaign video details.</p>
          </Link>
        </section>

        <section className="home-sections-grid">
          <article className="sheet-card section-card">
            <p className="eyebrow">Admin Section</p>
            <h2>/admin/register, /admin/login, /admin/dashboard</h2>
            <p className="muted">
              Admin registers candidates and voters, sets election date and time, updates
              deadlines, posts election notices, and controls the countdown shown to all users.
            </p>
          </article>

          <article className="sheet-card section-card">
            <p className="eyebrow">Voter Section</p>
            <h2>/voter/register, /voter/login, /voter/dashboad, /voter/compain</h2>
            <p className="muted">
              Voters open their dashboard, see all elections, select one election, and view all
              candidate compains before voting.
            </p>
          </article>

          <article className="sheet-card section-card">
            <p className="eyebrow">Candidate Section</p>
            <h2>/candidate/login, /candidate/dashboad, /candidate/compaindetails</h2>
            <p className="muted">
              Candidates login after admin registration, view countdown, vote count, winner or
              looser decision, and add compain details with a 00:30 video visible to voters.
            </p>
          </article>
        </section>
        </div>
      </section>
    </PhonePage>
  );
}

function AuthForm({
  title,
  subtitle,
  fields,
  formData,
  onChange,
  onSubmit,
  submitting,
  error,
  submitLabel,
  footer,
}) {
  return (
    <form className="stack-grid" onSubmit={onSubmit}>
      <article className="sheet-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Secure Access</p>
            <h2>{title}</h2>
          </div>
        </div>
        <p className="muted">{subtitle}</p>
        <div className="form-grid">
          {fields.map((field) => (
            <label className="field" key={field.name}>
              <span>{field.label}</span>
              {field.type === "textarea" ? (
                <textarea
                  className="input textarea"
                  value={formData[field.name] || ""}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                />
              ) : (
                <input
                  className="input"
                  type={field.type}
                  value={formData[field.name] || ""}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                />
              )}
            </label>
          ))}
        </div>
        {error ? <div className="status-banner error">{error}</div> : null}
        <button className="action-button wide" type="submit" disabled={submitting}>
          {submitting ? "Please wait..." : submitLabel}
        </button>
      </article>
      {footer}
    </form>
  );
}

function PortalLoginPage({ user, portal, onLogin }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user && canUsePortal(user, portal)) {
    return (
      <Navigate
        to={
          portal === "admin"
            ? "/admin/dashboard"
            : portal === "candidate"
              ? "/candidate/dashboard"
              : "/voter/dashboard"
        }
        replace
      />
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const nextUser = await onLogin(formData, portal);
      navigate(getPortalTarget(nextUser));
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  const titles = {
    admin: {
      eyebrow: "Admin Portal",
      title: "Admin Login",
      subtitle: "Access the election management workspace for candidate and voter onboarding.",
    },
    voter: {
      eyebrow: "Voter Portal",
      title: "Voter Login",
      subtitle: "Open the election dashboard and campaign pages from a voter account.",
    },
    candidate: {
      eyebrow: "Candidate Portal",
      title: "Candidate Login",
      subtitle: "Candidates sign in after being registered by the admin workspace.",
    },
  };

  const copy = titles[portal];

  return (
    <PhonePage
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={copy.subtitle}
      user={user}
      accent={portal === "admin" ? "dark" : portal === "candidate" ? "amber" : "blue"}
    >
      <AuthForm
        title={copy.title}
        subtitle="The app first checks the backend account list, then falls back to local accounts created in this frontend workspace."
        formData={formData}
        onChange={(name, value) => setFormData((current) => ({ ...current, [name]: value }))}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
        submitLabel="Sign in"
        fields={[
          { name: "username", label: "Username", type: "text", required: true },
          { name: "password", label: "Password", type: "password", required: true },
        ]}
        footer={
          portal !== "candidate" ? (
            <article className="sheet-card soft-card">
              <p className="muted">
                {portal === "admin"
                  ? "Need a local admin account for the redesigned portal?"
                  : "Need a voter account for the new portal flow?"}
              </p>
              <Link
                className="inline-link"
                to={portal === "admin" ? "/admin/register" : "/voter/register"}
              >
                Open registration
              </Link>
            </article>
          ) : null
        }
      />
    </PhonePage>
  );
}

function PortalRegisterPage({ user, portal, onRegister }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    full_name: "",
    username: "",
    password: "",
    email: "",
    phone_number: "",
    department_name: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user && portal === "admin" && user.app_role === "admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }
  if (user && portal === "voter" && user.app_role !== "admin") {
    return <Navigate to="/voter/dashboard" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const nextUser = await onRegister(formData, portal);
      navigate(getPortalTarget(nextUser));
    } catch (registerError) {
      setError(registerError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PhonePage
      eyebrow={portal === "admin" ? "Admin Setup" : "Voter Setup"}
      title={portal === "admin" ? "Admin Register" : "Voter Register"}
      subtitle="This registration flow stores accounts in the frontend workspace so the new role-based pages can be used immediately."
      user={user}
      accent={portal === "admin" ? "dark" : "blue"}
    >
      <AuthForm
        title={portal === "admin" ? "Create admin access" : "Create voter access"}
        subtitle="Use a unique username. Voter registrations appear in the admin dashboard request list."
        formData={formData}
        onChange={(name, value) => setFormData((current) => ({ ...current, [name]: value }))}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
        submitLabel={portal === "admin" ? "Create admin account" : "Create voter account"}
        fields={[
          { name: "full_name", label: "Full name", type: "text", required: true },
          { name: "username", label: "Username", type: "text", required: true },
          { name: "password", label: "Password", type: "password", required: true },
          { name: "email", label: "Email", type: "email", required: false },
          { name: "phone_number", label: "Phone number", type: "tel", required: false },
          { name: "department_name", label: "Department", type: "text", required: false },
        ]}
        footer={
          <article className="sheet-card soft-card">
            <p className="muted">
              {portal === "admin"
                ? "Admins can later register candidate accounts from the admin dashboard."
                : "After registration you will be taken directly to the voter dashboard."}
            </p>
          </article>
        }
      />
    </PhonePage>
  );
}

function ElectionSelect({ elections, selectedElectionId, onSelectElection }) {
  return (
    <label className="field">
      <span>Election</span>
      <select
        className="input"
        value={selectedElectionId ?? ""}
        onChange={(event) => onSelectElection(event.target.value)}
      >
        {elections.map((election) => (
          <option key={election.id} value={election.id}>
            {election.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function AdminDashboard({
  user,
  elections,
  selectedElection,
  selectedElectionId,
  onSelectElection,
  workspace,
  onUpdateWorkspace,
  onLogout,
}) {
  const location = useLocation();
  const [stats, setStats] = useState(null);
  const [detail, setDetail] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [voterForm, setVoterForm] = useState({
    full_name: "",
    username: "",
    password: "",
    department_name: "",
    registration_number: "",
  });
  const [candidateForm, setCandidateForm] = useState({
    full_name: "",
    username: "",
    password: "",
    position_name: "",
    department_name: "",
  });
  const [scheduleForm, setScheduleForm] = useState(() => ({
    title: selectedElection?.title || "",
    campaign_start_at: toDateTimeLocal(selectedElection?.campaign_start_at),
    campaign_end_at: toDateTimeLocal(selectedElection?.campaign_end_at),
    voting_start_at: toDateTimeLocal(selectedElection?.voting_start_at),
    voting_end_at: toDateTimeLocal(selectedElection?.voting_end_at),
  }));
  const [announcementForm, setAnnouncementForm] = useState({ title: "", message: "" });

  useEffect(() => {
    if (!selectedElection) {
      return;
    }
    setScheduleForm({
      title: selectedElection.title,
      campaign_start_at: toDateTimeLocal(selectedElection.campaign_start_at),
      campaign_end_at: toDateTimeLocal(selectedElection.campaign_end_at),
      voting_start_at: toDateTimeLocal(selectedElection.voting_start_at),
      voting_end_at: toDateTimeLocal(selectedElection.voting_end_at),
    });
  }, [selectedElectionId, selectedElection]);

  useEffect(() => {
    if (!selectedElection) {
      return;
    }
    let ignore = false;
    Promise.allSettled([fetchStats(selectedElection.id), fetchElectionDetail(selectedElection.id)])
      .then(([statsResult, detailResult]) => {
        if (ignore) {
          return;
        }
        setStats(statsResult.status === "fulfilled" ? statsResult.value : null);
        setDetail(detailResult.status === "fulfilled" ? detailResult.value : null);
      })
      .catch(() => {
        if (!ignore) {
          setStats(null);
          setDetail(null);
        }
      });
    return () => {
      ignore = true;
    };
  }, [selectedElection]);

  if (!user || user.app_role !== "admin") {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  function updateWorkspace(mutator) {
    onUpdateWorkspace((current) => mutator(structuredClone(current)));
  }

  function handleRegisterVoter(event) {
    event.preventDefault();
    setError("");
    setStatus("");
    if (workspace.users.some((entry) => entry.username === voterForm.username)) {
      setError("That username is already in use.");
      return;
    }
    updateWorkspace((next) => {
      const account = {
        id: createId("voter"),
        role: "voter",
        full_name: voterForm.full_name,
        username: voterForm.username,
        password: voterForm.password,
        registration_number: voterForm.registration_number,
        department: voterForm.department_name ? { name: voterForm.department_name } : null,
      };
      next.users.push(account);
      next.voterRequests.push({
        id: createId("request"),
        created_at: new Date().toISOString(),
        full_name: voterForm.full_name,
        registration_number: voterForm.registration_number,
        username: voterForm.username,
      });
      return next;
    });
    setVoterForm({
      full_name: "",
      username: "",
      password: "",
      department_name: "",
      registration_number: "",
    });
    setStatus("Voter account stored in the frontend workspace.");
  }

  function handleRegisterCandidate(event) {
    event.preventDefault();
    setError("");
    setStatus("");
    if (!selectedElection) {
      setError("Select an election first.");
      return;
    }
    if (workspace.users.some((entry) => entry.username === candidateForm.username)) {
      setError("That candidate username is already in use.");
      return;
    }
    updateWorkspace((next) => {
      const accountId = createId("candidate-user");
      next.users.push({
        id: accountId,
        role: "candidate",
        full_name: candidateForm.full_name,
        username: candidateForm.username,
        password: candidateForm.password,
        department: candidateForm.department_name ? { name: candidateForm.department_name } : null,
      });
      next.candidateProfiles.push({
        id: createId("candidate"),
        election_id: String(selectedElection.id),
        user_id: accountId,
        user_name: candidateForm.full_name,
        username: candidateForm.username,
        position_name: candidateForm.position_name,
        department_name: candidateForm.department_name,
        slogan: "",
        manifesto: "",
        campaign_video_url: "",
        campaign_video_duration: "00:30",
        posted_at: new Date().toISOString(),
      });
      return next;
    });
    setCandidateForm({
      full_name: "",
      username: "",
      password: "",
      position_name: "",
      department_name: "",
    });
    setStatus("Candidate account stored. The candidate can now use the candidate login page.");
  }

  function handleScheduleSave(event) {
    event.preventDefault();
    setError("");
    setStatus("");
    if (!selectedElection) {
      setError("Select an election first.");
      return;
    }
    updateWorkspace((next) => {
      next.electionOverrides[String(selectedElection.id)] = {
        ...next.electionOverrides[String(selectedElection.id)],
        title: scheduleForm.title,
        campaign_start_at: fromDateTimeLocal(
          scheduleForm.campaign_start_at,
          selectedElection.campaign_start_at,
        ),
        campaign_end_at: fromDateTimeLocal(
          scheduleForm.campaign_end_at,
          selectedElection.campaign_end_at,
        ),
        voting_start_at: fromDateTimeLocal(
          scheduleForm.voting_start_at,
          selectedElection.voting_start_at,
        ),
        voting_end_at: fromDateTimeLocal(scheduleForm.voting_end_at, selectedElection.voting_end_at),
      };
      return next;
    });
    setStatus("Election schedule updated for all dashboards.");
  }

  function handleAnnouncementPost(event) {
    event.preventDefault();
    setError("");
    setStatus("");
    if (!selectedElection) {
      setError("Select an election first.");
      return;
    }
    updateWorkspace((next) => {
      next.announcements.unshift({
        id: createId("announcement"),
        election_id: String(selectedElection.id),
        title: announcementForm.title,
        message: announcementForm.message,
        created_at: new Date().toISOString(),
      });
      return next;
    });
    setAnnouncementForm({ title: "", message: "" });
    setStatus("Election announcement posted to the shared dashboards.");
  }

  const adminTabs = [
    { to: "/admin/login", label: "Login" },
    { to: "/admin/register", label: "Register" },
    { to: "/admin/dashboard", label: "Dashboard" },
  ];

  const localCandidateCount = workspace.candidateProfiles.filter(
    (entry) => entry.election_id === String(selectedElectionId),
  ).length;
  const localVoterCount = workspace.users.filter((entry) => entry.role === "voter").length;

  return (
    <PhonePage
      eyebrow="Admin Dashboard"
      title="Election Control"
      subtitle="Register candidates and voters, set date and deadline values, then post election notices to the other dashboards."
      user={user}
      accent="dark"
      tabs={adminTabs}
      actions={
        <button className="ghost-button" onClick={onLogout}>
          Logout
        </button>
      }
    >
      <div className="stack-grid">
        {status ? <div className="status-banner success">{status}</div> : null}
        {error ? <div className="status-banner error">{error}</div> : null}

        <article className="sheet-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Current Election</p>
              <h2>Management target</h2>
            </div>
          </div>
          <ElectionSelect
            elections={elections}
            selectedElectionId={selectedElectionId}
            onSelectElection={onSelectElection}
          />
          {selectedElection ? <CountdownPanel election={selectedElection} /> : null}
        </article>

        <section className="stats-grid two-col">
          <StatCard
            label="Backend voters"
            value={stats?.registered_voters ?? "--"}
            caption="Eligible voters from the backend election data."
            accent="emerald"
          />
          <StatCard
            label="Local voters"
            value={localVoterCount}
            caption="Voter accounts created in this frontend workspace."
            accent="slate"
          />
          <StatCard
            label="Candidates"
            value={(stats?.candidate_count ?? 0) + localCandidateCount}
            caption="Backend approved candidates plus local registrations."
            accent="orange"
          />
          <StatCard
            label="Announcements"
            value={
              workspace.announcements.filter(
                (entry) => entry.election_id === String(selectedElectionId),
              ).length
            }
            caption="Posts visible across dashboards."
            accent="default"
          />
        </section>

        <section className="sheet-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Register Candidate</p>
              <h2>Candidate account</h2>
            </div>
          </div>
          <form className="form-grid" onSubmit={handleRegisterCandidate}>
            <label className="field">
              <span>Full name</span>
              <input
                className="input"
                value={candidateForm.full_name}
                onChange={(event) =>
                  setCandidateForm((current) => ({ ...current, full_name: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Username</span>
              <input
                className="input"
                value={candidateForm.username}
                onChange={(event) =>
                  setCandidateForm((current) => ({ ...current, username: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                className="input"
                type="password"
                value={candidateForm.password}
                onChange={(event) =>
                  setCandidateForm((current) => ({ ...current, password: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Position</span>
              <input
                className="input"
                value={candidateForm.position_name}
                onChange={(event) =>
                  setCandidateForm((current) => ({ ...current, position_name: event.target.value }))
                }
                placeholder="President, Secretary..."
                required
              />
            </label>
            <label className="field full-span">
              <span>Department</span>
              <input
                className="input"
                value={candidateForm.department_name}
                onChange={(event) =>
                  setCandidateForm((current) => ({
                    ...current,
                    department_name: event.target.value,
                  }))
                }
              />
            </label>
            <button className="action-button full-span" type="submit">
              Register candidate
            </button>
          </form>
        </section>

        <section className="sheet-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Register Voter</p>
              <h2>Voter account</h2>
            </div>
          </div>
          <form className="form-grid" onSubmit={handleRegisterVoter}>
            <label className="field">
              <span>Full name</span>
              <input
                className="input"
                value={voterForm.full_name}
                onChange={(event) =>
                  setVoterForm((current) => ({ ...current, full_name: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Username</span>
              <input
                className="input"
                value={voterForm.username}
                onChange={(event) =>
                  setVoterForm((current) => ({ ...current, username: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                className="input"
                type="password"
                value={voterForm.password}
                onChange={(event) =>
                  setVoterForm((current) => ({ ...current, password: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Registration number</span>
              <input
                className="input"
                value={voterForm.registration_number}
                onChange={(event) =>
                  setVoterForm((current) => ({
                    ...current,
                    registration_number: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field full-span">
              <span>Department</span>
              <input
                className="input"
                value={voterForm.department_name}
                onChange={(event) =>
                  setVoterForm((current) => ({ ...current, department_name: event.target.value }))
                }
              />
            </label>
            <button className="action-button full-span" type="submit">
              Register voter
            </button>
          </form>
        </section>

        <section className="sheet-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Set Date And Time</p>
              <h2>Election schedule</h2>
            </div>
          </div>
          <form className="form-grid" onSubmit={handleScheduleSave}>
            <label className="field full-span">
              <span>Title</span>
              <input
                className="input"
                value={scheduleForm.title}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Campaign start</span>
              <input
                className="input"
                type="datetime-local"
                value={scheduleForm.campaign_start_at}
                onChange={(event) =>
                  setScheduleForm((current) => ({
                    ...current,
                    campaign_start_at: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Campaign deadline</span>
              <input
                className="input"
                type="datetime-local"
                value={scheduleForm.campaign_end_at}
                onChange={(event) =>
                  setScheduleForm((current) => ({
                    ...current,
                    campaign_end_at: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Voting start</span>
              <input
                className="input"
                type="datetime-local"
                value={scheduleForm.voting_start_at}
                onChange={(event) =>
                  setScheduleForm((current) => ({
                    ...current,
                    voting_start_at: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Voting deadline</span>
              <input
                className="input"
                type="datetime-local"
                value={scheduleForm.voting_end_at}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, voting_end_at: event.target.value }))
                }
              />
            </label>
            <button className="action-button full-span" type="submit">
              Save schedule
            </button>
          </form>
        </section>

        <section className="sheet-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Post Election</p>
              <h2>Shared announcement</h2>
            </div>
          </div>
          <form className="form-grid" onSubmit={handleAnnouncementPost}>
            <label className="field full-span">
              <span>Title</span>
              <input
                className="input"
                value={announcementForm.title}
                onChange={(event) =>
                  setAnnouncementForm((current) => ({ ...current, title: event.target.value }))
                }
                required
              />
            </label>
            <label className="field full-span">
              <span>Message</span>
              <textarea
                className="input textarea"
                value={announcementForm.message}
                onChange={(event) =>
                  setAnnouncementForm((current) => ({ ...current, message: event.target.value }))
                }
                required
              />
            </label>
            <button className="action-button full-span" type="submit">
              Post to dashboards
            </button>
          </form>
        </section>

        <section className="sheet-card soft-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Election feed</p>
              <h2>Visible notices</h2>
            </div>
          </div>
          <div className="stack-grid compact">
            {workspace.announcements
              .filter((entry) => entry.election_id === String(selectedElectionId))
              .map((announcement) => (
                <article className="info-row" key={announcement.id}>
                  <strong>{announcement.title}</strong>
                  <p>{announcement.message}</p>
                </article>
              ))}
            {detail?.announcements?.map((announcement) => (
              <article className="info-row" key={`backend-${announcement.id}`}>
                <strong>{announcement.title}</strong>
                <p>{announcement.message}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </PhonePage>
  );
}

function VoterDashboard({
  user,
  elections,
  selectedElection,
  selectedElectionId,
  onSelectElection,
  workspace,
  onLogout,
}) {
  const location = useLocation();
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!selectedElection) {
      return;
    }
    let ignore = false;
    fetchElectionDetail(selectedElection.id)
      .then((data) => {
        if (!ignore) {
          setDetail(data);
        }
      })
      .catch(() => {
        if (!ignore) {
          setDetail(null);
        }
      });
    return () => {
      ignore = true;
    };
  }, [selectedElection]);

  if (!user || user.app_role === "admin") {
    return <Navigate to="/voter/login" replace state={{ from: location.pathname }} />;
  }

  const voterTabs = [
    { to: "/voter/login", label: "Login" },
    { to: "/voter/register", label: "Register" },
    { to: "/voter/dashboard", label: "Dashboard" },
    { to: "/voter/compain", label: "Campaign" },
  ];

  const localAnnouncements = workspace.announcements.filter(
    (entry) => entry.election_id === String(selectedElectionId),
  );

  return (
    <PhonePage
      eyebrow="Voter Dashboard"
      title="Election List"
      subtitle="See all elections, select one, and keep the same countdown that the admin manages."
      user={user}
      accent="blue"
      tabs={voterTabs}
      actions={
        <button className="ghost-button" onClick={onLogout}>
          Logout
        </button>
      }
    >
      <div className="stack-grid">
        <section className="sheet-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">All Elections</p>
              <h2>Selectable list</h2>
            </div>
          </div>
          <div className="election-list">
            {elections.map((election) => (
              <button
                key={election.id}
                className={`election-item${
                  String(election.id) === String(selectedElectionId) ? " active" : ""
                }`}
                onClick={() => onSelectElection(String(election.id))}
              >
                <strong>{election.title}</strong>
                <span>{getStatusLabel(election.status)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="sheet-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Selected Election</p>
              <h2>{selectedElection?.title || "No election"}</h2>
            </div>
            <Link className="inline-link" to="/voter/compain">
              View campaigns
            </Link>
          </div>
          <ElectionSelect
            elections={elections}
            selectedElectionId={selectedElectionId}
            onSelectElection={onSelectElection}
          />
          {selectedElection ? <CountdownPanel election={selectedElection} /> : null}
        </section>

        <section className="stats-grid two-col">
          <StatCard
            label="Role"
            value={formatRole(user.app_role)}
            caption="Signed-in portal role."
            accent="slate"
          />
          <StatCard
            label="Department"
            value={user.department?.name || "Open"}
            caption="Used for scoped positions."
            accent="default"
          />
          <StatCard
            label="Campaign start"
            value={selectedElection ? formatDateTime(selectedElection.campaign_start_at) : "--"}
            caption="First campaign visibility date."
            accent="emerald"
          />
          <StatCard
            label="Voting deadline"
            value={selectedElection ? formatDateTime(selectedElection.voting_end_at) : "--"}
            caption="Final vote closing time."
            accent="orange"
          />
        </section>

        <section className="sheet-card soft-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Election Board</p>
              <h2>Posted notices</h2>
            </div>
          </div>
          <div className="stack-grid compact">
            {localAnnouncements.map((announcement) => (
              <article className="info-row" key={announcement.id}>
                <strong>{announcement.title}</strong>
                <p>{announcement.message}</p>
              </article>
            ))}
            {detail?.announcements?.map((announcement) => (
              <article className="info-row" key={announcement.id}>
                <strong>{announcement.title}</strong>
                <p>{announcement.message}</p>
              </article>
            ))}
            {!localAnnouncements.length && !detail?.announcements?.length ? (
              <p className="muted">No notices have been posted for this election yet.</p>
            ) : null}
          </div>
        </section>
      </div>
    </PhonePage>
  );
}

function VoterCampaignPage({ user, selectedElection, workspace, onLogout }) {
  const location = useLocation();
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    if (!selectedElection) {
      return;
    }
    let ignore = false;
    fetchCampaigns(selectedElection.id)
      .then((data) => {
        if (!ignore) {
          setPayload(data);
        }
      })
      .catch(() => {
        if (!ignore) {
          setPayload(null);
        }
      });
    return () => {
      ignore = true;
    };
  }, [selectedElection]);

  if (!user || user.app_role === "admin") {
    return <Navigate to="/voter/login" replace state={{ from: location.pathname }} />;
  }

  const voterTabs = [
    { to: "/voter/login", label: "Login" },
    { to: "/voter/register", label: "Register" },
    { to: "/voter/dashboard", label: "Dashboard" },
    { to: "/voter/compain", label: "Campaign" },
  ];

  const localCandidates = workspace.candidateProfiles.filter(
    (entry) => entry.election_id === String(selectedElection?.id),
  );

  return (
    <PhonePage
      eyebrow="Voter Campaign"
      title="Candidate Campaigns"
      subtitle="See all campaigns from backend candidates and locally registered candidates in one page."
      user={user}
      accent="blue"
      tabs={voterTabs}
      actions={
        <button className="ghost-button" onClick={onLogout}>
          Logout
        </button>
      }
    >
      <div className="stack-grid">
        {payload?.positions?.map((position) => (
          <section className="sheet-card" key={position.id}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{getScopeLabel(position)}</p>
                <h2>{position.name}</h2>
              </div>
            </div>
            <div className="candidate-grid">
              {position.candidates.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  scope={getScopeLabel(position)}
                  footer={
                    candidate.vote_total ? `${candidate.vote_total} votes recorded` : "Campaign ready"
                  }
                />
              ))}
            </div>
          </section>
        ))}

        {!!localCandidates.length && (
          <section className="sheet-card soft-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Admin Registered</p>
                <h2>Local candidate campaigns</h2>
              </div>
            </div>
            <div className="candidate-grid">
              {localCandidates.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={{
                    id: candidate.id,
                    approved: true,
                    slogan: candidate.slogan,
                    manifesto: candidate.manifesto,
                    campaign_video_url: candidate.campaign_video_url,
                    campaign_video_duration: candidate.campaign_video_duration,
                    user: {
                      full_name: candidate.user_name,
                      username: candidate.username,
                      role: "candidate",
                    },
                  }}
                  scope={candidate.position_name}
                  footer={candidate.department_name || "Locally registered by admin"}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </PhonePage>
  );
}

function CandidateDashboard({
  user,
  elections,
  selectedElection,
  selectedElectionId,
  onSelectElection,
  workspace,
  onLogout,
}) {
  const location = useLocation();
  const [campaignsPayload, setCampaignsPayload] = useState(null);
  const [resultsPayload, setResultsPayload] = useState(null);

  useEffect(() => {
    if (!selectedElection) {
      return;
    }
    let ignore = false;
    Promise.allSettled([fetchCampaigns(selectedElection.id), fetchResults(selectedElection.id)])
      .then(([campaignsResult, resultsResult]) => {
        if (ignore) {
          return;
        }
        setCampaignsPayload(campaignsResult.status === "fulfilled" ? campaignsResult.value : null);
        setResultsPayload(resultsResult.status === "fulfilled" ? resultsResult.value : null);
      })
      .catch(() => {
        if (!ignore) {
          setCampaignsPayload(null);
          setResultsPayload(null);
        }
      });
    return () => {
      ignore = true;
    };
  }, [selectedElection]);

  if (!user || user.app_role === "admin") {
    return <Navigate to="/candidate/login" replace state={{ from: location.pathname }} />;
  }

  const candidateTabs = [
    { to: "/candidate/login", label: "Login" },
    { to: "/candidate/dashboard", label: "Dashboard" },
    { to: "/candidate/compaindetails", label: "Campaign" },
  ];

  const backendCandidate =
    campaignsPayload?.positions
      ?.flatMap((position) =>
        position.candidates.map((candidate) => ({
          ...candidate,
          position_name: position.name,
        })),
      )
      .find(
        (candidate) =>
          String(candidate.user?.id) === String(user.id) || candidate.user?.username === user.username,
      ) || null;

  const localCandidate =
    workspace.candidateProfiles.find(
      (entry) =>
        entry.election_id === String(selectedElectionId) &&
        (String(entry.user_id) === String(user.id) || entry.username === user.username),
    ) || null;

  const candidateResult = flattenResults(resultsPayload).find(
    (entry) =>
      String(entry.user_id) === String(user.id) || entry.candidate_name === user.full_name,
  );

  const decision = !candidateResult
    ? selectedElection?.status === "ended"
      ? "No final result"
      : "Pending result"
    : candidateResult.is_winner
      ? "Winner"
      : "Loser";

  return (
    <PhonePage
      eyebrow="Candidate Dashboard"
      title="Campaign Performance"
      subtitle="Candidates see the election countdown, their vote count, and the current decision state."
      user={user}
      accent="amber"
      tabs={candidateTabs}
      actions={
        <button className="ghost-button" onClick={onLogout}>
          Logout
        </button>
      }
    >
      <div className="stack-grid">
        <section className="sheet-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">My Election</p>
              <h2>{selectedElection?.title || "No election selected"}</h2>
            </div>
            <Link className="inline-link" to="/candidate/compaindetails">
              Add campaign
            </Link>
          </div>
          <ElectionSelect
            elections={elections}
            selectedElectionId={selectedElectionId}
            onSelectElection={onSelectElection}
          />
          {selectedElection ? <CountdownPanel election={selectedElection} /> : null}
        </section>

        <section className="stats-grid two-col">
          <StatCard
            label="Vote count"
            value={candidateResult?.vote_total ?? 0}
            caption="Votes recorded for your candidate profile."
            accent="orange"
          />
          <StatCard
            label="Decision"
            value={decision}
            caption="Winner or loser after the result feed is available."
            accent={decision === "Winner" ? "emerald" : "slate"}
          />
          <StatCard
            label="Position"
            value={
              backendCandidate?.position_name || localCandidate?.position_name || "Not assigned"
            }
            caption="Seat registered by admin."
            accent="default"
          />
          <StatCard
            label="Department"
            value={
              backendCandidate?.department?.name ||
              localCandidate?.department_name ||
              user.department?.name ||
              "Open"
            }
            caption="Candidate scope."
            accent="slate"
          />
        </section>

        {backendCandidate || localCandidate ? (
          <section className="sheet-card soft-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Published campaign</p>
                <h2>Current details</h2>
              </div>
            </div>
            <CandidateCard
              candidate={{
                ...(backendCandidate || {}),
                id: backendCandidate?.id || localCandidate?.id,
                approved: true,
                slogan: localCandidate?.slogan || backendCandidate?.slogan,
                manifesto: localCandidate?.manifesto || backendCandidate?.manifesto,
                campaign_video_url: localCandidate?.campaign_video_url,
                campaign_video_duration: localCandidate?.campaign_video_duration,
                user: backendCandidate?.user || {
                  id: user.id,
                  username: user.username,
                  full_name: user.full_name || user.username,
                  role: "candidate",
                },
              }}
              scope={backendCandidate?.position_name || localCandidate?.position_name || "Candidate"}
              footer={
                candidateResult
                  ? `Rank ${candidateResult.rank} in ${candidateResult.scope}`
                  : "Waiting for visible results"
              }
            />
          </section>
        ) : (
          <section className="sheet-card soft-card">
            <p className="muted">
              No candidate registration was found for this user in the selected election yet.
            </p>
          </section>
        )}
      </div>
    </PhonePage>
  );
}

function CandidateCampaignDetails({
  user,
  selectedElection,
  selectedElectionId,
  workspace,
  onUpdateWorkspace,
  onLogout,
}) {
  const location = useLocation();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const candidateTabs = [
    { to: "/candidate/login", label: "Login" },
    { to: "/candidate/dashboard", label: "Dashboard" },
    { to: "/candidate/compaindetails", label: "Campaign" },
  ];

  const localCandidate =
    workspace.candidateProfiles.find(
      (entry) =>
        entry.election_id === String(selectedElectionId) &&
        (String(entry.user_id) === String(user?.id) || entry.username === user?.username),
    ) || null;

  const [formData, setFormData] = useState(() => ({
    slogan: localCandidate?.slogan || "",
    manifesto: localCandidate?.manifesto || "",
    campaign_video_url: localCandidate?.campaign_video_url || "",
    campaign_video_duration: localCandidate?.campaign_video_duration || "00:30",
  }));

  useEffect(() => {
    setFormData({
      slogan: localCandidate?.slogan || "",
      manifesto: localCandidate?.manifesto || "",
      campaign_video_url: localCandidate?.campaign_video_url || "",
      campaign_video_duration: localCandidate?.campaign_video_duration || "00:30",
    });
  }, [localCandidate]);

  if (!user || user.app_role === "admin") {
    return <Navigate to="/candidate/login" replace state={{ from: location.pathname }} />;
  }

  function handleSubmit(event) {
    event.preventDefault();
    setStatus("");
    setError("");
    if (!selectedElection) {
      setError("Select an election first.");
      return;
    }
    onUpdateWorkspace((current) => {
      const next = structuredClone(current);
      const existingIndex = next.candidateProfiles.findIndex(
        (entry) =>
          entry.election_id === String(selectedElectionId) &&
          (String(entry.user_id) === String(user.id) || entry.username === user.username),
      );
      const baseProfile =
        existingIndex >= 0
          ? next.candidateProfiles[existingIndex]
          : {
              id: createId("candidate"),
              election_id: String(selectedElectionId),
              user_id: user.id,
              user_name: user.full_name || user.username,
              username: user.username,
              position_name: "Candidate",
              department_name: user.department?.name || "",
            };
      const nextProfile = {
        ...baseProfile,
        slogan: formData.slogan,
        manifesto: formData.manifesto,
        campaign_video_url: formData.campaign_video_url,
        campaign_video_duration: formData.campaign_video_duration || "00:30",
        posted_at: new Date().toISOString(),
      };
      if (existingIndex >= 0) {
        next.candidateProfiles[existingIndex] = nextProfile;
      } else {
        next.candidateProfiles.push(nextProfile);
      }
      return next;
    });
    setStatus("Campaign details saved. Voters can now see the posted campaign content.");
  }

  return (
    <PhonePage
      eyebrow="Candidate Campaign"
      title="Campaign Details"
      subtitle="Add manifesto content and a video link for a 00:30 campaign clip."
      user={user}
      accent="amber"
      tabs={candidateTabs}
      actions={
        <button className="ghost-button" onClick={onLogout}>
          Logout
        </button>
      }
    >
      <div className="stack-grid">
        {status ? <div className="status-banner success">{status}</div> : null}
        {error ? <div className="status-banner error">{error}</div> : null}

        <section className="sheet-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Selected Election</p>
              <h2>{selectedElection?.title || "No election selected"}</h2>
            </div>
          </div>
          {selectedElection ? <CountdownPanel election={selectedElection} /> : null}
        </section>

        <section className="sheet-card">
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field full-span">
              <span>Slogan</span>
              <input
                className="input"
                value={formData.slogan}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, slogan: event.target.value }))
                }
                placeholder="Your campaign slogan"
              />
            </label>
            <label className="field full-span">
              <span>Manifesto</span>
              <textarea
                className="input textarea"
                value={formData.manifesto}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, manifesto: event.target.value }))
                }
                placeholder="Describe the campaign promise"
              />
            </label>
            <label className="field full-span">
              <span>Video link</span>
              <input
                className="input"
                value={formData.campaign_video_url}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    campaign_video_url: event.target.value,
                  }))
                }
                placeholder="https://example.com/video.mp4"
              />
            </label>
            <label className="field">
              <span>Video duration</span>
              <input
                className="input"
                value={formData.campaign_video_duration}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    campaign_video_duration: event.target.value,
                  }))
                }
                placeholder="00:30"
              />
            </label>
            <div className="hint-card">
              <strong>Video rule</strong>
              <p>Use a short clip link and keep the posted campaign video at 00:30.</p>
            </div>
            <button className="action-button full-span" type="submit">
              Save campaign details
            </button>
          </form>
        </section>
      </div>
    </PhonePage>
  );
}

export default function App() {
  const [elections, setElections] = useState([]);
  const [selectedElectionId, setSelectedElectionId] = useState(null);
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) || "");
  const [workspace, setWorkspace] = useStoredState(WORKSPACE_KEY, createInitialWorkspace);
  const [localSession, setLocalSession] = useStoredState(LOCAL_SESSION_KEY, () => null);
  const [user, setUser] = useState(() => (localSession ? normalizeLocalUser(localSession) : null));
  const [loading, setLoading] = useState(true);
  const [appError, setAppError] = useState("");

  useEffect(() => {
    let ignore = false;
    fetchElections()
      .then((data) => {
        if (ignore) {
          return;
        }
        setElections(data);
        if (!selectedElectionId) {
          const preferred =
            data.find((entry) => entry.status === "active") ||
            data.find((entry) => entry.status === "upcoming") ||
            data[0];
          setSelectedElectionId(preferred ? String(preferred.id) : null);
        }
      })
      .catch((error) => {
        if (!ignore) {
          setAppError(error.message);
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      if (localSession) {
        setUser(normalizeLocalUser(localSession));
      } else {
        setUser(null);
      }
      return;
    }
    let ignore = false;
    fetchCurrentUser(token)
      .then((data) => {
        if (!ignore) {
          setUser(normalizeBackendUser(data));
        }
      })
      .catch(() => {
        if (!ignore) {
          window.localStorage.removeItem(TOKEN_KEY);
          setToken("");
          setUser(localSession ? normalizeLocalUser(localSession) : null);
        }
      });
    return () => {
      ignore = true;
    };
  }, [token, localSession]);

  const mergedElections = useMemo(
    () =>
      elections.map((election) =>
        applyElectionOverride(election, workspace.electionOverrides[String(election.id)]),
      ),
    [elections, workspace.electionOverrides],
  );

  const selectedElection =
    mergedElections.find((entry) => String(entry.id) === String(selectedElectionId)) ||
    mergedElections[0] ||
    null;

  async function handleLogin(credentials, portal) {
    try {
      const response = await login(credentials);
      const nextUser = normalizeBackendUser(response.user);
      if (!canUsePortal(nextUser, portal)) {
        throw new Error(`This account cannot use the ${portal} portal.`);
      }
      window.localStorage.setItem(TOKEN_KEY, response.token);
      setToken(response.token);
      setLocalSession(null);
      setUser(nextUser);
      return nextUser;
    } catch (backendError) {
      const localUser = workspace.users.find(
        (entry) =>
          entry.username === credentials.username &&
          entry.password === credentials.password &&
          canUsePortal(normalizeLocalUser(entry), portal),
      );
      if (!localUser) {
        throw backendError;
      }
      window.localStorage.removeItem(TOKEN_KEY);
      setToken("");
      setLocalSession(localUser);
      const nextUser = normalizeLocalUser(localUser);
      setUser(nextUser);
      return nextUser;
    }
  }

  async function handleRegister(payload, portal) {
    if (workspace.users.some((entry) => entry.username === payload.username)) {
      throw new Error("That username already exists.");
    }
    const localUser = {
      id: createId(portal),
      role: portal === "admin" ? "admin" : "voter",
      full_name: payload.full_name,
      username: payload.username,
      password: payload.password,
      email: payload.email,
      phone_number: payload.phone_number,
      department: payload.department_name ? { name: payload.department_name } : null,
    };
    setWorkspace((current) => {
      const next = structuredClone(current);
      next.users.push(localUser);
      if (portal === "voter") {
        next.voterRequests.push({
          id: createId("request"),
          created_at: new Date().toISOString(),
          full_name: payload.full_name,
          username: payload.username,
          registration_number: "",
        });
      }
      return next;
    });
    setLocalSession(localUser);
    const nextUser = normalizeLocalUser(localUser);
    setUser(nextUser);
    return nextUser;
  }

  async function handleLogout() {
    if (token) {
      try {
        await logout(token);
      } catch {
        // The local cleanup is enough.
      }
    }
    window.localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setLocalSession(null);
    setUser(null);
  }

  if (loading) {
    return (
      <div className="web-app">
        <section className="web-shell loading-shell">
          <div className="loading-screen">Loading redesigned voting pages...</div>
        </section>
      </div>
    );
  }

  if (!mergedElections.length) {
    return (
      <PhonePage
        eyebrow="Voting System"
        title="No Elections"
        subtitle="Create an election in the backend first, then the new independent pages will populate from it."
        user={user}
      >
        {appError ? <div className="status-banner error">{appError}</div> : null}
      </PhonePage>
    );
  }

  return (
    <>
      {appError ? <div className="global-banner">{appError}</div> : null}
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route
          path="/home"
          element={
            <HomeScreen
              elections={mergedElections}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
              user={user}
            />
          }
        />
        <Route
          path="/admin/login"
          element={<PortalLoginPage user={user} portal="admin" onLogin={handleLogin} />}
        />
        <Route
          path="/admin/register"
          element={<PortalRegisterPage user={user} portal="admin" onRegister={handleRegister} />}
        />
        <Route
          path="/admin/dashboard"
          element={
            <AdminDashboard
              user={user}
              elections={mergedElections}
              selectedElection={selectedElection}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
              workspace={workspace}
              onUpdateWorkspace={setWorkspace}
              onLogout={handleLogout}
            />
          }
        />
        <Route
          path="/voter/login"
          element={<PortalLoginPage user={user} portal="voter" onLogin={handleLogin} />}
        />
        <Route
          path="/voter/register"
          element={<PortalRegisterPage user={user} portal="voter" onRegister={handleRegister} />}
        />
        <Route
          path="/voter/dashboard"
          element={
            <VoterDashboard
              user={user}
              elections={mergedElections}
              selectedElection={selectedElection}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
              workspace={workspace}
              onLogout={handleLogout}
            />
          }
        />
        <Route path="/voter/dashboad" element={<Navigate to="/voter/dashboard" replace />} />
        <Route
          path="/voter/compain"
          element={
            <VoterCampaignPage
              user={user}
              selectedElection={selectedElection}
              workspace={workspace}
              onLogout={handleLogout}
            />
          }
        />
        <Route path="/voter/campaign" element={<Navigate to="/voter/compain" replace />} />
        <Route
          path="/candidate/login"
          element={<PortalLoginPage user={user} portal="candidate" onLogin={handleLogin} />}
        />
        <Route
          path="/candidate/dashboard"
          element={
            <CandidateDashboard
              user={user}
              elections={mergedElections}
              selectedElection={selectedElection}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
              workspace={workspace}
              onLogout={handleLogout}
            />
          }
        />
        <Route path="/candidate/dashboad" element={<Navigate to="/candidate/dashboard" replace />} />
        <Route
          path="/candidate/compaindetails"
          element={
            <CandidateCampaignDetails
              user={user}
              selectedElection={selectedElection}
              selectedElectionId={selectedElectionId}
              workspace={workspace}
              onUpdateWorkspace={setWorkspace}
              onLogout={handleLogout}
            />
          }
        />
        <Route
          path="/candidate/campaigndetails"
          element={<Navigate to="/candidate/compaindetails" replace />}
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </>
  );
}
