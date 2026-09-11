import BrandLogo from "./BrandLogo";

interface TopBarProps {
  onOpenMenu: () => void;
}

export default function TopBar({ onOpenMenu }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="brand-mark"><BrandLogo /></div>
        SpotShare
      </div>
      <button className="icon-btn" onClick={onOpenMenu} aria-label="Open menu">
        ☰
      </button>
    </header>
  );
}
