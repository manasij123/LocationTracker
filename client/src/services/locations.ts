import { api } from "./api";
import type { PlaceResult } from "../types";

export function searchLocations(query: string) {
  return api.post<{ results: PlaceResult[] }>("/locations/search", { query });
}

export function reverseGeocodeLocation(latitude: number, longitude: number) {
  return api.post<{ result: PlaceResult }>("/locations/reverse-geocode", { latitude, longitude });
}
