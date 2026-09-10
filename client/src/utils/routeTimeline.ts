import { distanceKm } from "./geo";

// Every function here that references `google.maps.*` is a plain function body, evaluated only
// when called — never at module scope — since the Google Maps JS SDK may not have loaded yet
// when this file is first imported. Callers must only invoke these after the SDK has loaded.

export interface RouteStep {
  path: google.maps.LatLngLiteral[];
  durationSeconds: number;
}

export interface RouteTimeline {
  /** Each leg of the trip (e.g. walk, then train, then walk) with its own realistic duration,
   *  so playback can move at a different pace per leg instead of one constant speed. */
  steps: RouteStep[];
  /** All steps' paths concatenated, for drawing the whole route as one line. */
  path: google.maps.LatLngLiteral[];
  totalDurationSeconds: number;
}

/** Real duration for a route: traffic-adjusted (`duration_in_traffic`) when asked for and
 *  available, else the plain historical-average `duration` — summed across legs (normally one). */
function routeDurationSeconds(route: google.maps.DirectionsRoute, preferTraffic: boolean): number {
  return route.legs.reduce((sum, leg) => {
    const value = preferTraffic ? leg.duration_in_traffic?.value ?? leg.duration?.value : leg.duration?.value;
    return sum + (value ?? 0);
  }, 0);
}

function fastestRoute(routes: google.maps.DirectionsRoute[], preferTraffic: boolean): google.maps.DirectionsRoute {
  return routes.reduce((best, route) =>
    routeDurationSeconds(route, preferTraffic) < routeDurationSeconds(best, preferTraffic) ? route : best
  );
}

function buildTimelineFromRoute(
  route: google.maps.DirectionsRoute,
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral,
  /** Use this as the total instead of the natural sum of step durations (e.g. a traffic-
   *  adjusted leg duration Directions only reports at the leg level, not per-step) — every
   *  step's duration is rescaled proportionally so they still add up to it. */
  totalDurationOverrideSeconds?: number
): RouteTimeline {
  const steps: RouteStep[] = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      const stepPath =
        step.path && step.path.length > 0
          ? step.path.map((p) => ({ lat: p.lat(), lng: p.lng() }))
          : [
              { lat: step.start_location.lat(), lng: step.start_location.lng() },
              { lat: step.end_location.lat(), lng: step.end_location.lng() },
            ];
      steps.push({ path: stepPath, durationSeconds: step.duration?.value ?? 0 });
    }
  }
  // Pin the very first and last points to the exact requested coordinates — Directions snaps
  // to the nearest road/stop, which can otherwise leave a visible gap at either end.
  if (steps.length > 0) {
    steps[0].path[0] = origin;
    const lastStep = steps[steps.length - 1];
    lastStep.path[lastStep.path.length - 1] = destination;
  }
  const naturalTotal = steps.reduce((sum, s) => sum + s.durationSeconds, 0) || 1;
  if (totalDurationOverrideSeconds != null && totalDurationOverrideSeconds > 0) {
    const scale = totalDurationOverrideSeconds / naturalTotal;
    for (const s of steps) s.durationSeconds *= scale;
    return { steps, path: steps.flatMap((s) => s.path), totalDurationSeconds: totalDurationOverrideSeconds };
  }
  return { steps, path: steps.flatMap((s) => s.path), totalDurationSeconds: naturalTotal };
}

/** Fetches the fastest driving route right now — with live traffic conditions factored in via
 *  drivingOptions, same as what Google Maps' own "Fastest route now" reflects — used when no
 *  transit coverage exists for a pair of points. Resolves to null if no route is available. */
export function fetchDrivingTimeline(
  service: google.maps.DirectionsService,
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral
): Promise<RouteTimeline | null> {
  return new Promise((resolve) => {
    service.route(
      {
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
        drivingOptions: { departureTime: new Date(), trafficModel: google.maps.TrafficModel.BEST_GUESS },
      },
      (result, status) => {
        if (status !== google.maps.DirectionsStatus.OK || !result || result.routes.length === 0) {
          resolve(null);
          return;
        }
        const fastest = fastestRoute(result.routes, true);
        resolve(buildTimelineFromRoute(fastest, origin, destination, routeDurationSeconds(fastest, true)));
      }
    );
  });
}

