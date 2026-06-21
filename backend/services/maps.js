const AppError = require('../utils/AppError');
const { isLiveMode } = require('../config/runtime');
const { geoDistanceMeters } = require('./operationsPolicy');

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const DEFAULT_DEVIATION_METERS = 750;
const CACHE_LIMIT = 500;
const cache = new Map();
const OFFLINE_PLACES = {
  nairobi: { lat: -1.2864, lng: 36.8172, formattedAddress: 'Nairobi, Kenya' },
  mombasa: { lat: -4.0435, lng: 39.6682, formattedAddress: 'Mombasa, Kenya' },
  kisumu: { lat: -0.0917, lng: 34.768, formattedAddress: 'Kisumu, Kenya' },
  kampala: { lat: 0.3476, lng: 32.5825, formattedAddress: 'Kampala, Uganda' },
  'dar es salaam': { lat: -6.7924, lng: 39.2083, formattedAddress: 'Dar es Salaam, Tanzania' },
  arusha: { lat: -3.3869, lng: 36.683, formattedAddress: 'Arusha, Tanzania' },
  kigali: { lat: -1.9441, lng: 30.0619, formattedAddress: 'Kigali, Rwanda' },
  lagos: { lat: 6.5244, lng: 3.3792, formattedAddress: 'Lagos, Nigeria' },
  accra: { lat: 5.6037, lng: -0.187, formattedAddress: 'Accra, Ghana' },
  johannesburg: { lat: -26.2041, lng: 28.0473, formattedAddress: 'Johannesburg, South Africa' }
};

function configuredApiKey() {
  if (process.env.NODE_ENV === 'test' && process.env.MAPS_TEST_LIVE !== 'true') return '';
  return process.env.GOOGLE_MAPS_API_KEY || '';
}

function browserConfig() {
  return {
    provider: configuredApiKey() ? 'google' : 'fallback',
    apiKey: process.env.GOOGLE_MAPS_BROWSER_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '',
    mapId: process.env.GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'
  };
}

function cacheGet(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, item);
  return item.value;
}

function cacheSet(key, value, ttlMs) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return value;
}

function validCoordinates(value = {}) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function durationSeconds(value) {
  const match = String(value || '').match(/^([\d.]+)s$/);
  return match ? Math.round(Number(match[1])) : undefined;
}

function directRoute(origin, destination, intermediates = []) {
  const points = [origin, ...intermediates, destination].map(validCoordinates).filter(Boolean);
  let directMeters = 0;
  for (let index = 1; index < points.length; index += 1) {
    directMeters += geoDistanceMeters(points[index - 1], points[index]) || 0;
  }
  const distanceMeters = Math.max(1000, Math.round(directMeters * 1.22));
  const duration = Math.max(600, Math.round(distanceMeters / (55_000 / 3600)));
  return {
    provider: 'fallback',
    origin,
    destination,
    waypoints: intermediates,
    distanceMeters,
    durationSeconds: duration,
    staticDurationSeconds: duration,
    encodedPolyline: encodePolyline(points),
    optimizedIntermediateWaypointIndex: intermediates.map((_, index) => index),
    computedAt: new Date(),
    trafficAware: false
  };
}

async function fetchJson(url, options = {}) {
  if (typeof fetch !== 'function')
    throw new AppError('Maps integration requires a Node runtime with fetch support', 500);
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(Number(process.env.MAPS_TIMEOUT_MS) || 15_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError(data.error?.message || data.error_message || 'Maps provider request failed', 502, {
      providerStatus: response.status
    });
  }
  return data;
}

