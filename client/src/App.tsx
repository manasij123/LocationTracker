import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./layouts/AppShell";
import Dashboard from "./pages/Dashboard";
import ShareLocation from "./pages/ShareLocation";
import ShareResult from "./pages/ShareResult";
import MyLocations from "./pages/MyLocations";
import LocationDetails from "./pages/LocationDetails";
import Activity from "./pages/Activity";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import PublicSharePage from "./pages/PublicSharePage";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/share/:shareId" element={<PublicSharePage />} />

        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/share-location" element={<ShareLocation />} />
          <Route path="/share-location/result/:shareId" element={<ShareResult />} />
          <Route path="/locations" element={<MyLocations />} />
          <Route path="/locations/:shareId" element={<LocationDetails />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/more" element={<Navigate to="/settings" replace />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
