const content = document.getElementById('adminContent');

const rows = {
  users: [
    ['Amina Osei', 'Client', 'Ghana', 'Verified phone'],
    ['James Mwangi', 'Owner', 'Kenya', 'Documents approved'],
    ['Super Admin', 'Admin', 'Kenya', 'Control center']
  ],
  trucks: [
    ['Isuzu FVZ', 'Lorry', 'Verified', 'Nairobi-Kampala'],
    ['Scania R450', 'Trailer', 'Verified', 'Mombasa-Kigali'],
    ['Toyota Hilux', 'Pickup', 'Insurance review', 'Accra-Kumasi']
  ],
  bookings: [
    ['ITK-2044', 'Nairobi to Kampala', 'In Transit', 'On schedule'],
    ['ITK-2031', 'Mombasa to Dar es Salaam', 'Bidding', '3 offers'],
    ['ITK-2028', 'Accra to Lagos', 'Delivered', 'POD ready']
  ],
  payments: [
    ['TX-991', 'Wallet escrow', '$920', 'Held'],
    ['TX-992', 'M-Pesa', '$1,260', 'Pending release'],
    ['TX-993', 'Card escrow', '$780', 'Paid']
  ]
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

function table(name) {
  return `
    <section class="panel">
      <div class="panel-heading">
        <div><p class="eyebrow">${name}</p><h2>${name[0].toUpperCase()}${name.slice(1)}</h2></div>
        <button class="secondary-btn" data-export="${name}">Export CSV</button>
      </div>
      <table class="admin-table"><tbody>${rows[name].map((row, rowIndex) => `
        <tr>${row.map(cell => `<td>${cell}</td>`).join('')}<td><button class="ghost-btn" data-review-row="${name}:${rowIndex}">Review</button></td></tr>
      `).join('')}</tbody></table>
    </section>
  `;
}

function dashboard() {
  content.innerHTML = `
    <div class="kpi-grid">
      <article class="metric-card admin-kpi"><span>Total Users</span><strong id="adminUsers">52,014</strong><small>Clients, owners, and admins</small></article>
      <article class="metric-card admin-kpi"><span>Active Trucks</span><strong id="adminTrucks">12,431</strong><small>Verified and pending vehicles</small></article>
      <article class="metric-card admin-kpi"><span>Bookings</span><strong id="adminBookings">88,210</strong><small>Open and completed shipments</small></article>
      <article class="metric-card admin-kpi"><span>Revenue</span><strong id="adminRevenue">$2.4M</strong><small>Escrow and completed trips</small></article>
    </div>
    <section class="panel" style="margin-top:18px">
      <div class="panel-heading"><div><p class="eyebrow">Operations</p><h2>Attention Queue</h2></div><button class="primary-btn" id="runAudit">Run Audit</button></div>
      <div class="action-list">
        <button class="action-item" data-admin-task="verification"><strong>Verify owners</strong><span>12 accounts have new identity or insurance files.</span></button>
        <button class="action-item" data-admin-task="payments"><strong>Release payments</strong><span>6 delivered shipments are waiting for escrow approval.</span></button>
        <button class="action-item" data-admin-task="support"><strong>Resolve issues</strong><span>3 route and document reports need an operator reply.</span></button>
      </div>
    </section>
  `;
  document.getElementById('runAudit').addEventListener('click', () => toast('Audit queued: verification, documents, payments, and route exceptions'));
  API.adminStats()
    .then(stats => {
      document.getElementById('adminUsers').textContent = Number(stats.totalUsers || 0).toLocaleString();
      document.getElementById('adminTrucks').textContent = Number(stats.totalTrucks || 0).toLocaleString();
      document.getElementById('adminBookings').textContent = Number(stats.totalBookings || 0).toLocaleString();
      document.getElementById('adminRevenue').textContent = `$${Number(stats.totalRevenue || 0).toLocaleString()}`;
    })
    .catch(() => toast('Using demo admin metrics until the API is available'));
}

function settings() {
  content.innerHTML = `
    <section class="panel">
      <h2>Settings</h2>
      <div class="settings-grid">
        <article class="settings-card"><p class="eyebrow">Appearance</p><h3>Theme</h3><p class="muted">Choose how iTruck appears on this device.</p><div class="segmented-control"><button type="button" data-theme-choice="light">Light</button><button type="button" data-theme-choice="dark">Dark</button></div></article>
        <article class="settings-card"><p class="eyebrow">Operations</p><h3>Low-data mode</h3><p class="muted">Use lighter maps and fewer background updates for drivers on weaker networks.</p><label class="settings-toggle"><input type="checkbox" id="lowDataMode"> Enable low-data mode</label></article>
        <article class="settings-card"><p class="eyebrow">Notifications</p><h3>Channels</h3><p class="muted">Choose where shipment, document, bid, and payment alerts are sent.</p><label class="settings-toggle"><input type="checkbox" checked> Email</label><label class="settings-toggle"><input type="checkbox" checked> SMS</label><label class="settings-toggle"><input type="checkbox"> WhatsApp</label></article>
      </div>
    </section>
  `;
  if (window.iTruckTheme) {
    document.querySelectorAll('[data-theme-choice]').forEach(btn => {
      btn.addEventListener('click', () => window.iTruckTheme.apply(btn.dataset.themeChoice));
      btn.classList.toggle('active', btn.dataset.themeChoice === window.iTruckTheme.current());
    });
  }
  document.querySelectorAll('.settings-toggle input').forEach(input => input.addEventListener('change', () => toast('Setting saved')));
}

document.addEventListener('click', event => {
  const review = event.target.closest('[data-review-row]')?.dataset.reviewRow;
  const task = event.target.closest('[data-admin-task]')?.dataset.adminTask;
  const exportName = event.target.closest('[data-export]')?.dataset.export;
  if (review) toast(`Review opened for ${review.replace(':', ' row ')}`);
  if (task) toast(`${task} queue opened`);
  if (exportName) toast(`${exportName} export prepared`);
});

document.querySelectorAll('[data-admin-section]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-admin-section]').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    const section = button.dataset.adminSection;
    if (section === 'dashboard') dashboard();
    else if (section === 'settings') settings();
    else content.innerHTML = table(section);
  });
});

dashboard();
