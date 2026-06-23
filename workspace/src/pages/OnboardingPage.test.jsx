import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import OnboardingPage from './OnboardingPage.jsx';
import { server } from '../test/mocks/server.js';
import { http, HttpResponse } from 'msw';

const mockNotify = vi.fn();
const mockSetUser = vi.fn();

const clientUser = {
  id: 'usr-shipper',
  email: 'shipper@example.com',
  role: 'client',
  firstName: 'John',
  lastName: 'Doe',
  phone: '+254700000000',
  country: 'Kenya',
  isVerified: false,
  documents: []
};

const ownerUser = {
  id: 'usr-owner',
  email: 'owner@example.com',
  role: 'owner',
  firstName: 'David',
  lastName: 'Carrier',
  phone: '+254700111222',
  country: 'Kenya',
  isVerified: false,
  documents: []
};

describe('OnboardingPage Interaction & Verification Tests', () => {
  beforeEach(() => {
    mockNotify.mockClear();
    mockSetUser.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  test('Shipper: shows stages, triggers profile document upload and checks booking constraints', async () => {
    server.use(
      http.post('*/api/upload/cargo', () => {
        return HttpResponse.json({
          urls: ['https://example.com/kyc.pdf']
        });
      }),
      http.patch('*/api/users/documents/:documentType', () => {
        return HttpResponse.json({
          success: true,
          user: {
            ...clientUser,
            documents: [{ type: 'shipper-kyc', status: 'pending', url: 'https://example.com/kyc.pdf' }]
          }
        });
      })
    );

    render(<OnboardingPage notify={mockNotify} user={clientUser} setUser={mockSetUser} />);

    expect(screen.getByText('Submit shipper identity and business documents')).toBeInTheDocument();

    // 1. Attempt to book shipment when required docs are missing
    const bookBtn = screen.getByRole('button', { name: 'Book Shipment' });
    fireEvent.click(bookBtn);

    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringContaining('Please complete your profile: Shipper KYC is required')
    );

    // 2. Upload Shipper KYC document
    const docSlot = screen.getByRole('button', { name: /Shipper KYC/ });
    fireEvent.click(docSlot);

    // Simulate file attachment
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['dummy content'], 'kyc.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Document sent to admin review');
    });
    expect(mockSetUser).toHaveBeenCalled();
  });

  test('Owner: registers vehicle, attaches/removes photo, and submits vehicle registration', async () => {
    server.use(
      http.get('*/api/trucks/fleet', () => HttpResponse.json({ trucks: [] })),
      http.post('*/api/upload/cargo', () => {
        return HttpResponse.json({
          urls: ['https://example.com/truck.jpg']
        });
      }),
      http.post('*/api/trucks', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({
          success: true,
          truck: {
            id: 'TRK-new',
            plate: body.plateNumber,
            type: body.type,
            capacity: body.capacityTonnes + ' tonnes',
            verified: false
          }
        });
      })
    );

    render(<OnboardingPage notify={mockNotify} user={ownerUser} setUser={mockSetUser} />);

    await screen.findByText('Vehicle Registration');

    // 1. Upload Vehicle Photo
    const photoUploadBtn = screen.getByRole('button', { name: /Click to Upload Vehicle Photo/ });
    fireEvent.click(photoUploadBtn);

    // Attach file on the second file input (vehicle photos helper)
    const fileInputs = document.querySelectorAll('input[type="file"]');
    // OnboardingPage.jsx renders two hidden file inputs: index 0 is profile docs, index 1 is vehicle photos
    const photoInput = fileInputs[1];
    const file = new File(['dummy photo'], 'truck.jpg', { type: 'image/jpeg' });
    fireEvent.change(photoInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Vehicle photo attached to this enrollment');
    });

    // Verify photo preview card exists
    expect(screen.getByRole('img', { name: 'Vehicle photo 1' })).toBeInTheDocument();

    // Remove photo
    const removeBtn = screen.getByRole('button', { name: '×' });
    fireEvent.click(removeBtn);
    expect(screen.queryByRole('img', { name: 'Vehicle photo 1' })).not.toBeInTheDocument();

    // 2. Submit vehicle registration
    fireEvent.change(screen.getByLabelText('Plate number'), { target: { value: 'KBB 111C' } });
    fireEvent.change(screen.getByLabelText('Capacity tonnes'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Preferred routes'), { target: { value: 'Nairobi-Kigali' } });

    const submitBtn = screen.getByRole('button', { name: 'Send Vehicle for Review' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Vehicle sent to admin review');
    });
  });
});
