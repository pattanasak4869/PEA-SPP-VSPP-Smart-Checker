import React from 'react';
import { 
  CheckCircle2, XCircle, Zap, ShieldCheck, MapPin, 
  Building2, User, Calendar, FileText, Clock, 
  Target, Info, Hash, Award, Shield
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface InspectionReportProps {
  inspection: any;
  plant: any;
  request?: any;
  form?: any;
}

export const InspectionReport: React.FC<InspectionReportProps> = ({ inspection, plant, request, form }) => {
  // Helper to find field label
  const getFieldLabel = (key: string) => {
    if (!form) return key;
    let field = form.fields?.find((f: any) => f.id === key);
    if (!field && form.sections) {
      for (const section of form.sections) {
        field = section.fields?.find((f: any) => f.id === key);
        if (field) break;
      }
    }
    return field?.label || key;
  };

  return (
    <div className="bg-white text-slate-900 p-12 max-w-[900px] mx-auto font-sans leading-relaxed relative border border-slate-200 shadow-2xl my-10 print:my-0 print:border-none print:shadow-none" id="inspection-report">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
        
        @page { 
          size: A4 portrait; 
          margin: 15mm; 
        }
        
        @media print {
          body { 
            margin: 0; 
            padding: 0;
            background: white;
            -webkit-print-color-adjust: exact;
          }
          #inspection-report {
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
          }
          header, footer { display: none !important; }
          .print-page-break {
            break-before: page !important;
            page-break-before: always !important;
          }
        }

        .report-section-title {
          font-size: 10px;
          font-weight: 800;
          font-family: "Prompt", sans-serif;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #74045F;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .data-label {
          font-size: 9px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
        }

        .data-value {
          font-size: 12px;
          font-weight: 600;
          color: #1e293b;
        }

        .technical-table th {
          font-size: 9px;
          font-family: "Prompt", sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 800;
          color: #FFFFFF;
          padding: 12px 16px;
          background: #74045F;
          border-bottom: 2px solid #e2e8f0;
        }

        .technical-table td {
          font-size: 11px;
          font-family: "Prompt", sans-serif;
          padding: 10px 16px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
        }
      `}</style>
      
      {/* 1. OFFICIAL CORPORATE HEADER */}
      <div className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-6">
            <div className="bg-[#74045F] dark:bg-[#C7911B] p-2.5 rounded-lg shadow-lg shadow-[#74045F]/20 dark:shadow-[#C7911B]/20">
                <Zap size={24} className="text-white" fill="currentColor" />
            </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 leading-none mb-2">รายงานผลการตรวจสอบอุปกรณ์โรงไฟฟ้า</h1>
            <p className="text-[10px] font-bold text-[#74045F] uppercase tracking-[0.3em]">Report on the inspection results of power plant equipment.</p>
          </div>
        </div>
        <div className="text-right">
          <div className="inline-block px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl">
            <p className="text-[10px] font-bold text-[#000000] uppercase tracking-[0.2em] mb-1">รายงานผลการตรวจเลขที่</p>
            <p className="text-[11px] font-mono font-bold text-[#74045F] mb-4">PEA-SPP-{inspection.id?.substring(8, 16).toUpperCase()}</p>
            <span className={`text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border ${inspection.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
              ผลการตรวจสอบ: {inspection.status}
            </span>
          </div>
        </div>
      </div>
      <br />

      {/* 2. REPORT METADATA */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 shadow-sm">
        <table className="w-full technical-table text-left border-collapse">
          <thead>
            <tr>
              <th className="w-32 text-center">วันที่ตรวจสอบ</th>
              <th className=" text-center">เวลาบันทึข้อมูล</th>
              <th className=" text-center">แบบฟอร์มอ้างอิง</th>
              <th className=" text-center">สถานะข้อมูล</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-center">วันที่ {new Date(inspection.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
              <td className="text-center">เวลา {new Date(inspection.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} นาที</td>
              <td className="text-center">{form?.title?.split(' ')[0] || 'GEN-01'}</td>
              <td className="text-center">
                <span className={`text-xs font-bold ${inspection.status === 'APPROVED' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {inspection.status === 'APPROVED' ? 'Finalized' : 'Draft/Pending'}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <br />

      {/* 3. ASSET & VENDOR INFORMATION */}
      <h3 className="report-section-title">
        <Building2 size={14} className="text-[#74045F]" />
        ข้อมูลทั่วไปโรงไฟฟ้าและผู้ประสานงานตรวจสอบ
      </h3>
      <div className="overflow-hidden rounded-xl border border-slate-100 shadow-sm">
        <table className="w-full technical-table text-left border-collapse">
          <thead>
            <tr>
              <th className="w-32 text-center">ชื่อโรงไฟฟ้า</th>
              <th className=" text-center">ประเภทโรงไฟฟ้า</th>
              <th className=" text-center">กำลังการผลิต</th>
              <th className=" text-center">โซนจังหวัดที่ตั้ง</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-center">{plant.name}</td>
              <td className="text-center">{plant.type}</td>
              <td className="text-center">{plant.capacity} MW</td>
              <td className="text-center">{plant.address || plant.province || 'Standard Territory'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <br/>
      <div className="overflow-hidden rounded-xl border border-slate-100 shadow-sm">
        <table className="w-full technical-table text-left border-collapse">
          <thead>
            <tr>
              <th className="w-32 text-center">ผู้ประสานงานผู้รับจ้าง</th>
              <th className=" text-center">ผู้ประสานงานตรวจสอบ</th>
              <th className=" text-center">เบอร์โทรติดต่อ</th>
              <th className=" text-center">หน่วยงานตรวจสอบ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-center">{request?.vendorName || 'Independent Audit'}</td>
              <td className="text-center">{request?.coordinatorName || 'Not Appointed'}</td>
              <td className="text-center">{request?.coordinatorPhone || '-'}</td>
              <td className="text-center">PEA Regional PQ Technical Audit Team</td>
            </tr>
          </tbody>
        </table>
      </div>      
      <br />
      {/* 4. TECHNICAL DATA TABLE - Structured & Formal */}
      <section className="mb-16">
        <h3 className="report-section-title">
          <FileText size={14} className="text-[#74045F]" />
          ข้อมูลจากการสังเกตภาคสนามและการวัดทางเทคนิค
        </h3>
        <div className="overflow-hidden rounded-xl border border-slate-100 shadow-sm">
          <table className="w-full technical-table text-left border-collapse">
            <thead>
              <tr>
                <th className="w-16 text-center">ลำดับที่</th>
                <th className="text-center">รายการการตรวจสอบ</th>
                <th className="w-1/3 text-center">ค่าผลลัพธ์ของอุปกรณ์</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(inspection.formData || {}).length > 0 ? (
                Object.entries(inspection.formData || {}).map(([key, value]: [string, any], index) => (
                  <tr key={key} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                    <td className="text-center font-mono text-slate-400 tracking-tighter">
                      {String(index + 1).padStart(2, '0')}
                    </td>
                    <td className="text-center text-slate-700">
                      {getFieldLabel(key)}
                    </td>
                    <td className="font-mono text-center text-xs text-slate-600 bg-slate-50/50">
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
      </section>

      {/* 5. EXECUTIVE SUMMARY */}
      <section className="mb-20 print:break-before-page print-page-break">
        <h3 className="report-section-title">
          <Award size={14} className="text-[#74045F]" />
          สรุปการประเมินและข้อสังเกตของผู้บริหาร
        </h3>
        <div className="p-8 bg-slate-50 rounded-[1rem] border border-slate-100 relative overflow-hidden">
          <div className="space-y-4 relative z-10">
            <p className="text-[10px] font-black text-[#74045F] uppercase tracking-widest flex items-center gap-2">
              <Info size={12}  />
              Supervisory Review
            </p>
            <p className="text-[10px] text-slate-600 leading-relaxed border-l-4 border-[#74045F] pl-6 py-2">
              {inspection.approvalNote || "ค่าพารามิเตอร์ทางเทคนิคของโรงงานที่ได้รับการประเมินสอดคล้องกับมาตรฐานคุณภาพไฟฟ้า (PQ) อย่างเป็นทางการของ PEA ไม่มีการดำเนินการแก้ไขทันทีหรือความผิดปกติที่สำคัญใด ๆ ที่ได้รับการบันทึกไว้ในระหว่างรอบการตรวจสอบภาคสนามนี้"}
            </p>
          </div>
        </div>
      </section>
  
      {/* 6. AUTHORIZATION - Formal Signatures */}
      {/* Container หลักแบบ Tableless (จัดวางซ้าย-ขวา ขนานกัน) */}
      <div className="flex flex-row justify-between items-end w-full gap-8 mt-12 pt-6 border-t border-slate-100 break-inside-avoid">       
        {/* บล็อกที่ 1: ฝั่งผู้ตรวจสอบ (Inspector) */}
        <div className="flex flex-col items-center justify-center flex-1">
          <p className="text-[10px] font-medium text-slate-600 mt-1 mb-4">รับรองผลการตรวจว่าเป็นความจริง</p>
          {/* กล่องรูปภาพลายเซ็นต์ (ความสูง 2 บรรทัดของ 16pt ตามที่ปรับไว้) */}
          <div className="h-12 w-44 flex items-center justify-center mb-1 overflow-hidden">
            {inspection.inspectorSignature ? (
              <img 
                src={inspection.inspectorSignature} 
                className="max-h-full max-w-full object-contain mix-blend-multiply" 
                alt="Inspector Signature" 
              />
            ) : (
              <div className="w-24 h-[1px] bg-slate-200"></div>
            )}
          </div>          
          {/* เส้นและชื่อตำแหน่ง */}
          <p className="text-slate-400 text-sm">................................................</p>
          <p className="text-[10px] font-medium text-slate-600 mt-1">( {inspection.inspectorName} )</p>
          <p className="text-[10px] font-medium text-slate-600 mt-1">ผู้รายงานผลการตรวจสอบ</p>
          <p className="text-[10px] text-slate-400 mt-0.5">วันที่ลงนาม: {new Date(inspection.submittedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>

        {/* บล็อกที่ 2: ฝั่งผู้จัดการ (Manager) */}
        <div className="flex flex-col items-center justify-center flex-1">
          <p className="text-[10px] font-medium text-slate-600 mt-1 mb-4">อนุมัติรายงานผลการตรวจสอบ</p>
          {/* กล่องรูปภาพลายเซ็นต์ */}
          <div className="h-12 w-44 flex items-center justify-center mb-1 overflow-hidden">
            {inspection.managerSignature ? (
              <img 
                src={inspection.managerSignature} 
                className="max-h-full max-w-full object-contain mix-blend-multiply" 
                alt="Manager Signature" 
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-12 w-44">
                <p className="text-[7px] font-bold text-slate-300 italic uppercase tracking-wider">Awaiting Signature</p>
                <div className="w-16 h-[1px] bg-slate-100 mt-1"></div>
              </div>
            )}
          </div>          
          {/* เส้นและชื่อตำแหน่ง */}
          <p className="text-slate-400 text-sm">................................................</p>
          <p className="text-[10px] font-medium text-slate-600 mt-1">( {inspection.managerName || "Regional Director"} )</p>
          <p className="text-[10px] font-medium text-slate-600 mt-1">ผู้อนุมัติรายงานผลการตรวจสอบ</p>
          <p className="text-[10px] text-slate-400 mt-0.5">วันที่ลงนาม: {inspection.approvedAt ? new Date(inspection.approvedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '____/____/____'}</p>
        </div>
      </div>
      <br/>
      {/* 6. AUTHORIZATION - Formal Signatures */}
      {/* Container หลักแบบ Tableless (จัดวางซ้าย-ขวา ขนานกัน) */}
      <div className="flex flex-row justify-between items-end w-full gap-8 mt-12 pt-6 border-t border-slate-100 break-inside-avoid">       
        {/* บล็อกที่ 1: ฝั่งผู้ตรวจสอบ (Inspector) */}
        <div className="flex flex-col flex-1">
          {inspection.submittedAt && <p className="text-[6px] font-mono text-slate-300 italic opacity-40">Hash: {inspection.id?.substring(0,16).toUpperCase()}</p>}
          {inspection.id && <p className="text-[6px] font-mono text-slate-300 italic opacity-40">Key: PEA-VER-X0{inspection.id?.substring(0,8).toUpperCase()}</p>}
          <h3 className="text-[6px] text-slate-300 opacity-0.03 flex items-center gap-1">
            <Shield size={20} />&nbsp;&nbsp;Digitally Secured by PEA-IAIS
          </h3>
        </div>

        {/* บล็อกที่ 2: ฝั่งผู้จัดการ (Manager) */}
        <div className="flex flex-col items-center justify-center flex-1">
          {inspection.id && (
            <div className="flex flex-col items-center gap-2">
              <div className="p-2 border border-slate-100 rounded-lg bg-white shadow-sm">
                <QRCodeSVG 
                  value={`${window.location.origin}?verify=${inspection.id}`} 
                  size={120}
                  level="H"
                  includeMargin={false}
                />
              </div>
              <p className="text-[5px] font-black">Scan to Verify Report</p>
            </div>
          )}
        </div>
      </div>
      <br/>

      {/* FOOTER METADATA */}
      <div className="mt-2 pt-4 border-t border-[#C7911B] flex justify-between items-center text-[8px] font-bold text-slate-300 uppercase tracking-[0.4em]">
         <p>PEA Infrastructure Audit Intelligence System</p>
         <p className="text-[#74045F]/20">Generated: {new Date().toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
         <p>&copy; {new Date().getFullYear()} PEA Division</p>
      </div>
    </div>
  );
};