/** Fetches the fastest public-transit route (bus/train/metro), trying every alternative Google
 *  offers and keeping the quickest — a direct two-stop train can otherwise get passed over for
 *  whatever route Directions returns first. Resolves to null if there's no transit coverage. */
function fetchTransitTimeline(
  service: google.maps.DirectionsService,
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral
): Promise<RouteTimeline | null> {
  return new Promise((resolve) => {
    service.route(
      { origin, destination, travelMode: google.maps.TravelMode.TRANSIT, provideRouteAlternatives: true },
      (result, status) => {
        if (status !== google.maps.DirectionsStatus.OK || !result || result.routes.length === 0) {
          resolve(null);
          return;
        }
        resolve(buildTimelineFromRoute(fastestRoute(result.routes, false), origin, destination));
      }
    );
  });
}

/** Fetches a realistic, real-world-paced route between two points: walking + public transit
 *  (bus/train/metro) legs when available — exactly what Google Maps shows for "how long would
 *  this actually take" — falling back to the fastest-right-now driving route when there's no
 *  transit coverage for this pair (e.g. a short local hop, or a region with sparse transit data).
 *  Resolves to null (never rejects) only if neither mode returns anything usable. */
export function fetchRouteTimeline(
  service: google.maps.DirectionsService,
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral
): Promise<RouteTimeline | null> {
  return fetchTransitTimeline(service, origin, destination).then(
    (timeline) => timeline ?? fetchDrivingTimeline(service, origin, destination)
  );
}

export function fetchSingleModeTimeline(
  service: google.maps.DirectionsService,
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral,
  mode: google.maps.TravelMode
): Promise<RouteTimeline | null> {
  return new Promise((resolve) => {
    service.route({ origin, destination, travelMode: mode }, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK && result && result.routes[0]) {
        resolve(buildTimelineFromRoute(result.routes[0], origin, destination));
      } else {
        resolve(null);
      }
    });
  });
}

/** Fetches a route for a creator-chosen travel mode (set per-segment via LocationHistory's
 *  travelMode) if one was given, otherwise the usual auto-detected transit-else-driving route. */
export function fetchRouteTimelineForSegment(
  service: google.maps.DirectionsService,
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral,
  travelMode?: string | null
): Promise<RouteTimeline | null> {
  switch (travelMode) {
    case "driving":
      return fetchDrivingTimeline(service, origin, destination);
    case "walking":
      return fetchSingleModeTimeline(service, origin, destination, google.maps.TravelMode.WALKING);
    case "bicycling":
      return fetchSingleModeTimeline(service, origin, destination, google.maps.TravelMode.BICYCLING);
    case "transit":
      return fetchTransitTimeline(service, origin, destination);
    default:
      return fetchRouteTimeline(service, origin, destination);
  }
}

/** Plays back at the real, estimated pace — a 7-minute walk's glide takes 7 real minutes and
 *  arrives exactly on that mark, matching what Google Maps' own "how long will this take"
 *  estimate says, rather than a compressed preview. */
export function playbackDurationMs(totalDurationSeconds: number): number {
  return Math.max(500, totalDurationSeconds * 1000);
}

/** The portion of a path from its start up to a given fraction of its length, by cumulative
 *  great-circle distance (so speed is constant across a path's own points, which approximates
 *  real motion well within a single step of a trip) — the last point is the exact interpolated
 *  position at that fraction. Used both to find "where is it right now" (last element) and to
 *  draw the trail already covered (the whole returned array). */
export function pathUpToFraction(path: google.maps.LatLngLiteral[], fraction: number): google.maps.LatLngLiteral[] {
  if (path.length === 1) return [path[0]];
  const cumulative = [0];
  for (let i = 1; i < path.length; i++) {
    cumulative.push(cumulative[i - 1] + distanceKm(path[i - 1].lat, path[i - 1].lng, path[i].lat, path[i].lng));
  }
  const total = cumulative[cumulative.length - 1] || 1;
  const target = Math.min(1, Math.max(0, fraction)) * total;
  const covered: google.maps.LatLngLiteral[] = [path[0]];
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < target) {
    covered.push(path[i]);
    i++;
  }
  const segFrom = path[i - 1];
  const segTo = path[i];
  const segLen = cumulative[i] - cumulative[i - 1];
  const segFraction = segLen > 0 ? (target - cumulative[i - 1]) / segLen : 0;
  covered.push({
    lat: segFrom.lat + (segTo.lat - segFrom.lat) * segFraction,
    lng: segFrom.lng + (segTo.lng - segFrom.lng) * segFraction,
  });
  return covered;
}

