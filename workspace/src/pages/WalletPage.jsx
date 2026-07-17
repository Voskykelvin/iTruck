import { useState } from 'react';
import { useWalletAccount, usePaymentAction } from '../queries/payments';
import { api } from '../api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import DataTable from '../components/ui/DataTable';
import Skeleton from '../components/ui/Skeleton';
import Badge from '../components/ui/Badge';
import { Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { money } from '../utils/helpers';
import { useToast } from '../components/ui/Toast';
import { useSessionBootstrap } from '../queries/session';
import { roleForUser } from '../utils/roles';

export default function WalletPage() {
  const { data: wallet, isLoading } = useWalletAccount();
  const { data: user } = useSessionBootstrap();
  const role = roleForUser(user);
  const { addToast } = useToast();

  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawal, setWithdrawal] = useState({ amount: '', method: 'mpesa', destination: '' });

  const withdrawAction = usePaymentAction((payload) => api.withdraw(payload));

  const handleWithdraw = (e) => {
    e.preventDefault();
    withdrawAction.mutate(
      { ...withdrawal, amount: Number(withdrawal.amount) },
      {
        onSuccess: () => {
          addToast({ title: 'Withdrawal Requested', message: 'Your payout is being processed.', type: 'success' });
          setIsWithdrawOpen(false);
          setWithdrawal({ amount: '', method: 'mpesa', destination: '' });
        },
        onError: (err) => addToast({ title: 'Withdrawal Failed', message: err.message, type: 'error' })
      }
    );
  };

  const columns = [
    {
      header: 'Type',
      accessor: 'type',
      cell: (row) => (
        <div className="row">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: row.type === 'credit' ? 'var(--success-soft)' : 'var(--surface-2)',
              color: row.type === 'credit' ? 'var(--success)' : 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {row.type === 'credit' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
          </div>
          <div style={{ marginLeft: 'var(--space-3)' }}>
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
              {row.description || (row.type === 'credit' ? 'Top-up / Payment Received' : 'Payment Sent')}
            </div>
            <div className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
              {new Date(row.createdAt || Date.now()).toLocaleDateString()}
            </div>
          </div>
        </div>
      )
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (row) => (
        <Badge variant={row.status === 'completed' ? 'success' : 'warning'}>{row.status || 'completed'}</Badge>
      )
    },
    {
      header: 'Amount',
      accessor: 'amount',
      align: 'right',
      cell: (row) => (
        <span
          style={{
            fontWeight: 600,
            color: row.type === 'credit' ? 'var(--success)' : 'var(--ink)'
          }}
        >
          {row.type === 'credit' ? '+' : '-'}
          {money(row.amount)}
        </span>
      )
    }
  ];

  return (
    <div className="animate-fade-in stack-lg">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="text-secondary">Review shipment payments, carrier earnings, and payout records.</p>
        </div>
      </div>

      {isLoading && role !== 'client' ? (
        <Skeleton style={{ height: 200 }} />
      ) : role !== 'client' ? (
        <Card
          className="row-between"
          style={{
            padding: 'var(--space-8)',
            background: 'linear-gradient(135deg, var(--brand-dark), var(--brand-mid))',
            color: 'white',
            border: 'none'
          }}
        >
          <div>
            <div className="row" style={{ color: 'rgba(255,255,255,0.8)', marginBottom: 'var(--space-2)' }}>
              <Wallet size={20} style={{ marginRight: 'var(--space-2)' }} />
              <span>Carrier Earnings Balance</span>
            </div>
            <div style={{ fontSize: 'var(--text-4xl)', fontWeight: 700, letterSpacing: '-0.02em' }}>
              {money(wallet?.balance || 0)}
            </div>
          </div>

          {role === 'owner' && (
            <div className="stack" style={{ alignItems: 'flex-end' }}>
              <Button variant="ghost" style={{ color: 'white' }} onClick={() => setIsWithdrawOpen(true)}>
                Request Payout
              </Button>
            </div>
          )}
        </Card>
      ) : null}

      <div className="stack">
        <h2 style={{ fontSize: 'var(--text-lg)' }}>Recent Transactions</h2>
        <DataTable columns={columns} data={wallet?.transactions || []} loading={isLoading} />
      </div>

      <Modal isOpen={isWithdrawOpen} onClose={() => setIsWithdrawOpen(false)} title="Withdraw Funds">
        <form onSubmit={handleWithdraw} className="stack">
          <Input
            label="Amount (KES)"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={withdrawal.amount}
            onChange={(e) => setWithdrawal({ ...withdrawal, amount: e.target.value })}
          />
          <label className="input-group">
            <span className="input-label">Payout Method</span>
            <select
              className="input-field"
              value={withdrawal.method}
              onChange={(e) => setWithdrawal({ ...withdrawal, method: e.target.value })}
            >
              <option value="mpesa">M-Pesa</option>
            </select>
          </label>
          <Input
            label="Phone or Account"
            required
            minLength={3}
            value={withdrawal.destination}
            onChange={(e) => setWithdrawal({ ...withdrawal, destination: e.target.value })}
          />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setIsWithdrawOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={withdrawAction.isPending}>
              Request Withdrawal
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
