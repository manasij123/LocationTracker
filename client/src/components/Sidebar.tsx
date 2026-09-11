import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Home, MapPin, Map, Radio, Activity, TrendingUp, Settings } from "lucide-react";
import BrandLogo from "./BrandLogo";

const navItems: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", label: "Dashboard", icon: Home, end: true },
  { to: "/share-location", label: "Share Location", icon: MapPin },
  { to: "/locations", label: "My Locations", icon: Map },
  { to: "/my-location", label: "My Current Location", icon: Radio },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/analytics", label: "Analytics", icon: TrendingUp },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark"><BrandLogo /></div>
        <div>
          <div className="brand-name">SpotShare</div>
          <div className="brand-tagline">Location Sharing</div>
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
            <span className="icon"><item.icon size={18} /></span>
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
