import { describe, expect, it } from 'vitest';
import { normalizeProfilePayload, normalizeProfileRecord } from './profile';

describe('profile normalization', () => {
  it('maps the settings form field names to the backend contract', () => {
    expect(
      normalizeProfilePayload({
        firstName: 'Jane',
        lastName: 'Wanjiku',
        companyName: 'BlueRoute Logistics',
        email: 'jane@example.com'
      })
    ).toEqual({
      firstName: 'Jane',
      lastName: 'Wanjiku',
      company: 'BlueRoute Logistics'
    });
  });

  it('reads backend profile data into the settings form shape', () => {
    expect(
      normalizeProfileRecord({
        firstName: 'Jane',
        lastName: 'Wanjiku',
        company: 'BlueRoute Logistics',
        email: 'jane@example.com'
      })
    ).toEqual({
      firstName: 'Jane',
      lastName: 'Wanjiku',
      companyName: 'BlueRoute Logistics',
      email: 'jane@example.com',
      phone: '',
      country: '',
      countryCode: '',
      role: '',
      accountType: ''
    });
  });

  it('drops empty values while preserving valid edits', () => {
    expect(
      normalizeProfilePayload({
        firstName: '  ',
        lastName: 'Mwangi',
        companyName: '',
        phone: '0712345678'
      })
    ).toEqual({
      lastName: 'Mwangi',
      phone: '0712345678'
    });
  });
});
