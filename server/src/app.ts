import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { generalLimiter } from "./middleware/rateLimiter";
import locationsRouter from "./routes/locations";
import sharesRouter from "./routes/shares";
import activityRouter from "./routes/activity";
import dashboardRouter from "./routes/dashboard";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN?.split(",") || "*",
    })
  );
  app.use(express.json({ limit: "50kb" }));
  app.set("trust proxy", 1);
  app.use(generalLimiter);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/locations", locationsRouter);
  app.use("/api/shares", sharesRouter);
  app.use("/api/activity", activityRouter);
  app.use("/api/dashboard", dashboardRouter);

  app.use("/api", notFoundHandler);
  app.use(errorHandler);

  return app;
}
