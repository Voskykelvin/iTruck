import { useState, useEffect } from 'react';
import { Wallet, CreditCard, PackageCheck, FileText } from 'lucide-react';
import { api } from '../api.js';
import { demoShipments } from '../data.js';
import MetricCard from '../components/MetricCard.jsx';
import Panel from '../components/Panel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Input from '../components/Input.jsx';
import Select from '../components/Select.jsx';
import WalletTopupModal from '../components/modals/WalletTopupModal.jsx';
import MobileMoneyEscrowModal from '../components/modals/MobileMoneyEscrowModal.jsx';
import { roleForUser, roleName, money, statusLabel, paymentTone, normalizeBookingShipment } from '../utils/helpers.js';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const workspaceShipments = DEMO_MODE ? demoShipments : [];

export default function PaymentsPage({ notify, user }) {
  const role = roleForUser(user);
  const [walletBalance, setWalletBalance] = useState(0);
  const [shipments, setShipments] = useState([]);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState('');
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupBusy, setTopupBusy] = useState(false);
  const [mobileMoneyTarget, setMobileMoneyTarget] = useState(null);
  const [mobileMoneyBusy, setMobileMoneyBusy] = useState(false);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [withdrawDraft, setWithdrawDraft] = useState({
    amount: 100,
    method: 'mpesa',
    destination: '+254700000000',
    accountName: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'iTruck User'
  });

  useEffect(() => {
    api
      .wallet()
      .then((data) => {
        if (Number.isFinite(Number(data.balance))) setWalletBalance(Number(data.balance));
        if (Array.isArray(data.transactions)) setWalletTransactions(data.transactions);
      })
      .catch(() => {});
    api
      .listBookings()
      .then((data) => Array.isArray(data.bookings) && setShipments(data.bookings.map(normalizeBookingShipment)))
      .catch(() => setShipments(workspaceShipments));
  }, []);

  const escrowedCount = shipments.filter((shipment) =>
    ['escrowed', 'release_pending', 'released'].includes(shipment.paymentStatus)
  ).length;
  const payableCount = shipments.filter((shipment) => canFundShipment(shipment)).length;

  function updateWithdraw(key, value) {
    setWithdrawDraft((current) => ({ ...current, [key]: value }));
  }

  function recordTransaction(transaction) {
    if (!transaction) return;
    const transactionId =
      transaction._id || transaction.id || transaction.reference || `${transaction.type}-${Date.now()}`;
    setWalletTransactions((current) =>
      [
        transaction,
        ...current.filter((item) => String(item._id || item.id || item.reference) !== String(transactionId))
      ].slice(0, 12)
    );
  }

  function replaceShipment(booking) {
    if (!booking) return null;
    const updated = normalizeBookingShipment(booking);
    setShipments((current) =>
      current.map((shipment) =>
        String(shipment.bookingId || shipment.id) === String(updated.bookingId || updated.id) ? updated : shipment
      )
    );
    return updated;
  }

  function canFundShipment(shipment) {
    return (
      role === 'client' &&
      shipment?.bookingId &&
      shipment.amount > 0 &&
      ['confirmed', 'in_transit', 'delivered'].includes(shipment.rawStatus) &&
      !['escrowed', 'release_pending', 'released'].includes(shipment.paymentStatus)
    );
  }

  async function fundShipmentEscrow(shipment) {
    if (!canFundShipment(shipment)) {
      notify('Accept a carrier bid before funding escrow');
      return;
    }

    if (walletBalance < shipment.amount) {
      notify('Wallet balance is below the escrow amount');
      return;
    }

    setPaymentBusy(`escrow-${shipment.bookingId}`);
    try {
      const data = await api.fundEscrow(shipment.bookingId, { amount: shipment.amount });
      const updated = replaceShipment(data.booking);
      recordTransaction(data.transaction);
      const nextBalance = Number(data.balance ?? data.transaction?.metadata?.walletBalance);
      if (Number.isFinite(nextBalance)) setWalletBalance(nextBalance);
      notify(data.alreadyFunded ? 'Escrow was already funded' : `Escrow funded for ${updated?.id || shipment.id}`);
    } catch (err) {
      notify(err.message);
    } finally {
      setPaymentBusy('');
    }
  }

  function openMobileMoneyEscrow(shipment) {
    if (!canFundShipment(shipment)) {
      notify('Accept a carrier bid before funding escrow');
      return;
    }
    setMobileMoneyTarget(shipment);
  }

  async function initiateMobileMoneyEscrow({ method, phone }) {
    if (!mobileMoneyTarget) return;
    if (!phone.trim()) {
      notify('Enter the mobile money phone number');
      return;
    }

    setMobileMoneyBusy(true);
    try {
      const data = await api.initiateMobileMoneyEscrow(mobileMoneyTarget.bookingId, {
        amount: mobileMoneyTarget.amount,
        method,
        phone
      });
      replaceShipment(data.booking);
      recordTransaction(data.transaction);
      setMobileMoneyTarget(null);
      notify(data.message || 'Mobile money authorization sent');
    } catch (err) {
      notify(err.message);
    } finally {
      setMobileMoneyBusy(false);
    }
  }

  async function requestWithdrawal(event) {
    event.preventDefault();
    setWithdrawBusy(true);
    try {
      const data = await api.withdraw({ ...withdrawDraft, amount: Number(withdrawDraft.amount) });
      setWalletBalance((current) => Math.max(0, current - Number(withdrawDraft.amount || 0)));
      recordTransaction(data.transaction);
      notify('Withdrawal queued');
    } catch (err) {
      notify(err.message);
    } finally {
      setWithdrawBusy(false);
    }
  }

  async function topupWallet({ amount, method }) {
    const value = Number(amount || 0);
    if (value <= 0) {
      notify('Enter a top-up amount');
      return;
    }

    setTopupBusy(true);
    try {
      const transaction = await api.creditWallet({
        amount: value,
        description: `${method} admin wallet adjustment`
      });
      const nextBalance = Number(transaction?.metadata?.walletBalance);
      if (Number.isFinite(nextBalance)) setWalletBalance(nextBalance);
      recordTransaction(transaction);
      setTopupOpen(false);
      notify('Admin wallet credited');
    } catch (err) {
      notify(err.message);
    } finally {
      setTopupBusy(false);
    }
  }

  return (
    <section className="workspace-layout">
      <div className="stack">
        <section className="metrics-grid">
          <MetricCard icon={Wallet} label="Wallet" value={money(walletBalance)} detail="Live payment balance" />
          <MetricCard icon={CreditCard} label="Role" value={roleName(role)} detail="Payment mode" />
          <MetricCard icon={PackageCheck} label="Shipments" value={shipments.length} detail="Billing records" />
          <MetricCard icon={FileText} label="Escrow" value={escrowedCount} detail={`${payableCount} ready to fund`} />
        </section>
        {role === 'admin' ? (
          <Panel title="Admin Wallet Adjustment" eyebrow="Funding">
            <div className="result-bar">
              <span>Available balance</span>
              <strong>{money(walletBalance)}</strong>
            </div>
            <button className="primary full icon-label" type="button" onClick={() => setTopupOpen(true)}>
              <CreditCard size={18} />
              <span>Credit Admin Wallet</span>
            </button>
          </Panel>
        ) : (
          <Panel title="Booking Funding" eyebrow="Funding">
            <div className="result-bar">
              <span>Available wallet balance</span>
              <strong>{money(walletBalance)}</strong>
            </div>
            <p className="muted-note">
              Direct wallet top-ups are not enabled yet. Fund an eligible shipment with M-Pesa or MTN MoMo from its
              escrow row.
            </p>
          </Panel>
        )}
        <Panel title="Shipment Escrow" eyebrow="Bookings">
          <div className="bid-options payment-list">
            {shipments.length ? (
              shipments.map((shipment) => {
                const canFund = canFundShipment(shipment);
                const isBusy = paymentBusy === `escrow-${shipment.bookingId}`;
                const funded = ['escrowed', 'release_pending', 'released'].includes(shipment.paymentStatus);
                const lowBalance = canFund && walletBalance < shipment.amount;
                return (
                  <div className="bid-option payment-option" key={shipment.bookingId || shipment.id}>
                    <div>
                      <StatusBadge tone={paymentTone(shipment.paymentStatus)}>
                        {statusLabel(shipment.paymentStatus)}
                      </StatusBadge>
                      <strong>{shipment.id}</strong>
                      <span>{shipment.route}</span>
                      <small>{shipment.paymentReference || shipment.payment || statusLabel(shipment.rawStatus)}</small>
                    </div>
                    <div>
                      <strong>{money(shipment.amount)}</strong>
                      {role === 'client' ? (
                        <>
                          <button
                            className={funded ? 'secondary' : 'primary'}
                            type="button"
                            disabled={!canFund || lowBalance || isBusy}
                            onClick={() => fundShipmentEscrow(shipment)}
                          >
                            {isBusy
                              ? 'Funding...'
                              : funded
                                ? 'Escrowed'
                                : !canFund
                                  ? 'Not Ready'
                                  : lowBalance
                                    ? 'Low Balance'
                                    : 'Wallet'}
                          </button>
                          <button
                            className="secondary"
                            type="button"
                            disabled={!canFund || funded}
                            onClick={() => openMobileMoneyEscrow(shipment)}
                          >
                            Mobile
                          </button>
                        </>
                      ) : (
                        <StatusBadge tone={paymentTone(shipment.paymentStatus)}>
                          {funded ? 'Protected' : 'Awaiting shipper'}
                        </StatusBadge>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState title="No payment bookings" detail="Shipment payments will appear after booking activity." />
            )}
          </div>
        </Panel>
        <Panel title={role === 'owner' ? 'Withdraw Earnings' : 'Shipment Invoices'} eyebrow="Payments">
          {role === 'owner' ? (
            <form className="payout-form" onSubmit={requestWithdrawal}>
              <Input
                label="Amount USD"
                type="number"
                value={withdrawDraft.amount}
                onChange={(value) => updateWithdraw('amount', Number(value))}
              />
              <Select
                label="Method"
                value={withdrawDraft.method}
                onChange={(value) => updateWithdraw('method', value)}
                options={['mpesa', 'mtn', 'bank', 'stripe']}
              />
              <Input
                label="Phone or account"
                value={withdrawDraft.destination}
                onChange={(value) => updateWithdraw('destination', value)}
              />
              <button className="primary full" type="submit" disabled={withdrawBusy}>
                {withdrawBusy ? 'Queuing...' : 'Withdraw'}
              </button>
            </form>
          ) : (
            <div className="doc-list">
              {shipments.map((shipment) => (
                <button
                  type="button"
                  key={shipment.id}
                  onClick={() => {
                    if (!shipment.bookingId) {
                      notify('Invoice needs a synced booking');
                      return;
                    }
                    api.downloadDocument('invoice', shipment.bookingId).catch((err) => notify(err.message));
                  }}
                >
                  {shipment.id} invoice
                </button>
              ))}
              {!shipments.length ? <span>No invoices yet</span> : null}
            </div>
          )}
        </Panel>
      </div>
      {role === 'admin' && topupOpen ? (
        <WalletTopupModal
          balance={walletBalance}
          busy={topupBusy}
          transactions={walletTransactions}
          onClose={() => setTopupOpen(false)}
          onTopup={topupWallet}
        />
      ) : null}
      {mobileMoneyTarget ? (
        <MobileMoneyEscrowModal
          shipment={mobileMoneyTarget}
          busy={mobileMoneyBusy}
          onClose={() => setMobileMoneyTarget(null)}
          onSubmit={initiateMobileMoneyEscrow}
        />
      ) : null}
    </section>
  );
}
