const params = new URLSearchParams(location.search);
const plate = params.get('truck');
const intent = params.get('intent') || 'view';
const truck = (window.iTruckFleet || []).find((item) => item.plate === plate) || (window.iTruckFleet || [])[0];

function toast(message) {
  let el = document.getElementById('workspaceToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'workspaceToast';
    el.className = 'workspace-toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

function saveLocal(type, data) {
  const key = `itruck_${type}`;
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  list.push({ id: `${type}-${Date.now()}`, ...data, createdAt: new Date().toISOString(), mode: 'local' });
  localStorage.setItem(key, JSON.stringify(list));
}

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function render() {
  if (!truck) {
    document.getElementById('truckProfile').innerHTML =
      '<section class="panel"><h1>Truck not found</h1><a class="primary-btn" href="listings.html">Return to listings</a></section>';
    return;
  }

  const whatsapp = truck.phone.replace(/[^0-9]/g, '');
  document.getElementById('truckProfile').innerHTML = `
    <section class="truck-profile-hero">
      <div>
        <span class="badge ${truck.verified ? 'success' : 'warn'}">${truck.verified ? 'Verified owner and vehicle' : 'Verification pending'}</span>
        <h1>${truck.name}</h1>
        <p>${truck.bio}</p>
        <div class="quick-actions">
          <a class="primary-btn" href="#requestPanel">Request This Truck</a>
          <a class="secondary-btn" href="tel:${truck.phone}">Call Owner</a>
          <a class="ghost-btn" target="_blank" rel="noreferrer" href="https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hello ${truck.owner}, I am interested in ${truck.plate} on iTruck.`)}">WhatsApp</a>
          <a class="ghost-btn" href="mailto:${truck.email}?subject=${encodeURIComponent(`Truck inquiry ${truck.plate}`)}">Email</a>
        </div>
      </div>
      <div class="vehicle-photo">
        <div class="vehicle-placeholder">
          <span class="vehicle-type">${truck.type}</span>
          <strong>${truck.name}</strong>
          <small>${truck.plate} - ${truck.capacity}</small>
          <div class="vehicle-silhouette" aria-hidden="true"><i></i><i></i></div>
        </div>
      </div>
    </section>

    <section class="truck-profile-layout">
      <div class="profile-main">
        <section class="panel">
          <p class="eyebrow">Vehicle</p>
          <div class="detail-grid profile-detail-grid">
            <span>Plate</span><strong>${truck.plate}</strong>
            <span>Type</span><strong>${truck.type}</strong>
            <span>Capacity</span><strong>${truck.capacity}</strong>
            <span>Rate</span><strong>${truck.price}</strong>
            <span>Rating</span><strong>${truck.rating} from ${truck.trips} trips</strong>
          </div>
        </section>
        <section class="panel">
          <p class="eyebrow">Routes</p>
          <div class="profile-routes">${truck.routes.map((route) => `<span>${route}</span>`).join('')}</div>
        </section>
        <section class="panel">
          <p class="eyebrow">Features</p>
          <div class="profile-tags">${truck.features.map((feature) => `<span>${feature}</span>`).join('')}</div>
        </section>
      </div>
      <aside class="profile-side">
        <section class="panel">
          <p class="eyebrow">Owner</p>
          <div class="owner-profile-card">
            <span class="owner-avatar">${initials(truck.owner)}</span>
            <div>
              <h2>${truck.owner}</h2>
              <p>${truck.company}</p>
              <small>${truck.verified ? 'Verified carrier profile' : 'Verification in progress'}</small>
            </div>
          </div>
          <div class="mini-list">
            <div class="mini-row"><span>Phone</span><strong>${truck.phone}</strong></div>
            <div class="mini-row"><span>Email</span><strong>${truck.email}</strong></div>
          </div>
        </section>
        <section class="panel request-panel" id="requestPanel">
          <div class="request-card-head">
            <div><p class="eyebrow">Request</p><h2>Start with this truck</h2></div>
            <span>${truck.price}</span>
          </div>
          <div class="request-summary">
            <span>${truck.type}</span>
            <strong>${truck.capacity}</strong>
            <small>${truck.verified ? 'Verified vehicle' : 'Verification pending'}</small>
          </div>
          <form id="requestTruckForm" class="profile-request-form">
            <label><span>Pickup</span><input name="pickup" placeholder="City or depot" required></label>
            <label><span>Destination</span><input name="destination" placeholder="City or border point" required></label>
            <label><span>Cargo</span><textarea name="cargo" placeholder="Cargo type, weight, timing, and handling notes"></textarea></label>
            <div class="request-actions">
              <button class="primary-btn" type="submit">Send Request</button>
              <a class="ghost-btn" href="book-truck.html?truck=${encodeURIComponent(truck.plate)}&type=${encodeURIComponent(truck.type)}">Full Booking</a>
            </div>
            <small class="request-note">The owner receives your route, cargo note, and contact details before quoting.</small>
          </form>
        </section>
      </aside>
    </section>
  `;

  document.getElementById('requestTruckForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    const payload = { ...data, truck: truck.plate, vehicleType: truck.type, owner: truck.owner, rate: truck.price };
    API.createRequest(payload)
      .catch(() => saveLocal('requests', payload))
      .finally(() => {
        toast(`Request sent to ${truck.owner}`);
        event.target.reset();
      });
  });

  if (intent === 'request') {
    setTimeout(
      () => document.getElementById('requestPanel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      80
    );
  }
}

render();
