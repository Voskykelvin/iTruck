const totalSteps = 6;
let step = 1;
let vehicle = new URLSearchParams(location.search).get('type') || 'Lorry';
let estimate = null;

const types = ['Matatu', 'Pickup', 'Lorry', 'Large Truck', 'Trailer', 'Bus', 'Specialised'];
const params = new URLSearchParams(location.search);
const vehicleTypes = document.getElementById('vehicleTypes');

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

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value, currency = 'USD') {
  return `${currency} ${Number(value || 0).toLocaleString()}`;
}

function saveLocal(type, data) {
  const key = `itruck_${type}`;
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  list.push({ id: `${type}-${Date.now()}`, ...data, createdAt: new Date().toISOString(), mode: 'local' });
  localStorage.setItem(key, JSON.stringify(list));
}

function serializeForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  data.optionalServices = [...form.querySelectorAll('input[name="optionalServices"]:checked')].map(input => input.value);
  data.quoteAcknowledged = Boolean(form.querySelector('input[name="quoteAcknowledged"]')?.checked);
  return data;
}

function renderVehicleTypes() {
  vehicleTypes.innerHTML = types.map(type => `
    <button type="button" class="vehicle-option ${type === vehicle ? 'active' : ''}" data-type="${type}">
      <h3>${type}</h3>
      <p class="muted">Verified supply, insured trips, and route tracking available</p>
    </button>
  `).join('');
}

function fallbackEstimate(data) {
  const distance = Number(data.distance || 420);
  const basePrice = Math.round(distance * 1.8);
  const crossBorderFee = data.border === 'Cross-border' ? Math.round(basePrice * 0.12) : 0;
  const insurance = Math.max(25, Math.round(basePrice * 0.035));
  const escrowFee = Math.round(basePrice * 0.025);
  const lineItems = [
    { key: 'basePrice', label: `${vehicle} lane estimate`, amount: basePrice },
    ...(crossBorderFee ? [{ key: 'crossBorderFee', label: 'Cross-border handling', amount: crossBorderFee }] : []),
    { key: 'insurance', label: 'Standard cargo protection', amount: insurance },
    { key: 'escrowFee', label: 'Escrow and payment handling', amount: escrowFee }
  ];

  return {
    currency: 'USD',
    distance,
    vehicleType: vehicle,
    lineItems,
    total: lineItems.reduce((sum, item) => sum + item.amount, 0),
    recommendedMode: distance > 900 || data.border === 'Cross-border' ? 'open-bids' : 'instant-match',
    confidence: 'medium',
    routeRisk: data.border === 'Cross-border' ? 'medium' : 'low',
    requiredDocuments: data.border === 'Cross-border'
      ? ['Waybill', 'Cargo photos', 'Receiver confirmation', 'Commercial invoice', 'Packing list', 'Customs declaration']
      : ['Waybill', 'Cargo photos', 'Receiver confirmation'],
    warnings: [],
    quoteProtection: 'Estimate includes platform, insurance, escrow, and selected service fees before carrier bids.'
  };
}

async function updateEstimate() {
  const form = document.getElementById('bookingForm');
  const data = serializeForm(form);

  try {
    estimate = await API.marketEstimate({
      ...data,
      vehicleType: vehicle,
      crossBorder: data.border === 'Cross-border'
    });
  } catch (err) {
    estimate = fallbackEstimate(data);
  }

  const insight = document.getElementById('routeInsight');
  if (insight && estimate) {
    insight.innerHTML = `
      <b>Estimated total:</b> ${money(estimate.total, estimate.currency)}
      <b>Mode:</b> ${escapeHtml(estimate.recommendedMode.replace('-', ' '))}
      <b>Risk:</b> ${escapeHtml(estimate.routeRisk || 'low')}
    `;
  }

  if (step === 5) renderReview();
}

