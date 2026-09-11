import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MapIcon } from "lucide-react";
import ShareCard from "../components/ShareCard";
import ConfirmDialog from "../components/ConfirmDialog";
import Skeleton from "../components/Skeleton";
import { listShares, revokeShare } from "../services/shares";
import { useToast } from "../hooks/useToast";
import { ApiRequestError } from "../services/api";
import type { Share } from "../types";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "expired", label: "Expired" },
  { key: "revoked", label: "Revoked" },
];

export default function MyLocations() {
  const navigate = useNavigate();
  const { show } = useToast();
  const [shares, setShares] = useState<Share[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Share | null>(null);
  const [revoking, setRevoking] = useState(false);

  function load() {
    setError(null);
    listShares({ status: filter, search: search || undefined, sort })
      .then((d) => setShares(d.shares))
      .catch((e) => setError(e instanceof ApiRequestError ? e.message : "Something went wrong."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sort]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeShare(revokeTarget.id);
      show("Location revoked", "success");
      setRevokeTarget(null);
      load();
    } catch (e) {
      show(e instanceof ApiRequestError ? e.message : "Couldn't revoke this share.", "error");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="page-title">My Locations</h1>
          <p className="page-subtitle">Manage all the places you've shared.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate("/share-location")}>+ Share Location</button>
      </div>

      <div className="section">
        <div className="search-input-wrap">
          <span className="search-icon"><Search size={17} /></span>
          <input className="input" placeholder="Search locations..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="flex justify-between items-center mt-16" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="chip-row">
            {FILTERS.map((f) => (
              <button key={f.key} className={`chip${filter === f.key ? " selected" : ""}`} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          <select className="input" style={{ width: "auto" }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="most_opened">Most opened</option>
          </select>
        </div>
      </div>

      <div className="section flex-col gap-12">
        {error && <p style={{ color: "var(--color-danger)", fontSize: 13.5 }}>{error}</p>}
        {shares === null && !error ? (
          <>
            <Skeleton height={150} radius={16} />
            <Skeleton height={150} radius={16} />
          </>
        ) : shares && shares.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><MapIcon size={40} /></div>
            <div className="empty-title">No locations shared yet.</div>
            <button className="btn btn-primary" onClick={() => navigate("/share-location")}>Share Your First Location</button>
          </div>
        ) : (
          shares?.map((share) => <ShareCard key={share.id} share={share} onRevoke={setRevokeTarget} />)
        )}
      </div>

      <button className="fab" onClick={() => navigate("/share-location")} aria-label="Share new location">+</button>

      <ConfirmDialog
        open={!!revokeTarget}
        title="Revoke this location?"
        description="This link will stop working immediately."
        confirmLabel="Revoke"
        danger
        loading={revoking}
        onConfirm={confirmRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
