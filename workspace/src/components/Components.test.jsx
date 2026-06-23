import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import Panel from './Panel.jsx';
import EmptyState from './EmptyState.jsx';
import Input from './Input.jsx';
import TextArea from './TextArea.jsx';
import Select from './Select.jsx';
import StatusBadge from './StatusBadge.jsx';
import MetricCard from './MetricCard.jsx';
import ChatBubble from './ChatBubble.jsx';
import DarkModeToggle from './DarkModeToggle.jsx';
import DocumentSlotButton from './DocumentSlotButton.jsx';
import NotificationBell from './NotificationBell.jsx';
import DocumentExpiryBanner from './DocumentExpiryBanner.jsx';
import OnboardingBanner from './OnboardingBanner.jsx';
import AppErrorBoundary from './AppErrorBoundary.jsx';

describe('Common Components', () => {
  afterEach(() => {
    cleanup();
  });

  test('Panel renders correctly with props', () => {
    const handleAction = vi.fn();
    render(
      <Panel title="My Panel" eyebrow="Eyebrow text" action="Click me" onAction={handleAction}>
        <div>Children Content</div>
      </Panel>
    );

    expect(screen.getByText('My Panel')).toBeInTheDocument();
    expect(screen.getByText('Eyebrow text')).toBeInTheDocument();
    const btn = screen.getByText('Click me');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Children Content')).toBeInTheDocument();
  });

  test('EmptyState renders with title and detail', () => {
    render(<EmptyState title="No Shipments" detail="You have no shipments yet" />);
    expect(screen.getByText('No Shipments')).toBeInTheDocument();
    expect(screen.getByText('You have no shipments yet')).toBeInTheDocument();
  });

  test('Input renders with label', () => {
    render(<Input label="Username" value="val" onChange={vi.fn()} />);
    expect(screen.getByText('Username')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('val');
  });

  test('TextArea renders with label', () => {
    render(<TextArea label="Description" value="desc" onChange={vi.fn()} />);
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('desc');
  });

  test('Select renders with label and options', () => {
    render(<Select label="Choose" value="a" onChange={vi.fn()} options={['a', 'b']} />);
    expect(screen.getByText('Choose')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('a');
  });

  test('StatusBadge renders correct class and text', () => {
    render(<StatusBadge tone="success">In Progress</StatusBadge>);
    const el = screen.getByText('In Progress');
    expect(el).toHaveClass('success');
  });

  test('MetricCard renders correct details', () => {
    const DummyIcon = () => <div data-testid="icon" />;
    render(<MetricCard icon={DummyIcon} label="Sales" value="500" detail="10% up" />);
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('10% up')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  test('ChatBubble renders self vs other status', () => {
    const msgSelf = { author: 'me', id: '1', createdAt: new Date().toISOString(), text: 'Hi there' };
    const { rerender } = render(<ChatBubble message={msgSelf} />);
    expect(screen.getByText('Hi there').closest('.chat-message')).toHaveClass('me');

    const msgOther = { author: 'them', id: '2', name: 'Carrier', createdAt: new Date().toISOString(), text: 'Hello' };
    rerender(<ChatBubble message={msgOther} />);
    expect(screen.getByText('Hello').closest('.chat-message')).toHaveClass('them');
  });

  test('DarkModeToggle calls onToggle', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<DarkModeToggle dark={true} onToggle={onToggle} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<DarkModeToggle dark={false} onToggle={onToggle} />);
    expect(btn.getAttribute('title')).toContain('dark mode');
  });

  test('DocumentSlotButton renders different statuses', () => {
    const onClick = vi.fn();
    const { rerender } = render(<DocumentSlotButton label="Insurance" status="missing" onClick={onClick} />);
    expect(screen.getByText('Insurance')).toBeInTheDocument();
    expect(screen.getByText('Upload')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<DocumentSlotButton label="Insurance" status="approved" onClick={onClick} />);
    expect(screen.getByText('Verified')).toBeInTheDocument();

    rerender(<DocumentSlotButton label="Insurance" status="pending" onClick={onClick} />);
    expect(screen.getByText('Under Review')).toBeInTheDocument();

    rerender(<DocumentSlotButton label="Insurance" status="rejected" onClick={onClick} />);
    expect(screen.getByText('Rejected - Re-upload')).toBeInTheDocument();

    rerender(<DocumentSlotButton label="Insurance" status="expired" onClick={onClick} />);
    expect(screen.getByText('Expired - Re-upload')).toBeInTheDocument();

    rerender(<DocumentSlotButton label="Insurance" status="approved" busy={true} onClick={onClick} />);
    expect(screen.getByText('Uploading...')).toBeInTheDocument();
  });

  test('NotificationBell dropdown opens and marks read', () => {
    const notifs = [{ id: '1', title: 'New load', read: false, createdAt: new Date().toISOString(), link: '/load' }];
    const markRead = vi.fn();
    const navigate = vi.fn();
    render(<NotificationBell notifications={notifs} onMarkAllRead={markRead} onNavigate={navigate} />);

    const bellBtn = screen.getByRole('button', { name: 'Notifications' });
    expect(bellBtn).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    // Open dropdown
    fireEvent.click(bellBtn);
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('New load')).toBeInTheDocument();

    // Mark all read
    const readBtn = screen.getByText('Mark all read');
    fireEvent.click(readBtn);
    expect(markRead).toHaveBeenCalledTimes(1);

    // Reopen and navigate
    fireEvent.click(bellBtn);
    const itemBtn = screen.getByText('New load').closest('button');
    fireEvent.click(itemBtn);
    expect(navigate).toHaveBeenCalledWith('/load');
  });

  test('NotificationBell empty list', () => {
    render(<NotificationBell notifications={[]} onMarkAllRead={vi.fn()} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
  });

  test('DocumentExpiryBanner lists expiring documents', () => {
    const user = {
      documents: [
        { type: 'driver-license', status: 'expired' },
        { type: 'insurance', expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }
      ]
    };
    render(<DocumentExpiryBanner user={user} />);
    expect(screen.getByText('2 documents expiring or expired')).toBeInTheDocument();
    expect(screen.getByText('driver license (expired)')).toBeInTheDocument();
    expect(screen.getByText('insurance (expiring soon)')).toBeInTheDocument();
  });

  test('OnboardingBanner progresses correctly client and owner', () => {
    const owner = {
      firstName: 'Alice',
      email: 'owner@example.com',
      documents: [{ type: 'license', status: 'approved' }]
    };
    const { rerender } = render(<OnboardingBanner user={owner} role="owner" fleet={[{ id: 'trk' }]} shipments={[]} />);
    expect(screen.getByText(/Complete your profile/)).toBeInTheDocument();

    const client = { firstName: 'Bob', email: 'client@example.com', documents: [] };
    rerender(<OnboardingBanner user={client} role="shipper" fleet={[]} shipments={[]} />);
    expect(screen.getByText(/Complete your profile/)).toBeInTheDocument();
  });

  test('AppErrorBoundary catches child crash', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Buggy = () => {
      throw new Error('Crashing child');
    };
    render(
      <AppErrorBoundary>
        <Buggy />
      </AppErrorBoundary>
    );
    expect(screen.getByText('We could not open the workspace.')).toBeInTheDocument();
    spy.mockRestore();
  });
});
