export interface PlaceResult {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

export interface GeocodingProvider {
  search(query: string): Promise<PlaceResult[]>;
}

/**
 * Offline provider used when no live geocoding API is reachable (default for local dev).
 * Ships with a small curated dataset of well-known places plus a deterministic
 * fallback so any free-text query still resolves to a plausible-looking point.
 */
class MockGeocodingProvider implements GeocodingProvider {
  private dataset: PlaceResult[] = [
    {
      placeId: "mock-tcs-gitobitan",
      name: "TCS Gitobitan",
      formattedAddress: "TCS Gitobitan, Sector V, Salt Lake, Kolkata, West Bengal 700091",
      latitude: 22.5744,
      longitude: 88.4331,
    },
    {
      placeId: "mock-park-street",
      name: "Park Street",
      formattedAddress: "Park Street, Kolkata, West Bengal 700016",
      latitude: 22.5535,
      longitude: 88.3517,
    },
    {
      placeId: "mock-salt-lake",
      name: "Salt Lake",
      formattedAddress: "Bidhannagar, Salt Lake, Kolkata, West Bengal 700064",
      latitude: 22.5809,
      longitude: 88.4171,
    },
    {
      placeId: "mock-howrah-station",
      name: "Howrah Junction",
      formattedAddress: "Howrah Junction Railway Station, Howrah, West Bengal 711101",
      latitude: 22.5835,
      longitude: 88.3425,
    },
    {
      placeId: "mock-victoria-memorial",
      name: "Victoria Memorial",
      formattedAddress: "1, Queens Way, Maidan, Kolkata, West Bengal 700071",
      latitude: 22.5448,
      longitude: 88.3426,
    },
    {
      placeId: "mock-city-center-2",
      name: "City Centre 2",
      formattedAddress: "City Centre 2, Salt Lake, Kolkata, West Bengal 700091",
      latitude: 22.6011,
      longitude: 88.4133,
    },
    {
      placeId: "mock-eco-park",
      name: "Eco Park",
      formattedAddress: "Eco Park, New Town, Kolkata, West Bengal 700156",
      latitude: 22.6069,
      longitude: 88.4746,
    },
    {
      placeId: "mock-esplanade",
      name: "Esplanade",
      formattedAddress: "Esplanade, Kolkata, West Bengal 700069",
      latitude: 22.5626,
      longitude: 88.3529,
    },
  ];

  async search(query: string): Promise<PlaceResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const matches = this.dataset.filter(
      (place) =>
        place.name.toLowerCase().includes(q) ||
        place.formattedAddress.toLowerCase().includes(q)
    );

    if (matches.length > 0) return matches;

    // Deterministic pseudo-geocode so arbitrary free-text queries still work offline.
    const seed = [...q].reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7);
    const latitude = 22.5726 + (((seed % 2000) - 1000) / 1000) * 0.08;
    const longitude = 88.3639 + ((((seed >> 3) % 2000) - 1000) / 1000) * 0.08;

    return [
      {
        placeId: `mock-${Buffer.from(q).toString("hex").slice(0, 16)}`,
        name: query.trim(),
        formattedAddress: `${query.trim()}, Kolkata, West Bengal, India`,
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6)),
      },
    ];
  }
}

/** Live provider backed by the public OpenStreetMap Nominatim search API. */
class NominatimGeocodingProvider implements GeocodingProvider {
  async search(query: string): Promise<PlaceResult[]> {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "6");

    const res = await fetch(url, {
      headers: {
        "User-Agent": "SpotShare/1.0 (temporary location sharing app)",
        "Accept-Language": "en",
      },
    });

    if (!res.ok) {
      throw new Error(`Geocoding provider responded with status ${res.status}`);
    }

    const data = (await res.json()) as Array<{
      place_id: number;
      display_name: string;
      lat: string;
      lon: string;
      name?: string;
      address?: Record<string, string>;
    }>;

