const shipments = window.iTruckShipments || [];
const query = new URLSearchParams(location.search);

let selected = Math.max(0, shipments.findIndex(item => item.id === query.get('shipment')));
if (selected < 0) selected = 0;
let mapMode = query.get('map') === 'satellite' ? 'satellite' : 'roadmap';

function selectedShipment() {
  return shipments[selected] || shipments[0];
}

function googleRouteUrl(shipment) {
  const origin = encodeURIComponent(shipment.origin);
  const destination = encodeURIComponent(shipment.destination);
  return `https://www.google.com/maps?output=embed&saddr=${origin}&daddr=${destination}&dirflg=d&t=${mapMode === 'satellite' ? 'k' : 'm'}`;
}

function trackingUrl(shipment = selectedShipment()) {
  return `${location.origin}${location.pathname}?shipment=${encodeURIComponent(shipment.id)}`;
}

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
  setTimeout(() => el.classList.remove('show'), 2800);
}

function saveLocal(type, data) {
  const key = `itruck_${type}`;
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  list.push({ id: `${type}-${Date.now()}`, ...data, createdAt: new Date().toISOString(), mode: 'local' });
  localStorage.setItem(key, JSON.stringify(list));
}

function openModal(title, body, size = '') {
  let shell = document.getElementById('trackingModal');
  if (!shell) {
    shell = document.createElement('div');
    shell.id = 'trackingModal';
    shell.className = 'workspace-modal';
    shell.innerHTML = '<div class="workspace-dialog"><button class="modal-x" type="button" data-close-tracking-modal aria-label="Close">x</button><div id="trackingModalContent"></div></div>';
    document.body.appendChild(shell);
  }

  shell.querySelector('.workspace-dialog').classList.toggle('wide', size === 'wide');
  document.getElementById('trackingModalContent').innerHTML = `<h2>${title}</h2>${body}`;
  shell.classList.add('open');
}

function closeModal() {
  document.getElementById('trackingModal')?.classList.remove('open');
}

function updateUrl() {
  const shipment = selectedShipment();
  if (!shipment) return;
  const next = `${location.pathname}?shipment=${encodeURIComponent(shipment.id)}`;
  history.replaceState(null, '', next);
}

function render() {
  const shipment = selectedShipment();
  if (!shipment) return;

  document.getElementById('trackingList').innerHTML = shipments.map((item, index) => `
    <button class="tracking-item ${index === selected ? 'active' : ''}" data-select-shipment="${index}">
      <strong>${item.id}</strong>
      <span>${item.route}</span>
      <small>${item.progress}% | ${item.position}</small>
    </button>
  `).join('');

  document.getElementById('googleMap').src = googleRouteUrl(shipment);
  document.getElementById('mapRouteTitle').textContent = shipment.route;
  document.getElementById('currentPosition').textContent = shipment.position;
  document.getElementById('routeTelemetry').textContent = `${shipment.speed} | ETA ${shipment.eta}`;
  document.getElementById('routeProgress').style.width = `${shipment.progress}%`;
  document.getElementById('trackingDetail').innerHTML = `
    <div class="tracking-facts">
      <span>Reference</span><strong>${shipment.id}</strong>
      <span>Driver</span><strong>${shipment.driver}</strong>
      <span>Cargo</span><strong>${shipment.cargo}</strong>
      <span>Vehicle</span><strong>${shipment.vehicle} | ${shipment.plate}</strong>
      <span>Route</span><strong>${shipment.route}</strong>
      <span>Progress</span><strong>${shipment.progress}%</strong>
    </div>
    <div class="tracking-timeline">
      <div class="done">Booked</div>
      <div class="done">Loaded</div>
      <div class="active">In transit</div>
      <div class="${shipment.progress >= 100 ? 'done' : ''}">Delivered</div>
    </div>
  `;

  updateUrl();
}

function openSharePanel() {
  const shipment = selectedShipment();
  const url = trackingUrl(shipment);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Track ${shipment.id} on iTruck: ${url}`)}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent(`Tracking link for ${shipment.id}`)}&body=${encodeURIComponent(`Track ${shipment.route} here:\n${url}`)}`;

  openModal(
    `Share ${shipment.id}`,
    `<p class="modal-copy">Send a live shipment link to receivers, warehouse teams, or support. The link opens the selected shipment directly.</p>
    <div class="share-card">
      <span>Tracking URL</span>
      <strong>${url}</strong>
    </div>
    <div class="contact-grid">
      <button class="primary-btn" type="button" data-copy-share="${url}">Copy Link</button>
      <button class="secondary-btn" type="button" data-native-share="${url}">Share From Device</button>
      <a class="ghost-btn" target="_blank" rel="noreferrer" href="${whatsappUrl}">WhatsApp</a>
      <a class="ghost-btn" href="${emailUrl}">Email</a>
    </div>
    <button class="ghost-btn" type="button" data-close-tracking-modal>Close</button>`
  );
}

