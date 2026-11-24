import { lazy, Suspense, useCallback, useState } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';

import { useAuth } from '../auth/AuthProvider';
import type { WorkspaceOutletContext } from './workspace-context';

const enableSpeedInsights = import.meta.env.PROD;
const PasswordSettingsModal = lazy(() => import('../components/PasswordSettingsModal'));

export default function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { status, user, bindProvider, signOut } = useAuth();
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  const openPasswordSettings = useCallback(() => {
    setPasswordModalOpen(true);
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut();
    navigate('/login', { replace: true });
  }, [navigate, signOut]);

  if (status === 'unauthenticated' || (status === 'authenticated' && !user)) {
    return <Navigate to="/login" replace />;
  }

  const context: WorkspaceOutletContext = {
    user,
    openPasswordSettings,
    bindProvider,
    signOut: handleSignOut,
  };

  return (
    <>
      <Outlet context={context} />
      {passwordModalOpen && user && (
        <Suspense fallback={null}>
          <PasswordSettingsModal
            hasPassword={user.hasPassword}
            onClose={() => setPasswordModalOpen(false)}
          />
        </Suspense>
      )}
      {enableSpeedInsights && <SpeedInsights route={location.pathname} />}
    </>
  );
}