    return data.map((item) => ({
      placeId: `osm-${item.place_id}`,
      name: item.name || item.display_name.split(",")[0],
      formattedAddress: item.display_name,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
    }));
  }
}

/** Live provider backed by Google's Places API (New) — Text Search. Requires an API key. */
class GooglePlacesProvider implements GeocodingProvider {
  constructor(private apiKey: string) {}

  async search(query: string): Promise<PlaceResult[]> {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({ textQuery: query, pageSize: 6 }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Places API responded with status ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      places?: Array<{
        id: string;
        formattedAddress: string;
        displayName?: { text: string };
        location: { latitude: number; longitude: number };
      }>;
    };

    return (data.places || []).map((place) => ({
      placeId: place.id,
      name: place.displayName?.text || place.formattedAddress.split(",")[0],
      formattedAddress: place.formattedAddress,
      latitude: place.location.latitude,
      longitude: place.location.longitude,
    }));
  }
}

/** Turns coordinates back into a readable place — always via the free Nominatim reverse
 *  API regardless of MAP_PROVIDER, since none of that needs a paid key and the forward-search
 *  provider choice doesn't matter here (the input is already exact coordinates). */
async function nominatimReverseGeocode(latitude: number, longitude: number): Promise<PlaceResult> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url, {
    headers: {
      "User-Agent": "SpotShare/1.0 (temporary location sharing app)",
      "Accept-Language": "en",
    },
  });

  if (!res.ok) {
    throw new Error(`Reverse geocoding responded with status ${res.status}`);
  }

  const item = (await res.json()) as {
    place_id?: number;
    display_name?: string;
    lat?: string;
    lon?: string;
    name?: string;
    error?: string;
  };

  if (!item.display_name) {
    throw new Error(item.error || "No reverse geocoding result for these coordinates");
  }

  return {
    placeId: `osm-${item.place_id}`,
    name: item.name || item.display_name.split(",")[0],
    formattedAddress: item.display_name,
    latitude: item.lat ? parseFloat(item.lat) : latitude,
    longitude: item.lon ? parseFloat(item.lon) : longitude,
  };
}

function pinnedLocationFallback(latitude: number, longitude: number): PlaceResult {
  const lat = latitude.toFixed(5);
  const lng = longitude.toFixed(5);
  return {
    placeId: `pin-${lat}-${lng}`,
    name: `Pinned location (${lat}, ${lng})`,
    formattedAddress: `Custom pinned location — ${lat}, ${lng}`,
    latitude,
    longitude,
  };
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<PlaceResult> {
  try {
    return await nominatimReverseGeocode(latitude, longitude);
  } catch (err) {
    // Offline dev, rate limit, or an ocean/remote spot with no address — still hand back
    // something usable so pasting coordinates never dead-ends.
    console.warn("Reverse geocoding failed, falling back to a generic pinned-location label:", err);
    return pinnedLocationFallback(latitude, longitude);
  }
}

function buildProvider(): GeocodingProvider {
  const providerName = (process.env.MAP_PROVIDER || "mock").toLowerCase();
  if (providerName === "nominatim") return new NominatimGeocodingProvider();
  if (providerName === "google") {
    const apiKey = process.env.GEOCODING_API_KEY;
    if (!apiKey) {
      console.warn("MAP_PROVIDER=google but GEOCODING_API_KEY is not set — falling back to mock provider.");
      return new MockGeocodingProvider();
    }
    return new GooglePlacesProvider(apiKey);
  }
  return new MockGeocodingProvider();
}

const provider = buildProvider();
const mockFallback = new MockGeocodingProvider();

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  try {
    return await provider.search(query);
  } catch (err) {
    // Live provider unreachable (offline dev, rate limit, etc.) — degrade gracefully
    // rather than breaking the search flow.
    console.warn("Geocoding provider failed, falling back to mock provider:", err);
    return mockFallback.search(query);
  }
}