/** Every point of the route already "traveled" by a given elapsed time — every fully-completed
 *  step's whole path, plus the partial distance into whichever step is current. Feeding this
 *  into a polyline every frame makes the route line grow behind the marker as it moves, instead
 *  of the whole line appearing before the marker has gone anywhere. */
export function coveredPathUpTo(steps: RouteStep[], elapsedSeconds: number): google.maps.LatLngLiteral[] {
  const result: google.maps.LatLngLiteral[] = [];
  let acc = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (elapsedSeconds <= acc + step.durationSeconds || i === steps.length - 1) {
      const localFraction = step.durationSeconds > 0 ? (elapsedSeconds - acc) / step.durationSeconds : 1;
      result.push(...pathUpToFraction(step.path, localFraction));
      return result;
    }
    result.push(...step.path);
    acc += step.durationSeconds;
  }
  return result;
}

/** The marker's position at a given point in *real* elapsed trip time — finds which step that
 *  moment falls in (e.g. still walking, or now on the train) and interpolates within it. This
 *  is what makes playback speed vary realistically: a step covering a lot of ground in a short
 *  real duration (a train ride) visibly moves faster than one covering little ground over a
 *  long duration (a walk), because both are being played back at the same time-compression. */
export function pointAtElapsedSeconds(steps: RouteStep[], elapsedSeconds: number): google.maps.LatLngLiteral {
  const covered = coveredPathUpTo(steps, elapsedSeconds);
  return covered[covered.length - 1];
}

/** Rescales every step's duration proportionally so the timeline's total matches a
 *  creator-supplied override, while keeping each step's relative pace (e.g. still slower
 *  while "walking" than while "on the train") exactly as Google estimated it. */
export function applyDurationOverride(timeline: RouteTimeline, overrideSeconds: number): RouteTimeline {
  const scale = timeline.totalDurationSeconds > 0 ? overrideSeconds / timeline.totalDurationSeconds : 1;
  return {
    ...timeline,
    steps: timeline.steps.map((s) => ({ ...s, durationSeconds: s.durationSeconds * scale })),
    totalDurationSeconds: overrideSeconds,
  };
}

export interface PastTransition {
  latitude: number;
  longitude: number;
  /** When this transition started (i.e. when the point above stopped being current). */
  updatedAt: string;
  travelDurationSeconds?: number | null;
  travelMode?: string | null;
}

/** Where a still-possibly-in-flight transition realistically stands *right now* — used when
 *  chaining a new location update onto one whose real travel time may not have elapsed yet, so
 *  the new update's "how long from here" estimate starts from wherever the creator actually is,
 *  not from a destination they haven't really reached. Falls back to `to` (the recorded
 *  destination) if the transition's time already elapsed, or the route can't be determined. */
export async function resolveCurrentPosition(
  service: google.maps.DirectionsService,
  from: PastTransition,
  to: google.maps.LatLngLiteral
): Promise<google.maps.LatLngLiteral> {
  const elapsedSeconds = (Date.now() - new Date(from.updatedAt).getTime()) / 1000;
  if (elapsedSeconds <= 0) {
    return { lat: from.latitude, lng: from.longitude };
  }

  const origin = { lat: from.latitude, lng: from.longitude };
  const timeline = await fetchRouteTimelineForSegment(service, origin, to, from.travelMode);
  if (!timeline) return to;

  const finalTimeline =
    from.travelDurationSeconds != null ? applyDurationOverride(timeline, from.travelDurationSeconds) : timeline;
  if (elapsedSeconds >= finalTimeline.totalDurationSeconds) return to;

  return pointAtElapsedSeconds(finalTimeline.steps, elapsedSeconds);
}
