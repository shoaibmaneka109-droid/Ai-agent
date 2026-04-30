import React, { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Alert from '../components/common/Alert';
import { listPayments } from '../services/paymentsService';

const STATUS_COLORS = {
  succeeded: 'green', failed: 'red', pending: 'yellow', refunded: 'gray', cancelled: 'gray',
};

const FILTERS = ['all', 'pending', 'succeeded', 'failed', 'refunded'];

const PaymentsPage = () => {
  const { org } = useSelector((s) => s.auth);
  const [payments, setPayments] = useState([]);
  const [meta, setMeta] = useState(null);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);

  const load = useCallback(async () => {
    if (!org?.id) return;
    setLoading(true);
    try {
      const params = { page, limit: 20, ...(filter !== 'all' && { status: filter }) };
      const res = await listPayments(org.id, params);
      setPayments(res.data.data.payments || []);
      setMeta(res.data.data.meta);
    } catch {
      setAlert({ type: 'error', message: 'Failed to load payments' });
    } finally {
      setLoading(false);
    }
  }, [org?.id, filter, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-gray-500 text-sm mt-1">
            {meta ? `${meta.total} total transactions` : 'Loading…'}
          </p>
        </div>
      </div>

      {alert && (
        <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} className="mb-4" />
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading payments…</p>
        ) : payments.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">No payments found.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 capitalize">{p.provider}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{p.id.slice(0, 18)}…</p>
                    {p.external_id && (
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">{p.external_id}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {p.currency} {(Number(p.amount) / 100).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-400">{new Date(p.created_at).toLocaleString()}</p>
                    </div>
                    <Badge color={STATUS_COLORS[p.status] || 'gray'}>{p.status}</Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {meta && meta.totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-4">
                <p className="text-sm text-gray-500">
                  Page {meta.page} of {meta.totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!meta.hasPrev}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!meta.hasNext}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

export default PaymentsPage;
