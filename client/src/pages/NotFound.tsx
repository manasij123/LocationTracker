import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="empty-state" style={{ minHeight: "100vh", justifyContent: "center" }}>
      <div className="empty-icon">🧭</div>
      <div className="empty-title">Page not found</div>
      <Link to="/" className="btn btn-primary">Go to Dashboard</Link>
    </div>
  );
}
