import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SearchPalette from './SearchPalette';

vi.mock('../../queries/session', () => ({
  useSessionBootstrap: () => ({
    data: { role: 'client', firstName: 'John' },
    isLoading: false
  })
}));

vi.mock('../../queries/commercial', () => ({
  useBookings: () => ({
    data: [
      {
        id: 'shp-101',
        route: 'Nairobi → Mombasa',
        origin: 'Nairobi',
        destination: 'Mombasa',
        cargo: 'Agricultural Maize',
        vehicleType: 'Lorry',
        status: 'in_transit',
        rawStatus: 'in_transit'
      }
    ]
  })
}));

describe('SearchPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <MemoryRouter>
        <SearchPalette isOpen={false} onClose={() => {}} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders practical close button and does NOT show static ESC to close badge', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <SearchPalette isOpen={true} onClose={onClose} />
      </MemoryRouter>
    );

    // Verify static badge is gone
    expect(screen.queryByText(/esc to close/i)).not.toBeInTheDocument();

    // Verify accessible practical close button exists and functions
    const closeBtn = screen.getByRole('button', { name: /close search/i });
    expect(closeBtn).toBeInTheDocument();

    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('allows typing and provides clear input functionality', () => {
    render(
      <MemoryRouter>
        <SearchPalette isOpen={true} onClose={() => {}} />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(/search shipments/i);
    fireEvent.change(input, { target: { value: 'Nairobi' } });
    expect(input.value).toBe('Nairobi');

    // Clear button appears
    const clearBtn = screen.getByRole('button', { name: /clear search input/i });
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(input.value).toBe('');
  });
});
