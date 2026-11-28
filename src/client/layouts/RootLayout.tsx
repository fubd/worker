import { lazy, Suspense, useCallback, useState } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';

import { useAuth } from '../auth/AuthProvider';
import { isServerVerifiedHome } from '../public-shell';
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

  const context: WorkspaceOutletContext = {
    user,
    openPasswordSettings,
    bindProvider,
    signOut: handleSignOut,
  };

  if (status === 'unauthenticated') {
    if (!(location.pathname === '/' && isServerVerifiedHome())) {
      return <Navigate to="/login" replace />;
    }
  }
  if (!user) {
    return <Outlet context={context} />;
  }

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
