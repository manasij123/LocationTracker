import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="empty-state" style={{ minHeight: "100vh", justifyContent: "center" }}>
      <div className="empty-icon"><Compass size={40} /></div>
      <div className="empty-title">Page not found</div>
      <Link to="/" className="btn btn-primary">Go to Dashboard</Link>
    </div>
  );
}