function openDeliveryPanel() {
  const shipment = selectedShipment();
  openModal(
    `Confirm ${shipment.id}`,
    `<p class="modal-copy">Confirm delivery only when the cargo has arrived and the receiver accepts the condition.</p>
    <form id="deliveryForm" class="modal-form">
      <label>Receiver name<input name="receiver" placeholder="Name of receiving person" required></label>
      <label>Delivery condition<select name="condition"><option>Accepted - good condition</option><option>Accepted with notes</option><option>Damaged or short cargo</option></select></label>
      <label>Delivery note<textarea name="note" placeholder="Optional note about cargo condition"></textarea></label>
      <button class="primary-btn" type="submit">Confirm Delivery</button>
    </form>`
  );
}

function openIssuePanel() {
  const shipment = selectedShipment();
  openModal(
    `Report issue for ${shipment.id}`,
    `<p class="modal-copy">Send route, cargo, driver, document, or payment exceptions to the operations queue with the shipment reference attached.</p>
    <div class="contact-grid support-grid">
      <a class="secondary-btn" href="tel:+254700000000">Call Support</a>
      <a class="ghost-btn" href="mailto:support@itruck.africa?subject=${encodeURIComponent(`Issue with ${shipment.id}`)}">Email Support</a>
    </div>
    <form id="issueForm" class="modal-form">
      <label>Issue type<select name="issueType"><option>Delay</option><option>Driver unreachable</option><option>Cargo concern</option><option>Payment issue</option><option>Route or border issue</option></select></label>
      <label>Urgency<select name="urgency"><option>Normal</option><option>High</option><option>Critical</option></select></label>
      <label>Details<textarea name="details" required placeholder="Describe what happened, who is affected, and the next action needed"></textarea></label>
      <button class="primary-btn" type="submit">Send Report</button>
    </form>`
  );
}

async function copyToClipboard(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast('Tracking link copied');
  } catch (err) {
    const input = document.createElement('input');
    input.value = value;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    toast('Tracking link copied');
  }
}

function bindEvents() {
  document.addEventListener('click', async event => {
    const shipmentTarget = event.target.closest('[data-select-shipment]');
    const closeTarget = event.target.closest('[data-close-tracking-modal]');
    const copyTarget = event.target.closest('[data-copy-share]');
    const nativeShareTarget = event.target.closest('[data-native-share]');

    if (closeTarget || event.target.id === 'trackingModal') {
      closeModal();
      return;
    }

    if (shipmentTarget) {
      selected = Number(shipmentTarget.dataset.selectShipment);
      render();
      return;
    }

    if (event.target.closest('#mapRoad')) {
      mapMode = 'roadmap';
      render();
      return;
    }

    if (event.target.closest('#mapSatellite')) {
      mapMode = 'satellite';
      render();
      return;
    }

    if (event.target.closest('#shareTracking')) {
      openSharePanel();
      return;
    }

    if (event.target.closest('#confirmDelivery')) {
      openDeliveryPanel();
      return;
    }

    if (event.target.closest('#messageDriver')) {
      location.href = `driver-contact.html?shipment=${encodeURIComponent(selectedShipment().id)}`;
      return;
    }

    if (event.target.closest('#reportIssue')) {
      openIssuePanel();
      return;
    }

    if (copyTarget) {
      await copyToClipboard(copyTarget.dataset.copyShare);
      return;
    }

    if (nativeShareTarget) {
      const url = nativeShareTarget.dataset.nativeShare;
      if (navigator.share) {
        await navigator.share({ title: 'iTruck shipment tracking', text: `Track ${selectedShipment().id}`, url }).catch(() => {});
      } else {
        await copyToClipboard(url);
      }
    }
  });

  document.addEventListener('submit', event => {
    if (event.target.id === 'deliveryForm') {
      event.preventDefault();
      const shipment = selectedShipment();
      const payload = { shipmentId: shipment.id, ...Object.fromEntries(new FormData(event.target).entries()), status: 'delivered' };
      shipment.progress = 100;
      API.updateBookingStatus(shipment.id, payload)
        .catch(() => saveLocal('delivery_confirmations', payload))
        .finally(() => {
          closeModal();
          render();
          toast('Delivery confirmation recorded');
        });
    }

    if (event.target.id === 'issueForm') {
      event.preventDefault();
      const shipment = selectedShipment();
      const payload = { shipmentId: shipment.id, ...Object.fromEntries(new FormData(event.target).entries()) };
      API.reportIssue(payload)
        .catch(() => saveLocal('reports', payload))
        .finally(() => {
          closeModal();
          toast('Issue report sent to operations');
        });
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeModal();
  });
}

bindEvents();
render();

setInterval(() => {
  const shipment = selectedShipment();
  if (!shipment || shipment.progress >= 100) return;
  shipment.progress = Math.min(99, shipment.progress + 1);
  render();
}, 12000);
