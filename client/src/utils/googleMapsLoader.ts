let loaderPromise: Promise<typeof google> | null = null;

/**
 * Loads the Google Maps JavaScript API script once and caches the promise, so multiple
 * MapView instances mounting concurrently don't each inject their own <script> tag.
 */
export function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google);
      return;
    }

    const callbackName = "__spotshareGoogleMapsLoaded";
    (window as any)[callbackName] = () => {
      delete (window as any)[callbackName];
      resolve(window.google);
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load Google Maps JavaScript API"));
    document.head.appendChild(script);
  });

  return loaderPromise;
}
