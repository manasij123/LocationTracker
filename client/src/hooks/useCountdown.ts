import { useEffect, useState } from "react";

/**
 * Ticks down from a server-authoritative expiry timestamp. The client never computes
 * expiration on its own — it only renders the remaining time until `expiresAt`.
 */
export function useCountdown(expiresAt: string | null | undefined) {
  const [remainingMs, setRemainingMs] = useState(() =>
    expiresAt ? new Date(expiresAt).getTime() - Date.now() : 0
  );

  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const tick = () => setRemainingMs(Math.max(0, target - Date.now()));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return Math.max(0, remainingMs);
}
