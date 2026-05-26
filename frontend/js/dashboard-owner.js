const jobs = [
  { cargo: 'Maize bags', route: 'Kampala to Mombasa', price: 1850, distance: '1,140 km', window: 'Pickup tomorrow', fit: '92% fit' },
  { cargo: 'Construction steel', route: 'Nairobi to Kigali', price: 2400, distance: '1,170 km', window: 'Bids close in 2h', fit: '88% fit' },
  { cargo: 'Cold chain produce', route: 'Arusha to Dar es Salaam', price: 980, distance: '630 km', window: 'Needs refrigerated truck', fit: '76% fit' }
];

const fleet = [
  { plate: 'KDA 442Q', name: 'Isuzu FVZ 34', status: 'Available', docs: 'Verified', lane: 'Nairobi-Kampala', readiness: 96 },
  { plate: 'KCB 991T', name: 'Scania R450', status: 'In transit', docs: 'Verified', lane: 'Mombasa-Kigali', readiness: 84 },
  { plate: 'KDG 128P', name: 'Toyota Hilux', status: 'Maintenance due', docs: 'Insurance review', lane: 'Nairobi-Nakuru', readiness: 68 }
];

const queue = [
  { title: 'Submit bid', detail: 'Construction steel - Nairobi to Kigali', type: 'bid' },
  { title: 'Upload insurance', detail: 'Toyota Hilux policy expires soon', type: 'insurance' },
  { title: 'Confirm pickup', detail: 'Maize bags - Kampala depot', type: 'pickup' }
];

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

function openModal(title, body, footer = '') {
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
  document.getElementById('workspaceModalContent').innerHTML = `<h2>${title}</h2>${body}${footer}`;
  shell.classList.add('open');
}

function closeModal() {
  document.getElementById('workspaceModal')?.classList.remove('open');
}

document.getElementById('jobBoard').innerHTML = jobs.map((job, index) => `
  <article class="load-card interactive-row" data-load-card="${index}" tabindex="0" role="button" aria-label="Place bid for ${job.cargo}">
    <div>
      <span class="badge success">${job.fit}</span>
      <h3>${job.cargo}</h3>
      <p>${job.route}</p>
      <small>${job.distance} - ${job.window}</small>
    </div>
    <div>
      <strong>$${job.price.toLocaleString()}</strong>
      <button class="primary-btn" data-place-bid="${index}">Place Bid</button>
    </div>
  </article>
`).join('');

function badgeClass(status) {
  if (status === 'Available') return 'success';
  if (status === 'Maintenance due' || status === 'Documents needed') return 'warn';
  return '';
}

function renderFleet() {
  document.getElementById('fleetGrid').innerHTML = fleet.map((truck, index) => `
    <article class="fleet-row interactive-row" data-fleet-card="${index}" tabindex="0" role="button" aria-label="Manage ${truck.plate}">
      <div>
        <span class="badge ${badgeClass(truck.status)}">${truck.status}</span>
        <h3>${truck.plate}</h3>
        <p>${truck.name}</p>
        <small>${truck.docs} - ${truck.lane}</small>
      </div>
      <div class="shipment-progress">
        <strong>${truck.readiness}%</strong>
        <div class="progress"><span style="width:${truck.readiness}%"></span></div>
        <button class="ghost-btn" data-manage-truck="${index}">Manage</button>
      </div>
    </article>
  `).join('');
}

renderFleet();

document.getElementById('ownerQueue').innerHTML = queue.map((item, index) => `
  <button class="action-item" data-owner-task="${index}">
    <strong>${item.title}</strong>
    <span>${item.detail}</span>
  </button>
`).join('');

