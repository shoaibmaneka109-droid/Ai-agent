import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentsApi } from '../../api/payments.api';
import { format } from 'date-fns';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import Spinner from '../../components/common/Spinner';

function formatCurrency(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function DetailRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex justify-between py-3 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value ?? '—'}</span>
    </div>
  );
}

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const queryClient = useQueryClient();

  const { data: payment, isLoading } = useQuery({
    queryKey: ['payment', id],
    queryFn: () => paymentsApi.get(id!),
  });

  const refundMutation = useMutation({
    mutationFn: () => paymentsApi.refund(id!, {
      amount: Math.round(parseFloat(refundAmount) * 100),
      reason: refundReason,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment', id] });
      setRefundOpen(false);
    },
  });

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (!payment) return <p className="text-gray-500">Payment not found.</p>;

  const refundable = payment.amount - payment.refunded_amount;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/payments" className="btn-outline p-2">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payment Details</h1>
          <p className="font-mono text-sm text-gray-400">{payment.id}</p>
        </div>
      </div>

      <div className="card space-y-0 p-0 overflow-hidden">
        <div className="flex items-center justify-between bg-gray-50 px-6 py-4">
          <div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(payment.amount, payment.currency)}</p>
            {payment.refunded_amount > 0 && (
              <p className="text-sm text-gray-500">Refunded: {formatCurrency(payment.refunded_amount, payment.currency)}</p>
            )}
          </div>
          <StatusBadge status={payment.status} className="text-sm" />
        </div>

        <div className="px-6 py-2">
          <DetailRow label="Provider" value={<span className="capitalize">{payment.provider}</span>} />
          <DetailRow label="Provider ID" value={<span className="font-mono text-xs">{payment.provider_payment_id || '—'}</span>} />
          <DetailRow label="Customer" value={payment.customer_email} />
          <DetailRow label="Customer name" value={payment.customer_name} />
          <DetailRow label="Payment method" value={
            payment.payment_method_brand && payment.payment_method_last4
              ? `${payment.payment_method_brand} ••••${payment.payment_method_last4}`
              : payment.payment_method_type
          } />
          <DetailRow label="Description" value={payment.description} />
          <DetailRow label="Currency" value={payment.currency} />
          <DetailRow label="Created" value={format(new Date(payment.created_at), 'PPpp')} />
          {payment.paid_at && <DetailRow label="Paid at" value={format(new Date(payment.paid_at), 'PPpp')} />}
          {payment.failed_at && <DetailRow label="Failed at" value={format(new Date(payment.failed_at), 'PPpp')} />}
        </div>
      </div>

      {/* Refund button */}
      {['succeeded', 'partially_refunded'].includes(payment.status) && refundable > 0 && (
        <button onClick={() => setRefundOpen(true)} className="btn-outline gap-2">
          <RefreshCw className="h-4 w-4" />
          Issue Refund
        </button>
      )}

      {/* Refund modal */}
      <Modal isOpen={refundOpen} onClose={() => setRefundOpen(false)} title="Issue Refund" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Maximum refundable: <strong>{formatCurrency(refundable, payment.currency)}</strong>
          </p>
          <div>
            <label className="label mb-1">Amount ({payment.currency})</label>
            <input
              type="number"
              step="0.01"
              max={refundable / 100}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              className="input"
              placeholder={`0.00 – ${(refundable / 100).toFixed(2)}`}
            />
          </div>
          <div>
            <label className="label mb-1">Reason (optional)</label>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              className="input h-20 resize-none"
              placeholder="Customer request, duplicate charge, etc."
            />
          </div>
          {refundMutation.isError && (
            <p className="text-sm text-red-600">{(refundMutation.error as any)?.response?.data?.message || 'Refund failed'}</p>
          )}
          <div className="flex gap-3">
            <button onClick={() => setRefundOpen(false)} className="btn-secondary flex-1">Cancel</button>
            <button
              onClick={() => refundMutation.mutate()}
              disabled={!refundAmount || refundMutation.isPending}
              className="btn-primary flex-1"
            >
              {refundMutation.isPending ? <Spinner size="sm" className="text-white" /> : 'Confirm Refund'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
