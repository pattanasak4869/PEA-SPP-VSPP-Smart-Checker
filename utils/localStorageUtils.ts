
import { db } from '../src/lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

export let isSyncingFromFirestore = false;
export const setSyncingFromFirestore = (val: boolean) => {
  isSyncingFromFirestore = val;
};

const SYNC_KEYS: Record<string, { col: string, pk: string }> = {
  'power_plants': { col: 'powerPlants', pk: 'id' },
  'app_users': { col: 'users', pk: 'employeeId' },
  'app_inspection_forms': { col: 'inspectionForms', pk: 'id' },
  'app_inspection_requests': { col: 'inspectionRequests', pk: 'id' },
  'app_inspections': { col: 'inspections', pk: 'id' },
  'app_complaints': { col: 'complaints', pk: 'id' },
  'login_logs': { col: 'loginLogs', pk: 'id' }
};

/**
 * Safely parse JSON from localStorage with a fallback value.
 * This prevents crashes when the stored data is invalid or missing.
 */
export const safeParseLocalStorage = <T,>(key: string, fallback: T): T => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    // Don't try to parse if it doesn't look like JSON (simple strings)
    if (typeof fallback === 'string' && !item.startsWith('{') && !item.startsWith('[')) {
        return item as unknown as T;
    }
    return JSON.parse(item) as T;
  } catch (error) {
    console.error(`Error parsing localStorage key "${key}":`, error);
    return fallback;
  }
};

/**
 * Safely get a raw string from localStorage.
 */
export const safeGetLocalStorage = (key: string, fallback: string | null = null): string | null => {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return fallback;
        return localStorage.getItem(key) || fallback;
    } catch (error) {
        console.error(`Error getting localStorage key "${key}":`, error);
        return fallback;
    }
};

/**
 * Safely save data to localStorage.
 */
export const safeSetLocalStorage = <T,>(key: string, data: T): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    
    // Sync logic before we mutate local storage to compare old vs. new
    const syncInfo = SYNC_KEYS[key];
    if (syncInfo && !isSyncingFromFirestore && Array.isArray(data)) {
      const colName = syncInfo.col;
      const pkField = syncInfo.pk;
      try {
        const prevString = localStorage.getItem(key);
        const prevArray: any[] = prevString ? JSON.parse(prevString) : [];
        const newArray = data as any[];

        // 1. Find added or updated items
        for (const newItem of newArray) {
          if (!newItem || typeof newItem !== 'object') continue;
          const pk = newItem[pkField];
          if (!pk) continue;

          const prevItem = prevArray.find(item => item && item[pkField] === pk);
          if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(newItem)) {
            const docRef = doc(db, colName, pk);
            setDoc(docRef, newItem, { merge: true }).catch(err => {
              console.warn(`Firestore Sync Set Error for collection ${colName}, doc ${pk}:`, err);
            });
          }
        }

        // 2. Find deleted items
        for (const prevItem of prevArray) {
          if (!prevItem || typeof prevItem !== 'object') continue;
          const pk = prevItem[pkField];
          if (!pk) continue;

          const stillExists = newArray.some(newItem => newItem && newItem[pkField] === pk);
          if (!stillExists) {
            const docRef = doc(db, colName, pk);
            deleteDoc(docRef).catch(err => {
              console.warn(`Firestore Sync Delete Error for collection ${colName}, doc ${pk}:`, err);
            });
          }
        }
      } catch (syncErr) {
        console.warn(`Error during Firestore sync preparation for key ${key}:`, syncErr);
      }
    }

    const value = typeof data === 'string' ? data : JSON.stringify(data);
    localStorage.setItem(key, value);
  } catch (error: any) {
    if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      const sizeAttempt = ((typeof data === 'string' ? data : JSON.stringify(data)).length / 1024 / 1024);
      console.error(`localStorage quota exceeded for key "${key}". Current size attempt: ${sizeAttempt.toFixed(2)} MB`);
      
      // Auto-cleanup attempt: Clear old logs or non-critical data if quota exceeded
      try {
          console.warn('Quota exceeded. Attempting aggressive cleanup...');
          // Critical keys we NEVER want to delete: user_profile, app_auth, user_profiles_db (basic info), maybe plant/inspection data
          // Non-critical keys to clear in order of priority
          const nonCriticalKeys = [
            'login_logs', 
            'draft_profile_edit', 
            'app_notifications', 
            'draft_inspection', 
            'last_inspections_preview',
            'logout_message',
            'current_view'
          ];
          
          let clearedSomething = false;
          for (const k of nonCriticalKeys) {
            if (k !== key && localStorage.getItem(k)) {
              localStorage.removeItem(k);
              clearedSomething = true;
            }
          }

          // If still failing, try clearing older individual user avatars/signatures NOT belonging to current session
          if (!clearedSomething) {
             const currentUserId = safeParseLocalStorage<any>('user_profile', {})?.employeeId;
             for (let i = 0; i < localStorage.length; i++) {
               const k = localStorage.key(i);
               if (k && (k.startsWith('user_avatar_') || k.startsWith('user_signature_')) && (!currentUserId || !k.endsWith(currentUserId))) {
                  localStorage.removeItem(k);
                  clearedSomething = true;
               }
             }
          }
          
          // Try again
          const val = typeof data === 'string' ? data : JSON.stringify(data);
          localStorage.setItem(key, val);
          console.log(`Successfully saved "${key}" after aggressive cleanup.`);
          return;
      } catch (e) {
          console.error('Cleanup failed or data still too large:', e);
      }
    }
    console.error(`Error saving to localStorage key "${key}":`, error);
  }
};

/**
 * Safely remove an item from localStorage.
 */
export const safeRemoveLocalStorage = (key: string): void => {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return;
        localStorage.removeItem(key);
    } catch (error) {
        console.error(`Error removing localStorage key "${key}":`, error);
    }
};
