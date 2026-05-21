
import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, Search, Filter, Calendar, Zap, 
  CheckCircle2, Clock, XCircle, AlertCircle, RefreshCw,
  Trash2, Eye, Download, FileText, ArrowRight, ChevronRight,
  MoreVertical, Power, User, Building2, Inbox, Lock, ShieldAlert, ShieldCheck,
  Plus, LayoutDashboard, ListFilter, Activity, Users, MapPin, Settings2
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { safeParseLocalStorage, safeSetLocalStorage } from '../utils/localStorageUtils';
import { InspectionRequest, InspectionResult } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../src/lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

interface AdminInspectionManagementProps {
  isDangerZoneUnlocked: boolean;
  setIsDangerZoneUnlocked: (unlocked: boolean) => void;
  setIsUnlockModalOpen: (open: boolean) => void;
}

export const AdminInspectionManagement: React.FC<AdminInspectionManagementProps> = ({
  isDangerZoneUnlocked,
  setIsDangerZoneUnlocked,
  setIsUnlockModalOpen
}) => {
  const { t } = useLanguage();
  const [requests, setRequests] = useState<InspectionRequest[]>([]);
  const [inspections, setInspections] = useState<InspectionResult[]>([]);
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'REQUESTS' | 'RESULTS'>('DASHBOARD');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  
  // Create Task State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [plants, setPlants] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [newTask, setNewTask] = useState({
    plantId: '',
    vendorId: '',
    formId: '',
    details: '',
    requestedDate: new Date().toISOString().split('T')[0]
  });

  // Modals
  const [selectedRequest, setSelectedRequest] = useState<InspectionRequest | null>(null);
  const [selectedInspection, setSelectedInspection] = useState<InspectionResult | null>(null);
  const [associatedRequest, setAssociatedRequest] = useState<InspectionRequest | null>(null);

  useEffect(() => {
    if (selectedInspection?.requestId) {
      const req = requests.find(r => r.id === selectedInspection.requestId);
      setAssociatedRequest(req || null);
    } else {
      setAssociatedRequest(null);
    }
  }, [selectedInspection, requests]);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'REQUEST' | 'RESULT' } | null>(null);
  const [isStatusEditModalOpen, setIsStatusEditModalOpen] = useState(false);
  const [itemToEditStatus, setItemToEditStatus] = useState<InspectionRequest | null>(null);
  const [selectedFormIdForRequest, setSelectedFormIdForRequest] = useState<string>('');

  useEffect(() => {
    if (itemToEditStatus) {
      setSelectedFormIdForRequest(itemToEditStatus.formId || '');
    }
  }, [itemToEditStatus]);

  useEffect(() => {
    // 1. Auxiliary static data loading
    const refreshAuxData = () => {
      const loadedPlants = safeParseLocalStorage<any[]>('power_plants', []);
      const loadedUsers = safeParseLocalStorage<any[]>('app_users', []);
      const loadedForms = safeParseLocalStorage<any[]>('app_inspection_forms', []);
      
      setPlants(loadedPlants);
      setVendors(loadedUsers.filter(u => u.role === 'VENDER' || u.role === 'INSPECTOR'));
      setForms(loadedForms);
    };

    refreshAuxData();
    window.addEventListener('storage', refreshAuxData);

    // 2. Load cached local storage values immediately so UI renders instantly
    setIsLoading(true);
    const loadedRequests = safeParseLocalStorage<InspectionRequest[]>('app_inspection_requests', []);
    const loadedInspections = safeParseLocalStorage<any[]>('app_inspections', []);
    setRequests(loadedRequests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setInspections(loadedInspections.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setTimeout(() => setIsLoading(false), 300);

    // 3. Real-time Firestore sync of inspectionRequests
    const qRequests = query(collection(db, 'inspectionRequests'));
    const unsubRequests = onSnapshot(qRequests, (snapshot) => {
      const dbRequests: InspectionRequest[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        dbRequests.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
        } as InspectionRequest);
      });
      dbRequests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRequests(dbRequests);
      safeSetLocalStorage('app_inspection_requests', dbRequests);
    }, (error) => {
      console.error("Firestore inspectionRequests Sync Error:", error);
    });

    // 4. Real-time Firestore sync of inspections (results)
    const qInspections = query(collection(db, 'inspections'));
    const unsubInspections = onSnapshot(qInspections, (snapshot) => {
      const dbInspections: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        dbInspections.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
        });
      });
      dbInspections.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setInspections(dbInspections);
      safeSetLocalStorage('app_inspections', dbInspections);
    }, (error) => {
      console.error("Firestore inspections Sync Error:", error);
    });

    return () => {
      window.removeEventListener('storage', refreshAuxData);
      unsubRequests();
      unsubInspections();
    };
  }, []);

  const handleDelete = async () => {
    if (!itemToDelete) return;

    try {
      if (itemToDelete.type === 'REQUEST') {
        const updated = requests.filter(r => r.id !== itemToDelete.id);
        setRequests(updated);
        safeSetLocalStorage('app_inspection_requests', updated);
        await deleteDoc(doc(db, 'inspectionRequests', itemToDelete.id));
      } else {
        const updated = inspections.filter(i => i.id !== itemToDelete.id);
        setInspections(updated);
        safeSetLocalStorage('app_inspections', updated);
        await deleteDoc(doc(db, 'inspections', itemToDelete.id));
      }
    } catch (err) {
      console.error("Firestore delete error in Admin:", err);
    }

    setIsDeleteModalOpen(false);
    setItemToDelete(null);
  };

  const handleCreateTask = async () => {
    if (!newTask.plantId || !newTask.vendorId) return;
    
    const plant = plants.find(p => p.id === newTask.plantId);
    const vendor = vendors.find(v => v.employeeId === newTask.vendorId || v.username === newTask.vendorId);

    const request: InspectionRequest = {
      id: `REQ-ADM-${Date.now()}`,
      vendorId: vendor?.employeeId || vendor?.username || newTask.vendorId,
      vendorName: vendor?.name || 'Unknown',
      office: vendor?.peaOffice || vendor?.department,
      plantId: newTask.plantId,
      plantName: plant?.name || 'Unknown',
      formId: newTask.formId,
      details: newTask.details,
      requestedDate: newTask.requestedDate,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'inspectionRequests', request.id), request);
    } catch (err) {
      console.error("Firestore Create Task request error:", err);
      // Fallback
      const updated = [request, ...requests];
      setRequests(updated);
      safeSetLocalStorage('app_inspection_requests', updated);
    }
    
    setIsCreateModalOpen(false);
    setNewTask({
      plantId: '',
      vendorId: '',
      formId: '',
      details: '',
      requestedDate: new Date().toISOString().split('T')[0]
    });
  };

  const updateRequestStatus = async (id: string, status: InspectionRequest['status'], formId?: string) => {
    const target = requests.find(r => r.id === id);
    if (!target) return;

    const updatedRequest = {
      ...target,
      status,
      formId: formId !== undefined ? formId : target.formId
    };

    try {
      await setDoc(doc(db, 'inspectionRequests', id), updatedRequest, { merge: true });
    } catch (err) {
      console.error("Firestore update request status error:", err);
      // Fallback
      const updated = requests.map(r => r.id === id ? updatedRequest : r);
      setRequests(updated);
      safeSetLocalStorage('app_inspection_requests', updated);
    }

    setIsStatusEditModalOpen(false);
    setItemToEditStatus(null);
    setSelectedFormIdForRequest('');
  };

  const handleManualRefresh = () => {
    setIsLoading(true);
    // Reload plants, users, form local cached lists
    const loadedPlants = safeParseLocalStorage<any[]>('power_plants', []);
    const loadedUsers = safeParseLocalStorage<any[]>('app_users', []);
    const loadedForms = safeParseLocalStorage<any[]>('app_inspection_forms', []);
    setPlants(loadedPlants);
    setVendors(loadedUsers.filter(u => u.role === 'VENDER' || u.role === 'INSPECTOR'));
    setForms(loadedForms);
    setTimeout(() => setIsLoading(false), 500);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-500';
      case 'ACCEPTED': return 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-500';
      case 'AWAITING_APPROVAL': return 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-500';
      case 'SUBMITTED': return 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-500';
      case 'COMPLETED':
      case 'APPROVED': return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-500';
      case 'REJECTED': return 'bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-500';
      default: return 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400';
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesSearch = 
      req.plantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.vendorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredInspections = inspections.filter(ins => {
    const matchesSearch = 
      ins.plantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ins.inspectorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ins.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || ins.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    totalRequests: requests.length,
    pendingRequests: requests.filter(r => r.status === 'PENDING').length,
    acceptedRequests: requests.filter(r => r.status === 'ACCEPTED').length,
    awaitingApproval: requests.filter(r => r.status === 'AWAITING_APPROVAL').length,
    completedRequests: requests.filter(r => r.status === 'COMPLETED').length,
    rejectedRequests: requests.filter(r => r.status === 'REJECTED').length,
    totalInspections: inspections.length,
    pendingInspectionApproval: inspections.filter(i => i.status === 'SUBMITTED').length,
    approvedInspections: inspections.filter(i => i.status === 'APPROVED').length
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10 mt-10">
      {/* Header & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3 uppercase tracking-tighter italic">
            <ClipboardList className="text-[#74045F] dark:text-[#C7911B]" size={32} />
            จัดการงานตรวจสอบอุปกรณ์
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            บริหารจัดการและควบคุมกระบวนการตรวจสอบโรงไฟฟ้าทั้งหมดในระบบ
          </p>
        </div>
        
        <div className="flex flex-wrap items-center justify-start md:justify-end gap-3 lg:gap-4">
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-gradient-to-r from-[#74045F] to-[#C7911B] text-white font-bold py-3 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#74045F]/20 dark:shadow-[#C7911B]/20 transition-all active:scale-95 group whitespace-nowrap"
          >
            <Plus size={18} />
            Create Task
          </button>
          
          <button 
            onClick={handleManualRefresh}
            className="p-3.5 rounded-2xl bg-white dark:bg-[#030712] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-all border border-slate-100 dark:border-white/5 shadow-sm"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>

          <div className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-[#030712] border border-slate-100 dark:border-white/5 rounded-2xl shadow-sm">
              <div className="flex flex-col">
                  <span className="text-[8px] font-black text-rose-500 uppercase tracking-[0.2em] leading-none mb-1 text-right">{t('admin.security_panel')}</span>
                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{t('admin.danger_zone')}</span>
              </div>
              <button 
                  onClick={() => {
                      if (isDangerZoneUnlocked) setIsDangerZoneUnlocked(false);
                      else setIsUnlockModalOpen(true);
                  }}
                  className={`ml-2 w-12 h-6 rounded-full transition-all relative flex items-center px-1 ${isDangerZoneUnlocked ? 'bg-rose-500 shadow-lg shadow-rose-500/20' : 'bg-slate-200 dark:bg-white/10'}`}
              >
                  <motion.div 
                      animate={{ x: isDangerZoneUnlocked ? 24 : 0 }}
                      className={`w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-sm ${isDangerZoneUnlocked ? 'text-rose-500' : 'text-slate-400'}`}
                  >
                      {isDangerZoneUnlocked ? <Lock size={10} /> : <ShieldAlert size={10} />}
                  </motion.div>
              </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex p-1.5 bg-white dark:bg-[#030712] rounded-[1.5rem] border border-slate-100 dark:border-white/5 shadow-sm w-fit">
        <button
          onClick={() => setActiveTab('DASHBOARD')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'DASHBOARD' 
              ? 'bg-[#74045F]/10 text-[#74045F] dark:bg-[#C7911B]/10 dark:text-[#C7911B]' 
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          <LayoutDashboard size={14} />
          {t('nav.dashboard')}
        </button>
        <button
          onClick={() => setActiveTab('REQUESTS')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'REQUESTS' 
              ? 'bg-[#74045F]/10 text-[#74045F] dark:bg-[#C7911B]/10 dark:text-[#C7911B]' 
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          <ClipboardList size={14} />
          คำร้องขอ ({requests.length})
        </button>
        <button
          onClick={() => setActiveTab('RESULTS')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'RESULTS' 
              ? 'bg-[#74045F]/10 text-[#74045F] dark:bg-[#C7911B]/10 dark:text-[#C7911B]' 
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          <CheckCircle2 size={14} />
          ผลการตรวจ ({inspections.length})
        </button>
      </div>

      {activeTab === 'DASHBOARD' ? (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#030712] p-6 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 -mr-8 -mt-8 rounded-full transition-transform group-hover:scale-125"></div>
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-600">
                  <Activity size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">วงจรชีวิตงานทั้งหมด</p>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-white">{stats.totalRequests + stats.totalInspections}</h3>
                </div>
              </div>
              <div className="w-full h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: '100%' }}></div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#030712] p-6 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 -mr-8 -mt-8 rounded-full transition-transform group-hover:scale-125"></div>
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 text-amber-600">
                  <Clock size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">รอดำเนินการ</p>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-white">{stats.pendingRequests + stats.pendingInspectionApproval}</h3>
                </div>
              </div>
              <div className="w-full h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-500" 
                  style={{ width: `${((stats.pendingRequests + stats.pendingInspectionApproval) / (stats.totalRequests + stats.totalInspections || 1)) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#030712] p-6 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 -mr-8 -mt-8 rounded-full transition-transform group-hover:scale-125"></div>
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ผ่านการอนุมัติ</p>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-white">{stats.approvedInspections}</h3>
                </div>
              </div>
              <div className="w-full h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500" 
                  style={{ width: `${(stats.approvedInspections / (stats.totalInspections || 1)) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#030712] p-6 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 -mr-8 -mt-8 rounded-full transition-transform group-hover:scale-125"></div>
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-600">
                  <XCircle size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ถูกปฏิเสธ / ฉบับร่าง</p>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-white">{stats.rejectedRequests + (inspections.filter(i => i.status === 'REJECTED' || i.status === 'DRAFT').length)}</h3>
                </div>
              </div>
              <div className="w-full h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-rose-500" 
                  style={{ width: `${((stats.rejectedRequests + inspections.filter(i => i.status === 'REJECTED' || i.status === 'DRAFT').length) / (stats.totalRequests + stats.totalInspections || 1)) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-[#030712] p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm">
              <h4 className="text-sm font-black uppercase tracking-widest text-[#74045F] dark:text-[#C7911B] mb-6 flex items-center gap-2 italic">
                <Activity size={16} /> กิจกรรมล่าสุดในระบบ
              </h4>
              <div className="space-y-4">
                {[...requests.slice(0, 3), ...inspections.slice(0, 3)]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 5)
                  .map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                      <div className={`p-2 rounded-xl ${'vendorId' in item ? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                        {'vendorId' in item ? <Inbox size={18} /> : <CheckCircle2 size={18} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-800 dark:text-white truncate italic">{item.plantName}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                          {'vendorId' in item ? `Request by ${item.vendorName}` : `Inspection by ${item.inspectorName}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${getStatusStyle(item.status)}`}>
                          {item.status}
                        </span>
                        <p className="text-[9px] text-slate-400 mt-1 font-bold">{new Date(item.createdAt).toLocaleDateString('th-TH')}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="bg-white dark:bg-[#030712] p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm">
              <h4 className="text-sm font-black uppercase tracking-widest text-[#74045F] dark:text-[#C7911B] mb-6 flex items-center gap-2 italic">
                <Users size={16} /> ปริมาณงานรายบุคคล
              </h4>
              <div className="space-y-4">
                {vendors.slice(0, 5).map((vendor, idx) => {
                  const vendorWork = requests.filter(r => r.vendorId === (vendor.employeeId || vendor.username)).length;
                  const percentage = (vendorWork / (requests.length || 1)) * 100;
                  return (
                    <div key={idx} className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-600 dark:text-slate-300">{vendor.name}</span>
                        <span className="text-slate-400">{vendorWork} Tasks</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          className="h-full bg-[#74045F] dark:bg-[#C7911B]"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#030712] p-4 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-xl shadow-slate-200/20 dark:shadow-none">
          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder={t('admin.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl text-sm focus:ring-2 focus:ring-[#74045F]/20 outline-none transition-all dark:text-white font-medium"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-6 py-3 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl text-xs outline-none transition-all dark:text-white font-black uppercase tracking-widest"
            >
              <option value="ALL">สถานะทั้งหมด</option>
              {activeTab === 'REQUESTS' ? (
                <>
                  <option value="PENDING">รอดำเนินการ</option>
                  <option value="ACCEPTED">รับงานแล้ว</option>
                  <option value="AWAITING_APPROVAL">รออนุมัติ</option>
                  <option value="COMPLETED">เสร็จสิ้น</option>
                  <option value="REJECTED">ปฏิเสธ</option>
                </>
              ) : (
                <>
                  <option value="DRAFT">ฉบับร่าง</option>
                  <option value="SUBMITTED">ส่งรายงานแล้ว</option>
                  <option value="APPROVED">อนุมัติแล้ว</option>
                  <option value="REJECTED">ไม่ผ่านการอนุมัติ</option>
                </>
              )}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/5">
                  <th className="pb-4 pl-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('admin.id_status')}</th>
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ชื่อโรงไฟฟ้า</th>
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{activeTab === 'REQUESTS' ? 'ผู้รับงาน' : 'ผู้ตรวจสอบ'}</th>
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">วันที่</th>
                  <th className="pb-4 pr-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('admin.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                {activeTab === 'REQUESTS' ? (
                  filteredRequests.length > 0 ? (
                    filteredRequests.map(req => (
                      <tr key={req.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors group">
                        <td className="py-5 pl-4">
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{req.id}</span>
                            <span className={`w-fit px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${getStatusStyle(req.status)}`}>
                              {req.status}
                            </span>
                          </div>
                        </td>
                        <td className="py-5">
                           <div className="flex items-center gap-3">
                              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-500/5 text-blue-500">
                                 <Building2 size={16} />
                              </div>
                              <span className="text-sm font-black text-slate-800 dark:text-white italic">{req.plantName}</span>
                           </div>
                        </td>
                        <td className="py-5">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{req.vendorName}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Office: {req.office || 'N/A'}</span>
                          </div>
                        </td>
                        <td className="py-5">
                          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                            <Calendar size={14} className="text-slate-400" />
                            <span className="text-xs font-bold">{new Date(req.requestedDate).toLocaleDateString('th-TH')}</span>
                          </div>
                        </td>
                        <td className="py-5 pr-4 text-right">
                          <div className="flex items-center justify-end gap-2 outline-none">
                            <button 
                              onClick={() => setSelectedRequest(req)}
                              className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-[#74045F]/10 hover:text-[#74045F] transition-all"
                            >
                              <Eye size={16} />
                            </button>
                            <button 
                              onClick={() => {
                                setItemToEditStatus(req);
                                setIsStatusEditModalOpen(true);
                              }}
                              className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-amber-500/10 hover:text-amber-500 transition-all"
                            >
                              <Settings2 size={16} />
                            </button>
                            {isDangerZoneUnlocked && (
                              <button 
                                onClick={() => {
                                  setItemToDelete({ id: req.id, type: 'REQUEST' });
                                  setIsDeleteModalOpen(true);
                                }}
                                className="p-2.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <Inbox size={40} strokeWidth={1.5} />
                          <p className="text-xs font-bold uppercase tracking-widest italic">No requests found</p>
                        </div>
                      </td>
                    </tr>
                  )
                ) : (
                  filteredInspections.length > 0 ? (
                    filteredInspections.map(ins => (
                      <tr key={ins.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors group">
                        <td className="py-5 pl-4">
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{ins.id}</span>
                            <span className={`w-fit px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${getStatusStyle(ins.status)}`}>
                              {ins.status}
                            </span>
                          </div>
                        </td>
                        <td className="py-5">
                          <div className="flex items-center gap-3">
                             <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/5 text-emerald-500">
                                <Zap size={16} />
                             </div>
                             <span className="text-sm font-black text-slate-800 dark:text-white italic">{ins.plantName}</span>
                          </div>
                        </td>
                        <td className="py-5">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{ins.inspectorName}</span>
                            <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1 uppercase tracking-widest">
                               ID: {ins.inspectorId}
                            </span>
                          </div>
                        </td>
                        <td className="py-5">
                          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                            <Calendar size={14} className="text-slate-400" />
                            <span className="text-xs font-bold">{new Date(ins.createdAt).toLocaleDateString('th-TH')}</span>
                          </div>
                        </td>
                        <td className="py-5 pr-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => setSelectedInspection(ins)}
                              className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-[#74045F]/10 hover:text-[#74045F] transition-all"
                            >
                              <Eye size={16} />
                            </button>
                            {isDangerZoneUnlocked && (
                              <button 
                                onClick={() => {
                                  setItemToDelete({ id: ins.id, type: 'RESULT' });
                                  setIsDeleteModalOpen(true);
                                }}
                                className="p-2.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <Inbox size={40} strokeWidth={1.5} />
                          <p className="text-xs font-bold uppercase tracking-widest italic">No results found</p>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white dark:bg-[#030712] w-full max-w-lg rounded-[2.5rem] p-10 border border-white/10 shadow-2xl relative"
            >
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                <XCircle size={24} className="text-slate-300" />
              </button>

              <h3 className="text-2xl font-black text-slate-800 dark:text-white italic uppercase tracking-tighter mb-8 flex items-center gap-3">
                <Plus className="text-emerald-500" /> Create Inspection Task
              </h3>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Power Plant</label>
                  <select
                    value={newTask.plantId}
                    onChange={(e) => setNewTask({ ...newTask, plantId: e.target.value })}
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl text-sm font-bold italic outline-none focus:ring-2 focus:ring-[#74045F]/20"
                  >
                    <option value="">Select Target Plant</option>
                    {plants.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.office})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Assign To (Vendor/Inspector)</label>
                  <select
                    value={newTask.vendorId}
                    onChange={(e) => setNewTask({ ...newTask, vendorId: e.target.value })}
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl text-sm font-bold italic outline-none focus:ring-2 focus:ring-[#74045F]/20"
                  >
                    <option value="">Select Assignee</option>
                    {vendors.map(v => (
                      <option key={v.employeeId || v.username} value={v.employeeId || v.username}>{v.name} ({v.role})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Inspection Form</label>
                  <select
                    value={newTask.formId}
                    onChange={(e) => setNewTask({ ...newTask, formId: e.target.value })}
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl text-sm font-bold italic outline-none focus:ring-2 focus:ring-[#74045F]/20"
                  >
                    <option value="">Select Standard Form</option>
                    {forms.map(f => (
                      <option key={f.id} value={f.id}>{f.title}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Requested Date</label>
                    <input
                      type="date"
                      value={newTask.requestedDate}
                      onChange={(e) => setNewTask({ ...newTask, requestedDate: e.target.value })}
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#74045F]/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Task Details</label>
                  <textarea
                    value={newTask.details}
                    onChange={(e) => setNewTask({ ...newTask, details: e.target.value })}
                    placeholder="Enter specific instructions or scope..."
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl text-sm font-medium h-32 outline-none focus:ring-2 focus:ring-[#74045F]/20 resize-none"
                  />
                </div>

                <button
                  onClick={handleCreateTask}
                  disabled={!newTask.plantId || !newTask.vendorId}
                  className="w-full py-4 bg-[#74045F] dark:bg-[#C7911B] text-white font-black text-sm uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-[#74045F]/20 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] transition-all"
                >
                  Confirm Create Task
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Status Edit Modal */}
        {isStatusEditModalOpen && itemToEditStatus && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#030712] w-full max-w-sm rounded-[2.5rem] p-10 border border-white/10 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-amber-50 dark:bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 text-amber-500">
                <Settings2 size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-800 dark:text-white italic uppercase tracking-tighter">Manage Task Status</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-2 px-4">
                เปลี่ยนความคืบหน้าของคำร้อง <span className="text-[#74045F] dark:text-[#C7911B]">{itemToEditStatus.id}</span>
              </p>

              <div className="mt-6 text-left space-y-4">
                <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Assign Inspection Form</label>
                   <select 
                      value={selectedFormIdForRequest}
                      onChange={(e) => setSelectedFormIdForRequest(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-xl px-4 py-2.5 text-[11px] font-bold italic outline-none focus:ring-2 focus:ring-[#74045F]/20"
                   >
                      <option value="">-- ไม่นระบุแบบฟอร์ม (Inspector เลือกเอง) --</option>
                      {forms.map(f => (
                        <option key={f.id} value={f.id}>{f.title}</option>
                      ))}
                   </select>
                </div>
                
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Update Status (Action)</label>
                   <div className="grid grid-cols-1 gap-2">
                    {['PENDING', 'ACCEPTED', 'AWAITING_APPROVAL', 'COMPLETED', 'REJECTED'].map(status => (
                      <button
                        key={status}
                        onClick={() => updateRequestStatus(itemToEditStatus.id, status as InspectionRequest['status'], selectedFormIdForRequest)}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          itemToEditStatus.status === status
                            ? 'bg-[#74045F] text-white shadow-lg'
                            : 'bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsStatusEditModalOpen(false);
                  setItemToEditStatus(null);
                }}
                className="mt-6 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#030712] w-full max-w-md rounded-[2.5rem] p-8 border border-white/10 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-3xl bg-rose-50 flex items-center justify-center mb-6 text-rose-500">
                  <Trash2 size={32} />
                </div>
                <h3 className="text-xl font-black text-slate-800 dark:text-white italic uppercase tracking-tighter">Confirm Deletion?</h3>
                <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-2 leading-relaxed">
                   คุณต้องการลบข้อมูล{itemToDelete?.type === 'REQUEST' ? 'คำร้อง' : 'ผลการตรวจสอบ'}รหัส <span className="text-rose-500">{itemToDelete?.id}</span> ใช่หรือไม่? การดำเนินการนี้ไม่สามารถเรียกคืนได้
                </p>

                <div className="flex gap-3 w-full mt-10">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex-1 py-4 rounded-2xl bg-rose-500 text-white font-black text-xs uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* View Details Modal (Shared for both) */}
        {(selectedRequest || selectedInspection) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white dark:bg-[#030712] w-full max-w-2xl rounded-[3rem] p-0 border border-white/10 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 pb-4 flex justify-between items-start">
                 <div>
                    <h3 className="text-2xl font-black text-slate-800 dark:text-white italic uppercase tracking-tighter">
                      {selectedRequest ? 'Request Details' : 'Inspection Details'}
                    </h3>
                    <p className="text-xs text-slate-400 font-black uppercase tracking-widest">ID: {selectedRequest?.id || selectedInspection?.id}</p>
                 </div>
                 <button 
                  onClick={() => { setSelectedRequest(null); setSelectedInspection(null); }}
                  className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                 >
                   <XCircle size={24} className="text-slate-300" />
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto px-8 pb-10 space-y-8">
                 {selectedRequest && (
                   <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="p-5 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Plant Name</p>
                            <p className="text-sm font-black text-slate-800 dark:text-white italic">{selectedRequest.plantName}</p>
                         </div>
                         <div className="p-5 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                            <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusStyle(selectedRequest.status)}`}>
                              {selectedRequest.status}
                            </span>
                         </div>
                      </div>

                      <div className="p-6 rounded-[2rem] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Vendor / Subcontractor</p>
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                               <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center text-blue-600">
                                  <Building2 size={20} />
                               </div>
                               <div>
                                  <p className="text-sm font-black text-slate-800 dark:text-white italic">{selectedRequest.vendorName}</p>
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">ID: {selectedRequest.vendorId}</p>
                               </div>
                            </div>
                            {(selectedRequest.coordinatorName || selectedRequest.coordinatorPhone) && (
                              <div className="text-right">
                                <p className="text-[10px] font-black text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest italic">{selectedRequest.coordinatorName || 'Coordinator'}</p>
                                <p className="text-[10px] font-bold text-slate-400">{selectedRequest.coordinatorPhone}</p>
                              </div>
                            )}
                         </div>
                      </div>

                      <div className="p-6 rounded-[2rem] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">Request Details / Details</p>
                         <p className="text-sm text-slate-600 dark:text-slate-300 font-medium italic leading-relaxed">
                           {selectedRequest.details || 'ไม่พบข้อมูลรายละเอียดเพิ่มเติม'}
                         </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Appointment Date</p>
                            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center gap-2">
                               <Calendar size={14} className="text-slate-400" />
                               <span className="text-xs font-bold">{new Date(selectedRequest.requestedDate).toLocaleDateString('th-TH')}</span>
                            </div>
                         </div>
                         <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Created At</p>
                            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center gap-2">
                               <Clock size={14} className="text-slate-400" />
                               <span className="text-xs font-bold">{new Date(selectedRequest.createdAt).toLocaleString('th-TH')}</span>
                            </div>
                         </div>
                      </div>
                   </div>
                 )}

                 {selectedInspection && (
                   <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="p-5 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Plant Name</p>
                            <p className="text-sm font-black text-slate-800 dark:text-white italic">{selectedInspection.plantName}</p>
                         </div>
                         <div className="p-5 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                            <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusStyle(selectedInspection.status)}`}>
                              {selectedInspection.status}
                            </span>
                         </div>
                      </div>

                      <div className="p-6 rounded-[2rem] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Inspector Information</p>
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                               <User size={20} />
                            </div>
                            <div>
                               <p className="text-sm font-black text-slate-800 dark:text-white italic">{selectedInspection.inspectorName}</p>
                               <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">ID: {selectedInspection.inspectorId}</p>
                            </div>
                         </div>
                      </div>

                      {associatedRequest && (
                         <div className="p-6 rounded-[2rem] bg-[#74045F]/5 dark:bg-[#C7911B]/5 border border-[#74045F]/10 dark:border-[#C7911B]/10">
                           <h4 className="text-[10px] font-black text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest mb-3 italic">Original Vendor Request info</h4>
                           <div className="grid grid-cols-2 gap-4">
                              <div>
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Coordinator</p>
                                 <p className="text-sm font-black text-slate-800 dark:text-white italic">{associatedRequest.coordinatorName || '-'}</p>
                                 <p className="text-[10px] text-slate-500 font-bold">{associatedRequest.coordinatorPhone || '-'}</p>
                              </div>
                              <div className="text-right">
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Vendor Company</p>
                                 <p className="text-xs font-black text-[#74045F] dark:text-[#C7911B] italic">{associatedRequest.vendorName}</p>
                              </div>
                           </div>
                           {associatedRequest.details && (
                             <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Request Details</p>
                               <p className="text-[10px] text-slate-600 dark:text-slate-400 font-medium italic line-clamp-2">{associatedRequest.details}</p>
                             </div>
                           )}
                         </div>
                      )}

                      {/* Inspection Data Fields */}
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Inspection Data / ข้อมูลผลการตรวจสอบ</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                    <div key={key} className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                                       <p className="text-sm font-black text-slate-800 dark:text-white italic">{value || '-'}</p>
                                    </div>
                                 );
                              });
                           })()}
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Inspection Photos ({selectedInspection.photos.length})</p>
                        <div className="grid grid-cols-3 gap-2">
                           {selectedInspection.photos.map((photo, i) => (
                             <div key={i} className="aspect-video rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 group relative">
                                <img src={photo} className="w-full h-full object-cover" alt="" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                   <Download size={16} className="text-white" />
                                </div>
                             </div>
                           ))}
                        </div>
                      </div>

                      {/* Signatures */}
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-white/5">
                         <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-center">Inspector Signature</p>
                            {selectedInspection.inspectorSignature ? (
                              <div className="bg-white dark:bg-white/5 p-2 rounded-2xl border border-slate-100 dark:border-white/10">
                                 <img src={selectedInspection.inspectorSignature} className="max-h-24 mx-auto dark:invert dark:opacity-80" alt="Inspector Sig" />
                              </div>
                            ) : (
                              <div className="py-10 text-center bg-slate-50 dark:bg-white/5 rounded-2xl border border-dashed border-slate-200">
                                <p className="text-[10px] text-slate-400 font-bold">No Signature</p>
                              </div>
                            )}
                         </div>
                         <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-center">Manager Approval</p>
                            {selectedInspection.managerSignature ? (
                              <div className="bg-white dark:bg-white/5 p-2 rounded-2xl border border-slate-100 dark:border-white/10">
                                 <img src={selectedInspection.managerSignature} className="max-h-24 mx-auto dark:invert dark:opacity-80" alt="Manager Sig" />
                                 <p className="text-[8px] text-center font-bold text-slate-400 uppercase mt-1">{selectedInspection.managerName}</p>
                              </div>
                            ) : (
                              <div className="py-10 text-center bg-slate-50 dark:bg-white/5 rounded-2xl border border-dashed border-slate-200">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Pending Approval</p>
                              </div>
                            )}
                         </div>
                      </div>
                   </div>
                 )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
