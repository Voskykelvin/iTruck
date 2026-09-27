export function normalizeProfileRecord(raw = {}) {
  return {
    firstName: raw.firstName || '',
    lastName: raw.lastName || '',
    companyName: raw.companyName || raw.company || '',
    email: raw.email || '',
    phone: raw.phone || '',
    country: raw.country || '',
    countryCode: raw.countryCode || '',
    role: raw.role || '',
    accountType: raw.accountType || ''
  };
}

export function normalizeProfilePayload(raw = {}) {
  const normalized = {};

  const entries = [
    ['firstName', raw.firstName],
    ['lastName', raw.lastName],
    ['phone', raw.phone],
    ['company', raw.companyName ?? raw.company],
    ['country', raw.country],
    ['countryCode', raw.countryCode],
    ['accountType', raw.accountType]
  ];

  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue;

    const text = String(value).trim();
    if (!text) continue;

    normalized[key] = text;
  }

  return normalized;
}
