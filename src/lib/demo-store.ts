import {
  buildNotificationRecipients,
  createInitialDemoState,
  type DemoDatabaseState,
} from './demo-seed';

const STORAGE_KEY = 'vistasat_pro_demo_state_v1';
const SESSION_KEY = 'vistasat_pro_demo_user_id';

export function loadDemoState(): DemoDatabaseState {
  if (typeof window === 'undefined') return createInitialDemoState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialDemoState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw) as DemoDatabaseState;
  } catch {
    return createInitialDemoState();
  }
}

export function saveDemoState(state: DemoDatabaseState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('vistasat:demo-updated'));
}

export function getDemoSessionUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SESSION_KEY);
}

export function setDemoSessionUserId(userId: string | null) {
  if (typeof window === 'undefined') return;
  if (userId) {
    localStorage.setItem(SESSION_KEY, userId);
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

export const dispatchDemoNotifications = buildNotificationRecipients;
export type { DemoDatabaseState };
