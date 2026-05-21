
import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Activity, Database, CheckCircle2, AlertCircle } from 'lucide-react';
import { seedSampleData } from '../src/lib/firebase';

interface DashboardProps {}

export const Dashboard: React.FC<DashboardProps> = () => {
  const { t } = useLanguage();
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedStatus, setSeedStatus] = useState<'idle' | 'success' | 'error'>('idle');

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
    <div className="space-y-8 animate-fade-in pb-20 mt-10">
      <div className="max-w-4xl mx-auto text-center space-y-6">
        <div className="w-20 h-20 bg-indigo-600/10 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-pulse">
           <Activity size={40} />
        </div>
        
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
          {t('dash.title')}
        </h1>
        
        <p className="text-slate-500 dark:text-slate-400 text-base font-light leading-relaxed max-w-2xl mx-auto italic">
          ระบบพร้อมใช้งานสำหรับการติดตามและบริหารจัดการโรงไฟฟ้า SPP & VSPP เรียลไทม์ <br/>
          จัดการข้อมูลโปรไฟล์หรืองานตรวจสอบของคุณเพื่อเริ่มต้นใช้งาน
        </p>

        {/* Firebase Test Section */}
        <div className="max-w-md mx-auto mt-12 p-6 rounded-3xl bg-white dark:bg-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
              <Database size={20} />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-white">เชื่อมต่อ Firebase</h3>
          </div>
          
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            หากคุณไม่เห็นข้อมูลใน Firebase Console ให้กดปุ่มด้านล่างเพื่อส่งข้อมูลทดสอบ
          </p>

          <button
            onClick={handleTestFirebase}
            disabled={isSeeding || seedStatus === 'success'}
            className={`
              w-full py-3 px-6 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-300
              ${seedStatus === 'success' 
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                : seedStatus === 'error'
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 active:scale-95 disabled:opacity-50'}
            `}
          >
            {isSeeding ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : seedStatus === 'success' ? (
              <><CheckCircle2 size={20} /> ส่งข้อมูลสำเร็จ!</>
            ) : seedStatus === 'error' ? (
              <><AlertCircle size={20} /> เกิดข้อผิดพลาด</>
            ) : (
              'ส่งข้อมูลทดสอบ (Seed Data)'
            )}
          </button>

          {seedStatus === 'success' && (
            <p className="mt-4 text-xs text-emerald-600 dark:text-emerald-400 animate-pulse">
              ข้อมูลปรากฏใน Collection "powerPlants" แล้วครับ
            </p>
          )}
        </div>

        <div className="p-6 rounded-3xl bg-indigo-50/50 dark:bg-indigo-600/5 border border-indigo-100/50 dark:border-indigo-500/10 mt-8">
            <div className="flex items-center justify-center gap-2 text-indigo-600 dark:text-indigo-400 mb-2">
               <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></div>
               <span className="text-[10px] font-black uppercase tracking-[0.2em]">{t('dash.system_online')}</span>
            </div>
            <p className="text-sm text-indigo-800/60 dark:text-indigo-200/40 italic">
              สถานะการทำงานของระบบถูกติดตามและซิงค์ข้อมูลอย่างต่อเนื่องแบบเรียลไทม์
            </p>
        </div>
      </div>
    </div>
  );
};
