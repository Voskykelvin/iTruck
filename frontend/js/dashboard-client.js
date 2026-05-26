const shipments = [
  { id: 'ITK-2044', route: 'Nairobi to Kampala', cargo: 'Retail stock', status: 'In transit', progress: 64, eta: 'Today 18:40', action: 'Review arrival window' },
  { id: 'ITK-2031', route: 'Mombasa to Dar es Salaam', cargo: 'Machine parts', status: 'Bids open', progress: 18, eta: '3 bids received', action: 'Compare bids' },
  { id: 'ITK-2028', route: 'Accra to Lagos', cargo: 'Packaged food', status: 'Delivered', progress: 100, eta: 'Proof ready', action: 'Download POD' }
];

const quotes = [
  { lane: 'Nakuru to Kigali', vehicle: 'Trailer', estimate: '$2,860', bids: 5 },
  { lane: 'Tema to Kumasi', vehicle: 'Lorry', estimate: '$740', bids: 2 },
  { lane: 'Lagos to Accra', vehicle: 'Refrigerated', estimate: '$1,420', bids: 4 }
];

const actions = [
  { title: 'Compare bids', detail: 'Mombasa to Dar es Salaam - 3 new offers', type: 'bids', bookingId: 'ITK-2031' },
  { title: 'Confirm documents', detail: 'Waybill and cargo photos needed', type: 'documents', bookingId: 'ITK-2044' },
  { title: 'Release payment', detail: 'Accra to Lagos proof of delivery ready', type: 'payment', bookingId: 'ITK-2028' }
];

const payments = [
  ['ITK-2044', '$920', 'Escrow'],
  ['ITK-2031', '$1,260', 'Pending'],
  ['ITK-2028', '$780', 'Paid']
];

const bidProfiles = {
  james: { truckPlate: 'KDA 442Q', owner: 'James Mwangi', company: 'Mwangi Haulage', amount: '$2,860', equipment: 'Verified lorry', pickup: 'Today 16:00', transit: '2d 8h', score: 'Best fit', insurance: 'Active cargo cover', notes: 'GPS, cross-border documents, strong East Africa lane history.' },
  grace: { truckPlate: 'KCB 991T', owner: 'Grace Wanjiku', company: 'Wanjiku Logistics', amount: '$3,040', equipment: 'Trailer', pickup: 'Tomorrow 08:00', transit: '2d 4h', score: 'Fastest transit', insurance: 'Container and long-haul cover', notes: 'Higher rate, stronger trailer capacity and long-distance compliance.' },
  tunde: { truckPlate: 'LAG 882B', owner: 'Tunde Logistics', company: 'Tunde Logistics', amount: '$2,770', equipment: 'Mixed cargo bus', pickup: 'Tomorrow 12:00', transit: '3d 2h', score: 'Lowest price', insurance: 'Standard goods cover', notes: 'Lower cost, pending verification, better for mixed cargo and flexible timing.' }
};

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

function docButton(type, label, bookingId, className = 'ghost-btn') {
  return `<button class="${className}" data-download-doc="${type}" data-booking-id="${bookingId}">${label}</button>`;
}

function openModal(title, body) {
  let shell = document.getElementById('workspaceModal');
  if (!shell) {
    shell = document.createElement('div');
    shell.id = 'workspaceModal';
    shell.className = 'workspace-modal';
    shell.innerHTML = '<div class="workspace-dialog"><button class="modal-x" type="button" data-close-workspace-modal>x</button><div id="workspaceModalContent"></div></div>';
    document.body.appendChild(shell);
    shell.addEventListener('click', event => {
      if (event.target === shell || event.target.closest('[data-close-workspace-modal]')) closeModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeModal();
    });
  }
  document.getElementById('workspaceModalContent').innerHTML = `<h2>${title}</h2>${body}`;
  shell.classList.add('open');
}

function closeModal() {
  document.getElementById('workspaceModal')?.classList.remove('open');
}

function bidProfileUrl(bid) {
  return `truck-profile.html?truck=${encodeURIComponent(bid.truckPlate)}&intent=request`;
}

function findFleetProfile(bid) {
  return (window.iTruckFleet || []).find(truck => truck.plate === bid.truckPlate) || {};
}