document.addEventListener('click', event => {
  const directControl = event.target.closest('button,a,input,select,textarea,label');
  const bidIndex = event.target.dataset.placeBid
    ?? (!directControl ? event.target.closest('[data-load-card]')?.dataset.loadCard : undefined);
  const truckIndex = event.target.dataset.manageTruck
    ?? (!directControl ? event.target.closest('[data-fleet-card]')?.dataset.fleetCard : undefined);
  const taskIndex = event.target.closest('[data-owner-task]')?.dataset.ownerTask;

  if (event.target.closest('[data-close-workspace-modal]')) {
    closeModal();
    return;
  }

  if (bidIndex !== undefined) {
    const job = jobs[Number(bidIndex)];
    openModal(
      `Bid for ${job.cargo}`,
      `<form id="bidForm" class="modal-form">
        <label>Route<input value="${job.route}" readonly></label>
        <label>Your price<input name="amount" type="number" value="${job.price}"></label>
        <label>Truck<select name="truck">${fleet.map(truck => `<option>${truck.plate} - ${truck.name}</option>`).join('')}</select></label>
        <label>Message<textarea name="message">Available for pickup. Documents ready.</textarea></label>
        <button class="primary-btn" type="submit">Submit Bid</button>
      </form>`
    );
    document.getElementById('bidForm').addEventListener('submit', e => {
      e.preventDefault();
      const formData = Object.fromEntries(new FormData(e.target).entries());
      const payload = { ...formData, route: job.route, cargo: job.cargo, suggestedPrice: job.price, status: 'submitted' };
      API.submitBid(payload)
        .catch(() => saveLocal('bids', payload))
        .finally(() => {
          closeModal();
          toast(`Bid submitted for ${job.route}`);
        });
    });
  }

  if (truckIndex !== undefined) {
    const truck = fleet[Number(truckIndex)];
    openModal(
      `${truck.plate} readiness`,
      `<form id="vehicleStatusForm" class="modal-form">
        <label>Vehicle status
          <select name="status">
            <option ${truck.status === 'Available' ? 'selected' : ''}>Available</option>
            <option ${truck.status === 'In transit' ? 'selected' : ''}>In transit</option>
            <option ${truck.status === 'Loading' ? 'selected' : ''}>Loading</option>
            <option ${truck.status === 'Maintenance due' ? 'selected' : ''}>Maintenance due</option>
            <option ${truck.status === 'Documents needed' ? 'selected' : ''}>Documents needed</option>
            <option ${truck.status === 'Offline' ? 'selected' : ''}>Offline</option>
          </select>
        </label>
        <label>Document status
          <select name="docs">
            <option ${truck.docs === 'Verified' ? 'selected' : ''}>Verified</option>
            <option ${truck.docs === 'Insurance review' ? 'selected' : ''}>Insurance review</option>
            <option ${truck.docs === 'Logbook review' ? 'selected' : ''}>Logbook review</option>
            <option ${truck.docs === 'Missing documents' ? 'selected' : ''}>Missing documents</option>
          </select>
        </label>
        <label>Preferred lane<input name="lane" value="${truck.lane}" required></label>
        <label>Readiness score<input name="readiness" type="number" min="0" max="100" value="${truck.readiness}" required></label>
        <label>Next action
          <select name="nextAction">
            <option>Ready for bids</option>
            <option>Schedule inspection</option>
            <option>Upload insurance</option>
            <option>Contact driver</option>
            <option>Pause from marketplace</option>
          </select>
        </label>
        <button class="primary-btn" type="submit">Save Vehicle Status</button>
        <button class="ghost-btn" type="button" data-close-workspace-modal>Cancel</button>
      </form>`
    );
    document.getElementById('vehicleStatusForm').addEventListener('submit', event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target).entries());
      Object.assign(truck, { ...data, readiness: Number(data.readiness) });
      saveLocal('vehicle_status', { plate: truck.plate, ...data });
      renderFleet();
      closeModal();
      toast(`${truck.plate} status updated`);
    });
  }

  if (taskIndex !== undefined) {
    const task = queue[Number(taskIndex)];
    if (task.type === 'bid') {
      document.querySelector('[data-place-bid="1"]')?.click();
      return;
    }

    if (task.type === 'insurance') {
      openModal(
        'Upload Insurance',
        `<form id="insuranceForm" class="modal-form">
          <label>Vehicle<select name="truck">${fleet.map(truck => `<option>${truck.plate} - ${truck.name}</option>`).join('')}</select></label>
          <label>Policy number<input name="policy" placeholder="Policy number" required></label>
          <label>Expiry date<input name="expiry" type="date" required></label>
          <label>Document<input name="file" type="file" accept=".pdf,image/*"></label>
          <button class="primary-btn" type="submit">Save Insurance</button>
        </form>`
      );
      document.getElementById('insuranceForm').addEventListener('submit', event => {
        event.preventDefault();
        closeModal();
        toast('Insurance document saved for review');
      });
      return;
    }

    openModal(
      'Confirm Pickup',
      `<form id="pickupForm" class="modal-form">
        <label>Depot contact<input value="Kampala depot" required></label>
        <label>Driver note<textarea>Arrived at depot, loading maize bags.</textarea></label>
        <button class="primary-btn" type="submit">Mark Pickup Started</button>
      </form>`
    );
    document.getElementById('pickupForm').addEventListener('submit', event => {
      event.preventDefault();
      closeModal();
      toast('Pickup status updated');
    });
  }
});

