import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import AppShell from './App.jsx';
import { navigate } from './utils/helpers.js';

describe('App Integration & Page Routing', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset window location back to base/app
    window.history.pushState({}, '', '/app/profile');
  });

  afterEach(() => {
    cleanup();
  });

  test('Public legal routes render without login', () => {
    navigate('/app/privacy');
    render(<AppShell />);
    expect(screen.getByText('Privacy Notice')).toBeInTheDocument();

    navigate('/app/terms');
    cleanup();
    render(<AppShell />);
    expect(screen.getByText('Terms of Service')).toBeInTheDocument();
  });

  test('Guest is redirected to profile/signin and can log in as Shipper', async () => {
    render(<AppShell />);

    // Guest should be redirected to profile page and see signin form
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();

    // Fill sign in form
    const emailInput = screen.getByLabelText('Email');
    const passInput = screen.getByLabelText('Password');
    fireEvent.change(emailInput, { target: { value: 'shipper@example.com' } });
    fireEvent.change(passInput, { target: { value: 'password123' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: 'Sign in' });
    fireEvent.click(submitBtn);

    // Sidebar and toast should show up after signin completes
    await screen.findByText('iTruck');
    expect(screen.getByText('Operational Workspace')).toBeInTheDocument();
  });

  test('Can sign up as a new user', async () => {
    render(<AppShell />);

    // Click register
    const createBtn = screen.getByRole('button', { name: 'Create account' });
    fireEvent.click(createBtn);

    // Fill register inputs
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Phone', { selector: 'input' }), { target: { value: '711222333' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });

    const submitBtn = screen.getByRole('button', { name: 'Create account' });
    fireEvent.click(submitBtn);

    await screen.findByText('Account created — welcome to iTruck');
  });

  test('Shipper dashboard routes and interactive operations work', async () => {
    // Seed logged-in Shipper user
    localStorage.setItem(
      'itruck_user',
      JSON.stringify({
        id: 'usr-shipper',
        email: 'shipper@example.com',
        role: 'shipper',
        isVerified: true,
        firstName: 'Alice',
        lastName: 'Shipper'
      })
    );

    navigate('/app/shipper');
    render(<AppShell />);

    // Verify Shipper page loaded
    expect(screen.getByText('Shipment Command')).toBeInTheDocument();

    // Navigate to Book page
    navigate('/app/book');
    await screen.findByText('Book a Truck');

    // Fill shipment request form
    fireEvent.change(screen.getByLabelText('Pickup'), { target: { value: 'Mombasa' } });
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'Nairobi' } });
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'Tea bags' } });
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '10 tonnes' } });
    fireEvent.change(screen.getByLabelText('Cargo value USD'), { target: { value: '15000' } });
    fireEvent.change(screen.getByLabelText('Receiver name'), { target: { value: 'Bob Receiver' } });
    fireEvent.change(screen.getByLabelText('Receiver phone'), { target: { value: '+254711000999' } });

    // Acknowledge quote
    fireEvent.click(screen.getByLabelText('I reviewed fees, optional services, and required documents.'));

    // Submit shipment request
    const bookBtn = screen.getByRole('button', { name: 'Confirm Booking' });
    fireEvent.click(bookBtn);

    // Navigate to Bids page
    navigate('/app/bids');
    await screen.findByText('Bids Received');

    // Navigate to Marketplace
    navigate('/app/marketplace');
    await screen.findByText('Refine fleet');

    // Navigate to Tracking / Orders
    navigate('/app/tracking');
    await screen.findByText('Cargo');

    // Navigate to Documents
    navigate('/app/documents');
    await screen.findByText('Shipment Documents');

    // Navigate to Payments
    navigate('/app/payments');
    await screen.findByText('Shipment Escrow');

    // Navigate to Messages
    navigate('/app/messages');
    await screen.findByRole('heading', { name: 'Messages' });
  });

  test('Owner dashboard routes and interactive operations work', async () => {
    // Seed logged-in Owner user
    localStorage.setItem(
      'itruck_user',
      JSON.stringify({
        id: 'usr-owner',
        email: 'owner@example.com',
        role: 'owner',
        isVerified: true,
        firstName: 'David',
        lastName: 'Owner',
        company: 'David Haulage'
      })
    );

    navigate('/app/owner');
    render(<AppShell />);

    // Verify Owner Page loaded
    expect(screen.getByText('Job Board')).toBeInTheDocument();

    // Verify Onboarding Verification page
    navigate('/app/onboarding');
    await screen.findByText('Documents for Admin Review');

    // Verify Vehicles
    navigate('/app/vehicles');
    await screen.findByText('Vehicle Readiness');

    // Find work
    navigate('/app/bids');
    await screen.findByText('Available Loads');
  });

  test('Admin dashboard routes and operations work', async () => {
    // Seed logged-in Admin user
    localStorage.setItem(
      'itruck_user',
      JSON.stringify({
        id: 'usr-admin',
        email: 'admin@example.com',
        role: 'admin',
        isVerified: true,
        firstName: 'Admin',
        lastName: 'User'
      })
    );

    navigate('/app/admin');
    render(<AppShell />);

    // Verify Admin Console loaded
    expect(screen.getByText('Approvals Console')).toBeInTheDocument();
  });
});
