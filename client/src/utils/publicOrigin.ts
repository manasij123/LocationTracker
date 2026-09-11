/**
 * The origin to build shareable links against. In a plain browser tab, `window.location.origin`
 * is already the real, public web app URL — fine as a default. But inside the Capacitor-wrapped
 * native app, `window.location.origin` is the WebView's own internal address (`https://localhost`
 * by default), not a URL anyone outside the device can open. `VITE_PUBLIC_APP_URL` should be set
 * to the real, publicly-reachable web app URL (e.g. the Vercel deployment) so links generated
 * on-device still work when opened anywhere else — required for the native build, optional (and
 * normally unnecessary) for the plain web build.
 */
export function getPublicOrigin(): string {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, "");
  return window.location.origin;
}
