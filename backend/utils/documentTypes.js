function normalizeDocumentSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeProfileDocumentType(value, role = 'client') {
  const slug = normalizeDocumentSlug(value);
  if (slug === 'kyc') {
    if (role === 'owner') return 'owner-kyc';
    if (role === 'driver') return 'driver-id';
    return 'shipper-kyc';
  }
  const aliases = {
    'driving-license': 'driver-license',
    'driver-licence': 'driver-license',
    'driving-licence': 'driver-license',
    'driver-license': 'driver-license',
    'national-id': 'driver-id',
    'id-card': 'driver-id'
  };

  return aliases[slug] || slug;
}

function normalizeTruckDocumentType(value) {
  const slug = normalizeDocumentSlug(value);
  const aliases = {
    license: 'road-license',
    logbook: 'vehicle-logbook',
    'vehicle-photo': 'vehicle-photos'
  };

  return aliases[slug] || slug;
}

function normalizeBookingDocumentType(value) {
  const slug = normalizeDocumentSlug(value);
  const aliases = {
    'cargo-photo': 'cargo-photos',
    'commercial-invoice': 'invoice',
    'customs-declaration': 'customs',
    'proof-of-delivery': 'pod',
    pod: 'pod'
  };

  return aliases[slug] || slug;
}

function isDocumentUrl(value) {
  const text = String(value || '').trim();
  if (/^\/api\/uploads\/local\/[a-z0-9-]+(?:\.[a-z0-9]+)?$/i.test(text)) return true;

  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_err) {
    return false;
  }
}

module.exports = {
  isDocumentUrl,
  normalizeBookingDocumentType,
  normalizeDocumentSlug,
  normalizeProfileDocumentType,
  normalizeTruckDocumentType
};
