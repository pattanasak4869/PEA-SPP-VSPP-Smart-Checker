
import React, { useState, useEffect } from 'react';
import { 
  Zap, ClipboardList, Camera, Upload, Send, ArrowLeft, RefreshCw, 
  MapPin, CheckCircle2, AlertTriangle, Search, Filter, History, 
  LayoutList, FileCheck, FileText, ChevronRight, Inbox, Trash2, Edit3, Eye, X, Download,
  Lock, Unlock, Wifi, Navigation
} from 'lucide-react';
import { safeParseLocalStorage, safeSetLocalStorage } from '../utils/localStorageUtils';
import { compressBase64Image } from '../utils/imageUtils';
import { motion, AnimatePresence } from 'motion/react';
import { InspectionRequest, InspectionResult } from '../types';
import { useNotifications } from '../contexts/NotificationContext';
import { useLanguage } from '../contexts/LanguageContext';
import { SignatureModal } from './SignatureModal';
import { db } from '../src/lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

interface EquipmentInspectionProps {
  userProfile: any;
  onBack?: () => void;
}

export const EquipmentInspection: React.FC<EquipmentInspectionProps> = ({ userProfile, onBack }) => {
  const { addNotification } = useNotifications();
  const { t } = useLanguage();
  const [step, setStep] = useState<'SELECTION' | 'INBOX' | 'FORM' | 'REVIEW'>('SELECTION');
  const [activeTab, setActiveTab] = useState<'REQUESTS' | 'DRAFTS'>('REQUESTS');
  const [plants, setPlants] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [inboxRequests, setInboxRequests] = useState<InspectionRequest[]>([]);
  const [drafts, setDrafts] = useState<InspectionResult[]>([]);
  
  // Selection State
  const [selectedPlant, setSelectedPlant] = useState<any>(null);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [activeRequest, setActiveRequest] = useState<InspectionRequest | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

  // Multi-form selection state
  const [showFormPicker, setShowFormPicker] = useState(false);
  const [matchingForms, setMatchingForms] = useState<any[]>([]);
  const [pendingSelection, setPendingSelection] = useState<{ plant: any, request?: any } | null>(null);

  // Form State
  const [formData, setFormData] = useState<any>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [documents, setDocuments] = useState<{ name: string, url: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{ name: string, url: string, blobUrl?: string } | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);

  // Geofencing states
  const [geofenceStatus, setGeofenceStatus] = useState<'PENDING' | 'CHECKING' | 'SUCCESS' | 'OUT_OF_RANGE' | 'ERROR'>('PENDING');
  const [currentCoords, setCurrentCoords] = useState<{ lat: number, lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [geofenceErrorMsg, setGeofenceErrorMsg] = useState<string>('');

  // คำนวณระยะทางแบบ Haversine Formula (หน่วยเมตร)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // รัศมีโลกในหน่วยเมตร
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const verifyGeofence = (plant: any) => {
    if (!plant) return;
    
    // ดึงพิกัดโรงไฟฟ้า
    const plantLat = parseFloat(plant.gps?.lat);
    const plantLng = parseFloat(plant.gps?.lng);

    // หากโรงไฟฟ้ายังไม่ได้ลงทะเบียนพิกัด GPS ไว้ หรือพิกัดเป็น 0
    if (isNaN(plantLat) || isNaN(plantLng) || (plantLat === 0 && plantLng === 0)) {
      setGeofenceStatus('SUCCESS'); // ปลดล็อกฟอร์มให้โดยอัตโนมัติ เพื่อการทำงานที่ไม่สะดุด
      addNotification('INFO', 'ระบบ Geofence', `โรงไฟฟ้า ${plant.name} ยังไม่ได้ตั้งพิกัดเป้าหมาย ปลดล็อกฟอร์มเป็นกรณีพิเศษ`);
      return;
    }

    setGeofenceStatus('CHECKING');
    setGeofenceErrorMsg('');

    if (!navigator.geolocation) {
      setGeofenceStatus('ERROR');
      setGeofenceErrorMsg('เบราว์เซอร์หรืออุปกรณ์ของคุณไม่รองรับการดึงตำแหน่งปัจจุบัน (Geolocation Not Supported)');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        setCurrentCoords({ lat: userLat, lng: userLng });

        const dist = calculateDistance(userLat, userLng, plantLat, plantLng);
        setDistance(dist);

        // ระยะ Geofencing คุมความปลอดภัยที่ 500 เมตร
        const GEOFENCE_LIMIT = 500;
        if (dist <= GEOFENCE_LIMIT) {
          setGeofenceStatus('SUCCESS');
          addNotification('SUCCESS', 'ปลดล็อค Geofencing', `ตำแหน่งที่ตรวจสอบถูกต้อง ระยะห่างโรงไฟฟ้า: ${dist.toFixed(0)} เมตร`);
        } else {
          setGeofenceStatus('OUT_OF_RANGE');
          addNotification('ALERT', 'อยู่นอกพื้นที่ตรวจสอบ', `ไม่สามารถกรอกฟอร์มได้เนื่องจากระยะห่างจริงของคุณคือ ${(dist / 1000).toFixed(2)} กม. (เกณฑ์ควบคุมจำกัดที่ 500 เมตร)`);
        }
      },
      (error) => {
        console.error("Geofence Verification Error:", error);
        setGeofenceStatus('ERROR');
        let errMsg = 'ไม่สามารถตรวจจับตำแหน่งปัจจุบันของคุณได้';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errMsg = 'การแชร์พิกัดของอุปกรณ์ถูกปฏิเสธ กรุณาอนุญาตตำแหน่งแก่เว็บไซต์ในหน้าต่างเบราว์เซอร์';
            break;
          case error.POSITION_UNAVAILABLE:
            errMsg = 'อุปกรณ์ระบุตำแหน่งไม่รับสถานะพิกัด หรือสัญญาณอับขีดความสามารถ';
            break;
          case error.TIMEOUT:
            errMsg = 'ระบบระบุตำแหน่งหมดเวลาตรวจสอบกรุณากดดึงตำแหน่งใหม่อีกครั้ง';
            break;
        }
        setGeofenceErrorMsg(errMsg);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const handleOpenDocument = (doc: { name: string, url: string }) => {
    // If it's already a data URL, we use it directly or convert to blob
    if (doc.url.startsWith('data:')) {
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

  const loadData = () => {
    // Initial Data Load
    const savedPlants = safeParseLocalStorage<any[]>('power_plants', []);
    const savedForms = safeParseLocalStorage<any[]>('app_inspection_forms', []);
    const savedRequests = safeParseLocalStorage<InspectionRequest[]>('app_inspection_requests', []);
    const savedResults = safeParseLocalStorage<InspectionResult[]>('app_inspections', []);
    const userResponsibleProvince = userProfile?.region;
    const userId = userProfile?.employeeId || userProfile?.username;
    
    // Filter plants for inspector's responsible province
    if (userProfile?.role === 'INSPECTOR' && userResponsibleProvince) {
      setPlants(savedPlants.filter((p: any) => 
        // If it's an inspector, match the plant's province with their responsible province (region)
        p.province === userResponsibleProvince
      ));
    } else if (userProfile?.role === 'VENDER') {
      const userOffice = userProfile?.peaOffice || userProfile?.department;
      setPlants(savedPlants.filter((p: any) => p.office === userOffice || (p.vendorId === userId && !p.office)));
    } else {
      setPlants(savedPlants);
    }
    
    setForms(savedForms.filter((f: any) => f.status === 'ACTIVE'));

    // Filter inbox requests for inspector's responsible area
    setInboxRequests(savedRequests.filter((r: InspectionRequest) => {
      const isPending = r.status === 'PENDING';
      
      if (userProfile?.role === 'INSPECTOR' && userResponsibleProvince) {
        // Find the plant to check its province
        const plant = savedPlants.find((p: any) => p.id === r.plantId);
        return isPending && plant?.province === userResponsibleProvince;
      }
      
      const userOffice = userProfile?.peaOffice || userProfile?.department;
      const matchesOffice = !r.office || r.office === userOffice;
      return isPending && matchesOffice;
    }));

    // Filter drafts for current user
    setDrafts(savedResults.filter((r: InspectionResult) => 
      r.status === 'DRAFT' && r.inspectorId === userId
    ));
  };

  useEffect(() => {
    loadData();
    window.addEventListener('storage', loadData);
    return () => {
      window.removeEventListener('storage', loadData);
    };
  }, [userProfile]);

  const handleStartInspection = (plant: any, form: any, request?: InspectionRequest, draft?: InspectionResult) => {
    setSelectedPlant(plant);
    setSelectedForm(form);
    setActiveRequest(request || null);
    setActiveDraftId(draft?.id || null);
    
    // รีเซ็ตสถานะ Geofencing พร้อมตรวจพิกัดใหม่หมดจด
    setGeofenceStatus('PENDING');
    setDistance(null);
    setCurrentCoords(null);
    setGeofenceErrorMsg('');
    
    if (draft) {
      setFormData(draft.formData || {});
      setPhotos(draft.photos || []);
      setDocuments(draft.documents || []);
    } else {
      // Initialize form data with inspection logic
      const initialData: any = {};
      if (form.fields) {
        form.fields.forEach((field: any) => {
          initialData[field.id] = field.type === 'checkbox' || field.type === 'CHECKBOX' ? [] : '';
        });
      } else if (form.sections) {
        form.sections.forEach((section: any) => {
          section.fields?.forEach((field: any) => {
            initialData[field.id] = field.type === 'checkbox' || field.type === 'CHECKBOX' ? [] : '';
          });
        });
      }
      setFormData(initialData);
      setPhotos([]);
      setDocuments([]);
    }
    
    // เรียกตรวจทันทีตอนกดเริ่ม
    verifyGeofence(plant);
    setStep('FORM');
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteDraft = (draftId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!draftId) return;
    
    // Set for confirmation instead of window.confirm
    setConfirmDeleteId(draftId);
  };

  const executeDeleteDraft = async (draftId: string) => {
    try {
      // 1. Get current data
      const currentInspections = safeParseLocalStorage<InspectionResult[]>('app_inspections', []);
      
      // 2. Filter out the specific draft
      const filteredInspections = currentInspections.filter(r => r.id !== draftId);
      
      // 3. Save back to local storage
      safeSetLocalStorage('app_inspections', filteredInspections);
      
      // Delete from Firestore
      try {
        await deleteDoc(doc(db, 'inspections', draftId));
      } catch (dbErr) {
        console.error("Failed to delete draft from Firestore:", dbErr);
      }
      
      // 4. Update local state
      const userId = userProfile?.employeeId || userProfile?.username;
      const updatedDrafts = filteredInspections.filter(r => 
        r.status === 'DRAFT' && r.inspectorId === userId
      );
      setDrafts(updatedDrafts);
      
      // 5. Handle active editing state
      if (activeDraftId === draftId) {
        setActiveDraftId(null);
        setStep('SELECTION');
        setSelectedPlant(null);
        setSelectedForm(null);
        setActiveRequest(null);
        setFormData({});
        setPhotos([]);
        setDocuments([]);
      }

      addNotification('SUCCESS', 'ระบบประเมิน', 'ลบรายงานฉบับร่างเรียบร้อยแล้ว');
      setConfirmDeleteId(null);
      
      // 6. Final sync
      loadData();
    } catch (err) {
      console.error('Delete draft failed:', err);
      addNotification('ALERT', 'ระบบประเมิน', 'ไม่สามารถลบข้อมูลได้ในขณะนี้');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await compressBase64Image(reader.result as string, 800, 800, 0.6);
        setPhotos(prev => [...prev, compressed]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSubmitInspection = async (isFinal: boolean, signature?: string) => {
    if (!selectedPlant || !selectedForm) return;

    if (isFinal && !signature) {
      setShowSignatureModal(true);
      return;
    }

    setIsSubmitting(true);
    console.log('Submission started:', { isFinal, hasSignature: !!signature });

    const newId = activeDraftId || `INS-${Date.now()}`;
    const userId = userProfile?.employeeId || userProfile?.username;
    const result: InspectionResult = {
      id: newId,
      requestId: activeRequest?.id || undefined,
      office: userProfile?.peaOffice || undefined,
      department: userProfile?.department || undefined,
      region: selectedPlant?.region || selectedPlant?.province || userProfile?.region || undefined,
      inspectorId: userId,
      inspectorName: userProfile?.name || '',
      plantId: selectedPlant.id,
      plantName: selectedPlant.name,
      formId: selectedForm.id,
      formData,
      photos,
      documents,
      status: isFinal ? 'SUBMITTED' : 'DRAFT',
      inspectorSignature: signature || undefined,
      createdAt: new Date().toISOString(),
      submittedAt: isFinal ? new Date().toISOString() : undefined
    };

    try {
      // 1. Save directly to Firestore 'inspections' - remove undefined fields for compatibility
      const cleanDbPayload = Object.fromEntries(
        Object.entries(result).filter(([_, v]) => v !== undefined)
      );
      await setDoc(doc(db, 'inspections', result.id), cleanDbPayload);

      // 2. Save locally for fallback/instant rendering
      const savedResults = safeParseLocalStorage<InspectionResult[]>('app_inspections', []);
      const index = savedResults.findIndex(r => r.id === newId);
      
      let updatedResults;
      if (index >= 0) {
        updatedResults = savedResults.map(r => r.id === newId ? result : r);
      } else {
        updatedResults = [result, ...savedResults];
      }
      
      updatedResults.sort((a, b) => {
        const dateA = new Date(a.submittedAt || a.createdAt).getTime();
        const dateB = new Date(b.submittedAt || b.createdAt).getTime();
        return dateB - dateA;
      });

      safeSetLocalStorage('app_inspections', updatedResults.slice(0, 60));

      // 3. Update associated request status if applicable
      if (activeRequest && isFinal) {
        const updatedReq = { ...activeRequest, status: 'AWAITING_APPROVAL' as const };
        await setDoc(doc(db, 'inspectionRequests', activeRequest.id), updatedReq, { merge: true });

        const allRequests = safeParseLocalStorage<InspectionRequest[]>('app_inspection_requests', []);
        const updatedRequests = allRequests.map((r: InspectionRequest) => 
          r.id === activeRequest.id ? updatedReq : r
        );
        safeSetLocalStorage('app_inspection_requests', updatedRequests);
      }

      addNotification('SUCCESS', 'ระบบตรวจสอบ', isFinal ? 'ส่งผลการตรวจสอบสำเร็จแล้ว' : 'บันทึกฉบับร่างเรียบร้อยแล้ว');
      
      if (isFinal) {
        // Cleanup and redirect if submitted
        setStep('SELECTION');
        setSelectedPlant(null);
        setSelectedForm(null);
        setActiveRequest(null);
        setActiveDraftId(null);
        setFormData({});
        setPhotos([]);
        setDocuments([]);
      } else {
        // Just update activeDraftId if saved as draft
        setActiveDraftId(newId);
      }
    } catch (err) {
      console.error("Firestore submit inspection error:", err);
      addNotification('ALERT', 'ระบบตรวจสอบ', 'ไม่สามารถส่งหรือบันทึกข้อมูลสำเร็จในขณะนี้ ตรวจสอบสิทธิ์หรือรหัสเชื่อมต่อ');
    } finally {
      setIsSubmitting(false);
      // Refresh local data
      loadData();
    }
  };

  const handleCheckboxChange = (fieldId: string, option: string) => {
    const currentValues = Array.isArray(formData[fieldId]) ? formData[fieldId] : [];
    if (currentValues.includes(option)) {
      setFormData({ ...formData, [fieldId]: currentValues.filter((v: string) => v !== option) });
    } else {
      setFormData({ ...formData, [fieldId]: [...currentValues, option] });
    }
  };

  const isFormMatchingPlant = (form: any, plant: any) => {
    if (!plant || !form) return false;
    const plantTypeLower = (plant.type || '').toLowerCase();
    
    // Check targetCategory
    if (form.targetCategory && plantTypeLower.includes(form.targetCategory.toLowerCase())) return true;
    
    // Check for keywords in title
    const plantKeyword = plantTypeLower.split(' ')[0].toLowerCase();
    if (plantKeyword && form.title && form.title.toLowerCase().includes(plantKeyword)) return true;
    
    return false;
  };

  const getMatchedForms = (plant: any) => {
    if (!plant) return [];
    const plantTypeLower = (plant.type || '').toLowerCase();
    return forms.filter(f => {
       if (f.targetCategory && plantTypeLower.includes(f.targetCategory.toLowerCase())) return true;
       const plantKeyword = plantTypeLower.split(' ')[0].toLowerCase();
       if (plantKeyword && f.title && f.title.toLowerCase().includes(plantKeyword)) return true;
       return false;
    });
  };

  const SelectionView = () => (
    <div className="space-y-8 animate-fade-in">
       <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
             <div className="glass-panel p-8 rounded-[3rem] border border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-4 mb-8">
                   <div className="w-12 h-12 bg-[#74045F]/10 text-[#74045F] dark:bg-[#C7911B]/10 dark:text-[#C7911B] rounded-2xl flex items-center justify-center">
                      <Search size={24} />
                   </div>
                   <div>
                      <h3 className="text-xl font-black text-slate-800 dark:text-white italic">เลือกโรงไฟฟ้าที่จะตรวจสอบ</h3>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Select Power Plant & Form</p>
                   </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                   <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">โรงไฟฟ้า (Plant)</label>
                      <select 
                        value={selectedPlant?.id || ''}
                        onChange={(e) => {
                          const plant = plants.find(p => p.id === e.target.value);
                          setSelectedPlant(plant);
                          
                          // Auto-select or suggest forms based on plant type
                          if (plant) {
                             const matches = getMatchedForms(plant);
                             if (matches.length > 1) {
                                setMatchingForms(matches);
                                setPendingSelection({ plant });
                                setShowFormPicker(true);
                                setSelectedForm(null);
                             } else if (matches.length === 1) {
                                setSelectedForm(matches[0]);
                             } else {
                                setSelectedForm(null);
                             }
                          }
                        }}
                        className="w-full bg-slate-50 dark:bg-white/5 border-2 border-slate-100 dark:border-white/5 rounded-2xl p-4 text-sm font-bold text-slate-800 dark:text-slate-400 focus:border-[#74045F] outline-none transition-all"
                      >
                         <option value="">เลือกโรงไฟฟ้า...</option>
                         {plants.map(p => <option key={p.id} value={p.id}>{p.id} - {p.name}</option>)}
                      </select>
                   </div>
                   <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">แบบฟอร์มตรวจสอบ (Form)</label>
                      <select 
                        value={selectedForm?.id || ''}
                        onChange={(e) => setSelectedForm(forms.find(f => f.id === e.target.value))}
                        className="w-full bg-slate-50 dark:bg-white/5 border-2 border-slate-100 dark:border-white/5 rounded-2xl p-4 text-sm font-bold text-slate-800 dark:text-slate-400 focus:border-[#74045F] outline-none transition-all"
                      >
                         <option value="">เลือกแบบฟอร์ม...</option>
                         {forms.map(f => {
                            const isMatch = selectedPlant && isFormMatchingPlant(f, selectedPlant);
                            return (
                               <option key={f.id} value={f.id}>
                                  {f.title}{isMatch ? ' (แนะนำสำหรับประเภทนี้)' : ''}
                               </option>
                            );
                         })}
                      </select>
                   </div>
                </div>

                <div className="mt-10 pt-6 border-t border-slate-100 dark:border-white/5">
                   <button 
                      onClick={() => handleStartInspection(selectedPlant, selectedForm)}
                      disabled={!selectedPlant || !selectedForm}
                      className="w-full bg-gradient-to-r from-[#74045F] to-[#C7911B] text-white font-black py-5 rounded-[2rem] shadow-xl shadow-[#74045F]/20 active:scale-95 transition-all text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale"
                   >
                      <FileCheck size={20} />
                      เริ่มการตรวจสอบอุปกรณ์ (Manual)
                   </button>
                </div>
             </div>
          </div>

          <div className="space-y-6">
             <div className="glass-panel p-8 rounded-[3rem] border border-slate-100 dark:border-white/5 h-full">
                <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-2xl mb-8">
                   <button 
                      onClick={() => setActiveTab('REQUESTS')}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'REQUESTS' ? 'bg-white dark:bg-white/10 shadow-sm text-[#74045F] dark:text-[#C7911B]' : 'text-slate-400'}`}
                   >
                      <div className="flex items-center justify-center gap-2">
                         <Inbox size={14} />
                         คำร้อง ({inboxRequests.length})
                      </div>
                   </button>
                   <button 
                      onClick={() => setActiveTab('DRAFTS')}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'DRAFTS' ? 'bg-white dark:bg-white/10 shadow-sm text-[#74045F] dark:text-[#C7911B]' : 'text-slate-400'}`}
                   >
                      <div className="flex items-center justify-center gap-2">
                         <History size={14} />
                         ฉบับร่าง ({drafts.length})
                      </div>
                   </button>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                   {activeTab === 'REQUESTS' ? (
                      inboxRequests.length > 0 ? (
                        inboxRequests.map(req => (
                           <div 
                             key={req.id} 
                             onClick={() => {
                               const plant = plants.find(p => p.id === req.plantId);
                               
                               // Improved matching logic
                               let form = forms.find(f => f.id === req.formId);
                               
                               if (!form && plant) {
                                  const matches = getMatchedForms(plant);
                                  
                                  if (matches.length > 1) {
                                     setMatchingForms(matches);
                                     setPendingSelection({ plant, request: req });
                                     setShowFormPicker(true);
                                     return;
                                  } else if (matches.length === 1) {
                                     form = matches[0];
                                  }
                               }
                               
                               if (!form) form = forms[0];

                               if (plant && form) handleStartInspection(plant, form, req);
                               else addNotification('ALERT', 'ระบบตรวจสอบ', 'ไม่พบข้อมูลโรงไฟฟ้าหรือแบบฟอร์ม');
                             }}
                             className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-100 dark:border-white/5 hover:border-amber-500/50 cursor-pointer transition-all group"
                           >
                              <div className="flex justify-between items-start mb-2">
                                 <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{req.id}</span>
                                 <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">{new Date(req.requestedDate).toLocaleDateString()}</span>
                              </div>
                              <h4 className="text-xs font-black text-slate-800 dark:text-white mb-2 italic group-hover:text-amber-500 transition-colors line-clamp-1">{req.plantName}</h4>
                              <div className="flex items-center gap-2">
                                 <ClipboardList size={12} className="text-slate-400" />
                                 <span className="text-[10px] text-slate-500 font-bold italic line-clamp-1 truncate">{req.details}</span>
                              </div>
                           </div>
                        ))
                      ) : (
                        <div className="text-center py-10 opacity-40">
                           <Inbox size={32} className="mx-auto mb-2" />
                           <p className="text-[10px] font-black uppercase tracking-widest italic">ยังไม่มีคำร้องใหม่</p>
                        </div>
                      )
                   ) : (
                      drafts.length > 0 ? (
                          drafts.map(draft => (
                           <div key={draft.id} className="relative group">
                              {confirmDeleteId === draft.id ? (
                                 <motion.div 
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="bg-rose-500 text-white p-4 rounded-2xl flex items-center justify-between gap-4 z-50 relative"
                                 >
                                    <div className="flex-1">
                                       <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">ยืนยันการลบ?</p>
                                       <p className="text-[8px] font-bold opacity-80 uppercase">รายงานฉบับร่าง {draft.id}</p>
                                    </div>
                                    <div className="flex gap-2">
                                       <button 
                                          onClick={() => setConfirmDeleteId(null)}
                                          className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all"
                                       >
                                          <ArrowLeft size={16} />
                                       </button>
                                       <button 
                                          onClick={() => executeDeleteDraft(draft.id)}
                                          className="p-2 bg-white text-rose-500 hover:bg-rose-50 rounded-lg shadow-lg active:scale-95 transition-all"
                                       >
                                          <Trash2 size={16} />
                                       </button>
                                    </div>
                                 </motion.div>
                              ) : (
                                 <div className="flex items-center gap-2">
                                    <div 
                                      onClick={() => {
                                        const plant = plants.find(p => p.id === draft.plantId);
                                        const form = forms.find(f => f.id === draft.formId);
                                        const request = draft.requestId ? inboxRequests.find(r => r.id === draft.requestId) : undefined;
                                        if (plant && form) handleStartInspection(plant, form, request, draft);
                                        else addNotification('ALERT', 'ระบบตรวจสอบ', 'ไม่พบข้อมูลโรงไฟฟ้าหรือแบบฟอร์มของฉบับร่างนี้');
                                      }}
                                      className="flex-1 bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-100 dark:border-white/5 hover:border-indigo-500/50 cursor-pointer transition-all"
                                    >
                                       <div className="flex justify-between items-start mb-2">
                                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{draft.id}</span>
                                          <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">DRAFT</span>
                                       </div>
                                       <h4 className="text-xs font-black text-slate-800 dark:text-white mb-2 italic group-hover:text-indigo-500 transition-colors line-clamp-1">{draft.plantName}</h4>
                                       <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                             <FileText size={12} className="text-slate-400" />
                                             <span className="text-[10px] text-slate-500 font-bold italic">แก้ไขล่าสุด: {new Date(draft.createdAt).toLocaleDateString()}</span>
                                          </div>
                                       </div>
                                    </div>
                                    <button 
                                       type="button"
                                       onClick={(e) => handleDeleteDraft(draft.id, e)}
                                       className="shrink-0 p-4 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-2xl transition-all active:scale-90"
                                       title="ลบฉบับร่าง"
                                    >
                                       <Trash2 size={18} />
                                    </button>
                                 </div>
                              )}
                           </div>
                        ))
                      ) : (
                        <div className="text-center py-10 opacity-40">
                           <History size={32} className="mx-auto mb-2" />
                           <p className="text-[10px] font-black uppercase tracking-widest italic">ไม่มีฉบับร่าง</p>
                        </div>
                      )
                   )}
                </div>
             </div>
          </div>
       </div>
    </div>
  );

  const FormPhase = () => {
    const isLocked = geofenceStatus !== 'SUCCESS';

    return (
      <div className="space-y-8 animate-slide-in-right">
         <div className="flex justify-between items-center bg-transparent border-none">
            <button 
               onClick={() => setStep('SELECTION')}
               className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
            >
               <ArrowLeft size={16} /> ย้อนกลับไปเลือกโรงไฟฟ้า
            </button>
         </div>

         {isLocked ? (
            <div className="glass-panel p-10 rounded-[3rem] border border-rose-500/15 dark:border-rose-500/10 bg-white dark:bg-[#030712] shadow-2xl shadow-rose-200/5 dark:shadow-none max-w-2xl mx-auto text-center space-y-8 overflow-hidden relative">
               <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500"></div>
               
               {/* Icon Scope */}
               <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-rose-500/20 animate-ping duration-1000"></div>
                  <div className="absolute inset-2 rounded-full border border-rose-500/30 animate-pulse"></div>
                  <div className="w-16 h-16 bg-rose-500/10 dark:bg-rose-500/5 text-rose-500 rounded-full flex items-center justify-center shadow-lg shadow-rose-500/10">
                     <Lock size={28} className="animate-bounce" />
                  </div>
               </div>

               <div className="space-y-2">
                  <h3 className="text-xl font-black text-slate-800 dark:text-white italic">มาตรการตรวจความปลอดภัย Geofencing</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
                     โปรดเข้าสู่พื้นที่โรงไฟฟ้าเพื่อเปิดประเมินความปลอดภัยตามกำหนดตำแหน่งจริง
                  </p>
               </div>

               {/* Location Dashboard Table */}
               <div className="grid md:grid-cols-2 gap-4 max-w-xl mx-auto text-left">
                  <div className="bg-slate-50 dark:bg-white/5 p-5 rounded-2xl border border-slate-100 dark:border-white/5 space-y-2">
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">โรงไฟฟ้าที่เลือก</span>
                     <h4 className="text-xs font-black text-slate-700 dark:text-white truncate">{selectedPlant?.name}</h4>
                     <p className="text-[10px] text-slate-500 font-bold font-mono">
                        Lat: {parseFloat(selectedPlant?.gps?.lat || '0').toFixed(6)} | Lng: {parseFloat(selectedPlant?.gps?.lng || '0').toFixed(6)}
                     </p>
                  </div>

                  <div className="bg-slate-50 dark:bg-white/5 p-5 rounded-2xl border border-slate-100 dark:border-white/5 space-y-2">
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">พิกัดปัจจุบันของคุณ</span>
                     {geofenceStatus === 'CHECKING' ? (
                        <div className="flex items-center gap-2 text-amber-500 font-bold text-xs mt-1">
                           <RefreshCw size={12} className="animate-spin" />
                           <span>กำลังอัปเดตตำแหน่ง...</span>
                        </div>
                     ) : currentCoords ? (
                        <>
                           <h4 className="text-xs font-black text-[#74045F] dark:text-[#C7911B] flex items-center gap-1.5 leading-none">
                              <Navigation size={12} className="animate-pulse" /> ตรวจพบตำแหน่ง
                           </h4>
                           <p className="text-[10px] text-slate-500 font-bold font-mono">
                              Lat: {currentCoords.lat.toFixed(6)} | Lng: {currentCoords.lng.toFixed(6)}
                           </p>
                        </>
                     ) : (
                        <span className="text-xs font-bold text-rose-500 block">รอตรวจจับตำแหน่งสัญญาณ...</span>
                     )}
                  </div>
               </div>

               {/* Distance Warning Banner */}
               <div className="max-w-xl mx-auto p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 flex flex-col justify-center items-center gap-1.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">สถานะระยะห่าง</span>
                  {distance !== null ? (
                     <div className="space-y-1">
                        <div className="text-2xl font-black text-rose-500 leading-none italic">
                           {distance >= 1000 ? `${(distance / 1000).toFixed(2)} กิโลเมตร` : `${distance.toFixed(0)} เมตร`}
                        </div>
                        <p className="text-[9px] font-bold text-slate-450 uppercase tracking-widest text-slate-500 mt-1">
                           เกณฑ์ปลอดภัยสูงสุดคือ 500 เมตร (คุณอยู่นอกพื้นที่ที่กำหนด)
                        </p>
                     </div>
                  ) : geofenceStatus === 'CHECKING' ? (
                     <span className="text-xs font-semibold text-slate-400 italic">กำลังรับส่งพารามิเตอร์ตำแหน่ง...</span>
                  ) : (
                     <span className="text-xs font-semibold text-rose-500 font-bold">กรุณากดเปิดสิทธิ์แชร์และตรวจพิกัด</span>
                  )}
               </div>

               {/* Error Message */}
               {geofenceErrorMsg && (
                  <div className="max-w-xl mx-auto p-4 bg-rose-50 dark:bg-rose-500/5 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-2xl border border-rose-200 dark:border-rose-900/10 flex items-center justify-center gap-2">
                     <AlertTriangle size={14} className="shrink-0" />
                     <span>{geofenceErrorMsg}</span>
                  </div>
               )}

               {/* Action Control Panel */}
               <div className="pt-2 max-w-xl mx-auto space-y-4">
                  <button
                     onClick={() => verifyGeofence(selectedPlant)}
                     disabled={geofenceStatus === 'CHECKING'}
                     className="w-full bg-gradient-to-r from-[#74045F] to-[#C7911B] text-white font-black py-4 rounded-[2rem] shadow-xl shadow-[#74045F]/20 active:scale-95 transition-all text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 disabled:opacity-50"
                  >
                     <RefreshCw size={16} className={geofenceStatus === 'CHECKING' ? 'animate-spin' : ''} />
                     {geofenceStatus === 'CHECKING' ? 'กำลังดึงพิกัด...' : 'ตรวจพิกัดและยืนยันตำแหน่งใหม่'}
                  </button>
               </div>
            </div>
         ) : (
            <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 space-y-8">
             <div className="glass-panel p-10 rounded-[3rem] border border-slate-100 dark:border-white/5 bg-white dark:bg-[#030712] shadow-2xl shadow-slate-200/20 dark:shadow-none">
                <div className="flex justify-between items-start border-b border-slate-100 dark:border-white/10 pb-8 mb-8">
                   <div>
                      <div className="flex items-center gap-3 mb-2">
                         <span className="px-3 py-1 bg-indigo-500/10 text-indigo-500 text-[8px] font-black rounded-full uppercase tracking-widest">Inspection Mode</span>
                         {activeRequest && <span className="px-3 py-1 bg-amber-500/10 text-amber-500 text-[8px] font-black rounded-full uppercase tracking-widest">Ref: {activeRequest.id}</span>}
                         {activeDraftId && <span className="px-3 py-1 bg-indigo-500/10 text-indigo-500 text-[8px] font-black rounded-full uppercase tracking-widest italic">Drafting</span>}
                      </div>
                      <h2 className="text-3xl font-black text-slate-800 dark:text-white italic">{selectedPlant.name}</h2>
                      <div className="flex items-center gap-4 mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                         <div className="flex items-center gap-1.5"><MapPin size={12} className="text-[#74045F]" /> {selectedPlant.region}</div>
                         <div>Code: {selectedPlant.id}</div>
                      </div>
                   </div>
                   <div className="text-right">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Inspector Profile</div>
                      <p className="text-sm font-black text-slate-700 dark:text-white italic leading-none mb-1">{userProfile?.name}</p>
                      <p className="text-[10px] font-bold text-[#74045F] dark:text-[#C7911B] uppercase tracking-tighter">{userProfile?.position}</p>
                   </div>
                </div>

                <div className="space-y-12">
                   {selectedForm.fields ? (
                     <div className="grid md:grid-cols-2 gap-6">
                        {selectedForm.fields.map((field: any) => (
                           <div key={field.id} className="space-y-2">
                              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">
                                 {field.label} {field.required && <span className="text-rose-500">*</span>}
                              </label>
                              {field.type === 'SELECT' || field.type === 'select' ? (
                                 <select 
                                    value={formData[field.id] || ''}
                                    onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl p-5 text-sm font-bold outline-none focus:border-[#74045F] transition-all"
                                 >
                                    <option value="">เลือกคำตอบ...</option>
                                    {field.options?.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                                 </select>
                              ) : field.type === 'checkbox' || field.type === 'CHECKBOX' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                                  {field.options?.map((opt: string) => {
                                    const isChecked = Array.isArray(formData[field.id]) && formData[field.id].includes(opt);
                                    return (
                                      <label key={opt} className="flex items-center gap-3 p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl cursor-pointer transition-all">
                                        <div 
                                          onClick={() => handleCheckboxChange(field.id, opt)}
                                          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isChecked ? 'bg-[#74045F] border-[#74045F] text-white shadow-lg' : 'border-slate-300 dark:border-white/10'}`}
                                        >
                                          {isChecked && <CheckCircle2 size={14} />}
                                        </div>
                                        <span className={`text-xs font-bold ${isChecked ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>{opt}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              ) : field.type === 'DATE' || field.type === 'date' ? (
                                 <input 
                                    type="date"
                                    value={formData[field.id] || ''}
                                    onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl p-5 text-sm font-bold outline-none focus:border-[#74045F] transition-all"
                                 />
                              ) : (
                                 <input 
                                    type={field.type === 'NUMBER' || field.type === 'number' ? 'number' : 'text'}
                                    value={formData[field.id] || ''}
                                    onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
                                    placeholder={`กรอก${field.label}...`}
                                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl p-5 text-sm font-bold outline-none focus:border-[#74045F] transition-all"
                                 />
                              )}
                           </div>
                        ))}
                     </div>
                   ) : selectedForm.sections?.map((section: any, sIdx: number) => (
                      <div key={sIdx} className="space-y-6">
                         <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-[0.2em] italic flex items-center gap-3">
                            <span className="w-6 h-6 bg-[#74045F] text-white flex items-center justify-center rounded-lg text-[10px] not-italic">{sIdx + 1}</span>
                            {section.title}
                         </h3>

                         <div className="grid md:grid-cols-2 gap-6 pl-9">
                            {section.fields?.map((field: any) => (
                               <div key={field.id} className="space-y-2">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">{field.label}</label>
                                  {field.type === 'SELECT' || field.type === 'select' ? (
                                     <select 
                                        value={formData[field.id] || ''}
                                        onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl p-5 text-sm font-bold outline-none focus:border-[#74045F] transition-all"
                                     >
                                        <option value="">เลือกคำตอบ...</option>
                                        {field.options?.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                                     </select>
                                  ) : field.type === 'checkbox' || field.type === 'CHECKBOX' ? (
                                    <div className="grid grid-cols-1 gap-2 p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                                      {field.options?.map((opt: string) => {
                                        const isChecked = Array.isArray(formData[field.id]) && formData[field.id].includes(opt);
                                        return (
                                          <label key={opt} className="flex items-center gap-3 p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl cursor-pointer transition-all">
                                            <div 
                                              onClick={() => handleCheckboxChange(field.id, opt)}
                                              className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isChecked ? 'bg-[#74045F] border-[#74045F] text-white shadow-lg' : 'border-slate-300 dark:border-white/10'}`}
                                            >
                                              {isChecked && <CheckCircle2 size={14} />}
                                            </div>
                                            <span className={`text-xs font-bold ${isChecked ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>{opt}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                     <input 
                                        type={field.type === 'NUMBER' ? 'number' : 'text'}
                                        value={formData[field.id]}
                                        onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
                                        placeholder={`กรอก${field.label}...`}
                                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl p-5 text-sm font-bold outline-none focus:border-[#74045F] transition-all"
                                     />
                                  )}
                               </div>
                            ))}
                         </div>
                      </div>
                   ))}
                </div>
             </div>
          </div>

          <div className="w-full lg:w-96 space-y-8">
             <div className="glass-panel p-8 rounded-[3rem] border border-slate-100 dark:border-white/5">
                <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest italic mb-6">หลักฐานประกอบการตรวจ</h3>
                
                <div className="space-y-6">
                   <div className="flex gap-4">
                      <button 
                        onClick={() => document.getElementById('camera-input')?.click()}
                        className="flex-1 flex flex-col items-center justify-center gap-3 p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border-2 border-dashed border-slate-200 dark:border-white/10 hover:border-[#74045F] transition-all group"
                      >
                         <Camera className="text-slate-400 group-hover:text-[#74045F] transition-colors" size={32} />
                         <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Camera</span>
                      </button>
                      <button 
                        onClick={() => document.getElementById('file-input')?.click()}
                        className="flex-1 flex flex-col items-center justify-center gap-3 p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border-2 border-dashed border-slate-200 dark:border-white/10 hover:border-[#74045F] transition-all group"
                      >
                         <Upload className="text-slate-400 group-hover:text-[#74045F] transition-colors" size={32} />
                         <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Document</span>
                      </button>

                      <input type="file" id="camera-input" accept="image/*" capture="environment" hidden onChange={handlePhotoUpload} multiple />
                      <input type="file" id="file-input" multiple hidden onChange={(e) => {
                         const files = e.target.files;
                         if (files) {
                            Array.from(files).forEach(file => {
                               const reader = new FileReader();
                               reader.onloadend = async () => {
                                  const base64 = reader.result as string;
                                  const processed = base64.startsWith('data:image/') 
                                    ? await compressBase64Image(base64, 800, 800, 0.6) 
                                    : base64;
                                  setDocuments(prev => [...prev, { name: file.name, url: processed }]);
                               };
                               reader.readAsDataURL(file);
                            });
                         }
                      }} />
                   </div>

                   {/* Preview Area */}
                   <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                      {photos.map((src, idx) => (
                         <div key={`photo-${idx}`} className="relative aspect-square rounded-2xl overflow-hidden group border-2 border-slate-100 dark:border-white/5">
                            <img src={src} alt="Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                               <button 
                                 onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewImage(src);
                                 }}
                                 className="p-2 bg-white/20 hover:bg-white/40 rounded-lg text-white transition-all backdrop-blur-md"
                               >
                                  <Eye size={14} />
                               </button>
                               <button 
                                 onClick={(e) => {
                                    e.stopPropagation();
                                    setPhotos(prev => prev.filter((_, i) => i !== idx));
                                 }}
                                 className="p-2 bg-rose-500/80 hover:bg-rose-500 rounded-lg text-white transition-all"
                               >
                                  <Trash2 size={14} />
                               </button>
                            </div>
                         </div>
                      ))}
                      {documents.map((doc, idx) => (
                         <div key={`doc-${idx}`} className="col-span-2 bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-100 dark:border-white/5 flex items-center justify-between group hover:border-[#74045F] transition-all">
                            <div className="flex items-center gap-3">
                               <div className="w-8 h-8 bg-[#74045F]/10 text-[#74045F] dark:bg-[#C7911B]/10 dark:text-[#C7911B] rounded-xl flex items-center justify-center">
                                  <FileText size={16} />
                               </div>
                               <div className="flex flex-col">
                                  <span className="text-[10px] font-black italic truncate max-w-[150px] text-slate-800 dark:text-white">{doc.name}</span>
                                  <span className="text-[8px] font-bold text-slate-400">Attached Document</span>
                               </div>
                            </div>
                            <div className="flex gap-2">
                               <button 
                                 onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDocument(doc);
                                 }}
                                 className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition-all"
                               >
                                  <Eye size={14} />
                               </button>
                               <button 
                                 onClick={(e) => {
                                    e.stopPropagation();
                                    setDocuments(prev => prev.filter((_, i) => i !== idx));
                                 }}
                                 className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all"
                               >
                                  <Trash2 size={14} />
                               </button>
                            </div>
                         </div>
                      ))}
                      {photos.length === 0 && documents.length === 0 && (
                         <div className="col-span-2 py-8 text-center opacity-30">
                            <Upload size={24} className="mx-auto mb-2" />
                            <p className="text-[8px] font-black uppercase tracking-widest">No evidence attached</p>
                         </div>
                      )}
                   </div>
                </div>
             </div>

             <div className="glass-panel p-8 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-xl shadow-slate-200/20 dark:shadow-none">
                <div className="space-y-4">
                   <div className="flex gap-4">
                      <button 
                         onClick={() => handleSubmitInspection(false)}
                         disabled={isSubmitting}
                         className="flex-1 border-2 border-indigo-500 text-indigo-500 font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest hover:bg-indigo-50 dark:hover:bg-indigo-500/5 transition-all active:scale-95"
                      >
                         บันทึกฉบับร่าง
                      </button>
                      {activeDraftId && (
                         <div className="flex gap-2 w-16">
                           {confirmDeleteId === activeDraftId ? (
                             <div className="flex flex-col gap-1 w-full h-full">
                               <button 
                                 onClick={() => executeDeleteDraft(activeDraftId)}
                                 className="flex-1 bg-rose-500 text-white rounded-2xl flex items-center justify-center hover:bg-rose-600 transition-all active:scale-90"
                               >
                                 <Trash2 size={18} />
                               </button>
                               <button 
                                 onClick={() => setConfirmDeleteId(null)}
                                 className="h-8 bg-slate-100 dark:bg-white/10 rounded-xl text-[8px] font-black uppercase tracking-tight"
                               >
                                 Cancel
                               </button>
                             </div>
                           ) : (
                             <button 
                                type="button"
                                onClick={(e) => handleDeleteDraft(activeDraftId, e)}
                                disabled={isSubmitting}
                                className="w-full border-2 border-rose-500 text-rose-500 font-black py-4 rounded-2xl flex items-center justify-center hover:bg-rose-50 dark:hover:bg-rose-500/5 transition-all active:scale-95"
                                title="ลบฉบับร่าง"
                             >
                                <Trash2 size={20} />
                             </button>
                           )}
                         </div>
                      )}
                   </div>
                   <button 
                      onClick={() => handleSubmitInspection(true)}
                      disabled={isSubmitting}
                      className="w-full bg-gradient-to-r from-[#74045F] to-[#C7911B] text-white font-black py-5 rounded-[2rem] shadow-xl shadow-[#74045F]/20 active:scale-95 transition-all text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3"
                   >
                      {isSubmitting ? (
                         <>
                           <RefreshCw size={20} className="animate-spin" />
                           กำลังส่งผลการตรวจ...
                         </>
                      ) : (
                         <>
                           <Send size={20} />
                           ส่งผลตรวจเพื่อขออนุมัติ
                         </>
                      )}
                   </button>
                </div>

                <div className="mt-8 p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/20">
                   <div className="flex gap-3">
                      <CheckCircle2 size={16} className="text-emerald-500 mt-1 shrink-0" />
                      <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 italic">
                         ข้อมูลผลการตรวจสอบจะถูกส่งไปยังผู้จัดการ (Manager) ตามสายงานบังคับบัญชา (สังกัด {userProfile?.peaOffice || 'หน่วยงาน'} / {userProfile?.department || 'กอง'}) เพื่อดำเนินการอนุมัติ และจะปรากฎในประวัติย้อนหลังทันทีหลังการอนุมัติ
                      </p>
                   </div>
                </div>
             </div>
          </div>
        </div>
     )}
     </div>
    );
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in font-sans">
       <div className="flex justify-between items-center bg-white dark:bg-[#030712] p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-xl shadow-slate-200/20 dark:shadow-none">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white italic flex items-center gap-3">
            <ClipboardList className="text-[#74045F] dark:text-[#C7911B]" size={32} />
            ตรวจสอบอุปกรณ์ (Inspector Only)
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 italic">Expert Equipment Inspection System</p>
        </div>
        <div className="flex gap-4">
           <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Operator Status</span>
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                 <span className="text-xs font-black text-emerald-500 italic">Authorized Inspector</span>
              </div>
           </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
         {step === 'SELECTION' && SelectionView()}
         {step === 'FORM' && FormPhase()}
      </AnimatePresence>

      <AnimatePresence>
        {previewImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-10"
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
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
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
                    <Download className="rotate-180" size={14} /> Download
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
                  <object 
                    data={previewDocument.blobUrl || previewDocument.url} 
                    type="application/pdf"
                    className="w-full h-full"
                  >
                    <div className="p-10 text-center">
                      <p className="text-slate-500 mb-4 font-bold text-sm">ไม่สนับสนุนการแสดงผลโดยตรงในเบราว์เซอร์นี้</p>
                      <button 
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = previewDocument.blobUrl || previewDocument.url;
                          link.download = previewDocument.name;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        className="bg-[#74045F] text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-[0.2em]"
                      >
                        ดาวน์โหลดเพื่อดูเอกสาร
                      </button>
                    </div>
                  </object>
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
        onSave={(signature) => handleSubmitInspection(true, signature)}
        title="ลงนามผู้ตรวจสอบ (Inspector Signature)"
        savedSignature={userProfile?.signature}
      />

      {/* Form Picker Modal for Multiple Matches */}
      <AnimatePresence>
        {showFormPicker && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white dark:bg-[#0F172A] w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-200 dark:border-white/10"
            >
              <div className="p-8 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center">
                      <LayoutList size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-800 dark:text-white italic">เลือกแบบฟอร์มตรวจสอบ</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Found Multiple Matching Forms</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowFormPicker(false)}
                    className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-all"
                  >
                    <X size={20} className="text-slate-400" />
                  </button>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 mb-2">
                  <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                    ระบบตรวจพบแบบฟอร์มที่เหมาะสมกับประเภทโรงไฟฟ้ามากกว่า 1 รูปแบบ กรุณาเลือกแบบฟอร์มที่ต้องการใช้งานสำหรับ:
                  </p>
                  <p className="text-xs font-black text-slate-800 dark:text-white mt-1 italic">
                    {pendingSelection?.plant?.name} ({pendingSelection?.plant?.type})
                  </p>
                </div>

                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                  {matchingForms.map((form) => (
                    <button
                      key={form.id}
                      onClick={() => {
                        if (pendingSelection) {
                          handleStartInspection(pendingSelection.plant, form, pendingSelection.request);
                          setShowFormPicker(false);
                          setPendingSelection(null);
                        }
                      }}
                      className="w-full text-left p-5 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-3xl hover:border-[#74045F] hover:bg-white dark:hover:bg-white/10 transition-all group flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white dark:bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-[#74045F] transition-colors">
                          <FileCheck size={20} />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-slate-700 dark:text-white italic group-hover:text-[#74045F] transition-colors">{form.title}</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter truncate max-w-[250px]">{form.description}</p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-slate-300 group-hover:text-[#74045F] translate-x-0 group-hover:translate-x-1 transition-all" />
                    </button>
                  ))}
                </div>

                <div className="pt-2">
                  <button 
                    onClick={() => setShowFormPicker(false)}
                    className="w-full py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 dark:hover:text-slate-200 transition-all"
                  >
                    ยกเลิกและเลือกด้วยตนเอง
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
