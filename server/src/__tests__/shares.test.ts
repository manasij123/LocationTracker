import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../prisma";

const app = createApp();

describe("SpotShare API", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("searches for a location", async () => {
    const res = await request(app).post("/api/locations/search").send({ query: "TCS Gitobitan" });
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results[0]).toHaveProperty("latitude");
    expect(res.body.results[0]).toHaveProperty("longitude");
  });

  it("rejects an empty search query", async () => {
    const res = await request(app).post("/api/locations/search").send({ query: "" });
    expect(res.status).toBe(400);
  });

  it("reverse-geocodes coordinates to a place", async () => {
    const res = await request(app)
      .post("/api/locations/reverse-geocode")
      .send({ latitude: 22.5744, longitude: 88.4331 });
    expect(res.status).toBe(200);
    expect(res.body.result).toHaveProperty("placeId");
    expect(typeof res.body.result.formattedAddress).toBe("string");
    expect(res.body.result.latitude).toBeCloseTo(22.5744, 1);
    expect(res.body.result.longitude).toBeCloseTo(88.4331, 1);
  });

  it("rejects out-of-range coordinates for reverse geocoding", async () => {
    const res = await request(app)
      .post("/api/locations/reverse-geocode")
      .send({ latitude: 999, longitude: 88.4331 });
    expect(res.status).toBe(400);
  });

  it("creates a share, retrieves it publicly, tracks an open, then revokes it", async () => {
    const createRes = await request(app)
      .post("/api/shares")
      .send({
        placeName: "Test Plaza",
        formattedAddress: "Test Plaza, Test City",
        latitude: 22.57,
        longitude: 88.36,
        durationMinutes: 30,
        note: "Meet by the fountain",
      });
    expect(createRes.status).toBe(201);
    const shareId = createRes.body.share.id as string;
    expect(createRes.body.share.status).toBe("active");
    expect(createRes.body.share.note).toBe("Meet by the fountain");

    const publicRes = await request(app).get(`/api/shares/${shareId}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.share.status).toBe("active");
    expect(publicRes.body.share.latitude).toBe(22.57);
    expect(publicRes.body).toHaveProperty("serverTime");

    const openRes = await request(app).post(`/api/shares/${shareId}/open`).send({});
    expect(openRes.status).toBe(201);
    expect(openRes.body.recorded).toBe(true);

    const analyticsRes = await request(app).get(`/api/shares/${shareId}/analytics`);
    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body.totalOpens).toBe(1);
    expect(analyticsRes.body.uniqueVisitors).toBe(1);

    const revokeRes = await request(app).post(`/api/shares/${shareId}/revoke`);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.share.status).toBe("revoked");

    const afterRevoke = await request(app).get(`/api/shares/${shareId}`);
    expect(afterRevoke.body.share.status).toBe("revoked");
    expect(afterRevoke.body.share).not.toHaveProperty("latitude");

    const secondRevoke = await request(app).post(`/api/shares/${shareId}/revoke`);
    expect(secondRevoke.status).toBe(400);
  });

  it("does not record an open for an already-expired share", async () => {
    const createRes = await request(app)
      .post("/api/shares")
      .send({
        placeName: "Soon Expired",
        formattedAddress: "Somewhere",
        latitude: 22.5,
        longitude: 88.3,
        durationMinutes: 1,
      });
    const shareId = createRes.body.share.id as string;

    await prisma.share.update({
      where: { publicToken: shareId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const publicRes = await request(app).get(`/api/shares/${shareId}`);
    expect(publicRes.body.share.status).toBe("expired");

    const openRes = await request(app).post(`/api/shares/${shareId}/open`).send({});
    expect(openRes.body.recorded).toBe(false);
    expect(openRes.body.status).toBe("expired");
  });

  it("returns 404 for an unknown share token", async () => {
    const res = await request(app).get("/api/shares/doesnotexist123");
    expect(res.status).toBe(404);
  });

  it("rejects creating a share without a duration or expiresAt", async () => {
    const res = await request(app)
      .post("/api/shares")
      .send({ placeName: "X", formattedAddress: "Y", latitude: 1, longitude: 1 });
    expect(res.status).toBe(400);
  });

  it("lists the creator's shares and dashboard stats reflect them", async () => {
    const listRes = await request(app).get("/api/shares");
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.shares)).toBe(true);
    expect(listRes.body.shares.length).toBeGreaterThan(0);

    const statsRes = await request(app).get("/api/dashboard/stats");
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.totalShares).toBeGreaterThan(0);
    expect(statsRes.body).toHaveProperty("shareActivity");
  });

  it("returns activity events for the creator", async () => {
    const res = await request(app).get("/api/activity?limit=5");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeLessThanOrEqual(5);
  });

  it("updates an active share's location without changing its link or expiry", async () => {
    const createRes = await request(app)
      .post("/api/shares")
      .send({
        placeName: "Old Spot",
        formattedAddress: "Old Address",
        latitude: 22.5,
        longitude: 88.3,
        durationMinutes: 30,
      });
    const shareId = createRes.body.share.id as string;
    const originalExpiresAt = createRes.body.share.expiresAt;

    const updateRes = await request(app)
      .post(`/api/shares/${shareId}/location`)
      .send({
        placeName: "New Spot",
        formattedAddress: "New Address",
        latitude: 22.61,
        longitude: 88.47,
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.share.placeName).toBe("New Spot");
    expect(updateRes.body.share.latitude).toBe(22.61);
    expect(updateRes.body.share.id).toBe(shareId);
    expect(updateRes.body.share.expiresAt).toBe(originalExpiresAt);

    const publicRes = await request(app).get(`/api/shares/${shareId}`);
    expect(publicRes.body.share.placeName).toBe("New Spot");
    expect(publicRes.body.share.latitude).toBe(22.61);

    const activityRes = await request(app).get("/api/activity?type=shares&limit=5");
    expect(activityRes.body.events.some((e: any) => e.type === "location_updated")).toBe(true);
  });

  it("keeps every past point in locationHistory as a share gets updated repeatedly", async () => {
    const createRes = await request(app)
      .post("/api/shares")
      .send({
        placeName: "Point A",
        formattedAddress: "Address A",
        latitude: 22.5,
        longitude: 88.3,
        durationMinutes: 30,
      });
    const shareId = createRes.body.share.id as string;

    await request(app)
      .post(`/api/shares/${shareId}/location`)
      .send({ placeName: "Point B", formattedAddress: "Address B", latitude: 22.55, longitude: 88.35 });
    await request(app)
      .post(`/api/shares/${shareId}/location`)
      .send({ placeName: "Point C", formattedAddress: "Address C", latitude: 22.6, longitude: 88.4 });

    const publicRes = await request(app).get(`/api/shares/${shareId}`);
    expect(publicRes.body.share.placeName).toBe("Point C");
    expect(publicRes.body.share.locationHistory).toHaveLength(2);
    expect(publicRes.body.share.locationHistory[0].placeName).toBe("Point A");
    expect(publicRes.body.share.locationHistory[1].placeName).toBe("Point B");
  });

  it("stores a creator-supplied travel duration override for a location update", async () => {
    const createRes = await request(app)
      .post("/api/shares")
      .send({ placeName: "Origin", formattedAddress: "Origin Addr", latitude: 22.5, longitude: 88.3, durationMinutes: 30 });
    const shareId = createRes.body.share.id as string;

    await request(app)
      .post(`/api/shares/${shareId}/location`)
      .send({
        placeName: "Destination",
        formattedAddress: "Destination Addr",
        latitude: 22.55,
        longitude: 88.35,
        travelDurationSeconds: 600,
      });

    const publicRes = await request(app).get(`/api/shares/${shareId}`);
    expect(publicRes.body.share.locationHistory).toHaveLength(1);
    expect(publicRes.body.share.locationHistory[0].placeName).toBe("Origin");
    expect(publicRes.body.share.locationHistory[0].travelDurationSeconds).toBe(600);
  });

  it("stores a creator-chosen travel mode for a location update", async () => {
    const createRes = await request(app)
      .post("/api/shares")
      .send({ placeName: "Origin", formattedAddress: "Origin Addr", latitude: 22.5, longitude: 88.3, durationMinutes: 30 });
    const shareId = createRes.body.share.id as string;

    await request(app)
      .post(`/api/shares/${shareId}/location`)
      .send({
        placeName: "Destination",
        formattedAddress: "Destination Addr",
        latitude: 22.55,
        longitude: 88.35,
        travelMode: "walking",
      });

    const publicRes = await request(app).get(`/api/shares/${shareId}`);
    expect(publicRes.body.share.locationHistory[0].travelMode).toBe("walking");
  });

  it("rejects an invalid travel mode for a location update", async () => {
    const createRes = await request(app)
      .post("/api/shares")
      .send({ placeName: "Origin", formattedAddress: "Origin Addr", latitude: 22.5, longitude: 88.3, durationMinutes: 30 });
    const shareId = createRes.body.share.id as string;

    const res = await request(app)
      .post(`/api/shares/${shareId}/location`)
      .send({
        placeName: "Destination",
        formattedAddress: "Destination Addr",
        latitude: 22.55,
        longitude: 88.35,
        travelMode: "teleport",
      });
    expect(res.status).toBe(400);
  });

  it("rejects a location update on a revoked share", async () => {
    const createRes = await request(app)
      .post("/api/shares")
      .send({ placeName: "X", formattedAddress: "Y", latitude: 1, longitude: 1, durationMinutes: 30 });
    const shareId = createRes.body.share.id as string;
    await request(app).post(`/api/shares/${shareId}/revoke`);

    const updateRes = await request(app)
      .post(`/api/shares/${shareId}/location`)
      .send({ placeName: "Z", formattedAddress: "W", latitude: 2, longitude: 2 });
    expect(updateRes.status).toBe(400);
  });
});
