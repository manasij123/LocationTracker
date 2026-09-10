import type { Request, Response } from "express";
import { searchSchema, reverseGeocodeSchema } from "../utils/validation";
import { searchPlaces, reverseGeocode } from "../services/geocoding";

export async function search(req: Request, res: Response) {
  const { query } = searchSchema.parse(req.body);
  const results = await searchPlaces(query);
  res.json({ results });
}

export async function reverseGeocodeLocation(req: Request, res: Response) {
  const { latitude, longitude } = reverseGeocodeSchema.parse(req.body);
  const result = await reverseGeocode(latitude, longitude);
  res.json({ result });
}