function renderReview() {
  const data = serializeForm(document.getElementById('bookingForm'));
  const documents = estimate?.requiredDocuments || [];
  const warnings = estimate?.warnings || [];
  const lineItems = estimate?.lineItems || [];

  document.getElementById('bookingReview').innerHTML = `
    <div class="review-grid">
      <section class="review-summary">
        <div class="detail-grid">
          <span>Route</span><strong>${escapeHtml(data.pickup || 'Pickup')} to ${escapeHtml(data.destination || 'Destination')}</strong>
          <span>Vehicle</span><strong>${escapeHtml(vehicle)}</strong>
          <span>Cargo</span><strong>${escapeHtml(data.cargo || 'Standard cargo')}</strong>
          <span>Receiver</span><strong>${escapeHtml(data.receiverName || 'Receiver pending')}</strong>
          <span>Communication</span><strong>${escapeHtml(data.communicationPreference || 'Standard updates')}</strong>
        </div>
      </section>
      <section class="estimate-card">
        <div class="estimate-head">
          <span>${escapeHtml(estimate?.confidence || 'medium')} confidence</span>
          <strong>${estimate ? money(estimate.total, estimate.currency) : 'Calculating'}</strong>
        </div>
        <div class="line-items">
          ${lineItems.map(item => `
            <div>
              <span>${escapeHtml(item.label)}</span>
              <strong>${money(item.amount, estimate.currency)}</strong>
            </div>
          `).join('')}
        </div>
      </section>
    </div>
    <div class="document-checklist">
      <h3>Required documents</h3>
      <div>${documents.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>
    </div>
    ${warnings.length ? `
      <div class="quote-warning">
        ${warnings.map(item => `<span>${escapeHtml(item)}</span>`).join('')}
      </div>
    ` : ''}
    <p class="quote-protection">${escapeHtml(estimate?.quoteProtection || 'Quote protection available after estimate is generated.')}</p>
  `;
}

function render() {
  document.querySelectorAll('.booking-step').forEach(section => section.classList.toggle('active', Number(section.dataset.step) === step));
  document.getElementById('stepBadge').textContent = `Step ${step} of ${totalSteps}`;
  document.getElementById('prevStep').disabled = step === 1;
  document.getElementById('nextStep').classList.toggle('hidden', step === totalSteps);
  document.getElementById('submitBooking').classList.toggle('hidden', step !== totalSteps);
  updateEstimate();
  if (step === 5) renderReview();
}

renderVehicleTypes();

if (params.get('truck')) {
  document.getElementById('routeInsight').textContent = `Booking started from truck profile ${params.get('truck')}. Complete the route and cargo details to send the request.`;
}

vehicleTypes.addEventListener('click', event => {
  const option = event.target.closest('.vehicle-option');
  if (!option) return;
  vehicle = option.dataset.type;
  renderVehicleTypes();
  updateEstimate();
});

document.getElementById('nextStep').addEventListener('click', () => {
  const active = document.querySelector(`.booking-step[data-step="${step}"]`);
  const invalid = [...active.querySelectorAll('input, select, textarea')].find(field => !field.reportValidity());
  if (invalid) return;
  step = Math.min(totalSteps, step + 1);
  render();
});

document.getElementById('prevStep').addEventListener('click', () => {
  step = Math.max(1, step - 1);
  render();
});

document.getElementById('bookingForm').addEventListener('input', updateEstimate);
document.getElementById('bookingForm').addEventListener('change', updateEstimate);

document.getElementById('bookingForm').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = document.getElementById('submitBooking');
  submit.disabled = true;
  submit.textContent = 'Confirming...';
  const data = serializeForm(event.target);
  const payload = { ...data, vehicleType: vehicle, truck: params.get('truck') || '', estimate };

  if (!payload.quoteAcknowledged) {
    toast('Review the quote details before confirming');
    submit.disabled = false;
    submit.textContent = 'Confirm Booking';
    return;
  }

  try {
    await API.createBooking(payload);
    toast('Booking request created. You can track bids in the client dashboard.');
  } catch (err) {
    saveLocal('bookings', payload);
    toast('Booking saved locally. It will sync when the API is available.');
  }

  setTimeout(() => {
    window.iTruckRoute?.go('dashboard-client.html') || (location.href = 'dashboard-client.html');
  }, 900);

  submit.disabled = false;
  submit.textContent = 'Confirm Booking';
});

render();
