import { lazy, Suspense, useCallback, useState } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';

import { useAuth } from '../auth/AuthProvider';
import type { WorkspaceOutletContext } from './workspace-context';

const enableSpeedInsights = import.meta.env.PROD;
const PasswordSettingsModal = lazy(() => import('../components/PasswordSettingsModal'));
const isStaticRender = typeof window === 'undefined';

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
    return <Navigate to="/login" replace />;
  }
  if (!user) {
    if (isStaticRender) return <Outlet context={context} />;
    return (
      <div className="swan-workspace swan-workspace-is-loading" aria-busy="true">
        <div className="swan-sidebar-loading" aria-hidden="true">
          <div className="swan-loading-surface">
            <div className="swan-skeleton-bar is-brand" />
            <div className="swan-skeleton-bar is-search" />
            <div className="swan-skeleton-bar is-nav" />
            <div className="swan-skeleton-bar is-nav" />
            <div className="swan-skeleton-bar is-nav" />
          </div>
        </div>
        <main className="swan-workspace-main">
          <div className="swan-topbar-skeleton swan-loading-surface" aria-hidden="true">
            <div className="swan-skeleton-bar is-breadcrumb" />
            <div className="swan-skeleton-bar is-action" />
          </div>
        </main>
      </div>
    );
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
