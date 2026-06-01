const ownerNames = {
  'demo-owner-james': 'James Mwangi',
  'demo-owner-grace': 'Grace Wanjiku'
};

let trucks = (window.iTruckFleet || []).map(normalizeTruck);
let loading = true;
let savedTrucks = loadSavedTrucks();

function loadSavedTrucks() {
  try {
    return new Set(JSON.parse(localStorage.getItem('itruck_saved_trucks') || '[]'));
  } catch (err) {
    return new Set();
  }
}

function storeSavedTrucks() {
  localStorage.setItem('itruck_saved_trucks', JSON.stringify([...savedTrucks]));
}

function toast(message) {
  const toastEl = document.getElementById('toast');
  const messageEl = document.getElementById('toastMsg');
  if (!toastEl || !messageEl) return;
  messageEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function favoriteKey(truck) {
  return truck.plate || truck.id;
}

function normalizeTruck(truck) {
  const makeModel = [truck.make, truck.model].filter(Boolean).join(' ').trim();
  const owner = truck.ownerName || ownerNames[truck.owner] || truck.owner || 'Verified carrier';
  const type = truck.type || 'Lorry';
  const plate = truck.plate || truck.plateNumber || 'ITK-DEMO';
  const capacity = truck.capacity || (truck.capacityTonnes ? `${truck.capacityTonnes} tonnes` : 'Capacity on request');
  const price = truck.price || (truck.pricePerKm ? `$${Number(truck.pricePerKm).toFixed(2)}/km` : 'Quote on request');
  const pricePerKm = Number(truck.pricePerKm || String(price).replace(/[^0-9.]/g, '')) || 0;
  const rating = Number(truck.rating || 4.5);
  const trips = Number(truck.trips || truck.totalTrips || 40);
  const verified = truck.verified ?? truck.isVerified ?? false;
  const routeCount = (truck.routes || []).length;
  const routeFit = Number(
    truck.routeFit ||
      Math.min(98, 62 + (verified ? 18 : 0) + Math.min(12, routeCount * 4) + Math.min(8, Math.floor(trips / 35)))
  );

  return {
    id: truck._id || truck.id || plate,
    type,
    name: truck.name || makeModel || `${type} ${plate}`,
    plate,
    owner,
    company: truck.company || `${owner.split(' ')[0] || 'Carrier'} Logistics`,
    price,
    pricePerKm,
    capacity,
    rating: rating.toFixed(1),
    ratingNumber: rating,
    trips,
    routeFit,
    availability: truck.availability || (truck.isAvailable === false ? 'Offline' : 'Available now'),
    documentStatus: truck.documentStatus || (verified ? 'Docs verified' : 'Docs pending'),
    responseTime: truck.responseTime || (verified ? '< 15 min response' : 'Manual review'),
    routes: truck.routes || [],
    features: truck.features || [],
    verified
  };
}

function profileUrl(truck, intent = 'view') {
  return `truck-profile.html?truck=${encodeURIComponent(truck.plate)}&intent=${encodeURIComponent(intent)}`;
}

function getFilteredTrucks() {
  const search = document.getElementById('truckSearch');
  const q = search.value.trim().toLowerCase();
  const type = document.getElementById('typeFilter').value;
  const verifiedOnly = document.getElementById('verifiedOnly').checked;
  const minRating = Number(document.getElementById('minRating').value || 0);
  const sort = document.getElementById('sortTrucks').value;

  const filtered = trucks.filter((truck) => {
    const haystack = [
      truck.name,
      truck.type,
      truck.owner,
      truck.company,
      truck.plate,
      truck.capacity,
      truck.price,
      truck.availability,
      truck.documentStatus,
      ...(truck.routes || []),
      ...(truck.features || [])
    ]
      .join(' ')
      .toLowerCase();

    return (
      (!type || truck.type === type) &&
      (!verifiedOnly || truck.verified) &&
      truck.ratingNumber >= minRating &&
      haystack.includes(q)
    );
  });

  return filtered.sort((a, b) => {
    if (sort === 'price') return (a.pricePerKm || Number.MAX_VALUE) - (b.pricePerKm || Number.MAX_VALUE);
    if (sort === 'rating') return b.ratingNumber - a.ratingNumber;
    if (sort === 'trips') return b.trips - a.trips;
    return b.routeFit - a.routeFit;
  });
}

function renderLoading() {
  document.getElementById('resultCount').textContent = 'Loading trucks...';
  document.getElementById('truckResults').innerHTML = [1, 2, 3]
    .map(
      () => `
    <article class="truck-card skeleton-card">
      <span class="badge">Loading</span>
      <h3>Checking live marketplace</h3>
      <p>Fetching verified vehicles and routes...</p>
      <small>iTruck API</small>
    </article>
  `
    )
    .join('');
}

function render() {
  if (loading) {
    renderLoading();
    return;
  }

  const q = document.getElementById('truckSearch').value.trim();
  const filtered = getFilteredTrucks();

  document.getElementById('clearTruckSearch').classList.toggle('visible', Boolean(q));
  document.getElementById('resultCount').textContent =
    `${filtered.length} ${filtered.length === 1 ? 'truck' : 'trucks'} found`;

  if (!filtered.length) {
    document.getElementById('truckResults').innerHTML = `
      <section class="panel empty-state">
        <h2>No trucks match this search</h2>
        <p>Try a wider route, remove the verified-only filter, or create a booking request so owners can bid.</p>
        <a class="primary-btn" href="book-truck.html">Create Booking Request</a>
      </section>
    `;
    return;
  }

  document.getElementById('truckResults').innerHTML = filtered
    .map(
      (truck) => `
    <article class="truck-card">
      <div class="truck-card-top">
        <span class="badge ${truck.verified ? 'success' : 'warn'}">${truck.verified ? 'Verified' : 'Pending'}</span>
        <span class="truck-card-tools">
          <strong>${truck.routeFit}% fit</strong>
          <button class="save-truck ${savedTrucks.has(favoriteKey(truck)) ? 'saved' : ''}" type="button" data-save-truck="${truck.id}" aria-pressed="${savedTrucks.has(favoriteKey(truck)) ? 'true' : 'false'}">
            ${savedTrucks.has(favoriteKey(truck)) ? 'Saved' : 'Save'}
          </button>
        </span>
      </div>
      <h3>${truck.name}</h3>
      <p>${truck.type} by ${truck.owner}</p>
      <small>${truck.plate} - ${truck.capacity}</small>
      <div class="decision-grid">
        <span>Rate<strong>${truck.price}</strong></span>
        <span>Rating<strong>${truck.rating} / ${truck.trips}</strong></span>
        <span>Status<strong>${truck.availability}</strong></span>
      </div>
      <div class="profile-routes">${
        (truck.routes || [])
          .slice(0, 2)
          .map((route) => `<span>${route}</span>`)
          .join('') || '<span>Route on request</span>'
      }</div>
      <div class="trust-line">
        <span>${truck.documentStatus}</span>
        <span>${truck.responseTime}</span>
      </div>
      <div class="truck-actions">
        <a class="primary-btn" href="${profileUrl(truck)}">View Profile</a>
        <a class="ghost-btn" href="${profileUrl(truck, 'request')}">Request</a>
      </div>
    </article>
  `
    )
    .join('');
}

async function loadTrucks() {
  loading = true;
  render();

  try {
    const data = await API.listTrucks('');
    if (Array.isArray(data.trucks) && data.trucks.length) {
      trucks = data.trucks.map(normalizeTruck);
      window.iTruckFleet = trucks;
    }
  } catch (err) {
    trucks = (window.iTruckFleet || []).map(normalizeTruck);
  } finally {
    loading = false;
    render();
  }
}

['truckSearch', 'typeFilter', 'verifiedOnly', 'sortTrucks', 'minRating'].forEach((id) => {
  const control = document.getElementById(id);
  control.addEventListener('input', render);
  control.addEventListener('change', render);
});
document.getElementById('truckSearchForm').addEventListener('submit', (event) => event.preventDefault());
document.getElementById('typeChips').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-type]');
  if (!chip) return;
  document.getElementById('typeFilter').value = chip.dataset.type;
  document
    .querySelectorAll('#typeChips button')
    .forEach((button) => button.classList.toggle('active', button === chip));
  render();
});
document.getElementById('clearTruckSearch').addEventListener('click', () => {
  document.getElementById('truckSearch').value = '';
  render();
  document.getElementById('truckSearch').focus();
});
document.getElementById('truckResults').addEventListener('click', (event) => {
  const button = event.target.closest('[data-save-truck]');
  if (!button) return;
  const truck = trucks.find((item) => item.id === button.dataset.saveTruck);
  if (!truck) return;

  const key = favoriteKey(truck);
  if (savedTrucks.has(key)) {
    savedTrucks.delete(key);
    toast('Truck removed from saved list');
  } else {
    savedTrucks.add(key);
    toast('Truck saved for later');
  }

  storeSavedTrucks();
  render();
});
document.getElementById('resetFilters').addEventListener('click', () => {
  document.getElementById('truckSearch').value = '';
  document.getElementById('typeFilter').value = '';
  document.getElementById('sortTrucks').value = 'best';
  document.getElementById('minRating').value = '0';
  document.getElementById('verifiedOnly').checked = false;
  document
    .querySelectorAll('#typeChips button')
    .forEach((button) => button.classList.toggle('active', button.dataset.type === ''));
  render();
});

loadTrucks();
