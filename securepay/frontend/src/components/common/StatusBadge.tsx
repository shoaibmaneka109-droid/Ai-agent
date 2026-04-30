import clsx from 'clsx';

const statusConfig: Record<string, { label: string; className: string }> = {
  succeeded:          { label: 'Succeeded',    className: 'badge-green' },
  pending:            { label: 'Pending',       className: 'badge-yellow' },
  processing:         { label: 'Processing',    className: 'badge-blue' },
  failed:             { label: 'Failed',        className: 'badge-red' },
  failure:            { label: 'Failed',        className: 'badge-red' },
  success:            { label: 'Connected',     className: 'badge-green' },
  connected:          { label: 'Connected',     className: 'badge-green' },
  cancelled:          { label: 'Cancelled',     className: 'badge-gray' },
  refunded:           { label: 'Refunded',      className: 'badge-gray' },
  partially_refunded: { label: 'Part. Refunded',className: 'badge-yellow' },
  disputed:           { label: 'Disputed',      className: 'badge-red' },
  active:             { label: 'Active',        className: 'badge-green' },
  suspended:          { label: 'Suspended',     className: 'badge-red' },
  live:               { label: 'Live',          className: 'badge-green' },
  sandbox:            { label: 'Sandbox',       className: 'badge-yellow' },
  trialing:           { label: 'Trialing',      className: 'badge-blue' },
  hibernating:        { label: 'Hibernated',    className: 'badge-yellow' },
  past_due:           { label: 'Past Due',      className: 'badge-yellow' },
  unpaid:             { label: 'Unpaid',        className: 'badge-red' },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, className: 'badge-gray' };
  return (
    <span className={clsx(config.className, className)}>
      {config.label}
    </span>
  );
}
