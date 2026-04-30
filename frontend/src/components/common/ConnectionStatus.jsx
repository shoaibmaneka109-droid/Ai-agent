import React from 'react';

const configs = {
  ok: {
    dot: 'bg-green-400',
    text: 'text-green-700',
    bg: 'bg-green-50 border-green-200',
    label: 'Connected',
    icon: '✓',
  },
  failed: {
    dot: 'bg-red-400',
    text: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
    label: 'Failed',
    icon: '✕',
  },
  pending: {
    dot: 'bg-yellow-400',
    text: 'text-yellow-700',
    bg: 'bg-yellow-50 border-yellow-200',
    label: 'Testing…',
    icon: '⟳',
  },
  untested: {
    dot: 'bg-gray-300',
    text: 'text-gray-500',
    bg: 'bg-gray-50 border-gray-200',
    label: 'Not tested',
    icon: '—',
  },
};

/**
 * ConnectionStatus
 *
 * Shows a coloured badge with live connection test state.
 *
 * @param {'ok'|'failed'|'pending'|'untested'|null} status
 * @param {string} [message]   Provider message to show on hover/inline
 * @param {number} [latencyMs] Round-trip latency in ms
 * @param {'badge'|'pill'|'full'} [variant]
 */
const ConnectionStatus = ({ status, message, latencyMs, variant = 'badge' }) => {
  const cfg = configs[status ?? 'untested'] ?? configs.untested;

  if (variant === 'full') {
    return (
      <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${cfg.bg}`}>
        <span className={`mt-0.5 text-base font-bold ${cfg.text}`}>{cfg.icon}</span>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</p>
          {message && (
            <p className={`text-xs mt-0.5 ${cfg.text} opacity-80 break-words`}>{message}</p>
          )}
          {typeof latencyMs === 'number' && (
            <p className={`text-xs mt-0.5 ${cfg.text} opacity-60`}>{latencyMs}ms</p>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'pill') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text}`}
        title={message}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
        {typeof latencyMs === 'number' && (
          <span className="opacity-60 ml-0.5">{latencyMs}ms</span>
        )}
      </span>
    );
  }

  // default: badge
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.text} border`}
      title={message}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

export default ConnectionStatus;
