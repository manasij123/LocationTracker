import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard", icon: "🏠", end: true },
  { to: "/share-location", label: "Share Location", icon: "📍" },
  { to: "/locations", label: "My Locations", icon: "🗺" },
  { to: "/my-location", label: "My Current Location", icon: "📡" },
  { to: "/activity", label: "Activity", icon: "📊" },
  { to: "/analytics", label: "Analytics", icon: "📈" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark"><img src="/logo.svg" alt="SpotShare" /></div>
        <div>
          <div className="brand-name">SpotShare</div>
          <div className="brand-tagline">Temporary location sharing</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            <span className="icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <NavLink to="/settings" className="sidebar-profile">
          <div className="avatar">D</div>
          <div>
            <div className="profile-name">Demo User</div>
            <div className="profile-email">demo@spotshare.app</div>
          </div>
        </NavLink>
      </div>
    </aside>
  );
}
