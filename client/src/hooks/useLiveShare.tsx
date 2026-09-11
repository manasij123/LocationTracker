import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { startLiveShare, sendLivePing, revokeShare } from "../services/shares";
import type { Share } from "../types";

export type LiveShareStatus = "idle" | "requesting" | "sharing" | "error";

interface Coords {
  latitude: number;
  longitude: number;
}

interface LiveShareContextValue {
  status: LiveShareStatus;
  error: string | null;
  share: Share | null;
  coords: Coords | null;
  start: () => void;
  stop: () => void;
}

const LiveShareContext = createContext<LiveShareContextValue | null>(null);

// A GPS fix within this radius of the current "anchor" point still counts as the same spot —
// real GPS noise wanders a few meters even while standing still, so this has to be forgiving.
const WAIT_RADIUS_METERS = 30;
const WAIT_DURATION_MS = 5 * 60_000;
// Regular (non-wait-point) pings are throttled by both time and distance so a stationary phone
// doesn't spam the server, while still keeping the trail reasonably granular while moving.
const PING_THROTTLE_MS = 5000;
const PING_MIN_MOVE_METERS = 8;

function distanceMeters(a: Coords, b: Coords): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Drives a "My Current Location" live-tracking share for as long as this browser tab stays
 * open: watches real GPS continuously (`watchPosition`, unlike `useUserLocation`'s one-shot
 * read used elsewhere just to show "how far away" a search result is), sends throttled pings
 * to the server, and auto-detects "wait points" — spots the creator stays near for 5+ minutes
 * — entirely client-side from the same GPS stream, no extra requests needed. Held in a
 * context (mounted once at the app root) rather than local page state, so sharing keeps
 * running while the creator browses to other pages in the app and not just while this
 * specific page is on screen — it only stops on the explicit "Stop sharing" action.
 */
export function LiveShareProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LiveShareStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<Share | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const shareIdRef = useRef<string | null>(null);
  const anchorRef = useRef<{ position: Coords; since: number; waitPointFired: boolean } | null>(null);
  const lastSentRef = useRef<{ position: Coords; at: number } | null>(null);
  const sendingRef = useRef(false);

  const stop = useCallback(async () => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    const shareId = shareIdRef.current;
    shareIdRef.current = null;
    anchorRef.current = null;
    lastSentRef.current = null;
    setStatus("idle");
    setShare(null);
    if (shareId) {
      try {
        await revokeShare(shareId);
      } catch {
        // Already expired/revoked, or a network blip — either way there's nothing further to
        // stop client-side, and the share's own safety-net expiry ends it regardless.
      }
    }
  }, []);

  const handlePosition = useCallback((position: GeolocationPosition) => {
    const point: Coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    setCoords(point);

    const shareId = shareIdRef.current;
    if (!shareId) return;
    const now = Date.now();

    if (!anchorRef.current || distanceMeters(anchorRef.current.position, point) > WAIT_RADIUS_METERS) {
      anchorRef.current = { position: point, since: now, waitPointFired: false };
    }
    const anchor = anchorRef.current;
    const shouldFireWaitPoint = !anchor.waitPointFired && now - anchor.since >= WAIT_DURATION_MS;

    const last = lastSentRef.current;
    const movedEnough = !last || distanceMeters(last.position, point) >= PING_MIN_MOVE_METERS;
    const throttleElapsed = !last || now - last.at >= PING_THROTTLE_MS;

    if (!shouldFireWaitPoint && !(movedEnough && throttleElapsed)) return;
    if (sendingRef.current) return;

    sendingRef.current = true;
    if (shouldFireWaitPoint) anchor.waitPointFired = true;
    lastSentRef.current = { position: point, at: now };

    sendLivePing(shareId, {
      latitude: point.latitude,
      longitude: point.longitude,
      isWaitPoint: shouldFireWaitPoint,
    })
      .then(({ share: updated }) => setShare(updated))
      .catch(() => {
        // A dropped ping just leaves a small gap in the trail — the next one that lands keeps
        // the stream going, so there's nothing productive to surface for a single miss.
      })
      .finally(() => {
        sendingRef.current = false;
      });
  }, []);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("This browser doesn't support location access.");
      return;
    }
    setStatus("requesting");
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: Coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        startLiveShare(point)
          .then(({ share: created }) => {
            shareIdRef.current = created.id;
            anchorRef.current = { position: point, since: Date.now(), waitPointFired: false };
            lastSentRef.current = { position: point, at: Date.now() };
            setShare(created);
            setCoords(point);
            setStatus("sharing");

            watchIdRef.current = navigator.geolocation.watchPosition(
              handlePosition,
              () => {
                setStatus("error");
                setError("Lost access to your location. Sharing has stopped.");
                stop();
              },
              { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
            );
          })
          .catch(() => {
            setStatus("error");
            setError("Couldn't start live sharing. Please try again.");
          });
      },
      () => {
        setStatus("error");
        setError("Location permission was denied.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [handlePosition, stop]);

  const value = useMemo(
    () => ({ status, error, share, coords, start, stop }),
    [status, error, share, coords, start, stop]
  );

  return <LiveShareContext.Provider value={value}>{children}</LiveShareContext.Provider>;
}

export function useLiveShare() {
  const ctx = useContext(LiveShareContext);
  if (!ctx) throw new Error("useLiveShare must be used within LiveShareProvider");
  return ctx;
}
