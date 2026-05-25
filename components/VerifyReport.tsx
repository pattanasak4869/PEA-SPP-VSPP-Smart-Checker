
import React, { useState, useEffect } from 'react';
import { InspectionResult } from '../types';
import { safeParseLocalStorage } from '../utils/localStorageUtils';
import { CheckCircle2, AlertCircle, FileText, Calendar, User, Zap, Mail, Phone, ShieldCheck, MapPin, Info } from 'lucide-react';
import { motion } from 'motion/react';

export const VerifyReport: React.FC = () => {
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<InspectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<any[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('verify');
    setInspectionId(id);

    // Load available forms for translation labels
    const cachedForms = safeParseLocalStorage<any[]>('app_inspection_forms', []);
    setForms(cachedForms);

    if (id) {
      // Simulate fetching from DB (reading from localStorage)
      const inspections = safeParseLocalStorage<InspectionResult[]>('app_inspections', []);
      const found = inspections.find(i => i.id === id);
      
      // Artificial delay for realism
      setTimeout(() => {
        setInspection(found || null);
        setLoading(loading => false);
      }, 1500);
    } else {
      setLoading(false);
    }
  }, []);

  const getFieldLabel = (key: string) => {
    // 1. Look in the form corresponding to this inspection
    const form = forms.find(f => f.id === inspection?.formId);
    let field = form?.fields?.find((f: any) => f.id === key);
    if (!field && form?.sections) {
      for (const section of form.sections) {
        field = section.fields?.find((f: any) => f.id === key);
        if (field) break;
      }
    }
    if (field?.label) return field.label;

    // 2. Or fallback by scanning all other schemas
    for (const f of forms) {
      let lf = f.fields?.find((fl: any) => fl.id === key);
      if (!lf && f.sections) {
        for (const section of f.sections) {
          lf = section.fields?.find((fl: any) => fl.id === key);
          if (lf) break;
        }
      }
      if (lf?.label) return lf.label;
    }

    // 3. Robust Thai and English dictionary database for physical equipment or standard PQ forms
    const fallbackMap: Record<string, string> = {
      f1: 'ชื่อโรงไฟฟ้า',
      f2: 'วันที่ตรวจสอบหน้างาน',
      f3: 'ระดับแรงดันเชื่อมเหลื่อมระบบ',
      voltage: 'แรงดันไฟฟ้า (Voltage)',
      current: 'กระแสไฟฟ้า (Current)',
      harmonics: 'ระดับฮาร์มอนิกหลัก (THD - Total Harmonics distortion)',
      flicker: 'ระดับไฟกระพริบระนาบแรงดัน (Voltage Flicker)',
      grounding: 'ความต้านทานหลักดินของสถานี (Ground Resistance)',
      visual_check: 'การประเมินสภาพสัณฐานภายนอกตู้จำจ่าย',
      transformer_oil: 'คุณภาพนํ้ามันหม้อแปลงสลับเสตจ',
      temp_c: 'ระดับอุณหภูมิขั้วต่อความร้อนสะสม (°C)',
      power_factor: 'ค่าตัวประกอบสปีดกำลังหน้างาน (Power Factor)',
      phase_unbalance: 'ความสมดุลความตึงทางเฟส (Phase Unbalance)',
      active_power: 'กำลังไฟฟ้าจริงส่งสัญจร (Active Power - MW)',
      reactive_power: 'กำลังไฟฟ้ารีแอคทีฟสะสม (Reactive Power - MVAR)',
      frequency: 'ความถี่คลื่นระบบจำจ่ายเสถียร (Frequency - Hz)',
      insulation_resistance: 'ความต้านทานฉนวนหม้อแปลง (Insulation Resistance)',
      neutral_current: 'ระดับกระแสป้อนที่ไหลในสายนิวทรัล (Neutral Current)'
    };

    return fallbackMap[key] || key;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#74045F]/20 border-t-[#74045F] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-medium animate-pulse">กำลังตรวจสอบความถูกต้องของเอกสาร...</p>
        </div>
      </div>
    );
  }

  if (!inspectionId || !inspection) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-200 max-w-md w-full text-center"
        >
          <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-4 tracking-tight">ไม่พบข้อมูลการตรวจสอบ</h2>
          <p className="text-slate-500 mb-8 leading-relaxed">
            รหัสตรวจสอบไม่ถูกต้อง หรือเอกสารนี้อาจยังไม่ได้รับการอนุมัติเข้าสู่ระบบอย่างเป็นทางการ กรุณาติดต่อกองตรวจสอบมาตรฐานไฟฟ้าเพื่อยืนยันอีกครั้ง
          </p>
          <button 
            onClick={() => window.location.href = '/'}
            className="w-full bg-[#74045F] text-white font-bold py-4 rounded-2xl hover:bg-[#5a034a] transition-all shadow-lg shadow-[#74045F]/20"
          >
            กลับสู่หน้าหลัก
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Header Verification Badge */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-emerald-500 text-white p-8 rounded-[2.5rem] shadow-xl shadow-emerald-500/20 mb-8 flex flex-col md:flex-row items-center gap-6"
        >
          <div className="bg-white/20 p-4 rounded-full backdrop-blur-md">
            <ShieldCheck size={48} />
          </div>
          <div className="text-center md:text-left flex-1">
            <h1 className="text-3xl font-black tracking-tight mb-1 uppercase italic">Verified Authentic</h1>
            <p className="text-emerald-50 font-medium opacity-90 leading-relaxed">
              เอกสารฉบับนี้ผ่านการตรวจสอบและรับรองความถูกต้องโดยระบบ PEA Infrastructure Audit Intelligence System เรียบร้อยแล้ว ข้อมูลที่คุณเห็นด้านล่างคือข้อมูลต้นฉบับจากฐานข้อมูล
            </p>
          </div>
          <div className="bg-white/10 px-6 py-4 rounded-2xl border border-white/20 backdrop-blur-sm text-center">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">รายงานผลการตรวจเลขที่</p>
            <p className="text-lg font-mono font-black">PEA-SPP-{inspection.id?.substring(8, 16).toUpperCase()}</p>
          </div>
        </motion.div>

        {/* Data Comparison Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
              <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                <FileText size={20} className="text-[#74045F]" />
                ข้อมูลพื้นฐานโรงไฟฟ้า (Basic Information)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ชื่อโรงไฟฟ้า</p>
                  <p className="text-slate-700 font-bold">{inspection.plantName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">สถานะปัจจุบัน</p>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-black">
                    <CheckCircle2 size={12} />
                    {inspection.status}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">วันที่ได้รับอนุมัติ</p>
                  <p className="text-slate-700 font-bold">{inspection.approvedAt ? new Date(inspection.approvedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">หน่วยงานที่ตรวจสอบ</p>
                  <p className="text-slate-700 font-bold">{inspection.office || 'PEA Regional PQ Team'}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
              <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                <FileText size={20}  className="text-[#74045F]" />
                ข้อมูลจากการสังเกตภาคสนามและการวัดทางเทคนิค
              </h3>
              <div className="overflow-hidden rounded-xl border border-slate-100 shadow-sm">
                <table className="w-full technical-table text-left border-collapse">
                  <thead>
                    <tr>
                      <th className="w-16 text-center py-2">ลำดับที่</th>
                      <th className="text-center py-2">รายการการตรวจสอบ</th>
                      <th className="w-1/3 text-center py-2">ค่าผลลัพธ์ของอุปกรณ์</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(inspection.formData || {}).length > 0 ? (
                      Object.entries(inspection.formData || {}).map(([key, value]: [string, any], index) => (
                        <tr key={key} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                          <td className="text-center font-mono text-slate-400 tracking-tighter py-2">
                            {String(index + 1).padStart(2, '0')}
                          </td>
                          <td className="text-center text-slate-700 py-2">
                            {getFieldLabel(key)}
                          </td>
                          <td className="font-mono text-center text-xs text-slate-600 bg-slate-50/50 py-2">
                            {Array.isArray(value) ? value.join(', ') : (value || 'NULL')}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-20 text-center">
                          <div className="flex flex-col items-center gap-2 opacity-30">
                            <Info size={32} />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">No field data records found for this audit.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
              <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                <Zap size={20} className="text-amber-500" />
                สรุปผลการประเมิน (Inspection Summary)
              </h3>
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 italic text-slate-600 leading-relaxed">
                "{inspection.approvalNote || 'ไม่มีข้อเสนอแนะเพิ่มเติม'}"
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Inspector</p>
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-slate-100 shadow-inner">
                <User size={32} className="text-slate-300" />
              </div>
              <p className="text-sm font-black text-slate-800 mb-1">{inspection.inspectorName}</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Field Technical Auditor</p>
            </div>

            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Approver</p>
              <div className="w-20 h-20 bg-[#74045F]/5 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-[#74045F]/10 shadow-inner">
                <User size={32} className="text-[#74045F]/30" />
              </div>
              <p className="text-sm font-black text-slate-800 mb-1">{inspection.managerName || 'Regional Director'}</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Supervisory Chief</p>
            </div>

            <button 
              onClick={() => window.print()}
              className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
            >
              <FileText size={18} />
              พิมพ์รายละเอียดใบรับรอง
            </button>
          </div>
        </div>

        <p className="text-center mt-12 text-[10px] text-slate-400 font-bold uppercase tracking-[0.4em]">
          PEA INFRASTRUCTURE AUDIT INTELLIGENCE SYSTEM
        </p>
      </div>
    </div>
  );
};
