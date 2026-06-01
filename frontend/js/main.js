const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function scrollToSignup() {
  $('#signup')?.scrollIntoView({ behavior: 'smooth' });
}

function toast(message) {
  const toastEl = $('#toast');
  const messageEl = $('#toastMsg');
  if (!toastEl || !messageEl) return;
  messageEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2800);
}

function openModal(type) {
  $('#modalOverlay')?.classList.add('active');
  $$('.modal').forEach((modal) => modal.classList.remove('active'));
  $(`#modal-${type}`)?.classList.add('active');
}

function closeModal() {
  $('#modalOverlay')?.classList.remove('active');
  $$('.modal').forEach((modal) => modal.classList.remove('active'));
}

function bindNavigation() {
  const navbar = $('#navbar');
  const hamburger = $('#hamburger');
  hamburger?.addEventListener('click', () => {
    const isOpen = navbar.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  $$('.nav-links a').forEach((link) => {
    link.addEventListener('click', () => {
      navbar?.classList.remove('open');
      hamburger?.setAttribute('aria-expanded', 'false');
    });
  });
}

function bindModals() {
  $$('[data-open-modal]').forEach((button) => {
    button.addEventListener('click', () => openModal(button.dataset.openModal));
  });
  $$('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
  $('#modalOverlay')?.addEventListener('click', (event) => {
    if (event.target.id === 'modalOverlay') closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

const dialCodes = {
  Kenya: '+254',
  Nigeria: '+234',
  'South Africa': '+27',
  Uganda: '+256',
  Tanzania: '+255',
  Ghana: '+233',
  Egypt: '+20',
  Morocco: '+212',
  Ethiopia: '+251',
  'DRC Congo': '+243'
};

function bindCountryControls() {
  $$('[data-auth-form]').forEach((form) => {
    const country = $('[data-country-select]', form);
    const code = $('[data-country-code]', form);
    if (!country || !code) return;

    country.addEventListener('change', () => {
      code.value = dialCodes[country.value] || code.value;
    });

    code.addEventListener('change', () => {
      const match = Object.entries(dialCodes).find(([, value]) => value === code.value);
      if (match) country.value = match[0];
    });
  });
}

function redirectForRole(role) {
  if (location.protocol === 'file:') {
    if (role === 'owner') return '/app/owner';
    if (role === 'admin') return '/app/admin';
    return '/app/shipper';
  }

  if (role === 'owner') return '/app/owner';
  if (role === 'admin') return '/app/admin';
  return '/app/shipper';
}

function bindAuthForms() {
  $$('[data-auth-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Creating...';

      try {
        const data = await API.register(form.dataset.authForm, formData(form));
        API.setToken(data.token);
        localStorage.setItem('itruck_user', JSON.stringify(data.user));
        toast('Account created');
        setTimeout(() => {
          location.href = redirectForRole(data.user.role);
        }, 500);
      } catch (err) {
        toast(err.message);
      } finally {
        button.disabled = false;
        button.textContent = form.dataset.authForm === 'owner' ? 'Create Owner Account' : 'Create Client Account';
      }
    });
  });

  $('[data-login-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Signing in...';

    try {
      const data = await API.login(formData(event.target));
      API.setToken(data.token);
      localStorage.setItem('itruck_user', JSON.stringify(data.user));
      toast('Welcome back');
      setTimeout(() => {
        location.href = redirectForRole(data.user.role);
      }, 500);
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Log In';
    }
  });
}

function countStats() {
  const stats = $$('.hero-stats strong');
  let done = false;

  function count() {
    if (done) return;
    done = true;
    stats.forEach((el) => {
      const target = Number(el.dataset.target || 0);
      let value = 0;
      const step = Math.max(1, Math.ceil(target / 70));
      const id = setInterval(() => {
        value += step;
        if (value >= target) {
          value = target;
          clearInterval(id);
        }
        el.textContent = value.toLocaleString();
      }, 22);
    });
  }

  const target = $('.hero-stats');
  if (!target) return;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && count()), {
      threshold: 0.25
    }).observe(target);
  } else {
    count();
  }
}

function createParticles() {
  const container = $('#particles');
  if (!container) return;
  for (let i = 0; i < 18; i += 1) {
    const particle = document.createElement('i');
    particle.style.cssText = `position:absolute;width:3px;height:3px;border-radius:50%;background:rgba(245,158,11,.56);left:${Math.random() * 100}%;top:${Math.random() * 100}%;opacity:.58`;
    container.appendChild(particle);
  }
}

bindNavigation();
bindModals();
bindCountryControls();
bindAuthForms();
countStats();
createParticles();
