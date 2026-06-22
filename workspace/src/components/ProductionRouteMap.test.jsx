import { describe, expect, it } from 'vitest';
import { decodeRoutePolyline } from './ProductionRouteMap.jsx';

describe('production route polyline decoding', () => {
  it('decodes the Google encoded-polyline reference path', () => {
    expect(decodeRoutePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 }
    ]);
  });

  it('returns an empty route for empty input', () => {
    expect(decodeRoutePolyline('')).toEqual([]);
  });
});
