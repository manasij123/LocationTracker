import type { Request, Response } from "express";
import { searchSchema } from "../utils/validation";
import { searchPlaces } from "../services/geocoding";

export async function search(req: Request, res: Response) {
  const { query } = searchSchema.parse(req.body);
  const results = await searchPlaces(query);
  res.json({ results });
}
