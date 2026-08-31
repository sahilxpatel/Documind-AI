import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { EmptyState } from '../components/ui';

/**
 * Catch-all route. The SPA fallback serves index.html for any unknown path, so
 * without this an invalid URL rendered a blank page.
 */
const NotFound = () => {
  usePageTitle('Page not found');

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-6">
      <div className="bg-orbs pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md">
        <EmptyState
          icon={<Compass className="h-8 w-8" />}
          title="This page does not exist"
          description="The link may be out of date, or the address mistyped."
          action={
            <Link to="/" className="btn-primary">
              Go to the homepage
            </Link>
          }
        />
      </div>
    </div>
  );
};

export default NotFound;