function openBidReview(title, bids) {
  const selectedKey = Object.keys(bids)[0];
  openModal(
    title,
    `<p class="modal-copy">Compare more than price: carrier verification, insurance, pickup time, transit estimate, rating, and route fit should all shape the award.</p>
    <div class="bid-review-list">
      ${Object.entries(bids).map(([key, bid], index) => {
        const profile = findFleetProfile(bid);
        return `<article class="bid-review-card ${index === 0 ? 'selected' : ''}" data-bid-card="${key}">
          <button type="button" class="bid-select" data-select-bid="${key}">
            <span class="badge ${profile.verified ? 'success' : 'warn'}">${bid.score}</span>
            <strong>${bid.owner}</strong>
            <small>${bid.company} - ${bid.equipment}</small>
          </button>
          <div class="bid-facts">
            <span>Price</span><strong>${bid.amount}</strong>
            <span>Pickup</span><strong>${bid.pickup}</strong>
            <span>Transit</span><strong>${bid.transit}</strong>
            <span>Rating</span><strong>${profile.rating || '4.5'} from ${profile.trips || '50'} trips</strong>
            <span>Insurance</span><strong>${bid.insurance}</strong>
          </div>
          <p>${bid.notes}</p>
          <div class="bid-actions">
            <a class="secondary-btn" href="${bidProfileUrl(bid)}">View Carrier Profile</a>
            <button class="ghost-btn" type="button" data-select-bid="${key}">Select Bid</button>
          </div>
        </article>`;
      }).join('')}
    </div>
    <div class="bid-award-bar">
      <span id="selectedBidLabel">Selected: ${bids[selectedKey].owner}</span>
      <button class="primary-btn" id="acceptSelectedBid" data-selected-bid="${selectedKey}">Award Selected Bid</button>
    </div>`
  );

  document.querySelectorAll('[data-select-bid]').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.selectBid;
      document.querySelectorAll('[data-bid-card]').forEach(card => card.classList.toggle('selected', card.dataset.bidCard === key));
      document.getElementById('selectedBidLabel').textContent = `Selected: ${bids[key].owner}`;
      document.getElementById('acceptSelectedBid').dataset.selectedBid = key;
    });
  });

  document.getElementById('acceptSelectedBid').addEventListener('click', event => {
    const bid = bids[event.target.dataset.selectedBid];
    saveLocal('awarded_bids', { ...bid, awardedAt: new Date().toISOString() });
    closeModal();
    toast(`${bid.owner} awarded. Carrier profile and booking record updated.`);
  });
}

document.getElementById('shipmentList').innerHTML = shipments.map((item, index) => `
  <article class="shipment-row interactive-row" data-shipment-card="${index}" tabindex="0" role="button" aria-label="Open ${item.id} shipment">
    <div>
      <span class="badge ${item.status === 'Delivered' ? 'success' : item.status === 'Bids open' ? 'warn' : ''}">${item.status}</span>
      <h3>${item.id}</h3>
      <p>${item.route}</p>
      <small>${item.cargo} - ${item.eta}</small>
    </div>
    <div class="shipment-progress">
      <strong>${item.progress}%</strong>
      <div class="progress"><span style="width:${item.progress}%"></span></div>
      <button class="ghost-btn" data-shipment-action="${index}">${item.action}</button>
    </div>
  </article>
`).join('');

document.getElementById('quoteList').innerHTML = quotes.map((item, index) => `
  <article class="quote-card">
    <span class="badge">${item.bids} bids</span>
    <h3>${item.lane}</h3>
    <p>${item.vehicle}</p>
    <strong>${item.estimate}</strong>
    <button class="secondary-btn" data-review-quote="${index}">Review</button>
  </article>
`).join('');

document.getElementById('actionQueue').innerHTML = actions.map((item, index) => `
  <button class="action-item" data-client-task="${index}">
    <strong>${item.title}</strong>
    <span>${item.detail}</span>
  </button>
`).join('');

document.getElementById('paymentList').innerHTML = payments.map((item, index) => `
  <button class="mini-row" data-payment="${index}">
    <span>${item[0]}</span>
    <strong>${item[1]}</strong>
    <small>${item[2]}</small>
  </button>
`).join('');

