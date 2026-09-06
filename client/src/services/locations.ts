import { api } from "./api";
import type { PlaceResult } from "../types";

export function searchLocations(query: string) {
  return api.post<{ results: PlaceResult[] }>("/locations/search", { query });
}
