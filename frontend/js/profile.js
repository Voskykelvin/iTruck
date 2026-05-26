const storedUser = JSON.parse(localStorage.getItem('itruck_user') || '{}');
const storedProfile = JSON.parse(localStorage.getItem('itruck_profile') || '{}');
const user = {
  firstName: storedUser.firstName || 'Super',
  lastName: storedUser.lastName || 'Admin',
  email: storedUser.email || 'admin@itruck.africa',
  phone: storedUser.phone || '+254700000000',
  country: storedUser.country || 'Kenya',
  company: storedUser.company || 'iTruck Africa',
  role: storedUser.role || 'admin',
  currency: storedProfile.currency || 'USD',
  avatar: storedProfile.avatar || ''
};

const documents = JSON.parse(localStorage.getItem('itruck_profile_documents') || '[]');
const requiredDocs = [
  { type: 'National ID', requiredFor: 'All accounts' },
  { type: 'Phone verification', requiredFor: 'All accounts' },
  { type: 'Company registration', requiredFor: 'Business accounts' },
  { type: 'Vehicle logbook', requiredFor: 'Fleet owners' },
  { type: 'Insurance certificate', requiredFor: 'Fleet owners' },
  { type: 'Driver license', requiredFor: 'Drivers / owners' }
];

function initials() {
  return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'IT';
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
  setTimeout(() => el.classList.remove('show'), 2600);
}

function openModal(title, body) {
  let shell = document.getElementById('profileModal');
  if (!shell) {
    shell = document.createElement('div');
    shell.id = 'profileModal';
    shell.className = 'workspace-modal';
    shell.innerHTML = '<div class="workspace-dialog"><button class="modal-x" type="button" data-close-profile-modal>x</button><div id="profileModalContent"></div></div>';
    document.body.appendChild(shell);
    shell.addEventListener('click', event => {
      if (event.target === shell || event.target.closest('[data-close-profile-modal]')) closeModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeModal();
    });
  }
  document.getElementById('profileModalContent').innerHTML = `<h2>${title}</h2>${body}`;
  shell.classList.add('open');
}

function closeModal() {
  document.getElementById('profileModal')?.classList.remove('open');
}

async function withButtonBusy(button, busyText, action) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  try {
    await action();
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function documentStatus(type) {
  return documents.find(doc => doc.type === type);
}

function calculateScore() {
  const profileFields = ['firstName', 'lastName', 'email', 'phone', 'country', 'company'].filter(key => user[key]).length;
  const docCount = documents.length;
  return Math.min(100, Math.round(((profileFields / 6) * 45) + ((docCount / requiredDocs.length) * 55)));
}

function renderProfile() {
  document.getElementById('profileName').textContent = `${user.firstName} ${user.lastName}`;
  document.getElementById('profileEmail').textContent = user.email;
  document.getElementById('profileRole').textContent = user.role === 'owner' ? 'Fleet Owner' : user.role === 'client' ? 'Client / Shipper' : 'Admin';
  document.getElementById('profileCountry').textContent = user.country;

  const avatar = document.getElementById('avatarPreview');
  if (user.avatar) {
    avatar.style.backgroundImage = `url(${user.avatar})`;
    avatar.textContent = '';
  } else {
    avatar.textContent = initials();
  }

  const form = document.getElementById('profileForm');
  Object.entries(user).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });

  const score = calculateScore();
  document.getElementById('verificationScore').textContent = `${score}%`;
  document.getElementById('verificationBar').style.width = `${score}%`;
}

function renderDocuments() {
  document.getElementById('documentGrid').innerHTML = requiredDocs.map(doc => {
    const existing = documentStatus(doc.type);
    return `<article class="document-card">
      <div>
        <span class="badge ${existing ? 'success' : 'warn'}">${existing ? 'Uploaded' : 'Needed'}</span>
        <h3>${doc.type}</h3>
        <p>${doc.requiredFor}</p>
        <small>${existing ? existing.name : 'PDF, JPG, or PNG accepted'}</small>
      </div>
      <label class="ghost-btn">
        Upload
        <input type="file" class="doc-input" data-doc-type="${doc.type}" accept=".pdf,image/*">
      </label>
    </article>`;
  }).join('');

  document.getElementById('verificationChecklist').innerHTML = requiredDocs.map(doc => {
    const existing = documentStatus(doc.type);
    return `<div class="check-item ${existing ? 'done' : ''}">
      <span>${existing ? 'OK' : '-'}</span>
      <div><strong>${doc.type}</strong><small>${existing ? 'Received for review' : doc.requiredFor}</small></div>
    </div>`;
  }).join('');
}

document.getElementById('avatarInput').addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    user.avatar = reader.result;
    localStorage.setItem('itruck_profile', JSON.stringify({ ...storedProfile, avatar: user.avatar, currency: user.currency }));
    renderProfile();
    toast('Profile photo updated');
  };
  reader.readAsDataURL(file);
});

document.getElementById('documentGrid').addEventListener('change', event => {
  if (!event.target.classList.contains('doc-input')) return;
  const file = event.target.files[0];
  if (!file) return;
  const type = event.target.dataset.docType;
  const next = documents.filter(doc => doc.type !== type);
  next.push({ type, name: file.name, size: file.size, uploadedAt: new Date().toISOString(), status: 'review' });
  localStorage.setItem('itruck_profile_documents', JSON.stringify(next));
  documents.length = 0;
  documents.push(...next);
  renderDocuments();
  renderProfile();
  toast(`${type} uploaded for review`);
});

document.getElementById('saveProfile').addEventListener('click', event => {
  withButtonBusy(event.currentTarget, 'Saving...', async () => {
    const formData = Object.fromEntries(new FormData(document.getElementById('profileForm')).entries());
    Object.assign(user, formData);
    localStorage.setItem('itruck_user', JSON.stringify({ ...storedUser, ...formData }));
    localStorage.setItem('itruck_profile', JSON.stringify({ ...storedProfile, avatar: user.avatar, currency: user.currency }));
    renderProfile();
    toast('Profile saved');
  });
});

document.getElementById('changePassword').addEventListener('click', () => {
  openModal(
    'Change Password',
    `<form id="passwordForm" class="modal-form">
      <label>Current password<input name="currentPassword" type="password" required></label>
      <label>New password<input name="newPassword" type="password" minlength="8" required></label>
      <label>Confirm new password<input name="confirmPassword" type="password" minlength="8" required></label>
      <button class="primary-btn" type="submit">Update Password</button>
    </form>`
  );
  document.getElementById('passwordForm').addEventListener('submit', event => {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    withButtonBusy(button, 'Updating...', async () => {
      const values = Object.fromEntries(new FormData(event.target).entries());
      if (values.newPassword !== values.confirmPassword) {
        toast('Passwords do not match');
        return;
      }
      localStorage.setItem('itruck_security_updated', new Date().toISOString());
      closeModal();
      toast('Password update saved for API sync');
    });
  });
});

document.querySelectorAll('.settings-list input').forEach(input => {
  const label = input.parentElement.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const key = `itruck_security_${label}`;
  const stored = localStorage.getItem(key);
  if (stored !== null) input.checked = stored === 'true';
  input.addEventListener('change', () => {
    localStorage.setItem(key, input.checked ? 'true' : 'false');
    toast('Security preference saved');
  });
});

document.getElementById('logoutBtn').onclick = () => {
  API.clear();
  location.href = '../index.html';
};

renderProfile();
renderDocuments();
