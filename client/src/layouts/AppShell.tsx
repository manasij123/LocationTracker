import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import MoreDrawer from "../components/MoreDrawer";

export default function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <TopBar onOpenMenu={() => setDrawerOpen(true)} />
        <main className="app-content page-fade-in">
          <Outlet />
        </main>
        <BottomNav onOpenMore={() => setDrawerOpen(true)} />
      </div>
      <MoreDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
