function isMobile(): boolean {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Opens the destination in whatever navigation app the visitor's device offers. */
export function openDirections(latitude: number, longitude: number, label: string) {
  const encodedLabel = encodeURIComponent(label);
  const url = isMobile()
    ? `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`
    : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  const win = window.open(url, "_blank");
  if (!win) {
    window.location.href = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  }
}
