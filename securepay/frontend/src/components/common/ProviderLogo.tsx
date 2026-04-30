import { type Provider } from '../../api/apiKeys.api';

// Simple text-based provider badges so we don't need external image assets
const configs: Record<Provider | 'custom', { label: string; bg: string; text: string }> = {
  stripe:    { label: 'Stripe',    bg: 'bg-indigo-600', text: 'text-white' },
  airwallex: { label: 'Airwallex', bg: 'bg-blue-500',   text: 'text-white' },
  wise:      { label: 'Wise',      bg: 'bg-emerald-500',text: 'text-white' },
  custom:    { label: 'Custom',    bg: 'bg-gray-500',   text: 'text-white' },
};

interface ProviderLogoProps {
  provider: Provider | string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = { sm: 'h-7 w-7 text-xs', md: 'h-10 w-10 text-xs', lg: 'h-14 w-14 text-sm' };

export default function ProviderLogo({ provider, size = 'md' }: ProviderLogoProps) {
  const cfg = configs[provider as Provider] ?? configs.custom;
  const initials = cfg.label.slice(0, 2).toUpperCase();
  return (
    <div className={`flex flex-shrink-0 items-center justify-center rounded-xl font-bold ${cfg.bg} ${cfg.text} ${sizeMap[size]}`}>
      {initials}
    </div>
  );
}
