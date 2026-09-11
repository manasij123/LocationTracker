import { NavLink, useLocation } from "react-router-dom";

const items = [
  { to: "/", label: "Home", icon: "🏠", end: true },
  { to: "/share-location", label: "Share", icon: "📍" },
  { to: "/locations", label: "Locations", icon: "🗺" },
  { to: "/activity", label: "Activity", icon: "📊" },
];

interface BottomNavProps {
  onOpenMore: () => void;
}

export default function BottomNav({ onOpenMore }: BottomNavProps) {
  const location = useLocation();
  const moreActive = ["/analytics", "/settings", "/my-location"].some((p) => location.pathname.startsWith(p));

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `bottom-nav-item${isActive ? " active" : ""}`}
        >
          <span className="icon">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
      <button className={`bottom-nav-item${moreActive ? " active" : ""}`} onClick={onOpenMore}>
        <span className="icon">☰</span>
        <span>More</span>
      </button>
    </nav>
  );
}
