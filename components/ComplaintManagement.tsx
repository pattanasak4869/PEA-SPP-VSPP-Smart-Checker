
import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, Search, Filter, Clock, CheckCircle2, 
  AlertCircle, ChevronLeft, ChevronRight, User, 
  Calendar, Trash2, Send, Lock, ShieldAlert,
  ArrowRight, MoreVertical, LayoutGrid, List as ListIcon,
  MessageCircle, Mail, Phone, Tag, Building2, Download, FileText, Award, Briefcase
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../contexts/LanguageContext';
import { safeParseLocalStorage, safeSetLocalStorage } from '../utils/localStorageUtils';
import { MOCK_USERS } from '../constants';
import { db } from '../src/lib/firebase';
import { doc, setDoc, deleteDoc, collection, query, onSnapshot } from 'firebase/firestore';

export interface Complaint {
  id: string;
  subject: string;
  description: string;
  category: 'TECHNICAL' | 'ACCOUNT' | 'DATA' | 'BUG' | 'OTHER';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';
  submittedBy: {
    name: string;
    employeeId: string;
    role: string;
    position?: string;
    email: string;
    phone: string;
    peaOffice?: string;
    department?: string;
  };
  submittedAt: string;
  updatedAt: string;
  responses: Array<{
    id: string;
    message: string;
    author: string;
    role: 'ADMIN' | 'SYSTEM' | 'USER';
    timestamp: string;
  }>;
}

