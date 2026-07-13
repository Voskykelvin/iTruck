import { useState } from 'react';
import { Wallet, CreditCard, PackageCheck, FileText } from 'lucide-react';
import { api } from '../api.js';
import MetricCard from '../components/MetricCard.jsx';
import Panel from '../components/Panel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Input from '../components/Input.jsx';
import Select from '../components/Select.jsx';
import WalletTopupModal from '../components/modals/WalletTopupModal.jsx';
import MobileMoneyEscrowModal from '../components/modals/MobileMoneyEscrowModal.jsx';
import AsyncState from '../components/AsyncState.jsx';
import { useBookings } from '../queries/commercial.js';
import { useDownloadDocument } from '../queries/documents.js';
import { usePaymentAction, useWalletAccount } from '../queries/payments.js';
import { roleForUser, roleName, money, statusLabel, paymentTone } from '../utils/helpers.js';

export default function PaymentsPage({ notify, user }) {
  const role = roleForUser(user);
  const [topupOpen, setTopupOpen] = useState(false);
  const [mobileMoneyTarget, setMobileMoneyTarget] = useState(null);
  const [withdrawDraft, setWithdrawDraft] = useState({
    amount: 100,
    method: 'mpesa',
    destination: '+254700000000',
    accountName: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'iTruck User'
  });
  const walletQuery = useWalletAccount();
  const bookingsQuery = useBookings();
  const fundEscrow = usePaymentAction(({ bookingId, amount }) => api.fundEscrow(bookingId, { amount }));
  const initiateMobileMoney = usePaymentAction(({ bookingId, amount, method, phone }) =>
    api.initiateMobileMoneyEscrow(bookingId, { amount, method, phone })
  );
  const withdraw = usePaymentAction((payload) => api.withdraw(payload));
  const creditWallet = usePaymentAction((payload) => api.creditWallet(payload));
  const invoiceDownload = useDownloadDocument();
  const walletBalance = walletQuery.data?.balance || 0;
  const walletTransactions = walletQuery.data?.transactions || [];
  const shipments = bookingsQuery.data || [];

  const escrowedCount = shipments.filter((shipment) =>
    ['escrowed', 'release_pending', 'released'].includes(shipment.paymentStatus)
  ).length;
  const payableCount = shipments.filter((shipment) => canFundShipment(shipment)).length;

  function updateWithdraw(key, value) {
    setWithdrawDraft((current) => ({ ...current, [key]: value }));
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

    try {
      const data = await fundEscrow.mutateAsync({ bookingId: shipment.bookingId, amount: shipment.amount });
      notify(data.alreadyFunded ? 'Escrow was already funded' : `Escrow funded for ${shipment.id}`);
    } catch (err) {
      notify(err.message);
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

    try {
      const data = await initiateMobileMoney.mutateAsync({
        bookingId: mobileMoneyTarget.bookingId,
        amount: mobileMoneyTarget.amount,
        method,
        phone
      });
      setMobileMoneyTarget(null);
      notify(data.message || 'Mobile money authorization sent');
    } catch (err) {
      notify(err.message);
    }
  }

  async function requestWithdrawal(event) {
    event.preventDefault();
    const amount = Number(withdrawDraft.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify('Enter a withdrawal amount greater than zero');
      return;
    }
    if (amount > walletBalance) {
      notify('Wallet balance is below the withdrawal amount');
      return;
    }
    try {
      await withdraw.mutateAsync({ ...withdrawDraft, amount });
      notify('Withdrawal queued');
    } catch (err) {
      notify(err.message);
    }
  }

  async function topupWallet({ amount, method }) {
    const value = Number(amount || 0);
    if (value <= 0) {
      notify('Enter a top-up amount');
      return;
    }

    try {
      await creditWallet.mutateAsync({
        amount: value,
        description: `${method} admin wallet adjustment`
      });
      setTopupOpen(false);
      notify('Admin wallet credited');
    } catch (err) {
      notify(err.message);
    }
  }

  async function downloadInvoice(shipment) {
    if (!shipment.bookingId) {
      notify('Invoice needs a synced booking');
      return;
    }
    try {
      await invoiceDownload.mutateAsync({ type: 'invoice', bookingId: shipment.bookingId });
      notify(`Invoice downloaded for ${shipment.id}`);
    } catch (err) {
      notify(err.message);
    }
  }

  return (
    <section className="workspace-layout">
      <div className="stack">
        <section className="metrics-grid">
          <MetricCard
            icon={Wallet}
            label="Wallet"
            value={walletQuery.isError ? 'Unavailable' : money(walletBalance)}
            detail={walletQuery.isPending ? 'Loading payment balance' : 'Live payment balance'}
          />
          <MetricCard icon={CreditCard} label="Role" value={roleName(role)} detail="Payment mode" />
          <MetricCard icon={PackageCheck} label="Shipments" value={shipments.length} detail="Billing records" />
          <MetricCard icon={FileText} label="Escrow" value={escrowedCount} detail={`${payableCount} ready to fund`} />
        </section>
        {walletQuery.isError ? (
          <AsyncState
            compact
            title="Wallet could not be loaded"
            detail={walletQuery.error?.message}
            onRetry={() => walletQuery.refetch()}
          />
        ) : null}
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
            {bookingsQuery.isPending ? (
              <AsyncState compact title="Loading payment bookings..." />
            ) : bookingsQuery.isError ? (
              <AsyncState
                compact
                title="Payment bookings could not be loaded"
                detail={bookingsQuery.error?.message}
                onRetry={() => bookingsQuery.refetch()}
              />
            ) : shipments.length ? (
              shipments.map((shipment) => {
                const canFund = canFundShipment(shipment);
                const isBusy = fundEscrow.isPending && fundEscrow.variables?.bookingId === shipment.bookingId;
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
                            disabled={!canFund || lowBalance || isBusy || walletQuery.isPending || walletQuery.isError}
                            onClick={() => fundShipmentEscrow(shipment)}
                          >
                            {isBusy
                              ? 'Funding...'
                              : walletQuery.isPending
                                ? 'Loading Balance'
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
        <Panel title="Wallet Activity" eyebrow="Transactions">
          {walletQuery.isPending ? (
            <AsyncState compact title="Loading wallet activity..." />
          ) : walletQuery.isError ? (
            <AsyncState
              compact
              title="Wallet activity could not be loaded"
              detail={walletQuery.error?.message}
              onRetry={() => walletQuery.refetch()}
            />
          ) : walletTransactions.length ? (
            <div className="shipment-stack">
              {walletTransactions.slice(0, 12).map((transaction) => (
                <article className="shipment-row" key={transaction._id || transaction.id || transaction.reference}>
                  <div>
                    <StatusBadge>{statusLabel(transaction.status || 'pending')}</StatusBadge>
                    <h3>{statusLabel(transaction.type || 'payment')}</h3>
                    <p>{transaction.description || transaction.reference || 'Wallet transaction'}</p>
                    {transaction.createdAt ? <small>{new Date(transaction.createdAt).toLocaleString()}</small> : null}
                  </div>
                  <strong>{money(transaction.amount)}</strong>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No wallet activity" detail="Completed funding and payout records will appear here." />
          )}
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
              <button
                className="primary full"
                type="submit"
                disabled={withdraw.isPending || walletQuery.isPending || walletQuery.isError}
              >
                {withdraw.isPending ? 'Queuing...' : walletQuery.isPending ? 'Loading wallet...' : 'Withdraw'}
              </button>
            </form>
          ) : (
            <div className="doc-list">
              {shipments.map((shipment) => (
                <button
                  type="button"
                  key={shipment.id}
                  disabled={invoiceDownload.isPending && invoiceDownload.variables?.bookingId === shipment.bookingId}
                  onClick={() => downloadInvoice(shipment)}
                >
                  {invoiceDownload.isPending && invoiceDownload.variables?.bookingId === shipment.bookingId
                    ? `Opening ${shipment.id} invoice...`
                    : `${shipment.id} invoice`}
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
          busy={creditWallet.isPending}
          transactions={walletTransactions}
          onClose={() => setTopupOpen(false)}
          onTopup={topupWallet}
        />
      ) : null}
      {mobileMoneyTarget ? (
        <MobileMoneyEscrowModal
          shipment={mobileMoneyTarget}
          busy={initiateMobileMoney.isPending}
          onClose={() => setMobileMoneyTarget(null)}
          onSubmit={initiateMobileMoneyEscrow}
        />
      ) : null}
    </section>
  );
}
