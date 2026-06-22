import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

let googleMapsLoader;

function latestTrackingPoint(shipment) {
  const points = shipment?.tracking || [];
  return [...points]
    .reverse()
    .find((point) => [point?.lat, point?.lng].every((value) => Number.isFinite(Number(value))));
}

function loadGoogleMaps(apiKey) {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (googleMapsLoader) return googleMapsLoader;
  googleMapsLoader = new Promise((resolve, reject) => {
    const callback = `itruckMapsReady_${Date.now()}`;
    window[callback] = () => {
      delete window[callback];
      resolve(window.google.maps);
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=${callback}`;
    script.async = true;
    script.onerror = () => {
      delete window[callback];
      googleMapsLoader = null;
      reject(new Error('Google Maps could not load'));
    };
    document.head.appendChild(script);
  });
  return googleMapsLoader;
}

export function decodeRoutePolyline(encoded = '') {
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

export default function ProductionRouteMap({ shipment }) {
  const mapRef = useRef(null);
  const [fallback, setFallback] = useState(false);
  const latest = latestTrackingPoint(shipment);

  useEffect(() => {
    let active = true;
    const overlays = [];
    async function renderMap() {
      const config = await api.mapsConfig();
      if (!config.apiKey || !shipment?.routePlan?.encodedPolyline) {
        if (active) setFallback(true);
        return;
      }
      await loadGoogleMaps(config.apiKey);
      const [{ Map: GoogleMap, Polyline }, { AdvancedMarkerElement }] = await Promise.all([
        window.google.maps.importLibrary('maps'),
        window.google.maps.importLibrary('marker')
      ]);
      if (!active || !mapRef.current) return;
      const path = decodeRoutePolyline(shipment.routePlan.encodedPolyline);
      const center = latest || path[0] || shipment.pickupCoordinates || shipment.destinationCoordinates;
      const map = new GoogleMap(mapRef.current, {
        center,
        zoom: 7,
        mapId: config.mapId || 'DEMO_MAP_ID',
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true
      });
      overlays.push(
        new Polyline({
          map,
          path,
          strokeColor: shipment.routeDeviation?.isDeviated ? '#dc2626' : '#0b7a53',
          strokeOpacity: 0.9,
          strokeWeight: 5
        })
      );
      [
        [shipment.pickupCoordinates || path[0], `Pickup: ${shipment.origin}`],
        [shipment.destinationCoordinates || path.at(-1), `Delivery: ${shipment.destination}`],
        [latest, `Truck: ${shipment.plate}`]
      ].forEach(([position, title]) => {
        if (position) overlays.push(new AdvancedMarkerElement({ map, position, title }));
      });
      const bounds = new window.google.maps.LatLngBounds();
      path.forEach((point) => bounds.extend(point));
      if (latest) bounds.extend(latest);
      if (!bounds.isEmpty()) map.fitBounds(bounds, 42);
      setFallback(false);
    }
    renderMap().catch(() => active && setFallback(true));
    return () => {
      active = false;
      overlays.forEach((overlay) => {
        if ('map' in overlay) overlay.map = null;
        else overlay.setMap?.(null);
      });
    };
  }, [
    latest,
    latest?.lat,
    latest?.lng,
    shipment?.bookingId,
    shipment?.destination,
    shipment?.destinationCoordinates,
    shipment?.origin,
    shipment?.plate,
    shipment?.pickupCoordinates,
    shipment?.routeDeviation?.isDeviated,
    shipment?.routePlan?.encodedPolyline
  ]);

  if (fallback) {
    const mapUrl = `https://www.google.com/maps?output=embed&saddr=${encodeURIComponent(shipment.origin)}&daddr=${encodeURIComponent(shipment.destination)}&dirflg=d`;
    return <iframe title="Shipment route" src={mapUrl} loading="lazy" />;
  }
  return <div className="production-route-map" ref={mapRef} aria-label={`Road route for ${shipment.route}`} />;
}
