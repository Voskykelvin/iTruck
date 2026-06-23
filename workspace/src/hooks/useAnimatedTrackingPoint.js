import { useEffect, useRef, useState } from 'react';

export default function useAnimatedTrackingPoint(targetPoint) {
  const [animated, setAnimated] = useState(targetPoint || null);
  const latestRef = useRef(targetPoint || null);

  useEffect(() => {
    latestRef.current = animated;
  }, [animated]);

  useEffect(() => {
    if (!targetPoint) {
      setAnimated(null);
      return undefined;
    }

    const current = latestRef.current;
    if (
      !current ||
      ![current.lat, current.lng, targetPoint.lat, targetPoint.lng].every((value) => Number.isFinite(Number(value)))
    ) {
      setAnimated(targetPoint);
      return undefined;
    }

    const from = {
      lat: Number(current.lat),
      lng: Number(current.lng),
      speed: Number(current.speed || 0)
    };
    const to = {
      lat: Number(targetPoint.lat),
      lng: Number(targetPoint.lng),
      speed: Number(targetPoint.speed || 0)
    };
    const startedAt = performance.now();
    const duration = 900;
    let frameId;

    function tick(now) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = {
        ...targetPoint,
        lat: from.lat + (to.lat - from.lat) * eased,
        lng: from.lng + (to.lng - from.lng) * eased,
        speed: from.speed + (to.speed - from.speed) * eased
      };
      latestRef.current = next;
      setAnimated(next);
      if (progress < 1) frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [targetPoint]);

  return animated;
}