document.addEventListener('click', event => {
  const directControl = event.target.closest('button,a,input,select,textarea,label');
  const shipmentIndex = event.target.dataset.shipmentAction
    ?? (!directControl ? event.target.closest('[data-shipment-card]')?.dataset.shipmentCard : undefined);
  const quoteIndex = event.target.dataset.reviewQuote;
  const taskIndex = event.target.closest('[data-client-task]')?.dataset.clientTask;
  const paymentIndex = event.target.closest('[data-payment]')?.dataset.payment;
  const docTarget = event.target.closest('[data-download-doc]');

  if (event.target.closest('[data-close-workspace-modal]')) {
    closeModal();
    return;
  }

  if (docTarget) {
    const type = docTarget.dataset.downloadDoc;
    const bookingId = docTarget.dataset.bookingId;
    API.downloadDocument(type, bookingId)
      .then(() => toast(`${type.toUpperCase()} opened`))
      .catch(() => {
        saveLocal('document_requests', { type, bookingId });
        toast('Please log in again to download this document');
      });
    return;
  }

  if (shipmentIndex !== undefined) {
    const shipment = shipments[Number(shipmentIndex)];
    if (shipment.action === 'Download POD') {
      openModal(
        `${shipment.id} documents`,
        `<p class="modal-copy">Download shipment documents generated from the booking record. For live shipments, proof of delivery becomes final after receiver confirmation.</p>
        <div class="document-grid">
          ${docButton('pod', 'Download POD', shipment.id, 'primary-btn')}
          ${docButton('waybill', 'Waybill', shipment.id, 'secondary-btn')}
          ${docButton('invoice', 'Invoice', shipment.id)}
          ${docButton('customs', 'Customs Summary', shipment.id)}
        </div>
        <button class="ghost-btn" data-close-workspace-modal>Close</button>`
      );
      return;
    }
    openModal(
      `${shipment.id} details`,
      `<div class="detail-grid">
        <span>Route</span><strong>${shipment.route}</strong>
        <span>Cargo</span><strong>${shipment.cargo}</strong>
        <span>Status</span><strong>${shipment.status}</strong>
        <span>ETA</span><strong>${shipment.eta}</strong>
      </div>
      <div class="quick-actions"><a class="primary-btn" href="tracking.html">Open Tracking</a>${docButton('waybill', 'Waybill', shipment.id, 'secondary-btn')}<button class="ghost-btn" data-close-workspace-modal>Close</button></div>`
    );
  }

  if (quoteIndex !== undefined) {
    const quote = quotes[Number(quoteIndex)];
    const base = Number(quote.estimate.replace(/[^0-9]/g, ''));
    openBidReview(
      `Review bids for ${quote.lane}`,
      {
        james: { ...bidProfiles.james, amount: quote.estimate },
        grace: { ...bidProfiles.grace, amount: `$${(base + 180).toLocaleString()}` },
        tunde: { ...bidProfiles.tunde, amount: `$${(base - 90).toLocaleString()}` }
      }
    );
  }

  if (taskIndex !== undefined) {
    const task = actions[Number(taskIndex)];
    if (task.type === 'bids') {
      openBidReview(
        `${task.bookingId} bid comparison`,
        {
          james: { ...bidProfiles.james, amount: '$1,260' },
          grace: { ...bidProfiles.grace, amount: '$1,420' },
          tunde: { ...bidProfiles.tunde, amount: '$1,180' }
        }
      );
      return;
    }

    if (task.type === 'documents') {
      openModal(
        `${task.bookingId} document check`,
        `<p class="modal-copy">Upload cargo photos and keep the waybill ready for driver handover.</p>
        <form id="documentConfirmForm" class="modal-form">
          <label>Waybill reference<input value="WB-${task.bookingId}" required></label>
          <label>Cargo photos<input type="file" multiple accept="image/*,.pdf"></label>
          <button class="primary-btn" type="submit">Confirm Documents</button>
        </form>`
      );
      document.getElementById('documentConfirmForm').addEventListener('submit', event => {
        event.preventDefault();
        closeModal();
        toast('Shipment documents confirmed');
      });
      return;
    }

    openModal(
      `${task.bookingId} payment release`,
      `<div class="detail-grid">
        <span>Status</span><strong>Proof of delivery received</strong>
        <span>Amount</span><strong>$780</strong>
        <span>Next step</span><strong>Release escrow to owner</strong>
      </div>
      <button class="primary-btn" id="releasePayment">Release Payment</button>`
    );
    document.getElementById('releasePayment').addEventListener('click', () => {
      closeModal();
      toast('Payment release recorded');
    });
  }

  if (paymentIndex !== undefined) {
    const payment = payments[Number(paymentIndex)];
    openModal(
      `${payment[0]} payment`,
      `<div class="detail-grid"><span>Amount</span><strong>${payment[1]}</strong><span>Status</span><strong>${payment[2]}</strong></div><button class="primary-btn" data-close-workspace-modal>Done</button>`
    );
  }

});

document.addEventListener('keydown', event => {
  if (!['Enter', ' '].includes(event.key)) return;
  const card = event.target.closest('[data-shipment-card]');
  if (!card) return;
  event.preventDefault();
  card.querySelector('[data-shipment-action]')?.click();
});
