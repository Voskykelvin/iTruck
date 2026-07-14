import { describe, expect, it } from 'vitest';
import { money, timeFormat } from './helpers';

describe('display helpers', () => {
  it('formats monetary values consistently', () => {
    expect(money(1250, 'USD')).toMatch(/1,250/);
  });

  it('handles absent and invalid timestamps safely', () => {
    expect(timeFormat()).toBe('—');
    expect(timeFormat('not-a-date')).toBe('—');
  });

  it('formats valid timestamps', () => {
    expect(timeFormat('2026-07-14T10:00:00.000Z')).not.toBe('—');
  });
});
