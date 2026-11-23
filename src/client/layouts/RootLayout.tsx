import { lazy, Suspense, useCallback, useState } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';

import { BrandMark } from '../components/BrandMark';
import { useAuth } from '../auth/AuthProvider';
import type { WorkspaceOutletContext } from './workspace-context';

const enableSpeedInsights = import.meta.env.PROD;
const PasswordSettingsModal = lazy(() => import('../components/PasswordSettingsModal'));

function WorkspaceLoading() {
  return (
    <div className="swan-workspace-loading" role="status" aria-label="正在读取登录状态">
      <BrandMark size={42} />
      <span>正在打开雨燕…</span>
    </div>
  );
}

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

  if (status === 'loading') return <WorkspaceLoading />;
  if (status === 'unauthenticated' || !user) return <Navigate to="/login" replace />;

  const context: WorkspaceOutletContext = {
    user,
    openPasswordSettings,
    bindProvider,
    signOut: handleSignOut,
  };

  return (
    <>
      <Outlet context={context} />
      {passwordModalOpen && (
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
