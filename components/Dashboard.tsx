import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Activity } from 'lucide-react';

interface DashboardProps {}

export const Dashboard: React.FC<DashboardProps> = () => {
  const { t } = useLanguage();

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
