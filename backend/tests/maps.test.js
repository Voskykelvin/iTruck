const {
  computeRoute,
  decodePolyline,
  encodePolyline,
  geocode,
  routeProjection,
  routeTelemetry
} = require('../services/maps');

beforeEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
});

test('offline geocoding resolves supported African logistics hubs', async () => {
  await expect(geocode('Nairobi, Kenya')).resolves.toEqual(
    expect.objectContaining({ lat: -1.2864, lng: 36.8172, formattedAddress: 'Nairobi, Kenya' })
  );
});

test('fallback routing returns road-adjusted distance, duration, and polyline', async () => {
  const route = await computeRoute({
    origin: { lat: -1.2864, lng: 36.8172 },
    destinationCoordinates: { lat: -0.0917, lng: 34.768 }
  });

  expect(route.provider).toBe('fallback');
  expect(route.distanceMeters).toBeGreaterThan(250_000);
  expect(route.durationSeconds).toBeGreaterThan(3600);
  expect(decodePolyline(route.encodedPolyline)).toHaveLength(2);
});

test('polyline encoding round trips route coordinates', () => {
  const points = [
    { lat: -1.2864, lng: 36.8172 },
    { lat: -0.3031, lng: 36.08 },
    { lat: 0.3476, lng: 32.5825 }
  ];
  expect(decodePolyline(encodePolyline(points))).toEqual(points);
});

test('route projection and telemetry detect deviations and update ETA', () => {
  const encodedPolyline = encodePolyline([
    { lat: -1.2864, lng: 36.8172 },
    { lat: -0.0917, lng: 34.768 }
  ]);
  const projection = routeProjection(encodedPolyline, { lat: -0.7, lng: 35.8 });
  expect(projection.progressRatio).toBeGreaterThan(0);
  expect(projection.progressRatio).toBeLessThan(1);

  const update = routeTelemetry(
    {
      routePlan: {
        encodedPolyline,
        distanceMeters: 350_000,
        durationSeconds: 25_000,
        deviationThresholdMeters: 500,
        trafficAware: true
      },
      routeDeviation: { isDeviated: false }
    },
    { lat: -0.7, lng: 36.4 },
    new Date('2026-06-21T12:00:00.000Z')
  );

  expect(update.shouldAlert).toBe(true);
  expect(update.routeDeviation.isDeviated).toBe(true);
  expect(update.eta.remainingDistanceMeters).toBeGreaterThan(0);
  expect(update.eta.estimatedArrivalAt).toBeInstanceOf(Date);
});
