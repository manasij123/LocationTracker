import type { ShareStatus } from "../types";

const labels: Record<ShareStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
};

export default function StatusBadge({ status }: { status: ShareStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-dot" />
      {labels[status]}
    </span>
  );
}
