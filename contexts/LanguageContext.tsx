
import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { Language } from '../types';
import { translations, TranslationKey } from '../utils/translations';
import { safeGetLocalStorage, safeSetLocalStorage } from '../utils/localStorageUtils';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = safeGetLocalStorage('app_language');
    if (saved && ['TH', 'EN', 'CN'].includes(saved)) return saved as Language;
    return 'TH';
  });

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    safeSetLocalStorage('app_language', lang);
  };

  const t = useCallback((key: TranslationKey): string => {
    const translationSet = translations[key];
    if (!translationSet) {
        console.warn(`Missing translation key: ${key}`);
        return key;
    }
    return translationSet[language] || translationSet['EN'];
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage: handleSetLanguage,
    t
  }), [language, handleSetLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
