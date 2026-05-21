
import React, { useState, useEffect } from 'react';
import { Send, Calendar, Zap, ClipboardList, Clock, ArrowLeft, RefreshCw, CheckCircle2, Trash2, XCircle } from 'lucide-react';
import { safeParseLocalStorage, safeSetLocalStorage } from '../utils/localStorageUtils';
import { motion, AnimatePresence } from 'motion/react';
import { InspectionRequest } from '../types';
import { db } from '../src/lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

interface InspectionRequestFormProps {
  userProfile: any;
  onBack?: () => void;
}

export const InspectionRequestForm: React.FC<InspectionRequestFormProps> = ({ userProfile, onBack }) => {
  const [plants, setPlants] = useState<any[]>([]);
  const [selectedPlant, setSelectedPlant] = useState<string>('');
  const [details, setDetails] = useState('');
  const [coordinatorName, setCoordinatorName] = useState('');
  const [coordinatorPhone, setCoordinatorPhone] = useState('');
  const [requestedDate, setRequestedDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'FORM' | 'HISTORY'>('FORM');
  const [requests, setRequests] = useState<InspectionRequest[]>([]);

  useEffect(() => {
    if (!userProfile) return;

    // Load plants standard from local storage
    const savedPlants = safeParseLocalStorage<any[]>('power_plants', []);
    const userOffice = userProfile?.peaOffice || userProfile?.department;
    const isVendor = userProfile?.role === 'VENDER';
    const userId = userProfile?.employeeId || userProfile?.username;

    if (isVendor && userOffice) {
      setPlants(savedPlants.filter((p: any) => p.office === userOffice || p.vendorId === userId));
    } else {
      setPlants(savedPlants);
    }

    // Subscribe to Firestore 'inspectionRequests'
    const q = query(collection(db, 'inspectionRequests'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbRequests: InspectionRequest[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        dbRequests.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
        } as InspectionRequest);
      });

      // Sort by date descending
      dbRequests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Filter requests history: Vendors only see their office's requests, or their own requests
      let filteredRequests = dbRequests;
      if (isVendor && userOffice) {
        filteredRequests = dbRequests.filter((r: InspectionRequest) => 
          r.office === userOffice || r.vendorId === userId
        );
      } else {
        filteredRequests = dbRequests.filter((r: InspectionRequest) => r.vendorId === userId);
      }

      setRequests(filteredRequests);
      // Synchronize back to local storage so other components can fetch it locally if needed
      safeSetLocalStorage('app_inspection_requests', dbRequests);
    }, (error) => {
      console.error("Firestore inspectionRequests Sync Error:", error);
    });

    return () => unsubscribe();
  }, [userProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlant || !requestedDate || !userProfile) return;

    setIsSubmitting(true);
    
    const plant = plants.find(p => p.id === selectedPlant);
    
    const newRequest: InspectionRequest = {
      id: `REQ-${Date.now()}`,
      vendorId: userProfile.employeeId || userProfile.username,
      vendorName: userProfile.name,
      coordinatorName,
      coordinatorPhone,
      office: userProfile.peaOffice || userProfile.department,
      plantId: selectedPlant,
      plantName: plant?.name || 'Unknown Plant',
      details,
      requestedDate,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    try {
      // Save directly to Firestore inspectionRequests
      const reqRef = doc(db, 'inspectionRequests', newRequest.id);
      await setDoc(reqRef, newRequest);

      // Successfully saved!
      setDetails('');
      setCoordinatorName('');
      setCoordinatorPhone('');
      setRequestedDate('');
      setSelectedPlant('');
      setActiveTab('HISTORY');
    } catch (err) {
      console.error("Failed to save inspection request to Firestore:", err);
      // Fallback
      const allRequests = safeParseLocalStorage<InspectionRequest[]>('app_inspection_requests', []);
      const updatedRequests = [newRequest, ...allRequests];
      safeSetLocalStorage('app_inspection_requests', updatedRequests);
      setRequests(prev => [newRequest, ...prev]);
      setActiveTab('HISTORY');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteRequest = async (requestId: string) => {
    try {
      await deleteDoc(doc(db, 'inspectionRequests', requestId));
      setDeletingId(null);
    } catch (err) {
      console.error("Failed to delete inspection request from Firestore:", err);
      // Fallback local deletion
      const allRequests = safeParseLocalStorage<InspectionRequest[]>('app_inspection_requests', []);
      const updatedRequests = allRequests.filter((r: InspectionRequest) => r.id !== requestId);
      safeSetLocalStorage('app_inspection_requests', updatedRequests);
      setRequests(prev => prev.filter(r => r.id !== requestId));
      setDeletingId(null);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-500';
      case 'ACCEPTED': return 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-500';
      case 'AWAITING_APPROVAL': return 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-500 animate-pulse';
      case 'COMPLETED': return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-500';
      case 'REJECTED': return 'bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-500';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING': return 'รอกำหนด Inspector';
      case 'ACCEPTED': return 'รับเรื่องแล้ว / กำลังเข้าตรวจ';
      case 'AWAITING_APPROVAL': return 'ส่งผลตรวจแล้ว / รออนุมัติ';
      case 'COMPLETED': return 'ตรวจสอบเสร็จสิ้น';
      case 'REJECTED': return 'คำร้องถูกปฏิเสธ';
      default: return status;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex justify-between items-center bg-white dark:bg-[#030712] p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-xl shadow-slate-200/20 dark:shadow-none">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white italic flex items-center gap-3">
            <ClipboardList className="text-[#74045F] dark:text-[#C7911B]" size={32} />
            แจ้งคำร้องขอตรวจสอบ
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 italic">Vender Inspection Service Request</p>
        </div>
        <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab('FORM')}
              className={`px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'FORM' ? 'bg-[#74045F] dark:bg-[#C7911B] text-white shadow-lg' : 'bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-slate-600'}`}
            >
              แจ้งเรื่องใหม่
            </button>
            <button 
              onClick={() => setActiveTab('HISTORY')}
              className={`px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'HISTORY' ? 'bg-[#74045F] dark:bg-[#C7911B] text-white shadow-lg' : 'bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-slate-600'}`}
            >
              ประวัติคำร้อง ({requests.length})
            </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'FORM' ? (
          <motion.div 
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-panel p-10 rounded-[3rem] border-t border-gray-100 dark:border-white/10"
          >
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">ข้อมูลผู้แจ้ง (Auto-filled)</label>
                  <div className="bg-slate-50 dark:bg-white/5 p-5 rounded-3xl border border-slate-100 dark:border-white/5">
                    <p className="text-sm font-black text-slate-700 dark:text-white italic">{userProfile?.name}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">{userProfile?.peaOffice}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">เลือกโรงไฟฟ้าที่ต้องการตรวจสอบ</label>
                  <select 
                    value={selectedPlant}
                    onChange={(e) => setSelectedPlant(e.target.value)}
                    required
                    className="w-full bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-white/5 rounded-3xl p-5 text-sm font-bold text-slate-800 dark:text-white focus:border-[#74045F] dark:focus:border-[#C7911B] outline-none transition-all shadow-inner"
                  >
                    <option value="">เลือกโรงไฟฟ้า...</option>
                    {plants.map(p => (
                      <option key={p.id} value={p.id}>{p.id} - {p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">วันนัดหมายเข้าตรวจสอบ</label>
                  <div className="relative">
                    <Calendar className="absolute left-5 top-1/2 -translate-y-1/2 text-[#74045F] dark:text-[#C7911B]" size={20} />
                    <input 
                      type="date"
                      value={requestedDate}
                      onChange={(e) => setRequestedDate(e.target.value)}
                      required
                      className="w-full bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-white/5 rounded-3xl p-5 pl-14 text-sm font-bold text-slate-800 dark:text-white focus:border-[#74045F] dark:focus:border-[#C7911B] outline-none transition-all shadow-inner"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">ความเร่งด่วน</label>
                  <div className="flex gap-4">
                    {['NORMAL', 'URGENT'].map((p: any) => (
                      <button 
                         key={p}
                         type="button"
                         className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${details.includes(`[PRIORITY:${p}]`) ? 'bg-[#74045F] border-[#74045F] text-white' : 'border-slate-100 dark:border-white/5 text-slate-400'}`}
                         onClick={() => setDetails(prev => `${prev}\n[PRIORITY:${p}]`)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                 <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">ชื่อผู้ประสานงาน (Coordinator Name)</label>
                    <input 
                      type="text"
                      value={coordinatorName}
                      onChange={(e) => setCoordinatorName(e.target.value)}
                      placeholder="ระบุชื่อผู้ประสานงานหน้างาน..."
                      className="w-full bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-white/5 rounded-3xl p-5 text-sm font-bold text-slate-800 dark:text-white focus:border-[#74045F] dark:focus:border-[#C7911B] outline-none transition-all shadow-inner"
                    />
                 </div>
                 <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">เบอร์โทรศัพท์ผู้ประสานงาน (Phone)</label>
                    <input 
                      type="tel"
                      value={coordinatorPhone}
                      onChange={(e) => setCoordinatorPhone(e.target.value)}
                      placeholder="เช่น 08x-xxx-xxxx"
                      className="w-full bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-white/5 rounded-3xl p-5 text-sm font-bold text-slate-800 dark:text-white focus:border-[#74045F] dark:focus:border-[#C7911B] outline-none transition-all shadow-inner"
                    />
                 </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">รายละเอียดเพิ่มเติม</label>
                <textarea 
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="เหตุผลการตรวจสอบ หรืออาการเบื้องต้นที่พบ..."
                  rows={4}
                  className="w-full bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-white/5 rounded-[2rem] p-6 text-sm font-bold text-slate-800 dark:text-white focus:border-[#74045F] dark:focus:border-[#C7911B] outline-none transition-all shadow-inner resize-none"
                />
              </div>

              <div className="flex gap-4 pt-6">
                <button 
                  type="button"
                  onClick={onBack}
                  className="flex-1 py-5 rounded-[2rem] text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                >
                  ย้อนกลับ
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-[2] bg-gradient-to-r from-[#74045F] to-[#C7911B] text-white font-black py-5 rounded-[2rem] shadow-xl shadow-[#74045F]/20 active:scale-95 transition-all text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={20} className="animate-spin" />
                      กำลังส่งข้อมูล...
                    </>
                  ) : (
                    <>
                      <Send size={20} />
                      ยืนยันส่งคำร้องขอ
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.div 
            key="history"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            {requests.length > 0 ? (
              requests.map(req => (
                <div key={req.id} className="glass-panel p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:translate-x-1 transition-all">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-[#74045F] group-hover:dark:text-[#C7911B] transition-colors">
                      <Zap size={28} />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{req.id}</span>
                        <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${getStatusStyle(req.status)}`}>
                          {getStatusLabel(req.status)}
                        </div>
                      </div>
                      <h4 className="text-base font-black text-slate-800 dark:text-white italic">{req.plantName}</h4>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter">วันที่นัดหมาย: {new Date(req.requestedDate).toLocaleDateString('th-TH')}</p>
                        {(req.coordinatorName || req.coordinatorPhone) && (
                          <p className="text-[10px] text-[#74045F] dark:text-[#C7911B] font-black uppercase tracking-tighter italic">
                            ประสานงาน: {req.coordinatorName || '-'} {req.coordinatorPhone ? `(${req.coordinatorPhone})` : ''}
                          </p>
                        )}
                      </div>
                      
                      {req.details && (
                        <div className="mt-3 p-3 bg-slate-50/50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1 italic">รายละเอียดคำร้อง:</p>
                          <p className="text-[10px] text-slate-600 dark:text-slate-300 font-medium line-clamp-2 italic">{req.details}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2 text-right">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                        <Clock size={12} />
                        แจ้งเมื่อ {new Date(req.createdAt).toLocaleString('th-TH')}
                      </div>
                      {req.status === 'PENDING' && (
                        <div className="flex items-center gap-1">
                          {deletingId === req.id ? (
                            <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2 duration-300">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteRequest(req.id);
                                }}
                                className="px-3 py-1.5 bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
                              >
                                ยืนยันลบ
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingId(null);
                                }}
                                className="px-3 py-1.5 bg-slate-100 dark:bg-white/5 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-lg active:scale-95 transition-all"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingId(req.id);
                              }}
                              className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all"
                              title="ลบคำร้อง"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {req.status === 'PENDING' && (
                      <p className="text-[10px] text-amber-500 font-bold italic">รอการตอบรับจาก Inspector</p>
                    )}
                    {req.status === 'ACCEPTED' && (
                      <div className="flex items-center gap-2 text-blue-500">
                        <CheckCircle2 size={16} />
                        <p className="text-[10px] font-bold italic">Inspector รับรับเรื่องนัดหมายแล้ว</p>
                      </div>
                    )}
                    {req.status === 'AWAITING_APPROVAL' && (
                      <div className="flex items-center gap-2 text-indigo-500 animate-pulse">
                        <RefreshCw size={14} className="animate-spin" />
                        <p className="text-[10px] font-bold italic">รอหัวหน้าอนุมัติผลการตรวจสอบ</p>
                      </div>
                    )}
                    {req.status === 'COMPLETED' && (
                      <div className="flex items-center gap-2 text-emerald-500">
                        <CheckCircle2 size={16} />
                        <p className="text-[10px] font-bold italic">ดำเนินการอนุมัติเสร็จสิ้นแล้ว</p>
                      </div>
                    )}
                    {req.status === 'REJECTED' && (
                      <div className="flex items-center gap-2 text-rose-500">
                        <XCircle size={16} />
                        <p className="text-[10px] font-bold italic">คำร้องถูกปฏิเสธ / ยกเลิก</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="glass-panel py-32 rounded-[3.5rem] text-center border-dashed border-2 border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                <Clock size={64} className="mx-auto text-slate-200 dark:text-white/10 mb-6" />
                <p className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] italic">ไม่พบประวัติการแจ้งคำร้อง</p>
                <button 
                  onClick={() => setActiveTab('FORM')}
                  className="mt-6 text-xs font-black text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest underline underline-offset-8"
                >
                  เริ่มต้นแจ้งคำร้องใหม่
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