document.addEventListener('keydown', event => {
  if (!['Enter', ' '].includes(event.key)) return;
  const card = event.target.closest('[data-load-card],[data-fleet-card]');
  if (!card) return;
  event.preventDefault();
  card.querySelector('button[data-place-bid],button[data-manage-truck]')?.click();
});

document.getElementById('addTruck')?.addEventListener('click', () => {
  openModal(
    'Add Vehicle',
    `<form id="vehicleForm" class="modal-form">
      <label>Plate number<input name="plate" placeholder="KDB 123A" required></label>
      <label>Vehicle type<select name="type"><option>Lorry</option><option>Trailer</option><option>Pickup</option><option>Bus</option><option>Specialised</option></select></label>
      <label>Capacity<input name="capacity" placeholder="12 tonnes"></label>
      <label>Preferred lane<input name="lane" placeholder="Nairobi - Kampala"></label>
      <button class="primary-btn" type="submit">Save Vehicle</button>
    </form>`
  );
  document.getElementById('vehicleForm').addEventListener('submit', e => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.target).entries());
    const payload = {
      type: values.type,
      plateNumber: values.plate,
      capacityTonnes: Number.parseFloat(values.capacity) || 0,
      routes: values.lane ? [values.lane] : [],
      make: values.type,
      model: 'Owner listed',
      country: currentUser.country || 'Kenya'
    };

    API.createTruck(payload)
      .then(response => {
        const truck = response.truck || payload;
        fleet.unshift({
          plate: truck.plateNumber || values.plate,
          name: `${values.type} Owner listed`,
          status: 'Available',
          docs: 'Documents needed',
          lane: values.lane || 'Route pending',
          readiness: 54
        });
        renderFleet();
        toast('Vehicle saved to your live fleet');
      })
      .catch(() => {
        saveLocal('vehicles', values);
        toast('Vehicle saved locally. It will sync when the API is available.');
      })
      .finally(() => closeModal());
  });
});

document.getElementById('setRoutes')?.addEventListener('click', () => {
  openModal(
    'Preferred Routes',
    `<form id="routesForm" class="modal-form">
      <label>Primary lane<input value="Nairobi - Kampala"></label>
      <label>Secondary lane<input value="Mombasa - Kigali"></label>
      <label>Maximum distance<select><option>0 - 500 km</option><option selected>500 - 2,000 km</option><option>Continental</option></select></label>
      <button class="primary-btn" type="submit">Update Routes</button>
    </form>`
  );
  document.getElementById('routesForm').addEventListener('submit', e => {
    e.preventDefault();
    saveLocal('preferred_routes', Object.fromEntries(new FormData(e.target).entries()));
    closeModal();
    toast('Preferred routes updated');
  });
});
