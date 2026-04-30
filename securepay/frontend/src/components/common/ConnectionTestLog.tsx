import { useQuery } from '@tanstack/react-query';
import { apiKeysApi } from '../../api/apiKeys.api';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import Spinner from './Spinner';

interface Props {
  keyId: string;
}

export default function ConnectionTestLog({ keyId }: Props) {
  const { data: log, isLoading } = useQuery({
    queryKey: ['api-key-test-log', keyId],
    queryFn: () => apiKeysApi.getTestLog(keyId),
    staleTime: 0,
  });

  if (isLoading) return <div className="flex h-16 items-center justify-center"><Spinner size="sm" /></div>;
  if (!log?.length) return <p className="py-4 text-center text-sm text-gray-400">No test history yet</p>;

  return (
    <div className="divide-y divide-gray-50">
      {log.map((entry: any) => (
        <div key={entry.id} className="flex items-start gap-3 py-3 text-sm">
          {entry.status === 'success'
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
            : <XCircle     className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
          }
          <div className="min-w-0 flex-1">
            <p className={entry.status === 'success' ? 'text-gray-800' : 'text-red-700'}>
              {entry.message}
            </p>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {entry.latency_ms}ms
              </span>
              <span>{format(new Date(entry.created_at), 'MMM d, h:mm a')}</span>
              {entry.tested_by_name && <span>by {entry.tested_by_name}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