async function geocode(address, options = {}) {
  const text = String(address || '').trim();
  if (!text) throw new AppError('Address is required for geocoding', 422);
  const key = configuredApiKey();
  const cacheKey = `geocode:${text.toLowerCase()}:${String(options.region || '').toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  if (!key) {
    if (isLiveMode()) throw new AppError('GOOGLE_MAPS_API_KEY is required for live geocoding', 503);
    const normalized = text.toLowerCase();
    const match = Object.entries(OFFLINE_PLACES).find(([name]) => normalized.includes(name));
    return match ? { ...match[1], placeId: `offline:${match[0]}`, partialMatch: normalized !== match[0] } : null;
  }

  const url = new URL(GEOCODE_URL);
  url.searchParams.set('address', text);
  url.searchParams.set('key', key);
  if (options.region) url.searchParams.set('region', options.region);
  const data = await fetchJson(url);
  if (data.status !== 'OK' || !data.results?.length) {
    throw new AppError(`Unable to geocode address: ${text}`, 422, { providerStatus: data.status });
  }

  const result = data.results[0];
  return cacheSet(
    cacheKey,
    {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
      placeId: result.place_id,
      partialMatch: Boolean(result.partial_match)
    },
    6 * 60 * 60 * 1000
  );
}

async function coordinatesFor(value, fallbackAddress, options = {}) {
  const coordinates = validCoordinates(value);
  if (coordinates) return { ...coordinates, formattedAddress: fallbackAddress };
  return geocode(fallbackAddress, options);
}

function routeRequestBody(origin, destination, intermediates, options = {}) {
  return {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    intermediates: intermediates.map((point) => ({
      location: { latLng: { latitude: point.lat, longitude: point.lng } }
    })),
    travelMode: 'DRIVE',
    routingPreference: options.trafficAware === false ? 'TRAFFIC_UNAWARE' : 'TRAFFIC_AWARE',
    computeAlternativeRoutes: false,
    optimizeWaypointOrder: options.optimizeWaypointOrder === true && intermediates.length > 1,
    languageCode: options.languageCode || 'en-US',
    units: 'METRIC'
  };
}

async function computeRoute(input = {}) {
  const origin = await coordinatesFor(input.origin || input.pickupCoordinates, input.pickup, {
    region: input.region
  });
  const destination = await coordinatesFor(input.destination || input.destinationCoordinates, input.destination, {
    region: input.region
  });
  if (!origin || !destination) {
    throw new AppError('Pickup and destination coordinates are required for route calculation', 422);
  }

  const intermediateInputs = Array.isArray(input.intermediates) ? input.intermediates.slice(0, 23) : [];
  const intermediates = [];
  for (const waypoint of intermediateInputs) {
    const point = await coordinatesFor(waypoint, waypoint.address || waypoint.label, { region: input.region });
    if (point) intermediates.push(point);
  }

  const key = configuredApiKey();
  const requestBody = routeRequestBody(origin, destination, intermediates, input);
  const cacheKey = `route:${JSON.stringify(requestBody)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  if (!key) {
    if (isLiveMode()) throw new AppError('GOOGLE_MAPS_API_KEY is required for live route calculation', 503);
    return directRoute(origin, destination, intermediates);
  }

  const data = await fetchJson(ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.viewport,routes.optimizedIntermediateWaypointIndex'
    },
    body: JSON.stringify(requestBody)
  });
  const route = data.routes?.[0];
  if (!route) throw new AppError('Maps provider did not return a road route', 422);

  return cacheSet(
    cacheKey,
    {
      provider: 'google',
      origin,
      destination,
      waypoints: intermediates,
      distanceMeters: route.distanceMeters,
      durationSeconds: durationSeconds(route.duration),
      staticDurationSeconds: durationSeconds(route.staticDuration),
      encodedPolyline: route.polyline?.encodedPolyline,
      viewport: route.viewport,
      optimizedIntermediateWaypointIndex: route.optimizedIntermediateWaypointIndex || [],
      computedAt: new Date(),
      trafficAware: input.trafficAware !== false
    },
    5 * 60 * 1000
  );
}

