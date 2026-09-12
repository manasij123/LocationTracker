import { useEffect, useState } from "react";

type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };
type OrientationPermissionRequester = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Live compass heading in degrees (0 = north, clockwise) — the same "which way is the phone
 * pointing" reading behind Google Maps' rotating blue-dot beam, so a "my current location"
 * marker can point the same way as the map lets it react to `deviceorientationabsolute`
 * (Android/Chrome, already earth-referenced) or `deviceorientation`'s `webkitCompassHeading`
 * (iOS Safari); `alpha` alone is relative to wherever the device happened to be facing when the
 * listener attached, not north, so it's only usable via the "absolute" event. Returns null
 * while inactive, unsupported, or before the first reading arrives.
 */
export function useDeviceHeading(active: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    if (!active || typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      setHeading(null);
      return;
    }

    let screenAngle = screen.orientation?.angle ?? 0;
    function updateScreenAngle() {
      screenAngle = screen.orientation?.angle ?? 0;
    }

    function handleOrientation(event: OrientationEventWithCompass) {
      if (typeof event.webkitCompassHeading === "number") {
        setHeading(event.webkitCompassHeading);
        return;
      }
      if (event.alpha == null) return;
      // `alpha` here comes from the "absolute" event, so it's already earth-referenced (0 =
      // north) but increases counter-clockwise — flip it to a clockwise compass heading and add
      // back the screen's own rotation, since alpha is measured relative to the device body, not
      // the (possibly landscape) screen the map is actually drawn in.
      setHeading((360 - event.alpha + screenAngle) % 360);
    }

    let cancelled = false;
    const eventName = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";

    function subscribe() {
      if (cancelled) return;
      window.addEventListener(eventName, handleOrientation as EventListener);
      screen.orientation?.addEventListener?.("change", updateScreenAngle);
    }

    // iOS 13+ Safari gates motion/orientation sensors behind an explicit permission prompt that
    // must be triggered by a user gesture — harmless to call elsewhere (Android has no such gate
    // and this API doesn't exist there at all).
    const requestPermission = (DeviceOrientationEvent as unknown as OrientationPermissionRequester).requestPermission;
    if (typeof requestPermission === "function") {
      requestPermission()
        .then((state) => {
          if (state === "granted") subscribe();
        })
        .catch(() => {});
    } else {
      subscribe();
    }

    return () => {
      cancelled = true;
      window.removeEventListener(eventName, handleOrientation as EventListener);
      screen.orientation?.removeEventListener?.("change", updateScreenAngle);
      setHeading(null);
    };
  }, [active]);

  return heading;
}
