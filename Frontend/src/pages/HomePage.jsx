import { useDeferredValue, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import CountdownPanel from "../components/CountdownPanel";
import HomeControls from "../components/HomeControls";
import PortalLayout from "../components/PortalLayout";

const SIDEBAR_GROUPS = [
  {
    title: "Admin Forms",
    links: [
      { label: "Admin Register", to: "/admin/register" },
      { label: "Admin Login", to: "/admin/login" },
    ],
  },
  {
    title: "Voter Forms",
    links: [
      { label: "Voter Register", to: "/voter/register" },
      { label: "Voter Login", to: "/voter/login" },
    ],
  },
  {
    title: "Candidate Forms",
    links: [{ label: "Candidate Login", to: "/candidate/login" }],
  },
];

const ROLE_SECTIONS = [
  {
    title: "Admin Dashboard",
    route: "/admin/dashboard",
    kicker: "Administration",
    description:
      "Register candidates, register voters, set election date and time, update deadlines, and post election notices with countdown updates for all dashboards.",
  },
  {
    title: "Voter Dashboard",
    route: "/voter/dashboad",
    kicker: "Voter Section",
    description:
      "See all elections, select one election, and open all candidate compains from the voter dashboard flow.",
  },
  {
    title: "Candidate Dashboard",
    route: "/candidate/dashboad",
    kicker: "Candidate Section",
    description:
      "Candidates login after admin registration, watch countdown and vote count, see winner or looser decision, and add compain details with video 00:30.",
  },
  {
    title: "Voter Compaign",
    route: "/voter/compain",
    kicker: "Campaigns",
    description: "See all candidate compains posted for the selected election.",
  },
  {
    title: "Candidate Compaindetails",
    route: "/candidate/compaindetails",
    kicker: "Publishing",
    description: "Add manifesto details and a 00:30 campaign video visible to voters.",
  },
  {
    title: "Candidate Register",
    route: "/admin/dashboard",
    kicker: "Admin Only",
    description: "Candidates are registered by admin inside the admin dashboard workflow.",
  },
];

const FORM_CARDS = [
  {
    kicker: "Admin Form",
    title: "Admin Register",
    description: "Create admin access for election management.",
    to: "/admin/register",
    linkClassName: "primary-link",
    linkLabel: "Open /admin/register",
  },
  {
    kicker: "Admin Form",
    title: "Admin Login",
    description: "Login to manage elections, voters, candidates, and deadlines.",
    to: "/admin/login",
    linkClassName: "ghost-link",
    linkLabel: "Open /admin/login",
  },
  {
    kicker: "Voter Form",
    title: "Voter Register",
    description: "Create a voter account to access election dashboards and compains.",
    to: "/voter/register",
    linkClassName: "primary-link",
    linkLabel: "Open /voter/register",
  },
  {
    kicker: "Voter Form",
    title: "Voter Login",
    description: "Login and open the voter dashboard to select elections.",
    to: "/voter/login",
    linkClassName: "ghost-link",
    linkLabel: "Open /voter/login",
  },
  {
    kicker: "Candidate Form",
    title: "Candidate Login",
    description: "Candidates sign in after admin registration.",
    to: "/candidate/login",
    linkClassName: "primary-link",
    linkLabel: "Open /candidate/login",
  },
  {
    kicker: "Admin Only",
    title: "Candidate Register",
    description: "Candidates do not self-register. Admin registers them inside /admin/dashboard.",
    to: "/admin/dashboard",
    linkClassName: "ghost-link",
    linkLabel: "Open /admin/dashboard",
  },
];

export default function HomePage({
  elections,
  selectedElectionId,
  onSelectElection,
  user,
  theme,
  onToggleTheme,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const deferredSearch = useDeferredValue(searchQuery.trim().toLowerCase());

  const selectedElection = useMemo(
    () =>
      elections.find((entry) => String(entry.id) === String(selectedElectionId)) ||
      elections[0] ||
      null,
    [elections, selectedElectionId],
  );

  const visibleSections = useMemo(() => {
    if (!deferredSearch) {
      return ROLE_SECTIONS;
    }
    return ROLE_SECTIONS.filter((section) => {
      const searchableText = `${section.title} ${section.route} ${section.description}`.toLowerCase();
      return searchableText.includes(deferredSearch);
    });
  }, [deferredSearch]);

  const homeStats = [
    {
      label: "Entry Route",
      value: "/home",
      note: "The app starts here before moving into role-specific pages.",
    },
    {
      label: "Active Election",
      value: selectedElection?.title || "No election",
      note: "Selected from the election picker and shared across dashboards.",
    },
    {
      label: "Main Flows",
      value: "Admin, Voter, Candidate",
      note: "Each role keeps its own login, dashboard, and campaign workflow.",
    },
  ];

  return (
    <PortalLayout
      eyebrow="Election Hub"
      title="Online Voting System"
      subtitle="A web-based election hub that enables admins, voters, and candidates to manage and access election workflows from one system."
      accent="blue"
      user={user}
      theme={theme}
      onToggleTheme={onToggleTheme}
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
      <section className="page-wrap home-layout">
        <aside className={`home-sidebar${sidebarOpen ? " open" : ""}`}>
          <div className="sidebar-card">
            <p className="eyebrow">Forms</p>
            {SIDEBAR_GROUPS.map((group) => (
              <div className="stack-grid compact" key={group.title}>
                <p className="sidebar-group">{group.title}</p>
                {group.links.map((link) => (
                  <Link className="sidebar-link" key={link.to} to={link.to}>
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
            <div className="sidebar-note">
              Candidate register is handled by admin inside <strong>/admin/dashboard</strong>.
            </div>
          </div>
        </aside>

        <div className="stack-grid">
          <header className="home-toolbar sheet-card">
            <div className="home-toolbar-head">
              <div className="home-toolbar-copy">
                <p className="home-toolbar-kicker">Election Hub</p>
                <h2>Start with /home and move by role</h2>
                <p className="muted">
                  Search any section, route, or workflow card below, then open the matching page.
                </p>
              </div>
            </div>
            <HomeControls
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              selectedElectionId={selectedElectionId}
              onSelectElection={onSelectElection}
              elections={elections}
            />
          </header>

          <section className="home-overview-grid">
            {homeStats.map((item) => (
              <article className="home-overview-card" key={item.label}>
                <p className="info-card-kicker">{item.label}</p>
                <h3>{item.value}</h3>
                <p className="muted">{item.note}</p>
              </article>
            ))}
          </section>

          <article className="sheet-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Election Picker</p>
                <h2>Shared schedule</h2>
              </div>
            </div>
            {selectedElection ? <CountdownPanel election={selectedElection} /> : null}
          </article>

          <section className="section-heading">
            <div>
              <h2 className="section-title">Home Sections</h2>
              <p className="section-note">Open any area of the election hub from these cards.</p>
            </div>
          </section>

          <div className="portal-grid">
            {visibleSections.map((section) => (
              <article
                className="portal-card home-feature-card"
                key={section.route}
                role="button"
                tabIndex={0}
                onClick={() => navigate(section.route)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    navigate(section.route);
                  }
                }}
              >
                <span className="portal-kicker">{section.kicker}</span>
                <strong>{section.title}</strong>
                <p>{section.description}</p>
                <span className="home-route-pill">{section.route}</span>
              </article>
            ))}
          </div>

          {!visibleSections.length ? (
            <div className="catalog-empty">
              <h3>No section matches that search.</h3>
              <p>Try another route name, role, or workflow keyword.</p>
            </div>
          ) : null}

          <section className="home-section">
            <div className="section-heading">
              <div>
                <h2 className="section-title">Login And Register Forms</h2>
                <p className="section-note">
                  All available auth forms are linked from home and repeated in the sidebar.
                </p>
              </div>
            </div>
            <div className="info-grid">
              {FORM_CARDS.map((card) => (
                <article className="info-card auth-link-card" key={card.title}>
                  <p className="info-card-kicker">{card.kicker}</p>
                  <h3>{card.title}</h3>
                  <p className="muted">{card.description}</p>
                  <Link className={`${card.linkClassName} wide-link`} to={card.to}>
                    {card.linkLabel}
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section className="home-sections-grid">
            <article className="sheet-card">
              <p className="eyebrow">Admin Section</p>
              <h2>/admin/register, /admin/login, /admin/dashboard</h2>
              <p className="muted">
                Admin registers candidates and voters, sets election date and time, updates
                deadlines, posts election notices, and controls the countdown shown to all users.
              </p>
            </article>

            <article className="sheet-card">
              <p className="eyebrow">Voter Section</p>
              <h2>/voter/register, /voter/login, /voter/dashboad, /voter/compain</h2>
              <p className="muted">
                Voters open their dashboard, see all elections, select one election, and view all
                candidate compains before voting.
              </p>
            </article>

            <article className="sheet-card">
              <p className="eyebrow">Candidate Section</p>
              <h2>/candidate/login, /candidate/dashboad, /candidate/compaindetails</h2>
              <p className="muted">
                Candidates login after admin registration, view countdown, vote count, winner or
                looser decision, and add compain details with a 00:30 video visible to voters.
              </p>
            </article>
          </section>

          <section className="home-section">
            <div className="section-heading">
              <div>
                <h2 className="section-title">About Election Hub</h2>
                <p className="section-note">Core capabilities used across the system.</p>
              </div>
            </div>
            <div className="info-grid">
              <article className="sheet-card">
                <p className="info-card-kicker">Scheduling</p>
                <h3>Election countdown control</h3>
                <p className="muted">
                  Admin updates election date, time, and deadline once, then all dashboards receive
                  the same countdown.
                </p>
              </article>
              <article className="sheet-card">
                <p className="info-card-kicker">Campaigns</p>
                <h3>Candidate compains and video</h3>
                <p className="muted">
                  Candidates publish slogans, manifesto details, and a 00:30 video that voters can
                  review in the compain page.
                </p>
              </article>
              <article className="sheet-card">
                <p className="info-card-kicker">Results</p>
                <h3>Winner or looser decision</h3>
                <p className="muted">
                  Candidates can see vote count and outcome status while voters and admins track the
                  broader election activity.
                </p>
              </article>
            </div>
          </section>

          <section className="home-section">
            <div className="section-heading">
              <div>
                <h2 className="section-title">Contact And Help</h2>
                <p className="section-note">Support for account access and election operations.</p>
              </div>
            </div>
            <div className="contact-card">
              <div className="contact-copy">
                <p className="info-card-kicker">Support</p>
                <h3>Talk to Election Hub</h3>
                <p className="muted">
                  Get help with admin setup, voter access, candidate registration, and election
                  timing updates.
                </p>
                <div className="contact-actions">
                  <a className="primary-link" href="mailto:support@electionhub.app">
                    Email Support
                  </a>
                  <a className="ghost-link" href="tel:+255700000000">
                    Call Now
                  </a>
                </div>
              </div>

              <div className="contact-list">
                <a className="contact-item" href="mailto:support@electionhub.app">
                  <span>Email</span>
                  <strong>support@electionhub.app</strong>
                </a>
                <a className="contact-item" href="tel:+255700000000">
                  <span>Phone</span>
                  <strong>+255 700 000 000</strong>
                </a>
                <div className="contact-item">
                  <span>Platform</span>
                  <strong>Election Hub System</strong>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </PortalLayout>
  );
}
