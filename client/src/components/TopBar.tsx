import BrandLogo from "./BrandLogo";

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="brand-mark"><BrandLogo /></div>
        SpotShare
      </div>
    </header>
  );
}
