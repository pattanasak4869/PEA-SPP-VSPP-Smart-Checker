import React, { useState } from 'react';
import { Database, CheckCircle2, AlertCircle, RefreshCw, Layers, ShieldAlert } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { seedSampleData } from '../src/lib/firebase';
import { motion } from 'motion/react';

interface SeedManagementProps {
  isDangerZoneUnlocked: boolean;
  setIsDangerZoneUnlocked: (unlocked: boolean) => void;
  setIsUnlockModalOpen: (open: boolean) => void;
}

export const SeedManagement: React.FC<SeedManagementProps> = ({
  isDangerZoneUnlocked,
  setIsDangerZoneUnlocked,
  setIsUnlockModalOpen
}) => {
  const { t } = useLanguage();
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedStatus, setSeedStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [seededCollections, setSeededCollections] = useState<string[]>([]);

  const handleSeedData = async () => {
    if (!isDangerZoneUnlocked) {
      setIsUnlockModalOpen(true);
      return;
    }

    setIsSeeding(true);
    setSeedStatus('idle');
    setSeededCollections([]);
    try {
      const success = await seedSampleData();
      if (success) {
        setSeedStatus('success');
        setSeededCollections(['users', 'powerPlants', 'systemConfig']);
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
    <div className="space-y-8 animate-fade-in max-w-4xl mx-auto pb-20 mt-6">
      {/* Header Profile Info section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-100/50 dark:bg-white/5 p-6 rounded-[2rem] border border-slate-200/50 dark:border-white/5">
         <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-white italic flex items-center gap-2">
              <Database className="text-[#74045F] dark:text-[#C7911B]" size={24} />
              ระบบสร้างและจัดสรรข้อมูลจำลองขั้นสูง (Advanced Database Seeding)
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-1">
              Internal Information System Admin Tools
            </p>
         </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Info panel */}
        <div className="md:col-span-2 space-y-6">
          <div className="glass-panel p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 bg-white dark:bg-[#030712] shadow-xl shadow-slate-200/25 dark:shadow-none space-y-6">
            <h3 className="text-base font-black text-slate-800 dark:text-white italic">รายละเอียดของการซิงค์และเขียนข้อมูลจำลอง</h3>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
              เมนูนี้สำหรับผู้ดูแลระบบ (Admin Only) เพื่อใช้อัปโหลดโครงสร้างและชุดข้อมูลจำลองขนาดย่อม (Sample Seeding Core) เข้าสู่ระบบคลาวด์ Firebase Firestore โดยตรง 
              การซีดข้อมูลนี้จะช่วยรับประกันความสมบูรณ์และลดความขัดแย้งเชิงพิกัดในการทดสอบระบบความปลอดภัย Geofencing และแบบร่างเอกสารการปฏิบัติงาน
            </p>

            <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-amber-500 space-y-2">
               <h4 className="text-xs font-black flex items-center gap-1.5 uppercase tracking-wider">
                  <ShieldAlert size={14} /> ข้อควรระวังในการเขียนข้อมูลทับ
               </h4>
               <p className="text-[11px] text-amber-600/80 dark:text-amber-400/70 font-bold leading-normal">
                  ปุ่มเขียนข้อมูลระดับแกนระบบต้องการสิทธิ์ปลดล็อกพื้นที่ควบคุมพิเศษ (Danger Zone Security Lock) 
                  หากยังไม่ได้ปลดล็อก รหัสผ่านความปลอดภัยสำหรับการควบคุมระบบระยะไกลจะมีผลบังคับใช้
               </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">รายการ Collections ข้อมูลจำลองที่เตรียมเขียน</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5 flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-lg">
                    <Layers size={16} />
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-700 dark:text-slate-200">users</h5>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">บัญชีผู้ใช้จำลอง (10 รายการ)</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5 flex items-center gap-3">
                  <div className="p-2 bg-[#74045F]/10 text-[#74045F] dark:text-[#C7911B] rounded-lg">
                    <Layers size={16} />
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-700 dark:text-slate-200">powerPlants</h5>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">โรงไฟฟ้าสาธิต & GPS (3 รายการ)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Panel */}
        <div className="space-y-6">
          <div className="glass-panel p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 bg-white dark:bg-[#030712] shadow-xl shadow-slate-200/25 dark:shadow-none text-center space-y-6">
            <div className="w-16 h-16 bg-[#74045F]/10 dark:bg-[#C7911B]/10 text-[#74045F] dark:text-[#C7911B] rounded-2xl flex items-center justify-center mx-auto animate-pulse">
              <Database size={28} />
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">ตัวกระตุ้นฐานข้อมูลย่อย</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 leading-normal">คลิกเพื่อเริ่มเขียนข้อมูลทดลองหลัก</p>
            </div>

            <button
              onClick={handleSeedData}
              disabled={isSeeding}
              className={`
                w-full py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3.5 transition-all duration-300 shadow-lg cursor-pointer
                ${!isDangerZoneUnlocked 
                  ? 'bg-slate-400 dark:bg-slate-800 text-slate-200 border border-slate-300 dark:border-slate-700 shadow-none' 
                  : seedStatus === 'success'
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'
                  : seedStatus === 'error'
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'}
              `}
            >
              {isSeeding ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : seedStatus === 'success' ? (
                <CheckCircle2 size={16} />
              ) : (
                <Database size={16} />
              )}
              {!isDangerZoneUnlocked 
                ? 'ระบบล็อก (โปรดปลดล็อกก่อน)' 
                : isSeeding 
                ? 'กำลังเชื่อมต่อและเขียน...' 
                : seedStatus === 'success' 
                ? 'ส่งข้อมูลจำลองสำเร็จ!' 
                : 'เริ่มเขียนชุดข้อมูลทดสอบ'}
            </button>

            {/* Display status details */}
            {seedStatus === 'success' && seededCollections.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 text-left text-[11px] font-bold space-y-1.5"
              >
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider">
                  <CheckCircle2 size={12} /> ข้อมูลเขียนเรียบร้อย:
                </div>
                <ul className="list-disc pl-4 space-y-1 italic">
                  <li>Collection 'users' พร้อมใช้งาน</li>
                  <li>Collection 'powerPlants' ถูกจัดเรียงและปักพินพิกัดแล้ว</li>
                </ul>
              </motion.div>
            )}

            {seedStatus === 'error' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-500 text-left text-xs font-bold flex items-center gap-2"
              >
                <AlertCircle size={16} />
                <span>การซิงค์ล้มเหลว โปรดตรวจสอบบริการหรือสิทธิ์รักษาความปลอดภัย</span>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
