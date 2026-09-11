import { NavLink } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";
import BrandLogo from "./BrandLogo";

interface MoreDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function MoreDrawer({ open, onClose }: MoreDrawerProps) {
  const { theme, setTheme } = useTheme();
  if (!open) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-sheet">
        <div className="sidebar-brand">
          <div className="brand-mark"><BrandLogo /></div>
          <div>
            <div className="brand-name">SpotShare</div>
            <div className="brand-tagline">Location Sharing</div>
          </div>
        </div>
        <NavLink to="/my-location" className="sidebar-link" onClick={onClose}>
          <span className="icon">📡</span>
          <span>My Current Location</span>
        </NavLink>
        <NavLink to="/analytics" className="sidebar-link" onClick={onClose}>
          <span className="icon">📈</span>
          <span>Analytics</span>
        </NavLink>
        <NavLink to="/settings" className="sidebar-link" onClick={onClose}>
          <span className="icon">⚙</span>
          <span>Settings</span>
        </NavLink>

        <hr className="divider" />

        <div style={{ padding: "0 12px" }}>
          <div className="field-label">Appearance</div>
          <div className="chip-row">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                className={`chip${theme === t ? " selected" : ""}`}
                onClick={() => setTheme(t)}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1 }} />
        <div className="sidebar-footer">
          <div className="sidebar-profile">
            <div className="avatar">D</div>
            <div>
              <div className="profile-name">Demo User</div>
              <div className="profile-email">demo@spotshare.app</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
