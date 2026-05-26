const params = new URLSearchParams(location.search);
const shipment = (window.iTruckShipments || []).find(item => item.id === params.get('shipment')) || (window.iTruckShipments || [])[0];

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

function initials(name) {
  return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function methodCard({ type, label, detail, href, enabled }) {
  if (!enabled) {
    return `
      <article class="contact-method disabled">
        <span>${type}</span>
        <strong>${label}</strong>
        <small>Not enabled by this driver</small>
      </article>
    `;
  }

  return `
    <a class="contact-method" href="${href}" ${href.startsWith('http') ? 'target="_blank" rel="noreferrer"' : ''}>
      <span>${type}</span>
      <strong>${label}</strong>
      <small>${detail}</small>
    </a>
  `;
}

function chatKey() {
  return `itruck_chat_${shipment.id}`;
}

function loadChat() {
  return JSON.parse(localStorage.getItem(chatKey()) || '[]');
}

function renderChat() {
  const history = loadChat();
  document.getElementById('chatHistory').innerHTML = `
    <div class="chat-message driver">
      <span>${shipment.driver}</span>
      <p>Current update: ${shipment.position}. ETA ${shipment.eta}. Preferred contact: ${shipment.contactPreference}.</p>
    </div>
    ${history.map(item => `
      <div class="chat-message user">
        <span>You</span>
        <p>${item.message}</p>
      </div>
    `).join('')}
  `;
}

function render() {
  if (!shipment) {
    document.querySelector('.contact-workspace').innerHTML = '<section class="panel"><h1>Shipment not found</h1><a class="primary-btn" href="tracking.html">Return to tracking</a></section>';
    return;
  }

  const whatsapp = shipment.whatsapp || shipment.phone;
  const whatsappNumber = whatsapp.replace(/[^0-9]/g, '');
  document.getElementById('contactTitle').textContent = `${shipment.driver} - ${shipment.id}`;
  document.getElementById('backToTracking').href = `tracking.html?shipment=${encodeURIComponent(shipment.id)}`;
  document.getElementById('driverProfile').innerHTML = `
    <div class="driver-card-head">
      <span class="driver-avatar">${initials(shipment.driver)}</span>
      <div>
        <span class="badge success">Assigned driver</span>
        <h2>${shipment.driver}</h2>
        <p>${shipment.route}</p>
      </div>
    </div>
    <div class="driver-facts">
      <span>Shipment</span><strong>${shipment.id}</strong>
      <span>Vehicle</span><strong>${shipment.vehicle} | ${shipment.plate}</strong>
      <span>Cargo</span><strong>${shipment.cargo}</strong>
      <span>Current position</span><strong>${shipment.position}</strong>
      <span>Availability</span><strong>${shipment.contactWindow}</strong>
      <span>Preference</span><strong>${shipment.contactPreference}</strong>
    </div>
  `;

  document.getElementById('contactMethods').innerHTML = [
    methodCard({
      type: 'Phone',
      label: shipment.phone,
      detail: 'Best for urgent pickup, delay, or delivery changes',
      href: `tel:${shipment.phone}`,
      enabled: shipment.contactChoices.phone
    }),
    methodCard({
      type: 'WhatsApp',
      label: whatsapp || 'Unavailable',
      detail: 'Opens a prefilled shipment message',
      href: `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hello ${shipment.driver}, I am checking shipment ${shipment.id}.`)}`,
      enabled: shipment.contactChoices.whatsapp && Boolean(whatsapp)
    }),
    methodCard({
      type: 'Email',
      label: shipment.email,
      detail: 'Use for documents, photos, and written records',
      href: `mailto:${shipment.email}?subject=${encodeURIComponent(`Shipment ${shipment.id}`)}`,
      enabled: shipment.contactChoices.email
    }),
    methodCard({
      type: 'Support',
      label: 'iTruck operations',
      detail: 'Escalate if the driver is unreachable',
      href: 'tel:+254700000000',
      enabled: true
    })
  ].join('');

  renderChat();
}

document.getElementById('driverChatForm').addEventListener('submit', event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  const payload = { shipmentId: shipment.id, driver: shipment.driver, message: data.message };
  const history = loadChat();
  history.push({ message: data.message, createdAt: new Date().toISOString() });
  localStorage.setItem(chatKey(), JSON.stringify(history));

  API.saveMessage(payload)
    .catch(() => saveLocal('messages', payload))
    .finally(() => {
      event.target.reset();
      renderChat();
      toast('Message saved to shipment thread');
    });
});

render();
