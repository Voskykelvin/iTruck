import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import AdminPage from './AdminPage.jsx';

const mockNotify = vi.fn();
const adminUser = {
  id: 'usr-admin',
  email: 'admin@example.com',
  role: 'admin',
  isVerified: true
};

function getTab(name) {
  const tabs = screen.getAllByRole('button', { name });
  return tabs[0];
}

describe('AdminPage Integration and Interaction Tests', () => {
  beforeEach(() => {
    mockNotify.mockClear();
    window.confirm = vi.fn().mockReturnValue(true);
  });

  test('renders stats cards and switch tabs', async () => {
    render(<AdminPage notify={mockNotify} user={adminUser} />);

    // Wait for data load
    await screen.findAllByText('10'); // Total Users
    expect(screen.getByText('15')).toBeInTheDocument(); // Bookings
    expect(screen.getByText('USD 50,000')).toBeInTheDocument(); // Revenue

    // Verify KYC review list shows unverified user John Carrier
    expect((await screen.findAllByText('John Carrier'))[0]).toBeInTheDocument();

    // Verify Tab switches
    const kycTab = getTab(/KYC/);
    const truckTab = getTab(/Trucks/);
    const documentTab = getTab(/Shipment docs/);
    const approvedProfilesTab = getTab(/Approved profiles/);
    const approvedTrucksTab = getTab(/Approved trucks/);
    const paymentsTab = getTab(/Payments/);
    const deliveriesTab = getTab(/Delivery queue/);
    const casesTab = getTab(/Support cases/);
    const riskTab = getTab(/Risk/);

    // Click Trucks Tab
    fireEvent.click(truckTab);
    await screen.findAllByText('Bus');

    // Click Shipment docs Tab
    fireEvent.click(documentTab);
    await screen.findAllByText('Nairobi to Kampala');

    // Click Approved profiles Tab
    fireEvent.click(approvedProfilesTab);
    await screen.findAllByText('Alice Shipper');

    // Click Approved trucks Tab
    fireEvent.click(approvedTrucksTab);
    expect(screen.queryByText('Bus')).not.toBeInTheDocument();

    // Click Payments Tab
    fireEvent.click(paymentsTab);
    await screen.findAllByText('Payment record');

    // Click Delivery queue Tab
    fireEvent.click(deliveriesTab);
    await screen.findAllByText(/carrier@example.com - sms/);

    // Click Support cases Tab
    fireEvent.click(casesTab);
    await screen.findAllByText(/Damaged cargo/);

    // Click Risk Tab
    fireEvent.click(riskTab);
    await screen.findAllByText('Risk Overview');

    // Switch back to KYC Tab
    fireEvent.click(kycTab);
  });

  test('verifies user profile and document actions', async () => {
    render(<AdminPage notify={mockNotify} user={adminUser} />);
    await screen.findAllByText('John Carrier');

    const userRow = (await screen.findAllByText('John Carrier'))[0].closest('.admin-review-row');

    // Approve Business Registration Document
    const docRow = (await screen.findAllByText('Business Registration'))[0].closest('.admin-document-row');
    const approveDocBtn = within(docRow).getByRole('button', { name: 'Approve' });
    fireEvent.click(approveDocBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Business Registration marked approved');
    });

    // Approve Profile
    const approveProfileBtn = within(userRow).getByRole('button', { name: 'Approve Profile' });
    fireEvent.click(approveProfileBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('John Carrier verified');
    });
  });

  test('holds profile and deletes user profile validation', async () => {
    render(<AdminPage notify={mockNotify} user={adminUser} />);
    await screen.findAllByText('John Carrier');

    const userRow = (await screen.findAllByText('John Carrier'))[0].closest('.admin-review-row');

    // Hold Profile
    const holdBtn = within(userRow).getByRole('button', { name: 'Hold' });
    fireEvent.click(holdBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('John Carrier held for review');
    });

    // Attempt deleting user without reason
    const deleteBtn = within(userRow).getByRole('button', { name: 'Delete Profile' });
    fireEvent.click(deleteBtn);

    expect(mockNotify).toHaveBeenCalledWith('Add a deletion reason for John Carrier');

    // Update notes to allow deletion
    const noteArea = within(userRow).getByLabelText('Profile decision notes');
    fireEvent.change(noteArea, { target: { value: 'Suspicious profile detected' } });

    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('John Carrier deleted');
    });
  });

  test('verifies truck review actions', async () => {
    render(<AdminPage notify={mockNotify} user={adminUser} />);
    // Wait for data load
    await screen.findAllByText('John Carrier');

    const truckTab = getTab(/Trucks/);
    fireEvent.click(truckTab);
    await screen.findAllByText('Bus');

    // Approve Road License Document
    const docRow = (await screen.findAllByText('Road License'))[0].closest('.admin-document-row');
    const approveLicenseBtn = within(docRow).getByRole('button', { name: 'Approve' });
    fireEvent.click(approveLicenseBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Road License marked approved');
    });

    // Approve Vehicle
    const approveVehicleBtn = screen.getByRole('button', { name: 'Approve Truck' });
    fireEvent.click(approveVehicleBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('TRK 003 verified');
    });
  });

  test('performs document rejection actions', async () => {
    render(<AdminPage notify={mockNotify} user={adminUser} />);
    // Wait for data load
    await screen.findAllByText('John Carrier');

    const docTab = getTab(/Shipment docs/);
    fireEvent.click(docTab);
    await screen.findAllByText('Nairobi to Kampala');

    // Reject Waybill
    const docRow = (await screen.findAllByText('Waybill'))[0].closest('.admin-document-row');
    const rejectBtn = within(docRow).getByRole('button', { name: 'Reject' });
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Waybill marked rejected');
    });
  });

  test('manages support cases: comments and assignment', async () => {
    render(<AdminPage notify={mockNotify} user={adminUser} />);
    // Wait for data load
    await screen.findAllByText('John Carrier');

    const casesTab = getTab(/Support cases/);
    fireEvent.click(casesTab);
    await screen.findAllByText(/Damaged cargo/);

    // Comment on support case
    const replyInput = screen.getByPlaceholderText('Record findings, request evidence, or update the participants');
    fireEvent.change(replyInput, { target: { value: 'Investigating with the driver' } });

    const replyBtn = screen.getByRole('button', { name: 'Add update' });
    fireEvent.click(replyBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Participant update sent');
    });

    // Assign Case
    const assignBtn = screen.getByRole('button', { name: 'Assign' });
    fireEvent.click(assignBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Case assigned');
    });
  });

  test('retries failed notification delivery queue items', async () => {
    render(<AdminPage notify={mockNotify} user={adminUser} />);
    // Wait for data load
    await screen.findAllByText('John Carrier');

    const queueTab = getTab(/Delivery queue/);
    fireEvent.click(queueTab);
    await screen.findAllByText(/carrier@example.com - sms/);

    const retryBtn = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Notification delivery queued for retry');
    });
  });
});
