import { api } from "./api";
import type { ActivityEvent } from "../types";

export function getActivity(type?: string) {
  const qs = type && type !== "all" ? `?type=${type}` : "";
  return api.get<{ events: ActivityEvent[] }>(`/activity${qs}`);
}
