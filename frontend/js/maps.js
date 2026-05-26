class ITruckMaps {
  constructor(el) {
    this.el = el;
  }

  renderRoute({ origin = 'Nairobi, Kenya', destination = 'Kampala, Uganda', mode = 'roadmap' } = {}) {
    if (!this.el) return;
    const src = `https://www.google.com/maps?output=embed&saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(destination)}&dirflg=d&t=${mode === 'satellite' ? 'k' : 'm'}`;
    this.el.innerHTML = `<iframe class="google-map" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade" title="Route map" src="${src}"></iframe>`;
  }

  renderFallback(message = 'Map unavailable. Route details remain available in the shipment panel.') {
    if (!this.el) return;
    this.el.innerHTML = `<div class="map-fallback">${message}</div>`;
  }
}

window.iTruckMaps = ITruckMaps;
