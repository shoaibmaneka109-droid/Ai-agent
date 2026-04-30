import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center text-center">
      <ShieldCheck className="mb-4 h-14 w-14 text-brand-600" />
      <h1 className="text-5xl font-bold text-gray-900">404</h1>
      <p className="mt-2 text-lg text-gray-600">Page not found</p>
      <Link to="/dashboard" className="btn-primary mt-6">Back to Dashboard</Link>
    </div>
  );
}
