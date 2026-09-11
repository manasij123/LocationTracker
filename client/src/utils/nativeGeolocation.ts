import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin, Location as BgLocation, CallbackError } from "@capacitor-community/background-geolocation";

// This plugin ships no JS runtime of its own (only native platform code + type definitions —
// see its README), so the plugin object itself has to be created here via registerPlugin.
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

export interface GeoCoords {
  latitude: number;
  longitude: number;
}

/** True when running inside the Capacitor-wrapped native app, false in a plain browser tab. */
export const isNativeApp = Capacitor.isNativePlatform();

/**
 * Starts continuous location watching — the real background-geolocation plugin when running
 * inside the native app (a foreground service + persistent notification keeps it reporting even
 * while the app is backgrounded or the screen is off), or the browser's
 * `navigator.geolocation.watchPosition` otherwise (only reliable while this tab stays in the
 * foreground — see the visibilitychange handling in useLiveShare.tsx for that case). Either way
 * the first callback fires as soon as a fix is available, same as watchPosition's behavior.
 * Returns a function that stops watching.
 */
export async function startWatchingPosition(
  onPosition: (coords: GeoCoords) => void,
  onError: () => void
): Promise<() => void> {
  if (isNativeApp) {
    const watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: "SpotShare is sharing your live location",
        backgroundTitle: "Live location sharing active",
        requestPermissions: true,
        stale: false,
        distanceFilter: 5,
      },
      (position?: BgLocation, error?: CallbackError) => {
        if (error) {
          onError();
          return;
        }
        if (position) {
          onPosition({ latitude: position.latitude, longitude: position.longitude });
        }
      }
    );
    return () => {
      BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
    };
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => onPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
    onError,
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
  );
  return () => navigator.geolocation.clearWatch(watchId);
}

/** A single fresh fix — used to close a gap quickly after the web tab returns to the
 *  foreground. Not meaningful on native (the background watcher never actually stopped there),
 *  so callers only need this path for the web/backgrounded-tab case. */
export function getCurrentPositionOnce(): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}