function decodePolyline(encoded = '') {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function encodeSigned(value) {
  let number = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (number >= 0x20) {
    output += String.fromCharCode((0x20 | (number & 0x1f)) + 63);
    number >>= 5;
  }
  return output + String.fromCharCode(number + 63);
}

function encodePolyline(points = []) {
  let previousLat = 0;
  let previousLng = 0;
  return points
    .map((point) => {
      const lat = Math.round(Number(point.lat) * 1e5);
      const lng = Math.round(Number(point.lng) * 1e5);
      const encoded = encodeSigned(lat - previousLat) + encodeSigned(lng - previousLng);
      previousLat = lat;
      previousLng = lng;
      return encoded;
    })
    .join('');
}

function projectedPointDistance(point, start, end) {
  const latScale = 111_320;
  const lngScale = Math.cos((point.lat * Math.PI) / 180) * 111_320;
  const ax = (start.lng - point.lng) * lngScale;
  const ay = (start.lat - point.lat) * latScale;
  const bx = (end.lng - point.lng) * lngScale;
  const by = (end.lat - point.lat) * latScale;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { distanceMeters: Math.sqrt(x * x + y * y), fraction: t };
}

function routeProjection(encodedPolyline, location) {
  const point = validCoordinates(location);
  const path = decodePolyline(encodedPolyline);
  if (!point || path.length < 2) return null;

  const segmentLengths = [];
  let pathMeters = 0;
  for (let index = 1; index < path.length; index += 1) {
    const length = geoDistanceMeters(path[index - 1], path[index]) || 0;
    segmentLengths.push(length);
    pathMeters += length;
  }

  let best = { distanceMeters: Infinity, progressMeters: 0 };
  let traversed = 0;
  for (let index = 1; index < path.length; index += 1) {
    const projection = projectedPointDistance(point, path[index - 1], path[index]);
    if (projection.distanceMeters < best.distanceMeters) {
      best = {
        distanceMeters: Math.round(projection.distanceMeters),
        progressMeters: traversed + segmentLengths[index - 1] * projection.fraction
      };
    }
    traversed += segmentLengths[index - 1];
  }

  return {
    ...best,
    pathMeters,
    progressRatio: pathMeters ? Math.max(0, Math.min(1, best.progressMeters / pathMeters)) : 0
  };
}

function routeTelemetry(booking, location, now = new Date()) {
  const route = booking.routePlan || {};
  if (!route.encodedPolyline || !validCoordinates(location)) return null;
  const projection = routeProjection(route.encodedPolyline, location);
  if (!projection) return null;

  const totalDistance = Number(route.distanceMeters || projection.pathMeters);
  const progressDistance = totalDistance * projection.progressRatio;
  const remainingDistanceMeters = Math.max(0, Math.round(totalDistance - progressDistance));
  const routeDuration = Number(route.durationSeconds || route.staticDurationSeconds || 0);
  const remainingDurationSeconds = routeDuration
    ? Math.max(0, Math.round(routeDuration * (1 - projection.progressRatio)))
    : Math.max(0, Math.round(remainingDistanceMeters / (50_000 / 3600)));
  const thresholdMeters = Number(route.deviationThresholdMeters || DEFAULT_DEVIATION_METERS);
  const isDeviated = projection.distanceMeters > thresholdMeters;
  const previous = booking.routeDeviation || {};
  const alertCooldownMs = (Number(process.env.ROUTE_DEVIATION_ALERT_COOLDOWN_MINUTES) || 30) * 60 * 1000;
  const shouldAlert =
    isDeviated &&
    (!previous.isDeviated ||
      !previous.lastAlertedAt ||
      now.getTime() - new Date(previous.lastAlertedAt).getTime() >= alertCooldownMs);

  return {
    eta: {
      estimatedArrivalAt: new Date(now.getTime() + remainingDurationSeconds * 1000),
      remainingDistanceMeters,
      remainingDurationSeconds,
      updatedAt: now,
      trafficAware: Boolean(route.trafficAware)
    },
    routeDeviation: {
      isDeviated,
      distanceMeters: projection.distanceMeters,
      thresholdMeters,
      detectedAt: isDeviated ? previous.detectedAt || now : undefined,
      lastAlertedAt: shouldAlert ? now : previous.lastAlertedAt,
      recoveredAt: !isDeviated && previous.isDeviated ? now : previous.recoveredAt
    },
    shouldAlert,
    recovered: !isDeviated && previous.isDeviated === true,
    progressRatio: projection.progressRatio
  };
}

async function enrichRoute(input = {}) {
  const route = await computeRoute(input);
  return {
    pickup: input.pickup || route.origin.formattedAddress,
    destination: input.destination || route.destination.formattedAddress,
    pickupCoordinates: { lat: route.origin.lat, lng: route.origin.lng },
    destinationCoordinates: { lat: route.destination.lat, lng: route.destination.lng },
    distance: Number((route.distanceMeters / 1000).toFixed(1)),
    routePlan: {
      ...route,
      deviationThresholdMeters: Number(input.deviationThresholdMeters || DEFAULT_DEVIATION_METERS)
    },
    eta: {
      estimatedArrivalAt: new Date(Date.now() + Number(route.durationSeconds || 0) * 1000),
      remainingDistanceMeters: route.distanceMeters,
      remainingDurationSeconds: route.durationSeconds,
      updatedAt: new Date(),
      trafficAware: Boolean(route.trafficAware)
    }
  };
}

module.exports = {
  DEFAULT_DEVIATION_METERS,
  browserConfig,
  computeRoute,
  decodePolyline,
  encodePolyline,
  enrichRoute,
  geocode,
  routeProjection,
  routeTelemetry,
  validCoordinates
};
