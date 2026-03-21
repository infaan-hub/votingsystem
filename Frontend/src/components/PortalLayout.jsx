import { NavLink } from "react-router-dom";

function formatRole(role) {
  if (!role) {
    return "Guest";
  }
  return role
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
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

export default function PortalLayout({
  eyebrow,
  title,
  subtitle,
  user,
  accent = "blue",
  tabs,
  children,
  actions,
  theme = "light",
  onToggleTheme,
}) {
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
            <div className="hero-meta-actions">
              {onToggleTheme ? (
                <button className="theme-toggle" type="button" onClick={onToggleTheme}>
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </button>
              ) : null}
              <span className="role-pill">{user ? formatRole(user.app_role) : "Guest"}</span>
            </div>
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
