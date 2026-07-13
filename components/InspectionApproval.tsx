
import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, XCircle, Clock, Eye, Send, ArrowLeft, 
  RefreshCw, MessageSquare, ShieldCheck, UserCheck, 
  MapPin, Zap, FileText, ChevronRight, AlertCircle, X, Download, History, Users, Printer,
  Building2, User, Briefcase
} from 'lucide-react';
import { InspectionReport } from './InspectionReport';
import ReactDOM from 'react-dom/client';
import { motion, AnimatePresence } from 'motion/react';
import { InspectionResult } from '../types';
import { safeParseLocalStorage, safeSetLocalStorage } from '../utils/localStorageUtils';
import { useNotifications } from '../contexts/NotificationContext';
import { SignatureModal } from './SignatureModal';
import { db } from '../src/lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';

interface InspectionApprovalProps {
  userProfile: any;
  onBack?: () => void;
}

export const InspectionApproval: React.FC<InspectionApprovalProps> = ({ userProfile, onBack }) => {
  const { addNotification } = useNotifications();
  const [view, setView] = useState<'LIST' | 'DETAIL'>('LIST');
  const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY'>('PENDING');
  
  const refreshData = () => {
    console.log("Real-time stream is active. Data is automatically synchronized.");
  };
  const [inspections, setInspections] = useState<InspectionResult[]>([]);
  const [historyInspections, setHistoryInspections] = useState<InspectionResult[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [selectedInspection, setSelectedInspection] = useState<InspectionResult | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{ name: string, url: string, blobUrl?: string } | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [associatedRequest, setAssociatedRequest] = useState<any>(null);
  const [selectedPlant, setSelectedPlant] = useState<any>(null);

  useEffect(() => {
    if (selectedInspection) {
      if (selectedInspection.requestId) {
        const allRequests = safeParseLocalStorage<any[]>('app_inspection_requests', []);
        const req = allRequests.find(r => r.id === selectedInspection.requestId);
        setAssociatedRequest(req || null);
      } else {
        setAssociatedRequest(null);
      }

      // Fetch plant details
      const allPlants = safeParseLocalStorage<any[]>('app_power_plants', []);
      const plant = allPlants.find(p => p.id === selectedInspection.plantId);
      setSelectedPlant(plant || { name: selectedInspection.plantName, id: selectedInspection.plantId });
    } else {
      setAssociatedRequest(null);
      setSelectedPlant(null);
    }
  }, [selectedInspection]);

  const handleOpenDocument = (doc: { name: string, url: string }) => {
    if (doc.url.startsWith('data:application/pdf')) {
      try {
        const parts = doc.url.split(',');
        const mimeType = 'application/pdf';
        const byteCharacters = atob(parts[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        setPreviewDocument({ ...doc, url: blobUrl, blobUrl });
      } catch (e) {
        console.error('PDF processing error:', e);
        setPreviewDocument(doc);
      }
    } else if (doc.url.startsWith('data:image/')) {
        setPreviewDocument(doc);
    } else if (doc.url.startsWith('data:')) {
      try {
        const parts = doc.url.split(',');
        const mimeType = parts[0].split(':')[1].split(';')[0];
        const byteCharacters = atob(parts[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        
        setPreviewDocument({ ...doc, url: blobUrl, blobUrl });
      } catch (e) {
        console.error('Document processing error:', e);
        setPreviewDocument(doc);
      }
    } else {
      setPreviewDocument(doc);
    }
  };
  
  const [approvalNote, setApprovalNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!userProfile) return;

    const userRole = userProfile?.role;
    const userOffice = userProfile?.peaOffice;
    const userDept = userProfile?.department;

    const qInspections = query(collection(db, 'inspections'));
    const qForms = query(collection(db, 'inspectionForms'));

    const unsubForms = onSnapshot(qForms, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
        list.push({ ...doc.data(), id: doc.id });
      });
      setForms(list);
    });

    const unsubInspections = onSnapshot(qInspections, (snapshot) => {
      const list: InspectionResult[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
        } as InspectionResult);
      });

      // Pending
      const pending = list.filter((ins: any) => {
        const isPending = ins.status === 'SUBMITTED';
        if (!isPending) return false;
        if (userRole === 'ADMIN') return true;
        if (userRole === 'MANAGER') {
          const matchesOffice = !userOffice || ins.office === userOffice;
          const matchesDept = !userDept || ins.department === userDept;
          return matchesOffice && matchesDept;
        }
        return false; 
      });

      // History
      const history = list.filter((ins: any) => {
        const isProcessed = ins.status === 'APPROVED' || ins.status === 'REJECTED';
        if (!isProcessed) return false;
        if (userRole === 'ADMIN') return true;
        if (userRole === 'MANAGER') {
          const matchesOffice = !userOffice || ins.office === userOffice;
          const matchesDept = !userDept || ins.department === userDept;
          return matchesOffice && matchesDept;
        }
        return false; 
      });

      setInspections(pending);
      setHistoryInspections(history);
    }, (error) => {
      console.error("Firestore Inspections Sync Error in Approval:", error);
    });

    return () => {
      unsubForms();
      unsubInspections();
    };
  }, [userProfile]);

  const handlePrintReport = () => {
    if (!selectedInspection || !selectedPlant) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Create a container for the report
    const printContainer = printWindow.document.createElement('div');
    printWindow.document.body.appendChild(printContainer);

    // Copy styles from head
    const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
    styles.forEach(style => {
      printWindow.document.head.appendChild(style.cloneNode(true));
    });

    // Set title
    printWindow.document.title = `PQ_Report_${selectedInspection.id}`;

    // Render the report
    const root = ReactDOM.createRoot(printContainer);
    const form = forms.find(f => f.id === selectedInspection.formId);
    
    root.render(
      <InspectionReport 
        inspection={selectedInspection} 
        plant={selectedPlant} 
        request={associatedRequest}
        form={form}
      />
    );

    // Trigger print after rendering
    setTimeout(() => {
      printWindow.print();
    }, 1000);
  };

  const handleApprove = (action: 'APPROVED' | 'REJECTED', signature?: string) => {
    if (!selectedInspection) return;

    if (action === 'APPROVED' && !signature) {
      setShowSignatureModal(true);
      return;
    }

    setIsSubmitting(true);
    console.log(`[Flow] Manager action: ${action} for ${selectedInspection.id}`);

    const updatedInspection: InspectionResult = {
      ...selectedInspection,
      status: action,
      managerId: userProfile?.employeeId || userProfile?.username,
      managerName: userProfile?.name,
      approvalNote,
      managerSignature: signature || selectedInspection.managerSignature, // Use provided or existing
      approvedAt: new Date().toISOString()
    };

    setTimeout(() => {
      const allInspections = safeParseLocalStorage<InspectionResult[]>('app_inspections', []);
      const updatedAll = allInspections.map((ins: InspectionResult) => 
        ins.id === selectedInspection.id ? updatedInspection : ins
      );
      
      // Sort and slice
      updatedAll.sort((a, b) => {
        const dateA = new Date(a.approvedAt || a.submittedAt || a.createdAt).getTime();
        const dateB = new Date(b.approvedAt || b.submittedAt || b.createdAt).getTime();
        return dateB - dateA;
      });

      // Keep recent inspections
      safeSetLocalStorage('app_inspections', updatedAll.slice(0, 60));
      
      // Update associated request status if exists
      if (selectedInspection.requestId) {
        const allRequests = safeParseLocalStorage<any[]>('app_inspection_requests', []);
        const updatedRequests = allRequests.map(r => 
          r.id === selectedInspection.requestId 
            ? { ...r, status: action === 'APPROVED' ? 'COMPLETED' : 'ACCEPTED' } 
            : r
        );
        safeSetLocalStorage('app_inspection_requests', updatedRequests);
      }
      
      setInspections(prev => prev.filter(ins => ins.id !== selectedInspection.id));
      setIsSubmitting(false);
      setView('LIST');
      setSelectedInspection(null);
      setApprovalNote('');
    }, 1500);
  };

  const ListView = () => {
    const displayList = activeTab === 'PENDING' ? inspections : historyInspections;

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex bg-slate-100 dark:bg-white/5 p-1.5 rounded-[2rem] w-full max-w-md mx-auto mb-10 shadow-inner">
           <button 
              onClick={() => setActiveTab('PENDING')}
              className={`flex-1 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${activeTab === 'PENDING' ? 'bg-white dark:bg-white/10 shadow-xl text-[#74045F] dark:text-[#C7911B]' : 'text-slate-400 hover:text-slate-600'}`}
           >
              <Clock size={16} /> รออนุมัติ ({inspections.length})
           </button>
           <button 
              onClick={() => setActiveTab('HISTORY')}
              className={`flex-1 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${activeTab === 'HISTORY' ? 'bg-white dark:bg-white/10 shadow-xl text-[#74045F] dark:text-[#C7911B]' : 'text-slate-400 hover:text-slate-600'}`}
           >
              <History size={16} /> ประวัติ ({historyInspections.length})
           </button>
        </div>

        {displayList.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
             {displayList.map(ins => (
                <div key={ins.id} className="glass-panel p-6 rounded-[2.5rem] border border-slate-100 dark:border-white/5 flex flex-col justify-between hover:translate-y-[-4px] transition-all group shadow-xl shadow-slate-200/20 dark:shadow-none bg-white dark:bg-[#030712]">
                   <div>
                      <div className="flex justify-between items-start mb-4">
                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{ins.id}</span>
                         <div className={`px-3 py-1 ${
                           ins.status === 'SUBMITTED' ? 'bg-amber-500/10 text-amber-500' : 
                           ins.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                         } text-[8px] font-black rounded-full uppercase tracking-widest flex items-center gap-1.5`}>
                            {ins.status === 'SUBMITTED' ? <Clock size={10} /> : ins.status === 'APPROVED' ? <CheckCircle2 size={10} /> : <XCircle size={10} />} 
                            {ins.status}
                         </div>
                      </div>
                      <h3 className="text-lg font-black text-slate-800 dark:text-white italic leading-tight mb-2 group-hover:text-[#74045F] transition-colors">{ins.plantName}</h3>
                      <div className="flex items-center gap-2 mb-4">
                         <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-[10px] font-black">
                            {ins.inspectorName[0]}
                         </div>
                         <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">By {ins.inspectorName}</span>
                      </div>
                      
                      <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 mb-6">
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1 italic">Submission Details</p>
                         <p className="text-[10px] font-black text-slate-700 dark:text-white italic">
                            {new Date(ins.submittedAt || ins.createdAt).toLocaleString('th-TH')}
                         </p>
                      </div>
                   </div>

                   <button 
                      onClick={() => { setSelectedInspection(ins); setView('DETAIL'); }}
                      className="w-full flex items-center justify-center gap-2 py-4 bg-[#74045F]/5 dark:bg-white/5 text-[#74045F] dark:text-[#C7911B] rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest hover:bg-[#74045F] hover:text-white transition-all transition-duration-300"
                   >
                      ตรวจสอบรายละเอียด <ChevronRight size={14} />
                   </button>
                </div>
             ))}
          </div>
        ) : (
          <div className="glass-panel py-32 rounded-[3.5rem] text-center border-dashed border-2 border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
             <ShieldCheck size={64} className="mx-auto text-slate-200 dark:text-white/10 mb-6" />
             <p className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] italic">
               {activeTab === 'PENDING' ? 'ไม่มีข้อมูลรอการอนุมัติในขณะนี้' : 'ยังไม่มีประวัติการอนุมัติ'}
             </p>
          </div>
        )}
      </div>
    );
  };

  const DetailView = () => {
    if (!selectedInspection) return null;
    return (
       <div className="space-y-8 animate-slide-in-right">
          <button 
             onClick={() => setView('LIST')}
             className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
             <ArrowLeft size={16} /> กลับไปหน้ารวมรายการ
          </button>

          <div className="grid lg:grid-cols-3 gap-8 pb-20">
             <div className="lg:col-span-2 space-y-8">
                <div className="glass-panel p-10 rounded-[3rem] border border-slate-100 dark:border-white/5 bg-white dark:bg-[#030712] shadow-2xl transition-all">
                   <div className="flex justify-between items-start border-b border-slate-100 dark:border-white/10 pb-8 mb-8">
                      <div>
                         <div className="flex items-center gap-3 mb-2">
                            <span className={`px-3 py-1 ${
                               selectedInspection.status === 'SUBMITTED' ? 'bg-amber-500/10 text-amber-500' : 
                               selectedInspection.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                            } text-[8px] font-black rounded-full uppercase tracking-widest`}>
                               {selectedInspection.status === 'SUBMITTED' ? 'Pending Review' : selectedInspection.status}
                            </span>
                            <span className="px-3 py-1 bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/60 text-[8px] font-black rounded-full uppercase tracking-widest italic">{selectedInspection.id}</span>
                         </div>
                         <h2 className="text-3xl font-black text-slate-800 dark:text-white italic">{selectedInspection.plantName}</h2>
                         <div className="flex items-center flex-wrap gap-x-6 gap-y-2 mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            <div className="flex items-center gap-1.5"><Zap size={12} className="text-[#C7911B]" /> Plant ID: {selectedInspection.plantId}</div>
                            <div className="flex items-center gap-1.5"><User size={12} /> Inspector: {selectedInspection.inspectorName}</div>
                            {selectedInspection.office && (
                               <div className="flex items-center gap-1.5"><Building2 size={12} /> {selectedInspection.office}</div>
                            )}
                            {selectedInspection.department && (
                               <div className="flex items-center gap-1.5"><Briefcase size={12} /> {selectedInspection.department}</div>
                            )}
                         </div>
                      </div>
                      <div className="text-right">
                         <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Submit Time</p>
                            <p className="text-xs font-black text-slate-800 dark:text-white">{new Date(selectedInspection.submittedAt || '').toLocaleString('th-TH')}</p>
                         </div>
                      </div>
                   </div>

                   <div className="space-y-12">
                      {/* Form Data Visualization - Simplified for Approval */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         {(() => {
                            const form = forms.find(f => f.id === selectedInspection.formId);
                            return Object.entries(selectedInspection.formData || {}).map(([key, value]: [string, any]) => {
                               // Look for field in direct fields or within sections
                               let field = form?.fields?.find((f: any) => f.id === key);
                               if (!field && form?.sections) {
                                  for (const section of form.sections) {
                                     field = section.fields?.find((f: any) => f.id === key);
                                     if (field) break;
                                  }
                               }
                               const label = field?.label || key;
                               return (
                                  <div key={key} className="space-y-2 group">
                                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 transition-colors group-hover:text-[#74045F] group-hover:dark:text-[#C7911B]">{label}</p>
                                     <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 transition-all">
                                        <p className="text-sm font-black text-slate-700 dark:text-white italic">{value || '-'}</p>
                                     </div>
                                  </div>
                               );
                            });
                         })()}
                      </div>
                   </div>
                </div>

                {associatedRequest && (
                   <div className="glass-panel p-10 rounded-[3rem] border border-slate-100 dark:border-white/5 bg-white dark:bg-[#030712] shadow-xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="flex items-center gap-3">
                         <Users size={24} className="text-[#74045F] dark:text-[#C7911B]" />
                         <h3 className="text-xl font-black text-slate-800 dark:text-white italic uppercase tracking-tighter">Vendor Request & Coordinator Information</h3>
                      </div>

                      <div className="grid md:grid-cols-2 gap-8">
                         <div className="space-y-4">
                            <div className="p-5 rounded-3xl bg-[#74045F]/5 dark:bg-[#C7911B]/10 border border-[#74045F]/10 dark:border-[#C7911B]/20">
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Vendor Company</p>
                               <p className="text-sm font-black text-[#74045F] dark:text-[#C7911B] italic uppercase tracking-tight">{associatedRequest.vendorName}</p>
                               <p className="text-xs font-bold text-slate-500 mt-0.5">ID: {associatedRequest.vendorId}</p>
                            </div>
                            
                            <div className="p-5 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Service Request Details</p>
                               <p className="text-xs font-medium text-slate-600 dark:text-slate-300 italic leading-relaxed">{associatedRequest.details || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
                            </div>
                         </div>

                         <div className="space-y-4">
                            <div className="p-5 rounded-3xl bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-500/10">
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic text-emerald-600">On-site Coordinator</p>
                               <div className="space-y-1">
                                  <p className="text-sm font-black text-slate-800 dark:text-white italic">{associatedRequest.coordinatorName || 'ไม่ระบุชื่อ'}</p>
                                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                                     <Zap size={12} />
                                     {associatedRequest.coordinatorPhone || 'ไม่ระบุเบอร์โทรศัพท์'}
                                  </div>
                               </div>
                            </div>

                            <div className="p-5 rounded-3xl bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-500/10">
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic text-indigo-600">Request Timeline</p>
                               <div className="flex flex-col gap-2">
                                  <div className="flex justify-between text-[10px]">
                                     <span className="text-slate-400 font-bold uppercase tracking-widest">Requested Date:</span>
                                     <span className="text-slate-700 dark:text-white font-black italic">{new Date(associatedRequest.requestedDate).toLocaleDateString('th-TH')}</span>
                                  </div>
                                  <div className="flex justify-between text-[10px]">
                                     <span className="text-slate-400 font-bold uppercase tracking-widest">Notification Sent:</span>
                                     <span className="text-slate-700 dark:text-white font-black italic">{new Date(associatedRequest.createdAt).toLocaleString('th-TH')}</span>
                                  </div>
                                </div>
                             </div>
                          </div>
                       </div>
                    </div>
                 )}

                 <div className="glass-panel p-10 rounded-[3rem] border border-slate-100 dark:border-white/5 bg-white dark:bg-[#030712] shadow-xl">
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-[0.2em] italic mb-8 flex items-center gap-4">
                       <Eye size={20} className="text-[#C7911B]" /> Visual Evidence & Documents
                    </h3>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                       {selectedInspection.photos.map((src, idx) => (
                          <div 
                            key={`photo-${idx}`} 
                            onClick={() => {
                               setPreviewImage(src);
                            }}
                            className="aspect-square rounded-[2rem] overflow-hidden border-2 border-slate-100 dark:border-white/5 shadow-md hover:scale-[1.05] hover:shadow-2xl transition-all cursor-zoom-in group"
                          >
                             <img src={src} alt="Evidence" className="w-full h-full object-cover group-hover:brightness-110 transition-all" />
                          </div>
                       ))}
                       {selectedInspection.photos.length === 0 && (
                          <div className="col-span-full py-16 bg-slate-50 dark:bg-white/5 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-white/5 text-center flex flex-col items-center justify-center gap-4">
                             <Zap size={32} className="text-slate-300 opacity-50" />
                             <p className="text-[10px] font-black text-slate-400 uppercase italic tracking-widest">ไม่พบภาพถ่ายประกอบหลักฐาน</p>
                          </div>
                       )}
                    </div>

                    {selectedInspection.documents.length > 0 && (
                       <div className="mt-12 space-y-4">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 italic">Attached Documents ({selectedInspection.documents.length})</h4>
                          <div className="grid sm:grid-cols-2 gap-4">
                             {selectedInspection.documents.map((doc, idx) => (
                                <div 
                                  key={`doc-${idx}`} 
                                  onClick={() => handleOpenDocument(doc)}
                                  className="flex items-center justify-between p-5 bg-slate-50 dark:bg-white/5 rounded-[1.5rem] border border-slate-100 dark:border-white/5 group hover:bg-white dark:hover:bg-white/10 hover:border-[#74045F] transition-all cursor-pointer shadow-sm hover:shadow-md"
                                >
                                   <div className="flex items-center gap-4">
                                      <div className="w-10 h-10 bg-[#74045F]/10 text-[#74045F] dark:bg-[#C7911B]/10 dark:text-[#C7911B] rounded-2xl flex items-center justify-center">
                                         <FileText size={20} />
                                      </div>
                                      <div className="flex flex-col">
                                         <span className="text-xs font-black text-slate-800 dark:text-white truncate max-w-[150px]">{doc.name}</span>
                                         <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Verified Document</span>
                                      </div>
                                   </div>
                                   <div className="w-8 h-8 rounded-full border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-300 group-hover:text-[#74045F] group-hover:border-[#74045F] transition-all">
                                      <Eye size={14} />
                                   </div>
                                </div>
                             ))}
                          </div>
                       </div>
                    )}
                 </div>
             </div>

             <div className="space-y-8">
                <div className="glass-panel p-8 rounded-[3rem] border border-slate-100 dark:border-white/5 bg-white dark:bg-[#030712] shadow-2xl sticky top-24">
                   <div className="flex items-center gap-3 mb-8">
                      <UserCheck className="text-emerald-500" size={24} />
                      <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider italic">Manager Authorization</h3>
                   </div>

                    {/* Inspector Signature Display for Manager */}
                    <div className="mb-8 p-4 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/5">
                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 italic ml-1">ลงนามโดยผู้ตรวจสอบ (Inspector)</h4>
                       <div className="w-full h-24 bg-white dark:bg-slate-900 rounded-2xl flex items-center justify-center p-3">
                          {selectedInspection.inspectorSignature ? (
                             <img src={selectedInspection.inspectorSignature} className="max-w-full max-h-full object-contain" />
                          ) : (
                             <p className="text-[10px] text-slate-300 font-bold italic">ไม่พบข้อมูลลายมือชื่อ</p>
                          )}
                       </div>
                       <p className="mt-2 text-center text-[10px] font-black text-slate-500 italic">({selectedInspection.inspectorName})</p>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic">ข้อสังเกตเพิ่มเติม (Comment Log)</label>
                         {selectedInspection.status === 'SUBMITTED' ? (
                           <textarea 
                              value={approvalNote}
                              onChange={(e) => setApprovalNote(e.target.value)}
                              placeholder="ระบุข้อเสนอแนะหรือเหตุผลการอนุมัติ..."
                              rows={5}
                              className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-white/5 rounded-[2rem] p-6 text-sm font-bold text-slate-800 dark:text-white focus:border-emerald-500 outline-none transition-all resize-none shadow-inner"
                           />
                         ) : (
                           <div className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-white/5 rounded-[2rem] p-6 min-h-[100px]">
                              <p className="text-sm font-black text-slate-700 dark:text-white italic">{selectedInspection.approvalNote || 'ไม่มีบันทึกเพิ่มเติม'}</p>
                           </div>
                         )}
                      </div>

                      {selectedInspection.status === 'SUBMITTED' ? (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                             <button 
                                onClick={() => handleApprove('REJECTED')}
                                disabled={isSubmitting}
                                className="py-5 rounded-3xl bg-rose-50 dark:bg-rose-500/5 text-rose-500 border-2 border-rose-500/20 font-black text-[10px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2 group shadow-xl shadow-rose-500/10"
                             >
                                <XCircle size={18} className="group-hover:scale-110 transition-transform" /> ไม่ผ่านการตรวจ
                             </button>
                             <button 
                                onClick={() => handleApprove('APPROVED')}
                                disabled={isSubmitting}
                                className="py-5 rounded-3xl bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:shadow-emerald-500/40 active:scale-95 transition-all flex items-center justify-center gap-2 group"
                             >
                                <CheckCircle2 size={18} className="group-hover:scale-110 transition-transform" /> อนุมัติรับรองผล
                             </button>
                          </div>

                          {isSubmitting && (
                             <div className="flex items-center justify-center gap-3 text-[10px] font-black text-[#74045F] uppercase tracking-widest mt-4">
                                <RefreshCw size={14} className="animate-spin" /> Processing authorization...
                             </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="p-6 bg-slate-50/50 dark:bg-white/5 rounded-[2.5rem] border border-slate-100 dark:border-white/5 text-center shadow-inner">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 italic">ลงนามโดยผู้อนุมัติ (Authorized By)</p>
                             <div className="w-full h-28 bg-white dark:bg-slate-900/50 rounded-[2rem] flex items-center justify-center p-4 mb-4 border border-slate-100 dark:border-white/5">
                                {selectedInspection.managerSignature ? (
                                   <img src={selectedInspection.managerSignature} className="max-w-full max-h-full object-contain" alt="Manager Signature" />
                                ) : (
                                   <p className="text-[10px] text-slate-300 font-bold italic">ไม่พบข้อมูลลายมือชื่อผู้อนุมัติ</p>
                                )}
                             </div>
                             <div className="space-y-1">
                                <p className="text-xs font-black text-[#74045F] dark:text-[#C7911B] italic">({selectedInspection.managerName || '-'})</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em]">
                                   {selectedInspection.status === 'APPROVED' ? 'Approved At' : 'Rejected At'}: {selectedInspection.approvedAt ? new Date(selectedInspection.approvedAt).toLocaleString('th-TH') : '-'}
                                </p>
                             </div>
                          </div>
  
                          <div className="pt-4">
                             <button 
                                onClick={handlePrintReport}
                                className="w-full py-4 rounded-3xl bg-[#74045F] text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-[#74045F]/20 hover:shadow-[#74045F]/40 active:scale-95 transition-all flex items-center justify-center gap-3 group"
                             >
                                <Printer size={18} className="group-hover:rotate-12 transition-transform" /> 
                                Print Inspection Report
                             </button>
                          </div>
                        </>
                      )}
                    </div>

                   <div className="mt-10 p-5 bg-indigo-500/5 rounded-3xl border border-indigo-500/10">
                      <div className="flex gap-3">
                         <AlertCircle size={16} className="text-indigo-500 mt-1 shrink-0" />
                         <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 italic leading-relaxed">
                            หลังจากกดอนุมัติ ระบบจะทำการบันทึกข้อมูลเข้าสู่ฐานข้อมูลทะเบียนโรงไฟฟ้า (Plant Registry) และแจ้งเตือนไปยัง Inspector ผู้รับผิดชอบทันที
                         </p>
                      </div>
                   </div>
                </div>
             </div>
          </div>
       </div>
    );
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in font-sans">
       <div className="flex justify-between items-center bg-white dark:bg-[#030712] p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-xl shadow-slate-200/20 dark:shadow-none">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white italic flex items-center gap-3">
              <CheckCircle2 className="text-emerald-500" size={32} />
              อนุมัติผลการตรวจ (Manager Only)
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 italic">Quality Assurance & Authorization Panel</p>
          </div>
          <button 
            onClick={refreshData}
            className="p-3 bg-slate-50 dark:bg-white/5 rounded-2xl text-slate-400 hover:text-indigo-500 transition-all hover:bg-white shadow-sm"
            title="โหลดข้อมูลใหม่"
          >
            <RefreshCw size={20} />
          </button>
        </div>
        <div className="flex gap-4">
           <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Decision Board Status</span>
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                 <span className="text-xs font-black text-indigo-500 italic">Chief Approval Officer</span>
              </div>
           </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
         {view === 'LIST' ? <ListView key="list" /> : <DetailView key="detail" />}
      </AnimatePresence>

      <AnimatePresence>
        {previewImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 sm:p-10"
          >
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute top-6 right-6 p-4 bg-white/10 hover:bg-white/20 rounded-2xl text-white backdrop-blur-md transition-all border border-white/10"
              onClick={() => setPreviewImage(null)}
            >
              <X size={24} />
            </motion.button>
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="max-w-full max-h-full rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={previewImage} 
                alt="Full Preview" 
                className="max-w-full max-h-[85vh] object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewDocument && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[90vh] rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-white/10">
              <div className="p-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-[#74045F]/10 text-[#74045F] dark:bg-[#C7911B]/10 dark:text-[#C7911B] rounded-2xl flex items-center justify-center">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-white truncate max-w-[200px] sm:max-w-md italic">{previewDocument.name}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Document Viewer</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = previewDocument.blobUrl || previewDocument.url;
                      link.download = previewDocument.name;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="p-3 bg-white dark:bg-white/10 text-slate-600 dark:text-white rounded-xl hover:bg-slate-100 transition-all border border-slate-200 dark:border-white/10 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                  >
                    <Download size={14} /> Download
                  </button>
                  <button 
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = previewDocument.blobUrl || previewDocument.url;
                      link.download = previewDocument.name;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="p-3 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-all shadow-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                  >
                    <Download size={14} /> Download File
                  </button>
                  <button 
                    onClick={() => {
                      if (previewDocument.blobUrl) URL.revokeObjectURL(previewDocument.blobUrl);
                      setPreviewDocument(null);
                    }}
                    className="p-3 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-all shadow-lg active:scale-95"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-slate-100 dark:bg-slate-950 relative flex items-center justify-center overflow-auto">
                {previewDocument.url.includes('image/') || previewDocument.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                   <img 
                    src={previewDocument.blobUrl || previewDocument.url} 
                    alt="Document Content"
                    className="max-w-full max-h-full object-contain"
                   />
                ) : (
                  <iframe 
                    src={previewDocument.blobUrl || previewDocument.url} 
                    title="PDF Viewer"
                    className="w-full h-full border-none"
                  />
                )}
                <div className="absolute top-2 right-2 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                   <p className="bg-black/50 text-white px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest">Document Viewer</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SignatureModal 
        isOpen={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onSave={(signature) => handleApprove('APPROVED', signature)}
        title="ลงนามผู้อนุมัติ (Manager Signature)"
        savedSignature={userProfile?.signature}
      />
    </div>
  );
};
