import { NavLink, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Home, MapPin, Map, Radio, Menu } from "lucide-react";

const items: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/share-location", label: "Share", icon: MapPin },
  { to: "/locations", label: "Locations", icon: Map },
  { to: "/my-location", label: "Live", icon: Radio },
];

interface BottomNavProps {
  onOpenMore: () => void;
}

export default function BottomNav({ onOpenMore }: BottomNavProps) {
  const location = useLocation();
  const moreActive = ["/analytics", "/settings", "/activity"].some((p) => location.pathname.startsWith(p));

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `bottom-nav-item${isActive ? " active" : ""}`}
        >
          <span className="icon"><item.icon size={18} /></span>
          <span>{item.label}</span>
        </NavLink>
      ))}
      <button className={`bottom-nav-item${moreActive ? " active" : ""}`} onClick={onOpenMore}>
        <span className="icon"><Menu size={18} /></span>
        <span>More</span>
      </button>
    </nav>
  );
}
