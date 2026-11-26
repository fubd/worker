import type { AuthUser } from '@/shared/types';

export interface WorkspaceOutletContext {
  user: AuthUser | null;
  openPasswordSettings: () => void;
  bindProvider: (provider: 'google' | 'github') => void;
  signOut: () => Promise<void>;
}