const CATEGORIES = {
  TECHNICAL: { label: 'ปัญหาทางเทคนิค', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  ACCOUNT: { label: 'ปัญหาบัญชีผู้ใช้', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  DATA: { label: 'ปัญหาข้อมูล', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  BUG: { label: 'พบจุดผิดสังเกต', color: 'text-rose-500', bg: 'bg-rose-500/10' },
  OTHER: { label: 'อื่นๆ', color: 'text-slate-500', bg: 'bg-slate-500/10' },
};

const PRIORITIES = {
  LOW: { label: 'ต่ำ', color: 'text-slate-400', bg: 'bg-slate-100' },
  MEDIUM: { label: 'ปกติ', color: 'text-sky-500', bg: 'bg-sky-50' },
  HIGH: { label: 'สูง', color: 'text-orange-500', bg: 'bg-orange-50' },
  URGENT: { label: 'ด่วนมาก', color: 'text-rose-500', bg: 'bg-rose-50 animate-pulse' },
};

// Activity mapping to AlertCircle for status icon
const Activity = AlertCircle;

const STATUSES = {
  PENDING: { label: 'รอดำเนินการ', icon: <Clock size={14} />, color: 'text-slate-500', bg: 'bg-slate-50' },
  INVESTIGATING: { label: 'กำลังตรวจสอบ', icon: <Activity size={14} />, color: 'text-amber-500', bg: 'bg-amber-50' },
  RESOLVED: { label: 'แก้ไขแล้ว', icon: <CheckCircle2 size={14} />, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  CLOSED: { label: 'ปิดรายการ', icon: <Lock size={14} />, color: 'text-indigo-500', bg: 'bg-indigo-50' },
};

interface ComplaintManagementProps {
  isDangerZoneUnlocked: boolean;
  setIsDangerZoneUnlocked: (val: boolean) => void;
  setIsUnlockModalOpen: (val: boolean) => void;
}

export const ComplaintManagement: React.FC<ComplaintManagementProps> = ({ 
  isDangerZoneUnlocked, 
  setIsDangerZoneUnlocked, 
  setIsUnlockModalOpen 
}) => {
  const { t } = useLanguage();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [complaintToDelete, setComplaintToDelete] = useState<Complaint | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const itemsPerPage = 8;

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Initialize with Firestore query and subscribe to real-time sync updates
  useEffect(() => {
    const q = query(collection(db, 'complaints'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fbComplaints: Complaint[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        fbComplaints.push({
          ...data,
          id: doc.id,
          submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate().toISOString() : data.submittedAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        } as Complaint);
      });
      
      // Sort complaints by submittedAt descending
      fbComplaints.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      setComplaints(fbComplaints);
      safeSetLocalStorage('app_complaints', fbComplaints, true);
    }, (error) => {
      console.error("Firestore Complaints Sync Error:", error);
    });

    return () => unsubscribe();
  }, []);

  const saveToStorage = (data: Complaint[]) => {
    setComplaints(data);
    safeSetLocalStorage('app_complaints', data);
  };

  const handleUpdateStatus = async (id: string, newStatus: Complaint['status']) => {
    const target = complaints.find(c => c.id === id);
    if (!target) return;
    const updatedComplaint = { ...target, status: newStatus, updatedAt: new Date().toISOString() };
    
    try {
      await setDoc(doc(db, 'complaints', id), updatedComplaint);
    } catch (err) {
      console.error("Firestore update status error:", err);
    }

    const updated = complaints.map(c => c.id === id ? updatedComplaint : c);
    saveToStorage(updated);
    if (selectedComplaint?.id === id) {
      setSelectedComplaint(updatedComplaint);
    }
  };

  const handleAddResponse = async (id: string) => {
    if (!replyMessage.trim()) return;
    
    const target = complaints.find(c => c.id === id);
    if (!target) return;

    const newResponse = {
      id: `R-${Date.now()}`,
      message: replyMessage,
      author: 'Admin',
      role: 'ADMIN' as const,
      timestamp: new Date().toISOString()
    };

    const updatedComplaint = { 
      ...target, 
      responses: [...(target.responses || []), newResponse],
      updatedAt: new Date().toISOString() 
    };

    try {
      await setDoc(doc(db, 'complaints', id), updatedComplaint);
    } catch (err) {
      console.error("Firestore add reply error:", err);
    }

    const updated = complaints.map(c => c.id === id ? updatedComplaint : c);
    saveToStorage(updated);
    setReplyMessage('');
    if (selectedComplaint?.id === id) {
      setSelectedComplaint(updatedComplaint);
    }
  };

  const handleDeleteComplaint = (id: string) => {
    if (!isDangerZoneUnlocked) {
      showToast('กรุณาปลดล็อก Danger Zone ก่อนดำเนินการลบข้อมูล', 'error');
      return;
    }
    const complaint = complaints.find(c => c.id === id);
    if (!complaint) return;

    setComplaintToDelete(complaint);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (complaintToDelete) {
      try {
        await deleteDoc(doc(db, 'complaints', complaintToDelete.id));
      } catch (err) {
        console.error("Firestore delete complaint error:", err);
      }

      const updated = complaints.filter(c => c.id !== complaintToDelete.id);
      saveToStorage(updated);
      
      // Handle pagination if page becomes empty
      const newTotalPages = Math.ceil(updated.length / itemsPerPage);
      if (currentPage > newTotalPages && newTotalPages > 0) {
        setCurrentPage(newTotalPages);
      }

      if (selectedComplaint?.id === complaintToDelete.id) {
        setSelectedComplaint(null);
      }
      
      setIsDeleteModalOpen(false);
      setComplaintToDelete(null);
      showToast('ลบข้อร้องเรียนเรียบร้อยแล้ว');
    }
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Date', 'Subject', 'Category', 'Priority', 'Status', 'Submitted By', 'Role', 'Email', 'Phone'];
    const csvContent = [
      headers.join(','),
      ...complaints.map(c => [
        c.id,
        new Date(c.submittedAt).toLocaleString('th-TH'),
        `"${c.subject}"`,
        CATEGORIES[c.category].label,
        PRIORITIES[c.priority].label,
        STATUSES[c.status].label,
        `"${c.submittedBy.name}"`,
        c.submittedBy.role,
        c.submittedBy.email,
        c.submittedBy.phone
      ].join(','))
    ].join('\n');

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `complaint_reports_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredComplaints = complaints.filter(c => {
    const matchesSearch = 
      c.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.submittedBy.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchesCategory = categoryFilter === 'ALL' || c.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const totalPages = Math.ceil(filteredComplaints.length / itemsPerPage);
  const currentComplaints = filteredComplaints.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-8 animate-fade-in pb-10 mt-10">
      {/* Header & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
            <MessageSquare className="text-[#74045F] dark:text-[#C7911B]" size={32} />
            จัดการข้อร้องเรียน
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">จัดการแก้ไขปัญหาและรับเรื่องร้องเรียนจากผู้ใช้งานในระบบ</p>
        </div>
        
        <div className="flex flex-wrap items-center justify-start md:justify-end gap-3 lg:gap-4">
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

          <button 
            onClick={handleExportCSV}
            className="bg-gradient-to-r from-[#74045F] to-[#C7911B] text-white font-bold py-3 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#74045F]/20 dark:shadow-[#C7911B]/20 transition-all active:scale-95 group whitespace-nowrap"
          >
            <Download size={18} className="group-hover:scale-110 transition-transform" />
            พิมพ์รายงานระบบ
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-gray-200 dark:border-white/5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500"><MessageSquare size={24} /></div>
            <div>
                <div className="text-[10px] font-bold text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest leading-none mb-1">ทั้งหมด</div>
                <div className="text-xl font-black text-slate-800 dark:text-white">{complaints.length} เรื่อง</div>
            </div>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-gray-200 dark:border-white/5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500"><Clock size={24} /></div>
            <div>
                <div className="text-[10px] font-bold text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest leading-none mb-1">รอดำเนินการ</div>
                <div className="text-xl font-black text-slate-800 dark:text-white">{complaints.filter(c => c.status === 'PENDING').length} เรื่อง</div>
            </div>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-gray-200 dark:border-white/5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500"><Search size={24} /></div>
            <div>
                <div className="text-[10px] font-bold text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest leading-none mb-1">กำลังตรวจสอบ</div>
                <div className="text-xl font-black text-slate-800 dark:text-white">{complaints.filter(c => c.status === 'INVESTIGATING').length} เรื่อง</div>
            </div>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-gray-200 dark:border-white/5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500"><CheckCircle2 size={24} /></div>
            <div>
                <div className="text-[10px] font-bold text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest leading-none mb-1">แก้ไขแล้ว</div>
                <div className="text-xl font-black text-slate-800 dark:text-white">{complaints.filter(c => c.status === 'RESOLVED').length} เรื่อง</div>
            </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Left Column: List */}
        <div className="lg:col-span-5 space-y-6">
          {/* Search & Filters */}
          <div className="p-6 bg-white dark:bg-[#030712] border-2 border-slate-100 dark:border-white/5 rounded-[2rem] shadow-sm space-y-4">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
              <input 
                type="text"
                placeholder={t('admin.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-100 dark:bg-white/5 border-none focus:ring-2 focus:ring-indigo-500/20 py-3.5 pl-12 pr-4 rounded-xl text-sm transition-all"
              />
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {['ALL', 'PENDING', 'INVESTIGATING', 'RESOLVED', 'CLOSED'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                    statusFilter === status 
                    ? 'bg-[#74045F] dark:bg-[#C7911B] text-white shadow-lg shadow-indigo-500/20' 
                    : 'bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10'
                  }`}
                >
                  {status === 'ALL' ? 'ทั้งหมด' : STATUSES[status as keyof typeof STATUSES].label}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-white/10">
            {currentComplaints.length > 0 ? (
              currentComplaints.map((complaint) => (
                <motion.div
                  key={complaint.id}
                  layoutId={complaint.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedComplaint(complaint)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedComplaint(complaint);
                    }
                  }}
                  className={`w-full text-left p-6 rounded-[2rem] border-2 transition-all group cursor-pointer ${
                    selectedComplaint?.id === complaint.id
                    ? 'bg-[#74045F] border-[#74045F] shadow-xl shadow-[#74045F]/20 dark:bg-[#C7911B] dark:border-[#C7911B] dark:shadow-xl dark:shadow-[#C7911B]/20'
                    : 'bg-white dark:bg-[#030712] border-slate-100 dark:border-white/5 hover:border-[#74045F]/30 dark:hover:border-[#74045F]/30'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-wrap gap-1">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        selectedComplaint?.id === complaint.id
                        ? 'bg-white/20 text-white'
                        : CATEGORIES[complaint.category].bg + ' ' + CATEGORIES[complaint.category].color
                      }`}>
                        {CATEGORIES[complaint.category].label}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        selectedComplaint?.id === complaint.id
                        ? 'bg-white/20 text-white'
                        : PRIORITIES[complaint.priority].bg + ' ' + PRIORITIES[complaint.priority].color
                      }`}>
                        {PRIORITIES[complaint.priority].label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteComplaint(complaint.id);
                        }}
                        className={`p-1.5 rounded-lg transition-all ${
                          selectedComplaint?.id === complaint.id
                          ? 'bg-white/20 text-white hover:bg-white/30'
                          : isDangerZoneUnlocked
                            ? 'text-rose-500 hover:bg-rose-50'
                            : 'text-slate-300 opacity-40 cursor-not-allowed'
                        }`}
                        title={isDangerZoneUnlocked ? "ลบ" : " Danger Zone ถูกล็อก"}
                      >
                        {isDangerZoneUnlocked ? <Trash2 size={12} /> : <Lock size={10} />}
                      </button>
                      <span className={`text-[10px] font-black uppercase tracking-tighter ${
                         selectedComplaint?.id === complaint.id ? 'text-white/80' : 'text-slate-400'
                       }`}>
                         {complaint.id}
                      </span>
                    </div>
                  </div>
                  
                  <h3 className={`text-sm font-black mb-2 line-clamp-1 italic ${
                    selectedComplaint?.id === complaint.id ? 'text-white' : 'text-slate-800 dark:text-white'
                  }`}>
                    {complaint.subject}
                  </h3>
                  
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
                        selectedComplaint?.id === complaint.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-500'
                      }`}>
                        {complaint.submittedBy.name[0]}
                      </div>
                      <div>
                        <p className={`text-[10px] font-bold leading-none mb-1 ${
                          selectedComplaint?.id === complaint.id ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                        }`}>
                          {complaint.submittedBy.name}
                        </p>
                        <p className={`text-[8px] font-black uppercase tracking-widest ${
                          selectedComplaint?.id === complaint.id ? 'text-white/60' : 'text-slate-400'
                        }`}>
                          {complaint.submittedBy.role}
                        </p>
                      </div>
                    </div>
                    
                    <span className={`text-[10px] font-bold ${
                      selectedComplaint?.id === complaint.id ? 'text-white/60' : 'text-slate-400'
                    }`}>
                      {new Date(complaint.submittedAt).toLocaleDateString('th-TH')}
                    </span>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-20 bg-slate-50 dark:bg-white/5 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-white/10">
                <MessageSquare className="mx-auto text-slate-300 mb-4" size={48} />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs italic">ไม่พบรายการที่ระบุ</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Details */}
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {selectedComplaint ? (
              <motion.div
                key={selectedComplaint.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-white dark:bg-[#030712] border-2 border-slate-100 dark:border-white/5 rounded-[2.5rem] shadow-xl shadow-slate-200/20 dark:shadow-none overflow-hidden h-full flex flex-col"
              >
                {/* Detail Header */}
                <div className="p-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${
                          CATEGORIES[selectedComplaint.category].bg + ' ' + CATEGORIES[selectedComplaint.category].color
                        }`}>
                          {CATEGORIES[selectedComplaint.category].label}
                        </span>
                        <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${
                          PRIORITIES[selectedComplaint.priority].bg + ' ' + PRIORITIES[selectedComplaint.priority].color
                        }`}>
                          {PRIORITIES[selectedComplaint.priority].label}
                        </span>
                      </div>
                      <h2 className="text-2xl font-black text-slate-800 dark:text-white italic leading-tight">
                        {selectedComplaint.subject}
                      </h2>
                      <div className="flex items-center gap-4 mt-4 text-xs text-slate-400 font-bold uppercase tracking-widest">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={14} />
                          {new Date(selectedComplaint.submittedAt).toLocaleString('th-TH')}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <User size={14} />
                          {selectedComplaint.id}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-2 rounded-2xl shadow-sm border border-slate-100 dark:border-white/5">
                      {['INVESTIGATING', 'RESOLVED', 'CLOSED'].map((status) => (
                        <button
                          key={status}
                          onClick={() => handleUpdateStatus(selectedComplaint.id, status as Complaint['status'])}
                          className={`flex items-center justify-center p-2.5 rounded-xl transition-all ${
                            selectedComplaint.status === status
                            ? STATUSES[status as keyof typeof STATUSES].bg + ' ' + STATUSES[status as keyof typeof STATUSES].color
                            : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
                          }`}
                          title={STATUSES[status as keyof typeof STATUSES].label}
                        >
                          {STATUSES[status as keyof typeof STATUSES].icon}
                        </button>
                      ))}
                      <button 
                        onClick={() => handleDeleteComplaint(selectedComplaint.id)}
                        disabled={!isDangerZoneUnlocked}
                        className={`p-2.5 rounded-xl transition-all ${
                          isDangerZoneUnlocked 
                          ? 'text-rose-500 hover:bg-rose-50' 
                          : 'text-slate-300 cursor-not-allowed opacity-50'
                        }`}
                        title={isDangerZoneUnlocked ? "ลบข้อมูล" : "กรุณาปลดล็อก Danger Zone เพื่อลบข้อมูล"}
                      >
                        {isDangerZoneUnlocked ? <Trash2 size={16} /> : <Lock size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-white/10">
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">รายละเอียดเรื่องร้องเรียน</h4>
                    <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/5">
                       <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                         {selectedComplaint.description}
                       </p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">ข้อมูลผู้ร้องเรียน</h4>
                      <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/5 space-y-3">
                        <div className="flex items-center gap-3">
                          <User size={16} className="text-indigo-500" />
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{selectedComplaint.submittedBy.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Tag size={16} className="text-amber-500" />
                          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{selectedComplaint.submittedBy.role}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Award size={16} className="text-purple-500" />
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">ตำแหน่ง</span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{selectedComplaint.submittedBy.position}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Building2 size={16} className="text-[#C7911B]" />
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">สังกัด</span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{selectedComplaint.submittedBy.peaOffice}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Briefcase size={16} className="text-[#74045F]" />
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">กอง/แผนก</span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{selectedComplaint.submittedBy.department}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <User size={16} className="text-emerald-500" />
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">รหัสพนักงาน</span>
                            <span className="text-xs font-bold text-slate-500">{selectedComplaint.submittedBy.employeeId}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">ช่องทางติดต่อ</h4>
                      <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/5 space-y-3">
                        <div className="flex items-center gap-3">
                          <Mail size={16} className="text-sky-500" />
                          <span className="text-xs font-bold text-slate-500">{selectedComplaint.submittedBy.email}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Phone size={16} className="text-rose-500" />
                          <span className="text-xs font-bold text-slate-500">{selectedComplaint.submittedBy.phone}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Conversation */}
                  <div className="space-y-6 pt-6 border-t border-slate-100 dark:border-white/5">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">การตอบกลับ ({selectedComplaint.responses.length})</h4>
                    
                    <div className="space-y-6">
                      {selectedComplaint.responses.map((res) => (
                        <div key={res.id} className={`flex ${res.role === 'ADMIN' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] p-6 rounded-3xl ${
                            res.role === 'ADMIN' 
                            ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 rounded-tr-none' 
                            : 'bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-white rounded-tl-none'
                          }`}>
                            <p className="text-sm font-medium mb-3 leading-relaxed">{res.message}</p>
                            <div className={`flex items-center gap-2 text-[8px] font-black uppercase tracking-widest ${
                              res.role === 'ADMIN' ? 'text-white/60' : 'text-slate-400'
                            }`}>
                              <span>{res.author}</span>
                              <span className="opacity-40">•</span>
                              <span>{new Date(res.timestamp).toLocaleTimeString('th-TH')}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {selectedComplaint.responses.length === 0 && (
                        <p className="text-center py-6 text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] italic underline decoration-slate-200 decoration-wavy underline-offset-8">ยังไม่มีการตอบกลับในขณะนี้</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Reply Bar */}
                <div className="p-6 bg-slate-50 dark:bg-white/[0.01] border-t border-slate-100 dark:border-white/5">
                   <div className="relative group">
                     <textarea 
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="พิมพ์ข้อความตอบกลับเพื่อช่วยเหลือผู้ใช้งาน..."
                        className="w-full bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-white/5 focus:border-indigo-500 transition-all rounded-3xl p-5 pr-16 text-sm font-medium resize-none shadow-inner h-24 scrollbar-none"
                     />
                     <button 
                        onClick={() => handleAddResponse(selectedComplaint.id)}
                        disabled={!replyMessage.trim()}
                        className={`absolute right-4 bottom-4 w-12 h-12 flex items-center justify-center rounded-2xl transition-all ${
                          replyMessage.trim() 
                          ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 active:scale-95' 
                          : 'bg-slate-100 dark:bg-white/10 text-slate-400'
                        }`}
                     >
                       <Send size={20} />
                     </button>
                   </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center bg-white dark:bg-[#030712] border-2 border-slate-100 dark:border-white/5 rounded-[2.5rem] p-12 text-center group">
                 <div className="w-32 h-32 bg-[#74045f]/5 dark:bg-[#C7911B]/5 rounded-[2rem] flex items-center justify-center text-[#74045F] dark:text-[#C7911B] mb-8 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                   <MessageCircle size={64} />
                 </div>
                 <h2 className="text-2xl font-black text-slate-800 dark:text-white italic mb-4">Complaint Board</h2>
                 <p className="text-slate-500 dark:text-slate-400 font-medium max-w-sm mx-auto leading-relaxed italic underline decoration-slate-100 decoration-wavy underline-offset-8">
                   เลือกเรื่องร้องเรียนในรายการซ้ายมือ <br/> เพื่อตรวจสอบรายละเอียดและการจัดการ
                 </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 xl:left-72 xl:top-[65px] z-[250] flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={() => setIsDeleteModalOpen(false)}
            />
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass-panel w-full max-w-sm bg-white dark:bg-[#030712] rounded-3xl overflow-hidden shadow-2xl relative z-10 p-8 text-center"
            >
              <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2 italic">ยืนยันการลบข้อมูล?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 italic">
                คุณแน่ใจหรือไม่ว่าต้องการลบข้อร้องเรียน <br/>
                <span className="font-bold text-slate-900 dark:text-white">#{complaintToDelete?.id}</span> <br/>
                ออกจากระบบ? การกระทำนี้ไม่สามารถย้อนกลับได้
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 font-bold py-3 rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-[10px]"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={confirmDelete}
                  className="bg-rose-500 text-white font-bold py-3 rounded-2xl shadow-lg shadow-rose-500/20 active:scale-95 transition-all uppercase tracking-widest text-[10px]"
                >
                  ยืนยันลบข้อมูล
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`fixed bottom-8 right-8 z-[1000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 font-bold border ${
              toast.type === 'success' 
              ? 'bg-emerald-500 text-white border-emerald-400 shadow-emerald-500/20' 
              : 'bg-rose-500 text-white border-rose-400 shadow-rose-500/20'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="text-sm uppercase tracking-wider">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
