import { api } from "./api";
import type { DashboardStats } from "../types";

export function getDashboardStats(range: number = 7) {
  return api.get<DashboardStats>(`/dashboard/stats?range=${range}`);
}
