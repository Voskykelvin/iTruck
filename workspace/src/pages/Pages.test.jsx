import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import MessagesPage from './MessagesPage.jsx';
import MarketplacePage from './MarketplacePage.jsx';
import BookingPage from './BookingPage.jsx';
import DocumentsPage from './DocumentsPage.jsx';
import PaymentsPage from './PaymentsPage.jsx';
import ProfilePage from './ProfilePage.jsx';
import OnboardingPage from './OnboardingPage.jsx';
import OwnerPage from './OwnerPage.jsx';
import ShipperPage from './ShipperPage.jsx';
import AdminPage from './AdminPage.jsx';
import TrackingPage from './TrackingPage.jsx';
import BidsPage from './BidsPage.jsx';

const mockNotify = vi.fn();
const mockSetUser = vi.fn();
const mockSignOut = vi.fn();

const defaultUser = {
  id: 'usr-1',
  email: 'test@example.com',
  role: 'client',
  firstName: 'John',
  lastName: 'Doe',
  phone: '+254711222333',
  country: 'Kenya',
  isVerified: true,
  documents: []
};

const ownerUser = {
  ...defaultUser,
  id: 'usr-owner',
  email: 'owner@example.com',
  role: 'owner',
  company: 'David Haulage'
};

const adminUser = {
  ...defaultUser,
  id: 'usr-admin',
  email: 'admin@example.com',
  role: 'admin'
};

const driverUser = {
  ...defaultUser,
  id: 'usr-driver',
  email: 'driver@example.com',
  role: 'driver'
};

