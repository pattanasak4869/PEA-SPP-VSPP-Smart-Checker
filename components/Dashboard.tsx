
import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Activity, Database, CheckCircle2, AlertCircle, ShieldAlert } from 'lucide-react';
import { seedSampleData } from '../src/lib/firebase';
import { CaseMapTracker } from './CaseMapTracker';
import { ViewState } from '../types';

interface DashboardProps {
  userProfile?: any;
  onNavigate?: (view: ViewState) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ userProfile, onNavigate }) => {
  const { t } = useLanguage();
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedStatus, setSeedStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const isAdmin = userProfile?.role === 'ADMIN';

  const handleTestFirebase = async () => {
    setIsSeeding(true);
    setSeedStatus('idle');
    try {
      const success = await seedSampleData();
      if (success) {
        setSeedStatus('success');
        setTimeout(() => setSeedStatus('idle'), 5000);
      } else {
        setSeedStatus('error');
      }
    } catch (error) {
      console.error(error);
      setSeedStatus('error');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {isAdmin && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            <ShieldAlert size={16} />
            <span>Admin Central Overview • ซิงค์ฐานข้อมูล Firebase Firestore เรียลไทม์</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            (ระบบแสดงแผนที่สถานะเคสตรวจสอบตามข้อมูลจริงใน Firebase)
          </span>
        </div>
      )}
      <CaseMapTracker userProfile={userProfile} onNavigate={onNavigate} />
    </div>
  );
};

