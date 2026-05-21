
import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { safeParseLocalStorage, safeSetLocalStorage, safeGetLocalStorage } from '../utils/localStorageUtils';
import { db } from '../src/lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

interface AppSettings {
  autoSync: boolean;
  dataSaver: boolean;
}

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
}

const defaultSettings: AppSettings = {
  autoSync: true,
  dataSaver: false,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const savedSync = safeGetLocalStorage('setting_sync');
    const savedSaver = safeGetLocalStorage('setting_datasaver');
    
    return {
      autoSync: savedSync !== null ? savedSync === 'true' : defaultSettings.autoSync,
      dataSaver: savedSaver !== null ? savedSaver === 'true' : defaultSettings.dataSaver,
    };
  });

  // Real-time Sync with Firestore
  useEffect(() => {
    const configRef = doc(db, 'system_config', 'general');
    const unsubscribe = onSnapshot(configRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        console.log("Real-time settings update from Firestore:", data);
        setSettings((prev) => {
          const updated = { ...prev, ...data };
          if (JSON.stringify(prev) !== JSON.stringify(updated)) {
            return updated;
          }
          return prev;
        });
      }
    }, (error) => {
      console.warn("Firestore Settings Sync (Read) Error:", error);
    });

    return () => unsubscribe();
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    // 1. Update local state
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      // Persist to local storage immediately as fallback
      if (newSettings.autoSync !== undefined) safeSetLocalStorage('setting_sync', String(newSettings.autoSync));
      if (newSettings.dataSaver !== undefined) safeSetLocalStorage('setting_datasaver', String(newSettings.dataSaver));
      return updated;
    });

    // 2. Sync to Firestore (Global config - usually Admin only)
    try {
      const configRef = doc(db, 'system_config', 'general');
      // We try to sync, but it may fail if the user is not an admin
      // This is expected given our security rules
      await setDoc(configRef, newSettings, { merge: true });
    } catch (error) {
      // Regular users will see this in console if they try to change global settings
      // but their local session will still reflect the change
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.info("Firestore Settings Sync (Write) skipped or denied:", errorMessage);
    }
  }, []);

  const value = useMemo(() => ({
    settings,
    updateSettings
  }), [settings, updateSettings]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