describe('Page Components Unit & Interaction Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNotify.mockClear();
    mockSetUser.mockClear();
    mockSignOut.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  // 1. MESSAGES PAGE
  test('MessagesPage interactions', async () => {
    render(<MessagesPage notify={mockNotify} user={defaultUser} />);

    // Check loading bookings
    await screen.findByText('Threads');

    // Find thread list buttons and click one
    const threadBtns = await screen.findAllByRole('button');
    if (threadBtns.length > 0) {
      fireEvent.click(threadBtns[0]);
    }

    // Type in chat input and submit
    const chatInput = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(chatInput, { target: { value: 'Hello carrier' } });
    expect(chatInput.value).toBe('Hello carrier');

    const sendBtn = screen.getByLabelText('Send message');
    fireEvent.click(sendBtn);

    expect(mockNotify).not.toHaveBeenCalledWith(expect.stringContaining('Error'));
  });

  // 2. MARKETPLACE PAGE
  test('MarketplacePage searches, filters, and displays profiles', async () => {
    const { rerender } = render(<MarketplacePage route="/app/marketplace" />);

    // Check filter sidebar elements
    expect(screen.getByText('Refine fleet')).toBeInTheDocument();

    // Search input
    const searchInput = screen.getByPlaceholderText('Search route, owner, plate');
    fireEvent.change(searchInput, { target: { value: 'Mombasa' } });

    // Select vehicle type
    const selectType = screen.getByLabelText('Vehicle type');
    fireEvent.change(selectType, { target: { value: 'Flatbed' } });

    // Toggle verified checkbox
    const verifiedToggle = screen.getByLabelText('Verified only');
    fireEvent.click(verifiedToggle);

    // Sort
    const selectSort = screen.getByLabelText('Sort');
    fireEvent.change(selectSort, { target: { value: 'price' } });

    // Render with truck details query params
    rerender(<MarketplacePage route="/app/marketplace?truck=TRK-001" />);
    await screen.findByText('Request Truck');

    // Render with booking options query params
    rerender(<MarketplacePage route="/app/marketplace?booking=ITK-001" />);
    await screen.findByText('Back to Shipments');
  });

  // 3. BOOKING PAGE
  test('BookingPage form fills and validation', async () => {
    render(<BookingPage notify={mockNotify} />);

    // Step 1: Route
    fireEvent.change(screen.getByLabelText('Pickup'), { target: { value: 'Nairobi' } });
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'Mombasa' } });
    fireEvent.change(screen.getByLabelText('Distance km (road route)'), { target: { value: '500' } });

    // Select border / pickup window
    fireEvent.change(screen.getByLabelText('Border'), { target: { value: 'Cross-border' } });
    fireEvent.change(screen.getByLabelText('Pickup window'), { target: { value: 'Morning pickup' } });

    // Step 2: Vehicle & Cargo
    // Click optional services checkboxes
    const loadingCrewCheck = screen.getByLabelText('Loading crew');
    fireEvent.click(loadingCrewCheck);

    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'Rice bags' } });
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '20 tons' } });
    fireEvent.change(screen.getByLabelText('Handling'), { target: { value: 'Refrigerated' } });
    fireEvent.change(screen.getByLabelText('Cargo value USD'), { target: { value: '30000' } });

    // Step 3: Receiver & Payment
    fireEvent.change(screen.getByLabelText('Receiver name'), { target: { value: 'Sam Receiver' } });
    fireEvent.change(screen.getByLabelText('Receiver phone'), { target: { value: '+254700111222' } });
    fireEvent.change(screen.getByLabelText('Updates'), { target: { value: 'WhatsApp + SMS updates' } });
    fireEvent.change(screen.getByLabelText('Payment'), { target: { value: 'M-Pesa' } });

    // Click document draft buttons in quote panel
    const docBtns = await screen.findAllByRole('button');
    const waybillDraftBtn = docBtns.find((btn) => btn.textContent === 'Waybill');
    if (waybillDraftBtn) {
      fireEvent.click(waybillDraftBtn);
    }

    // Attempt submit without ack (should fail/notify)
    const submitBtn = screen.getByRole('button', { name: 'Confirm Booking' });
    fireEvent.click(submitBtn);
    expect(mockNotify).toHaveBeenCalledWith('Review and acknowledge quote details first');

    // Acknowledge quote checkbox and click submit
    const ackCheck = screen.getByLabelText('I reviewed fees, optional services, and required documents.');
    fireEvent.click(ackCheck);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining('Booking request created'));
    });
  });

  // 4. DOCUMENTS PAGE
  test('DocumentsPage slots and actions', async () => {
    // Client role
    const { rerender } = render(<DocumentsPage notify={mockNotify} user={defaultUser} setUser={mockSetUser} />);
    await screen.findByText('Shipment Documents');

    // Render as Owner role to see profile, fleet and handover documents
    rerender(<DocumentsPage notify={mockNotify} user={ownerUser} setUser={mockSetUser} />);
    await screen.findByText('Fleet Documents');
    await screen.findByText('Job Handover Documents');
  });

  // 5. PAYMENTS PAGE
  test('PaymentsPage wallet topup, escrow, and payouts', async () => {
    // Shipper payments
    const { rerender } = render(<PaymentsPage notify={mockNotify} user={defaultUser} />);
    await screen.findByText('Booking Funding');
    await screen.findByText('Shipment Escrow');

    // Owner payments payouts
    rerender(<PaymentsPage notify={mockNotify} user={ownerUser} />);
    await screen.findByText('Withdraw Earnings');

    // Fill withdraw payout form
    fireEvent.change(screen.getByLabelText('Amount USD'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'mpesa' } });
    fireEvent.change(screen.getByLabelText('Phone or account'), { target: { value: '+254700111222' } });
    const withdrawBtn = screen.getByRole('button', { name: 'Withdraw' });
    fireEvent.click(withdrawBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Withdrawal queued');
    });

    // Admin payments console
    rerender(<PaymentsPage notify={mockNotify} user={adminUser} />);
    await screen.findByText('Admin Wallet Adjustment');
  });

  // 6. PROFILE PAGE
  test('ProfilePage signed out and signed in flows', async () => {
    // Signed out (Access Panel)
    const { rerender } = render(
      <ProfilePage notify={mockNotify} route="/app/profile" user={{}} setUser={mockSetUser} signOut={mockSignOut} />
    );
    await screen.findByRole('heading', { name: 'Sign in' });

    // Switch to Register (signup)
    const createAccountBtn = screen.getByRole('button', { name: 'Create account' });
    fireEvent.click(createAccountBtn);
    await screen.findByRole('button', { name: 'Create account' }); // Signup submit button

    // Switch to Forgot password
    const backToSigninBtn = screen.getByRole('button', { name: 'Back to sign in' });
    fireEvent.click(backToSigninBtn);
    const forgotBtn = screen.getByRole('button', { name: 'Forgot password?' });
    fireEvent.click(forgotBtn);
    await screen.findByRole('button', { name: 'Send reset link' });

    // Render Signed In
    rerender(
      <ProfilePage
        notify={mockNotify}
        route="/app/profile"
        user={defaultUser}
        setUser={mockSetUser}
        signOut={mockSignOut}
      />
    );
    await screen.findByText('Profile Details');

    // Modify profile inputs
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Johnnie' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'D' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+254711999999' } });
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'Kenya' } });
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'JD Logistics' } });

    const saveDetailsBtn = screen.getByRole('button', { name: 'Save details' });
    fireEvent.click(saveDetailsBtn);
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Profile details updated');
    });

    // Notifications preference settings
    const quietHoursCheck = screen.getByLabelText('Use quiet hours');
    fireEvent.click(quietHoursCheck);

    const savePrefsBtn = screen.getByRole('button', { name: 'Save preferences' });
    fireEvent.click(savePrefsBtn);
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Notification preferences saved');
    });
  });

  // 7. ONBOARDING PAGE
  test('OnboardingPage step validation', () => {
    const { rerender } = render(<OnboardingPage notify={mockNotify} user={defaultUser} setUser={mockSetUser} />);
    expect(screen.getByText('Documents for Admin Review')).toBeInTheDocument();

    rerender(<OnboardingPage notify={mockNotify} user={ownerUser} setUser={mockSetUser} />);
    expect(screen.getByText('Vehicle Registration')).toBeInTheDocument();
  });

  // 8. OWNER PAGE
  test('OwnerPage vehicle registration and queue actions', async () => {
    render(<OwnerPage notify={mockNotify} user={ownerUser} />);
    await screen.findByText('Vehicle Readiness');

    // Add vehicle via Plate Number and Add button
    const plateInput = screen.getByPlaceholderText('Plate number');
    fireEvent.change(plateInput, { target: { value: 'KBB 123A' } });
    expect(plateInput.value).toBe('KBB 123A');

    const addBtn = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Vehicle sent to admin review');
    });

    // Trigger action from Action Queue
    const actionBtn = screen.getByRole('button', { name: 'Upload insurance - Toyota Hilux' });
    fireEvent.click(actionBtn);
    expect(mockNotify).toHaveBeenCalledWith('Insurance upload opened');
  });

  // 9. SHIPPER PAGE
  test('ShipperPage bid review and command actions', async () => {
    render(<ShipperPage notify={mockNotify} user={defaultUser} />);
    await screen.findByText('Shipment Command');

    // Compare bids action
    const compBidsBtn = screen.getByRole('button', { name: 'Compare carrier bids' });
    fireEvent.click(compBidsBtn);

    // Confirm waybill action
    const waybillBtn = screen.getByRole('button', { name: 'Confirm waybill and cargo photos' });
    fireEvent.click(waybillBtn);
  });

  // 10. TRACKING PAGE
  test('TrackingPage driver position updates and client POD release', async () => {
    // Driver tracking view
    const { rerender } = render(<TrackingPage notify={mockNotify} user={driverUser} />);
    await screen.findByText('Active Routes');

    // Find and click the Start button to start live tracking
    const startBtn = screen.getByRole('button', { name: 'Start' });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Live tracking started');
    });

    // Stop tracking
    const stopBtn = screen.getByRole('button', { name: 'Stop' });
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Live tracking stopped');
    });

    // Client tracking view
    rerender(<TrackingPage notify={mockNotify} user={defaultUser} />);
    await screen.findByText('Current position');
  });

  // 11. BIDS PAGE
  test('BidsPage available loads list and submitted offers', async () => {
    // Owner bids list
    const { rerender } = render(<BidsPage notify={mockNotify} user={ownerUser} />);
    await screen.findByText('Available Loads');
    await screen.findByText('My Bids');

    // Shipper bids review
    rerender(<BidsPage notify={mockNotify} user={defaultUser} />);
    await screen.findByText('Bids Received');
  });

  // 12. ADMIN PAGE
  test('AdminPage reviews tabs and verification flows', async () => {
    render(<AdminPage notify={mockNotify} user={adminUser} />);
    await screen.findByText('Approvals Console');

    // Tab switching kyc -> truck -> document -> payments -> cases -> deliveries -> risk
    const kycTab = screen.getByRole('button', { name: /KYC/ });
    const truckTab = screen.getByRole('button', { name: /Trucks/ });
    const documentTab = screen.getByRole('button', { name: /Shipment docs/ });
    const approvedProfilesTab = screen.getByRole('button', { name: /Approved profiles/ });
    const approvedTrucksTab = screen.getByRole('button', { name: /Approved trucks/ });
    const paymentsTab = screen.getByRole('button', { name: /Payments/ });
    const deliveriesTab = screen.getByRole('button', { name: /Delivery queue/ });
    const casesTab = screen.getByRole('button', { name: /Support cases/ });
    const riskTab = screen.getByRole('button', { name: /Risk/ });

    fireEvent.click(truckTab);
    await screen.findByText('No truck reviews');

    fireEvent.click(documentTab);
    await screen.findByText('No shipment document reviews');

    fireEvent.click(approvedProfilesTab);
    await screen.findByText('No approved profiles');

    fireEvent.click(approvedTrucksTab);
    await screen.findByText('No approved trucks');

    fireEvent.click(paymentsTab);
    await screen.findByText('No payment records');

    fireEvent.click(deliveriesTab);
    await screen.findByText('No delivery records');

    fireEvent.click(casesTab);
    await screen.findByText('No support cases');

    fireEvent.click(riskTab);
    await screen.findByText('No risk work');

    fireEvent.click(kycTab);
    await screen.findByText('No KYC reviews');
  });
});
