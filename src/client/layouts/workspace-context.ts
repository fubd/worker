import type { AuthUser } from '@/shared/types';

export type IconColorMode = 'neutral' | 'balanced' | 'categorical';

export interface WorkspaceOutletContext {
  user: AuthUser | null;
  iconColorMode?: IconColorMode;
  openPasswordSettings: () => void;
  bindProvider: (provider: 'google' | 'github') => void;
  signOut: () => Promise<void>;
}
