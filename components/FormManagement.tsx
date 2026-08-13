
import React, { useState, useEffect } from 'react';
import { 
  FileText, Plus, Search, Filter, MoreVertical, Edit2, Trash2, 
  Archive, CheckCircle2, AlertCircle, X, ChevronDown, ChevronUp,
  Layout, Type, Hash, Calendar, List, CheckSquare, Save, Copy,
  Image as ImageIcon, FileUp, MapPin, Grid, List as ListIcon, Clock, User as UserIcon,
  Eye, PlayCircle, ClipboardCheck, Lock, ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../contexts/LanguageContext';
import { safeParseLocalStorage, safeSetLocalStorage } from '../utils/localStorageUtils';
import { db } from '../src/lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { PaginationControls } from './PaginationControls';

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea' | 'image' | 'file' | 'gps';

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: string[]; // For select type
}

export type FormStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED';

export interface InspectionForm {
  id: string;
  title: string;
  description: string;
  version: string;
  status: FormStatus;
  targetCategory?: string; // e.g. 'SOLAR', 'WIND', 'HYDRO'
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  fields: FormField[];
}

const FIELD_TYPE_CONFIG: Record<FieldType, { icon: React.ReactNode, label: string }> = {
  text: { icon: <Type size={16} />, label: 'ข้อความ' },
  number: { icon: <Hash size={16} />, label: 'ตัวเลข' },
  date: { icon: <Calendar size={16} />, label: 'วันที่' },
  select: { icon: <List size={16} />, label: 'ตัวเลือก (Dropdown)' },
  checkbox: { icon: <CheckSquare size={16} />, label: 'ตัวเลือกหลายรายการ' },
  textarea: { icon: <Layout size={16} />, label: 'ข้อความยาว' },
  image: { icon: <ImageIcon size={16} />, label: 'รูปภาพ' },
  file: { icon: <FileUp size={16} />, label: 'ไฟล์เอกสาร' },
  gps: { icon: <MapPin size={16} />, label: 'พิกัด GPS' },
};

export const FormManagement: React.FC<{ 
  isDangerZoneUnlocked: boolean;
  setIsDangerZoneUnlocked: (val: boolean) => void;
  setIsUnlockModalOpen: (val: boolean) => void;
  userProfile?: any;
}> = ({ isDangerZoneUnlocked, setIsDangerZoneUnlocked, setIsUnlockModalOpen, userProfile }) => {
  const { t } = useLanguage();
  const [forms, setForms] = useState<InspectionForm[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<InspectionForm | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [formToDelete, setFormToDelete] = useState<InspectionForm | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [formToPreview, setFormToPreview] = useState<InspectionForm | null>(null);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [formToTest, setFormToTest] = useState<InspectionForm | null>(null);
  const [testSubmission, setTestSubmission] = useState<any>(null);
  const [testFormValues, setTestFormValues] = useState<Record<string, any>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Batch selection & deletion states
  const [selectedFormIds, setSelectedFormIds] = useState<string[]>([]);
  const [batchDeleteType, setBatchDeleteType] = useState<'SELECTED' | 'ALL' | null>(null);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);

  const currentUser = userProfile || safeParseLocalStorage<any>('user_profile', null);
  const isAdmin = currentUser?.role === 'ADMIN';

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Form Editor State
  const [formData, setFormData] = useState<Partial<InspectionForm>>({
    title: '',
    description: '',
    status: 'DRAFT',
    fields: []
  });

  useEffect(() => {
    // Real-time Firestore sync
    const q = query(collection(db, 'inspectionForms'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const firestoreForms: InspectionForm[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        firestoreForms.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        } as InspectionForm);
      });

      if (snapshot.empty) {
        // If Firestore is empty, seed the initial mockup of SPP Form so the DB is initialized
        const initialForm: InspectionForm = {
          id: 'form-1',
          title: 'แบบฟอร์มตรวจสอบคุณภาพไฟฟ้า (PQ)',
          description: 'แบบฟอร์มมาตรฐานสำหรับการเข้าตรวจสอบคุณภาพไฟฟ้า ณ โรงไฟฟ้า SPP/Vender',
          version: '1.0',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'System Admin',
          fields: [
            { id: 'f1', label: 'ชื่อโรงไฟฟ้า', type: 'text', required: true, placeholder: 'ระบุชื่อโรงไฟฟ้า' },
            { id: 'f2', label: 'วันที่เริ่มงาน', type: 'date', required: true },
            { id: 'f3', label: 'ระดับแรงดัน', type: 'select', required: true, options: ['115kV', '22kV', '33kV'] }
          ]
        };
        try {
          const formRef = doc(db, 'inspectionForms', initialForm.id);
          await setDoc(formRef, initialForm);
        } catch (e) {
          console.error("Failed to seed initial form to Firestore:", e);
        }
      } else {
        setForms(firestoreForms);
        safeSetLocalStorage('app_inspection_forms', firestoreForms, true);
      }
    }, (error) => {
      console.error("Firestore Forms Sync Error:", error);
    });

    return () => unsubscribe();
  }, []);

  const saveToLocalStorage = (updatedForms: InspectionForm[]) => {
    setForms(updatedForms);
    safeSetLocalStorage('app_inspection_forms', updatedForms);
  };

  const handleCreateNew = () => {
    setEditingForm(null);
    setFormData({
      title: '',
      description: '',
      status: 'DRAFT',
      fields: []
    });
    setIsModalOpen(true);
  };

  const handleEdit = (form: InspectionForm) => {
    setEditingForm(form);
    setFormData({ ...form });
    setIsModalOpen(true);
  };

  const handleDeleteClick = (form: InspectionForm) => {
    if (!isAdmin) {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์ลบข้อมูล', 'error');
      return;
    }
    if (!isDangerZoneUnlocked) {
      showToast('กรุณาปลดล็อก Danger Zone ก่อนดำเนินการลบข้อมูล', 'error');
      return;
    }
    setFormToDelete(form);
    setIsDeleteModalOpen(true);
  };

  const handlePreviewClick = (form: InspectionForm) => {
    setFormToPreview(form);
    setIsPreviewModalOpen(true);
  };

  const handleTestClick = (form: InspectionForm) => {
    setFormToTest(form);
    setTestFormValues({});
    setTestSubmission(null);
    setIsTestModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!isAdmin) {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์ลบข้อมูล', 'error');
      return;
    }
    if (!isDangerZoneUnlocked) {
      showToast('กรุณาปลดล็อก Danger Zone ก่อนดำเนินการลบข้อมูล', 'error');
      return;
    }
    if (formToDelete) {
      const updated = forms.filter(f => f.id !== formToDelete.id);
      setForms(updated);
      safeSetLocalStorage('app_inspection_forms', updated);

      try {
        await deleteDoc(doc(db, 'inspectionForms', formToDelete.id));
        showToast('ลบแบบฟอร์มสำเร็จ', 'success');
      } catch (err) {
        console.error("Firestore Form Delete Error:", err);
        showToast('ลบแบบฟอร์มในฐานข้อมูลล้มเหลว', 'error');
      }

      setSelectedFormIds(prev => prev.filter(id => id !== formToDelete.id));
      setIsDeleteModalOpen(false);
      setFormToDelete(null);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedFormIds.length === filteredForms.length && filteredForms.length > 0) {
      setSelectedFormIds([]);
    } else {
      setSelectedFormIds(filteredForms.map(f => f.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedFormIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleOpenBatchDeleteModal = (type: 'SELECTED' | 'ALL') => {
    if (!isAdmin) {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์ลบข้อมูล', 'error');
      return;
    }
    if (!isDangerZoneUnlocked) {
      showToast('กรุณาปลดล็อก Danger Zone ก่อนดำเนินการลบข้อมูล', 'error');
      return;
    }
    if (type === 'SELECTED' && selectedFormIds.length === 0) {
      showToast('กรุณาเลือกรายการแบบฟอร์มที่ต้องการลบอย่างน้อย 1 รายการ', 'error');
      return;
    }
    if (type === 'ALL' && filteredForms.length === 0) {
      showToast('ไม่พบรายการแบบฟอร์มที่ต้องการลบ', 'error');
      return;
    }
    setBatchDeleteType(type);
    setIsBatchDeleteModalOpen(true);
  };

  const handleConfirmBatchDelete = async () => {
    if (!isAdmin) {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์ลบข้อมูล', 'error');
      setIsBatchDeleteModalOpen(false);
      return;
    }
    if (!isDangerZoneUnlocked) {
      showToast('กรุณาปลดล็อก Danger Zone ก่อนดำเนินการลบข้อมูล', 'error');
      setIsBatchDeleteModalOpen(false);
      return;
    }

    let itemsToDelete: InspectionForm[] = [];
    if (batchDeleteType === 'SELECTED') {
      itemsToDelete = forms.filter(f => selectedFormIds.includes(f.id));
    } else if (batchDeleteType === 'ALL') {
      itemsToDelete = [...filteredForms];
    }

    if (itemsToDelete.length === 0) {
      setIsBatchDeleteModalOpen(false);
      return;
    }

    const idsToRemove = new Set(itemsToDelete.map(f => f.id));
    const updatedForms = forms.filter(f => !idsToRemove.has(f.id));

    setForms(updatedForms);
    safeSetLocalStorage('app_inspection_forms', updatedForms);

    try {
      for (const form of itemsToDelete) {
        await deleteDoc(doc(db, 'inspectionForms', form.id));
      }
    } catch (err) {
      console.error("Batch delete forms error:", err);
    }

    showToast(`ลบแบบฟอร์มเรียบร้อยแล้วจำนวน ${itemsToDelete.length} รายการ`, 'success');
    setSelectedFormIds(prev => prev.filter(id => !idsToRemove.has(id)));
    setIsBatchDeleteModalOpen(false);
    setBatchDeleteType(null);
  };

  const toggleStatus = async (form: InspectionForm) => {
    let nextStatus: FormStatus = 'ACTIVE';
    if (form.status === 'ACTIVE') nextStatus = 'ARCHIVED';
    else if (form.status === 'ARCHIVED') nextStatus = 'DRAFT';

    const updatedForm = {
      ...form,
      status: nextStatus,
      updatedAt: new Date().toISOString()
    };

    const updated = forms.map(f => f.id === form.id ? updatedForm : f);
    setForms(updated);
    safeSetLocalStorage('app_inspection_forms', updated);

    try {
      const formRef = doc(db, 'inspectionForms', form.id);
      await setDoc(formRef, updatedForm, { merge: true });
      showToast(`อัปเดตสถานะเป็น ${nextStatus} สำเร็จ`, 'success');
    } catch (err) {
      console.error("Firestore Status Update Error:", err);
      showToast('ไม่สามารถบันทึกสถานะลงฐานข้อมูลได้', 'error');
    }
  };

  const handleAddField = () => {
    const newField: FormField = {
      id: `field-${Date.now()}`,
      label: '',
      type: 'text',
      required: false,
      placeholder: ''
    };
    setFormData({
      ...formData,
      fields: [...(formData.fields || []), newField]
    });
  };

  const removeField = (index: number) => {
    const updatedFields = [...(formData.fields || [])];
    updatedFields.splice(index, 1);
    setFormData({ ...formData, fields: updatedFields });
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    const updatedFields = [...(formData.fields || [])];
    updatedFields[index] = { ...updatedFields[index], ...updates };
    setFormData({ ...formData, fields: updatedFields });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;

    let targetForm: InspectionForm;

    if (editingForm) {
      targetForm = {
        ...editingForm,
        ...formData,
        updatedAt: new Date().toISOString()
      } as InspectionForm;

      const updated = forms.map(f => f.id === editingForm.id ? targetForm : f);
      setForms(updated);
      safeSetLocalStorage('app_inspection_forms', updated);
    } else {
      targetForm = {
        id: `form-${Date.now()}`,
        title: formData.title || '',
        description: formData.description || '',
        version: '1.0',
        status: formData.status as FormStatus || 'DRAFT',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'Admin',
        fields: formData.fields as FormField[] || []
      };

      const updated = [targetForm, ...forms];
      setForms(updated);
      safeSetLocalStorage('app_inspection_forms', updated);
    }

    try {
      const formRef = doc(db, 'inspectionForms', targetForm.id);
      await setDoc(formRef, targetForm);
      showToast('บันทึกแบบฟอร์มลงระบบสำเร็จ', 'success');
    } catch (err) {
      console.error("Firestore Form Submit Error:", err);
      showToast('บันทึกข้อมูลแบบฟอร์มลงในฐานข้อมูลไม่สำเร็จ', 'error');
    }

    setIsModalOpen(false);
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const filteredForms = forms.filter(f => 
    f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedForms = filteredForms.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusColor = (status: FormStatus) => {
    switch (status) {
      case 'ACTIVE': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'DRAFT': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'ARCHIVED': return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };

  const handleResetForms = async () => {
    if (!isDangerZoneUnlocked) return;
    if (window.confirm('คำเตือน: คุณแน่ใจหรือไม่ว่าต้องการล้างแบบฟอร์มทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
      const initialForms: InspectionForm[] = [
        {
          id: 'form-1',
          title: 'แบบฟอร์มตรวจสอบคุณภาพไฟฟ้า (PQ)',
          description: 'แบบฟอร์มมาตรฐานสำหรับการเข้าตรวจสอบคุณภาพไฟฟ้า ณ โรงไฟฟ้า SPP/Vender',
          version: '1.0',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'System Admin',
          fields: [
            { id: 'f1', label: 'ชื่อโรงไฟฟ้า', type: 'text', required: true, placeholder: 'ระบุชื่อโรงไฟฟ้า' },
            { id: 'f2', label: 'วันที่เริ่มงาน', type: 'date', required: true },
            { id: 'f3', label: 'ระดับแรงดัน', type: 'select', required: true, options: ['115kV', '22kV', '33kV'] }
          ]
        }
      ];
      setForms(initialForms);
      safeSetLocalStorage('app_inspection_forms', initialForms);

      try {
        // Delete older forms in Firestore
        for (const f of forms) {
          if (f.id !== 'form-1') {
            await deleteDoc(doc(db, 'inspectionForms', f.id));
          }
        }
        // Write standard initial form
        await setDoc(doc(db, 'inspectionForms', 'form-1'), initialForms[0]);
        showToast('ล้างข้อมูลและรีเซ็ตค่าเริ่มต้นสำเร็จ', 'success');
      } catch (err) {
        console.error("Firestore Forms Reset Error:", err);
        showToast('รีเซ็ตข้อมูลในฐานข้อมูลไม่สำเร็จ', 'error');
      }
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10 mt-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
            <FileText className="text-[#74045F] dark:text-[#C7911B]" size={32} />
            จัดการแบบฟอร์ม
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">ออกแบบและบริหารจัดการแบบฟอร์มดิจิทัลสำหรับงานตรวจสอบ</p>
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
            onClick={handleCreateNew}
            disabled={!isDangerZoneUnlocked}
            className={`flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-black text-sm transition-all whitespace-nowrap shadow-lg ${
              isDangerZoneUnlocked 
              ? 'bg-gradient-to-r from-[#74045F] to-[#C7911B] text-white shadow-[#74045F]/20 dark:shadow-[#C7911B]/20 active:scale-95' 
              : 'bg-slate-200 dark:bg-white/5 text-slate-400 cursor-not-allowed opacity-60'
            }`}
          >
            {isDangerZoneUnlocked ? <Plus size={20} /> : <Lock size={18} />}
            สร้างแบบฟอร์มใหม่
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 group w-full">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#74045F] transition-colors" size={18} />
          <input 
            type="text" 
            placeholder={t('admin.search')}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-white dark:bg-[#030712] border-2 border-slate-100 dark:border-white/5 rounded-2xl pl-12 pr-6 py-3.5 focus:outline-none focus:border-[#74045F]/30 dark:focus:border-[#C7911B]/30 transition-all font-medium"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-xl flex">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-800 text-[#74045F] dark:text-[#C7911B] shadow-sm' : 'text-slate-400'}`}
            >
              <Grid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-800 text-[#74045F] dark:text-[#C7911B] shadow-sm' : 'text-slate-400'}`}
            >
              <ListIcon size={18} />
            </button>
          </div>
          <div className="bg-white dark:bg-[#030712] border-2 border-slate-100 dark:border-white/5 rounded-2xl p-1 flex">
            <button className="px-4 py-2 rounded-xl text-xs font-bold bg-[#74045F] text-white shadow-md">ทั้งหมด</button>
          </div>
        </div>
      </div>

      {/* Batch Selection & Deletion Toolbar */}
      <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-200/60 dark:border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggleSelectAll}
            className="flex items-center gap-2.5 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-[#74045F] transition-all shadow-sm"
          >
            <input 
              type="checkbox"
              checked={selectedFormIds.length > 0 && selectedFormIds.length === filteredForms.length}
              onChange={() => {}}
              className="w-4 h-4 rounded text-[#74045F] accent-[#74045F] cursor-pointer"
            />
            <span>{selectedFormIds.length === filteredForms.length && filteredForms.length > 0 ? 'ยกเลิกการเลือกทั้งหมด' : 'เลือกทั้งหมด'}</span>
          </button>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
            เลือกอยู่ <span className="text-[#74045F] dark:text-[#C7911B] font-black">{selectedFormIds.length}</span> จาก <span className="font-bold">{filteredForms.length}</span> แบบฟอร์ม
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={() => handleOpenBatchDeleteModal('SELECTED')}
                disabled={selectedFormIds.length === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm ${
                  selectedFormIds.length > 0
                    ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20 active:scale-95 cursor-pointer'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
                }`}
                title="ลบเฉพาะแบบฟอร์มที่เลือก"
              >
                <Trash2 size={15} />
                ลบเฉพาะที่เลือก ({selectedFormIds.length})
              </button>
              <button
                type="button"
                onClick={() => handleOpenBatchDeleteModal('ALL')}
                disabled={filteredForms.length === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm ${
                  filteredForms.length > 0
                    ? 'bg-rose-700 text-white hover:bg-rose-800 shadow-rose-700/20 active:scale-95 cursor-pointer'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
                }`}
                title="ลบแบบฟอร์มทั้งหมดตามตัวกรอง"
              >
                <Trash2 size={15} />
                ลบทั้งหมด ({filteredForms.length})
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 px-3.5 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 text-xs font-bold">
              <Lock size={14} />
              <span>สิทธิ์การลบเฉพาะผู้ดูแลระบบ (Admin) เท่านั้น</span>
            </div>
          )}
        </div>
      </div>

      {/* Forms Content */}
      <div className="pb-24 space-y-6">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {paginatedForms.map((form) => (
              <motion.div 
                key={form.id}
                layout
                className={`glass-panel group p-5 rounded-[1.5rem] border hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-none transition-all duration-500 flex flex-col ${
                  selectedFormIds.includes(form.id)
                    ? 'border-[#74045F] dark:border-[#C7911B] ring-2 ring-[#74045F]/20 dark:ring-[#C7911B]/20 bg-[#74045F]/[0.02]'
                    : 'bg-[#74045F]/5 dark:bg-white/5 border-gray-100 dark:border-white/5'
                }`}
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox"
                      checked={selectedFormIds.includes(form.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggleSelectOne(form.id);
                      }}
                      className="w-5 h-5 rounded-md border-2 border-slate-300 dark:border-slate-600 text-[#74045F] accent-[#74045F] cursor-pointer"
                      title="เลือกรายการนี้"
                    />
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 duration-500 ${form.status === 'ACTIVE' ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-400'}`}>
                      <FileText size={24} />
                    </div>
                    <div>
                      <h3 className="font-black text-base text-slate-800 dark:text-white leading-tight mb-1">{form.title}</h3>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${getStatusColor(form.status)}`}>
                          {form.status}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Version {form.version}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => handleTestClick(form)}
                      title="ทดสอบแบบฟอร์ม"
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-white/10 text-[#74045F] dark:text-[#C7911B] hover:bg-[#74045F]/10 transition-all font-black"
                    >
                      <PlayCircle size={18} />
                    </button>
                    <button 
                      onClick={() => handlePreviewClick(form)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-all"
                    >
                      <Eye size={16} />
                    </button>
                    <button 
                      onClick={() => handleEdit(form)}
                      disabled={!isDangerZoneUnlocked}
                      className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${isDangerZoneUnlocked ? 'bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50' : 'bg-slate-100 dark:bg-white/5 text-slate-300 cursor-not-allowed'}`}
                    >
                      {isDangerZoneUnlocked ? <Edit2 size={16} /> : <Lock size={14} />}
                    </button>
                    <button 
                      onClick={() => toggleStatus(form)}
                      disabled={!isDangerZoneUnlocked}
                      className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${isDangerZoneUnlocked ? 'bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-amber-500 hover:bg-amber-50' : 'bg-slate-100 dark:bg-white/5 text-slate-300 cursor-not-allowed'}`}
                    >
                      {form.status === 'ACTIVE' ? <Archive size={16} /> : <CheckCircle2 size={16} />}
                    </button>
                    <button 
                       onClick={() => handleDeleteClick(form)}
                       disabled={!isDangerZoneUnlocked}
                       className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${isDangerZoneUnlocked ? 'bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-rose-500 hover:bg-rose-50' : 'bg-slate-100 dark:bg-white/5 text-slate-300 cursor-not-allowed'}`}
                    >
                      {isDangerZoneUnlocked ? <Trash2 size={16} /> : <Lock size={14} />}
                    </button>
                  </div>
                </div>

                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 line-clamp-2 leading-relaxed h-10 font-medium">
                  {form.description}
                </p>

                <div className="mt-auto pt-6 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    <Layout size={14} className="text-[#C7911B]" />
                    <span>{form.fields.length} ฟิลด์ข้อมูล</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-bold text-right uppercase tracking-widest flex items-center gap-1.5">
                    <Clock size={12} />
                    {new Date(form.updatedAt).toLocaleDateString('th-TH')}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="glass-panel overflow-hidden border border-slate-100 dark:border-white/5 rounded-3xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-white/5">
                    <th className="px-4 py-5 text-center">
                      <input 
                        type="checkbox"
                        checked={selectedFormIds.length > 0 && selectedFormIds.length === filteredForms.length}
                        onChange={handleToggleSelectAll}
                        className="w-4 h-4 rounded text-[#74045F] accent-[#74045F] cursor-pointer"
                      />
                    </th>
                    <th className="px-6 py-5">ชื่อแบบฟอร์ม</th>
                    <th className="px-6 py-5">สถานะ</th>
                    <th className="px-6 py-5">เวอร์ชัน</th>
                    <th className="px-6 py-5">ฟิลด์ข้อมูล</th>
                    <th className="px-6 py-5">แก้ไขล่าสุด</th>
                    <th className="px-8 py-5 text-right">{t('admin.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium">
                  {paginatedForms.map((form) => (
                    <motion.tr 
                      key={form.id} 
                      layout
                      className={`hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors group text-sm ${selectedFormIds.includes(form.id) ? 'bg-[#74045F]/5 dark:bg-white/5' : ''}`}
                    >
                      <td className="px-4 py-5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox"
                          checked={selectedFormIds.includes(form.id)}
                          onChange={() => handleToggleSelectOne(form.id)}
                          className="w-4 h-4 rounded text-[#74045F] accent-[#74045F] cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${form.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-100 dark:bg-white/10 text-slate-400'}`}>
                            <FileText size={18} />
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 dark:text-white">{form.title}</div>
                            <div className="text-xs text-slate-400 line-clamp-1">{form.description}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-2.5 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-wider ${getStatusColor(form.status)}`}>
                          {form.status}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-xs text-slate-600 dark:text-slate-400 font-bold">V{form.version}</span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                          <Layout size={12} className="text-[#C7911B]" />
                          {form.fields.length} ฟิลด์
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-bold">
                          <Clock size={12} />
                          {new Date(form.updatedAt).toLocaleDateString('th-TH')}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex gap-1 justify-end">
                          <button 
                            onClick={() => handleTestClick(form)}
                            title="ทดสอบแบบฟอร์ม"
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-white/10 text-[#74045F] dark:text-[#C7911B] hover:bg-[#74045F]/20 transition-all font-black"
                          >
                            <PlayCircle size={14} />
                          </button>
                          <button 
                            onClick={() => handlePreviewClick(form)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-emerald-500 transition-all"
                          >
                            <Eye size={14} />
                          </button>
                          <button 
                            onClick={() => handleEdit(form)}
                            disabled={!isDangerZoneUnlocked}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${isDangerZoneUnlocked ? 'bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-indigo-500' : 'bg-slate-50 dark:bg-white/5 text-slate-300 cursor-not-allowed'}`}
                          >
                            {isDangerZoneUnlocked ? <Edit2 size={14} /> : <Lock size={12} />}
                          </button>
                          <button 
                            onClick={() => toggleStatus(form)}
                            disabled={!isDangerZoneUnlocked}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${isDangerZoneUnlocked ? 'bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-amber-500' : 'bg-slate-50 dark:bg-white/5 text-slate-300 cursor-not-allowed'}`}
                          >
                            {form.status === 'ACTIVE' ? <Archive size={14} /> : <CheckCircle2 size={14} />}
                          </button>
                          <button 
                            onClick={() => handleDeleteClick(form)}
                            disabled={!isDangerZoneUnlocked}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${isDangerZoneUnlocked ? 'bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-rose-500' : 'bg-slate-50 dark:bg-white/5 text-slate-300 cursor-not-allowed'}`}
                          >
                            {isDangerZoneUnlocked ? <Trash2 size={14} /> : <Lock size={12} />}
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <PaginationControls
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          totalItems={filteredForms.length}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={setItemsPerPage}
          pageSizeOptions={[5, 10, 20, 50, 100]}
        />

        {filteredForms.length === 0 && (
          <div className="py-20 text-center glass-panel rounded-3xl mt-4">
            <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
              <Search size={40} />
            </div>
            <h3 className="text-xl font-black text-slate-500">ไม่พบแบบฟอร์มที่ค้นหา</h3>
            <p className="text-slate-400 mt-2">ลองใช้คำค้นหาอื่นๆ หรือสร้างแบบฟอร์มใหม่</p>
          </div>
        )}
      </div>

      {/* Editor Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 xl:left-72 xl:top-[65px] z-[1000] flex items-center justify-center p-4 transition-all duration-300">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.9 }}
              className="glass-panel w-full max-w-4xl bg-white dark:bg-[#030712] rounded-[2rem] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[68vh] sm:max-h-[72vh]"
            >
              {/* Modal Header */}
              <div className="p-8 border-b border-gray-200 dark:border-white/5 bg-white/80 dark:bg-black/20 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#74045F]/10 dark:bg-[#C7911B]/10 flex items-center justify-center text-[#74045F] dark:text-[#C7911B]">
                    {editingForm ? <Edit2 size={24} /> : <FileText size={24} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white leading-tight">
                      {editingForm ? 'แก้ไขแบบฟอร์ม' : 'ร่างแบบฟอร์มใหม่'}
                    </h3>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-0.5">Form Designer Studio</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all font-black"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <form id="form-editor" onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                  <div className="p-8 overflow-y-auto flex-1 custom-scrollbar space-y-8">
                    {/* Basic Info Container */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                      <div className="md:col-span-2 space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ชื่อแบบฟอร์ม *</label>
                          <input 
                            type="text" 
                            required
                            value={formData.title}
                            onChange={(e) => setFormData({...formData, title: e.target.value})}
                            placeholder="เช่น แบบฟอร์มตรวจสอบสถานีไฟฟ้า"
                            className="w-full bg-slate-100 dark:bg-white/5 border-2 border-transparent focus:border-[#74045F]/50 dark:focus:border-[#C7911B]/50 rounded-xl px-4 py-3 text-sm focus:outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">คำอธิบายรายละเอียด</label>
                          <textarea 
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            placeholder="อธิบายจุดประสงค์ของแบบฟอร์มนี้..."
                            rows={2}
                            className="w-full bg-slate-100 dark:bg-white/5 border-2 border-transparent focus:border-[#74045F]/50 dark:focus:border-[#C7911B]/50 rounded-xl px-4 py-3 text-sm focus:outline-none transition-all resize-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">หมวดหมู่โรงไฟฟ้าที่รองรับ (Matching Type)</label>
                          <select 
                            value={formData.targetCategory || ''}
                            onChange={(e) => setFormData({...formData, targetCategory: e.target.value})}
                            className="w-full bg-slate-100 dark:bg-white/5 border-2 border-transparent focus:border-[#74045F]/50 dark:focus:border-[#C7911B]/50 rounded-xl px-4 py-3 text-sm focus:outline-none transition-all"
                          >
                            <option value="">-- ใช้เป็นแบบฟอร์มกลาง (General) --</option>
                            <option value="SOLAR">Solar Power Plant</option>
                            <option value="WIND">Wind Power Plant</option>
                            <option value="HYDRO">Hydro Power Plant</option>
                            <option value="BIOMASS">Biomass Power Plant</option>
                            <option value="OTHER">Other / Misc</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">สถานะเริ่มต้น</label>
                          <div className="grid grid-cols-1 gap-2">
                            {['ACTIVE', 'DRAFT'].map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setFormData({...formData, status: s as FormStatus})}
                                className={`flex items-center justify-center p-3 rounded-xl border-2 transition-all font-bold text-xs ${formData.status === s ? 'bg-white dark:bg-slate-800 border-[#74045F] text-[#74045F] shadow-sm' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                              >
                                {s === 'ACTIVE' ? <CheckCircle2 size={16} className="mr-2" /> : <AlertCircle size={16} className="mr-2" />}
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                  {/* Form Builder Section */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between px-2">
                      <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                         <Layout size={18} className="text-[#C7911B]" />
                         โครงสร้างฟิลด์ข้อมูล ({formData.fields?.length || 0})
                      </h4>
                      <button 
                        type="button"
                        onClick={handleAddField}
                        className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-95"
                      >
                        <Plus size={14} /> เพิ่มฟิลด์
                      </button>
                    </div>

                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {formData.fields?.map((field, idx) => (
                        <motion.div 
                          key={field.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="p-5 rounded-3xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/5 group relative overflow-hidden"
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#74045F] to-transparent"></div>
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                            <div className="md:col-span-5 space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">หัวข้อลำดับ {idx + 1}</label>
                              <input 
                                type="text"
                                value={field.label}
                                onChange={(e) => updateField(idx, { label: e.target.value })}
                                placeholder="ระบุชื่อฟิลด์"
                                className="w-full bg-slate-100 dark:bg-black/20 border-2 border-transparent focus:border-[#C7911B]/40 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none transition-all"
                              />
                            </div>
                            <div className="md:col-span-3 space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ชนิดข้อมูล</label>
                              <select 
                                value={field.type}
                                onChange={(e) => updateField(idx, { type: e.target.value as FieldType })}
                                className="w-full bg-slate-100 dark:bg-black/20 border-2 border-transparent focus:border-[#C7911B]/40 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none transition-all"
                              >
                                {Object.entries(FIELD_TYPE_CONFIG).map(([val, cfg]) => (
                                  <option key={val} value={val}>{cfg.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="md:col-span-3 flex items-center justify-center pb-2">
                               <button 
                                 type="button"
                                 onClick={() => updateField(idx, { required: !field.required })}
                                 className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${field.required ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}
                               >
                                 {field.required ? 'จำเป็นต้องกรอก' : 'ไม่บังคับ'}
                               </button>
                            </div>
                            <div className="md:col-span-1 flex items-center justify-end pb-1.5">
                              <button 
                                type="button"
                                onClick={() => removeField(idx)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>

                            {/* Dropdown Options for Select/Checkbox */}
                            {(field.type === 'select' || field.type === 'checkbox') && (
                              <div className="md:col-span-12 mt-2 pt-2 border-t border-slate-50">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">ตัวเลือก (คั่นด้วยเครื่องหมายคอมม่า ",")</label>
                                <input 
                                  type="text"
                                  value={field.options?.join(', ') || ''}
                                  onChange={(e) => updateField(idx, { options: e.target.value.split(',').map(s => s.trim()) })}
                                  placeholder="เช่น ตัวเลือก 1, ตัวเลือก 2, ตัวเลือก 3"
                                  className="w-full bg-slate-50 dark:bg-black/20 border-2 border-transparent focus:border-[#C7911B]/40 rounded-xl px-4 py-2 text-xs font-medium focus:outline-none transition-all"
                                />
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}

                      {(formData.fields?.length === 0) && (
                        <div className="text-center py-12 border-2 border-dashed border-slate-100 dark:border-white/5 rounded-3xl">
                          <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                             <Plus size={32} />
                          </div>
                          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">ยังไม่มีการเพิ่มฟิลด์ข้อมูล</p>
                          <button 
                            type="button" 
                            onClick={handleAddField}
                            className="mt-4 text-[#74045F] text-xs font-black uppercase tracking-[0.2em] hover:underline"
                          >
                             กดเพื่อเริ่มออกแบบแบบฟอร์ม
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </form>
            </div>

              {/* Modal Footer */}
              <div className="p-5 border-t border-gray-200 dark:border-white/5 bg-white/50 dark:bg-white/5 flex gap-3 flex-shrink-0">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 font-bold py-2.5 rounded-2xl hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
                >
                  ยกเลิก
                </button>
                <button 
                  form="form-editor"
                  type="submit"
                  className="flex-[2] bg-gradient-to-r from-[#74045F] to-[#C7911B] text-white font-bold py-2.5 rounded-2xl shadow-lg shadow-[#74045F]/20 transition-all active:scale-95"
                >
                  บันทึกแบบฟอร์ม
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 xl:left-72 xl:top-[65px] z-[1001] flex items-center justify-center p-4">
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
              <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2 tracking-tight">ลบแบบฟอร์ม?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                คุณแน่ใจหรือไม่ว่าต้องการลบแบบฟอร์ม <br/>
                <span className="font-bold text-slate-900 dark:text-white">"{formToDelete?.title}"</span> <br/>
                ออกจากระบบ?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 font-bold py-3 rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-xs"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={confirmDelete}
                  className="bg-rose-500 text-white font-bold py-3 rounded-2xl shadow-lg shadow-rose-500/20 active:scale-95 transition-all uppercase tracking-widest text-xs"
                >
                  ยืนยันการลบ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Batch Delete Confirmation Modal */}
      <AnimatePresence>
        {isBatchDeleteModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBatchDeleteModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-panel w-full max-w-md bg-white dark:bg-[#030712] rounded-[2.5rem] overflow-hidden shadow-2xl relative z-10 p-8 text-center border-t-4 border-rose-500"
            >
              <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">
                {batchDeleteType === 'SELECTED' ? 'ยืนยันการลบแบบฟอร์มเฉพาะที่เลือก?' : 'ยืนยันการลบแบบฟอร์มทั้งหมด?'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                {batchDeleteType === 'SELECTED' ? (
                  <>คุณกำลังจะลบแบบฟอร์มที่เลือกจำนวน <span className="font-black text-rose-500">{selectedFormIds.length}</span> รายการ ข้อมูลในระบบและ Firebase จะถูกลบถาวร</>
                ) : (
                  <>คุณกำลังจะลบแบบฟอร์มทั้งหมดตามตัวกรองจำนวน <span className="font-black text-rose-500">{filteredForms.length}</span> รายการ ข้อมูลในระบบและ Firebase จะถูกลบถาวร</>
                )}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsBatchDeleteModalOpen(false)}
                  className="flex-1 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 font-bold py-3.5 rounded-xl hover:bg-slate-200 transition-all text-xs uppercase tracking-wider"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={handleConfirmBatchDelete}
                  className="flex-1 bg-rose-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-rose-500/20 hover:bg-rose-600 active:scale-95 transition-all text-xs uppercase tracking-wider"
                >
                  ยืนยันการลบ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      <AnimatePresence>
        {isPreviewModalOpen && formToPreview && (
          <div className="fixed inset-0 xl:left-72 xl:top-[65px] z-[1000] flex items-center justify-center p-4 transition-all duration-300">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => setIsPreviewModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.9 }}
              className="glass-panel w-full max-w-2xl bg-white dark:bg-[#030712] rounded-[2.5rem] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[68vh] sm:max-h-[72vh]"
            >
              {/* Modal Header */}
              <div className="p-8 border-b border-slate-100 dark:border-white/5 bg-white dark:bg-[#030712] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <Eye size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white leading-tight">พรีวิวแบบฟอร์ม</h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black mt-0.5">{formToPreview.title}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsPreviewModalOpen(false)}
                  className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all font-black"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="overflow-y-auto p-8 custom-scrollbar space-y-8">
                <div className="space-y-2">
                  <h4 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">{formToPreview.title}</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{formToPreview.description}</p>
                </div>

                <div className="space-y-6">
                  {formToPreview.fields.map((field) => (
                    <div key={field.id} className="space-y-2.5">
                      <label className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider">
                        {field.label}
                        {field.required && <span className="text-rose-500">*</span>}
                      </label>
                      
                      {field.type === 'text' && (
                        <input type="text" placeholder={field.placeholder || 'กรอกข้อมูล...'} className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none font-medium" disabled />
                      )}
                      
                      {field.type === 'number' && (
                        <input type="number" placeholder={field.placeholder || 'กรอกตัวเลข...'} className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none font-medium" disabled />
                      )}

                      {field.type === 'date' && (
                        <input type="date" className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none font-medium" disabled />
                      )}

                      {field.type === 'textarea' && (
                        <textarea rows={3} placeholder={field.placeholder || 'กรอกรายละเอียด...'} className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none font-medium resize-none text-[13px]" disabled />
                      )}

                      {field.type === 'select' && (
                        <div className="relative">
                          <select className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none appearance-none font-bold" disabled>
                            <option value="">เลือกตัวเลือก...</option>
                            {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                        </div>
                      )}

                      {field.type === 'checkbox' && (
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          {field.options?.map(opt => (
                            <label key={opt} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400 font-bold">
                              <div className="w-5 h-5 rounded border-2 border-slate-200 dark:border-white/10 flex items-center justify-center">
                                <Plus size={12} className="text-slate-300" />
                              </div>
                              {opt}
                            </label>
                          ))}
                        </div>
                      )}

                      {field.type === 'image' && (
                         <div className="w-full aspect-[2/1] rounded-2xl bg-slate-100 dark:bg-white/5 border-2 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-3 text-slate-400 group transition-all duration-300">
                            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-white/10 shadow-sm flex items-center justify-center mb-1">
                              <ImageIcon size={28} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">แตะเพื่ออัปโหลดรูปภาพ</span>
                         </div>
                      )}

                      {field.type === 'file' && (
                         <div className="w-full p-5 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-4 text-slate-500 shadow-sm">
                            <div className="w-12 h-12 rounded-xl bg-white dark:bg-white/10 flex items-center justify-center shadow-inner"><FileUp size={24} /></div>
                            <div className="flex-1">
                               <div className="text-[11px] font-black uppercase tracking-[0.15em] mb-0.5">อัปโหลดไฟล์เอกสาร</div>
                               <div className="text-[10px] font-bold opacity-50">PDF, DOCX, XLSX (สูงสุด 10MB)</div>
                            </div>
                         </div>
                      )}

                      {field.type === 'gps' && (
                         <div className="w-full p-5 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-4 text-slate-500 shadow-sm">
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-500 flex items-center justify-center shadow-inner"><MapPin size={24} /></div>
                            <div className="flex-1 text-left">
                               <div className="text-[11px] font-black uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400 mb-0.5">ระบุตำแหน่งพิกัด GPS</div>
                               <div className="text-[10px] font-bold opacity-50 italic">ละติจูด, ลองจิจูด</div>
                            </div>
                            <div className="text-[10px] font-black uppercase bg-emerald-500 text-white px-3 py-1.5 rounded-lg shadow-lg shadow-emerald-500/20">GET GPS</div>
                         </div>
                      )}
                    </div>
                  ))}

                  {formToPreview.fields.length === 0 && (
                    <div className="text-center py-16 bg-slate-50 dark:bg-white/5 rounded-3xl border-2 border-dashed border-slate-100 dark:border-white/5">
                       <AlertCircle size={48} className="mx-auto mb-4 opacity-10 text-slate-400" />
                       <p className="text-sm font-black text-slate-400 uppercase tracking-widest">ยังไม่มีความละเอียดของฟิลด์แบบฟอร์ม</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-5 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-[#030712] flex justify-end shrink-0">
                <button 
                  onClick={() => setIsPreviewModalOpen(false)}
                  className="bg-slate-800 dark:bg-white/10 text-white dark:text-white font-black px-10 py-2.5 rounded-2xl shadow-xl shadow-slate-900/10 active:scale-95 transition-all text-xs uppercase tracking-[0.2em]"
                >
                  ปิดหน้าจอพรีวิว
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Test Form Modal */}
      <AnimatePresence>
        {isTestModalOpen && formToTest && (
          <div className="fixed inset-0 z-[1002] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#030712]/90 backdrop-blur-xl"
              onClick={() => {
                if (!testSubmission) setIsTestModalOpen(false);
              }}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-panel w-full max-w-2xl bg-white dark:bg-[#030712] rounded-[2.5rem] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-slate-100 dark:border-white/5 bg-gradient-to-r from-[#74045F]/5 to-[#C7911B]/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#74045F] text-white flex items-center justify-center shadow-lg shadow-[#74045F]/20">
                    <PlayCircle size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white leading-tight">โหมดทดสอบระบบ</h3>
                    <p className="text-[10px] text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest font-black mt-0.5">Simulation & Debug Mode</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsTestModalOpen(false)}
                  className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center text-slate-400 transition-all font-black"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="overflow-y-auto p-8 custom-scrollbar">
                {!testSubmission ? (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      setTestSubmission({
                        formId: formToTest.id,
                        submittedAt: new Date().toISOString(),
                        values: testFormValues
                      });
                    }}
                    className="space-y-8"
                  >
                    <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 p-4 rounded-2xl flex gap-3 text-amber-700 dark:text-amber-500">
                       <AlertCircle size={20} className="shrink-0" />
                       <div className="text-xs font-bold leading-relaxed">
                          นี่คือโหมดจำลองสถานะการใช้งานจริง ข้อมูลที่กรอกในหน้านี้จะระบุอยู่ใน "Data Payload" เมื่อกดส่ง และจะไม่ถูกบันทึกลงฐานข้อมูลจริง
                       </div>
                    </div>

                    <div className="space-y-6">
                      {formToTest.fields.map((field) => (
                        <div key={field.id} className="space-y-2">
                          <label className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider">
                            {field.label}
                            {field.required && <span className="text-rose-500">*</span>}
                          </label>
                          
                          {field.type === 'text' && (
                            <input 
                              type="text" 
                              required={field.required}
                              placeholder={field.placeholder || 'ระบุข้อมูล...'}
                              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#74045F]/50 font-bold transition-all"
                              onChange={(e) => setTestFormValues({...testFormValues, [field.id]: e.target.value})}
                            />
                          )}

                          {field.type === 'number' && (
                            <input 
                              type="number" 
                              required={field.required}
                              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#74045F]/50 font-bold transition-all"
                              onChange={(e) => setTestFormValues({...testFormValues, [field.id]: Number(e.target.value)})}
                            />
                          )}

                          {field.type === 'date' && (
                            <input 
                              type="date" 
                              required={field.required}
                              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#74045F]/50 font-bold transition-all"
                              onChange={(e) => setTestFormValues({...testFormValues, [field.id]: e.target.value})}
                            />
                          )}

                          {field.type === 'textarea' && (
                            <textarea 
                              required={field.required}
                              placeholder={field.placeholder || 'ระบุรายละเอียด...'}
                              rows={3}
                              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#74045F]/50 font-bold transition-all resize-none"
                              onChange={(e) => setTestFormValues({...testFormValues, [field.id]: e.target.value})}
                            />
                          )}

                          {field.type === 'select' && (
                            <div className="relative">
                              <select 
                                required={field.required}
                                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none appearance-none font-bold"
                                onChange={(e) => setTestFormValues({...testFormValues, [field.id]: e.target.value})}
                              >
                                <option value="">เลือกรายการ...</option>
                                {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                            </div>
                          )}

                          {field.type === 'checkbox' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                               {field.options?.map(opt => (
                                 <label key={opt} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-all">
                                    <input 
                                       type="checkbox" 
                                       className="w-5 h-5 rounded border-2 border-slate-200 accent-[#74045F]"
                                       onChange={(e) => {
                                          const prev = testFormValues[field.id] || [];
                                          const next = e.target.checked ? [...prev, opt] : prev.filter((v: string) => v !== opt);
                                          setTestFormValues({...testFormValues, [field.id]: next});
                                       }}
                                    />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{opt}</span>
                                 </label>
                               ))}
                            </div>
                          )}

                          {field.type === 'image' && (
                             <div className="relative w-full">
                                <input 
                                   type="file" 
                                   id={`test-upload-${field.id}`}
                                   accept="image/*"
                                   className="hidden"
                                   onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                         const reader = new FileReader();
                                         reader.readAsDataURL(file);
                                         reader.onload = () => {
                                            setTestFormValues({
                                               ...testFormValues, 
                                               [field.id]: {
                                                  name: file.name,
                                                  size: file.size,
                                                  type: file.type,
                                                  data: reader.result
                                               }
                                            });
                                         };
                                      }
                                   }}
                                />
                                <label 
                                   htmlFor={`test-upload-${field.id}`}
                                   className="relative w-full aspect-video rounded-3xl bg-slate-100 dark:bg-white/5 border-2 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-[#74045F]/40 transition-all cursor-pointer overflow-hidden group"
                                >
                                   {testFormValues[field.id] ? (
                                      <div className="absolute inset-0 group">
                                         <img 
                                            src={testFormValues[field.id].data} 
                                            alt="Preview" 
                                            className="w-full h-full object-cover"
                                         />
                                         <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <div className="bg-white/20 backdrop-blur-md p-3 rounded-full text-white">
                                               <ImageIcon size={24} />
                                            </div>
                                         </div>
                                         <div className="absolute top-4 right-4 flex gap-2">
                                            <button 
                                               type="button" 
                                               onClick={(e) => {
                                                  e.preventDefault();
                                                  setTestFormValues({...testFormValues, [field.id]: null});
                                               }} 
                                               className="bg-rose-500 text-white p-2 rounded-xl shadow-lg"
                                            >
                                               <X size={16} />
                                            </button>
                                         </div>
                                      </div>
                                   ) : (
                                      <div className="flex flex-col items-center">
                                         <ImageIcon size={32} className="mb-2 group-hover:scale-110 transition-transform" />
                                         <span className="text-[10px] font-black uppercase tracking-widest text-center">แตะเพื่อถ่ายภาพหรือเลือกไฟล์ภาพจริง</span>
                                      </div>
                                   )}
                                </label>
                             </div>
                          )}

                          {field.type === 'file' && (
                             <div className="relative w-full">
                                <input 
                                   type="file" 
                                   id={`test-file-${field.id}`}
                                   className="hidden"
                                   onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                         setTestFormValues({
                                            ...testFormValues, 
                                            [field.id]: {
                                               name: file.name,
                                               size: file.size,
                                               type: file.type,
                                               lastModified: file.lastModified
                                            }
                                         });
                                      }
                                   }}
                                />
                                {testFormValues[field.id] ? (
                                   <div className="w-full p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20 flex items-center gap-4 text-emerald-600 shadow-sm">
                                      <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                         <FileUp size={24} />
                                      </div>
                                      <div className="flex-1 overflow-hidden">
                                         <div className="text-[11px] font-black uppercase tracking-[0.15em] mb-0.5 truncate">{testFormValues[field.id].name}</div>
                                         <div className="text-[10px] font-bold opacity-70">{(testFormValues[field.id].size / 1024 / 1024).toFixed(2)} MB</div>
                                      </div>
                                      <button 
                                         type="button" 
                                         onClick={() => setTestFormValues({...testFormValues, [field.id]: null})}
                                         className="w-10 h-10 rounded-xl hover:bg-emerald-100 dark:hover:bg-white/5 flex items-center justify-center text-rose-500 transition-all font-black"
                                      >
                                         <X size={20} />
                                      </button>
                                   </div>
                                ) : (
                                   <label 
                                      htmlFor={`test-file-${field.id}`}
                                      className="w-full p-5 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-4 text-slate-500 shadow-sm cursor-pointer hover:bg-slate-200 dark:hover:bg-white/10 transition-all group"
                                   >
                                      <div className="w-12 h-12 rounded-xl bg-white dark:bg-white/10 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                                         <FileUp size={24} />
                                      </div>
                                      <div className="flex-1">
                                         <div className="text-[11px] font-black uppercase tracking-[0.15em] mb-0.5">เลือกไฟล์เอกสารจริง</div>
                                         <div className="text-[10px] font-bold opacity-50">PDF, DOCX, XLSX (สูงสุด 10MB)</div>
                                      </div>
                                   </label>
                                )}
                             </div>
                          )}

                          {field.type === 'gps' && (
                             <div className="flex gap-2">
                                <div className="flex-1 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-slate-400 italic">
                                   {testFormValues[field.id] ? `${testFormValues[field.id].lat}, ${testFormValues[field.id].lng}` : 'ยังไม่ระบุพิกัด'}
                                </div>
                                <button 
                                   type="button" 
                                   onClick={() => setTestFormValues({...testFormValues, [field.id]: { lat: 13.7367, lng: 100.5231 }})}
                                   className="bg-emerald-500 text-white px-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95"
                                >
                                   Locate
                                </button>
                             </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="pt-8 flex gap-4">
                       <button 
                         type="submit"
                         className="flex-1 bg-gradient-to-r from-[#74045F] to-[#C7911B] text-white font-black py-4 rounded-2xl shadow-xl shadow-[#74045F]/20 active:scale-95 transition-all text-xs uppercase tracking-[0.2em]"
                       >
                         ทดสอบส่งข้อมูล (Simulation Submit)
                       </button>
                    </div>
                  </form>
                ) : (
                  <div className="animate-fade-in space-y-8">
                     <div className="text-center">
                        <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                           <ClipboardCheck size={40} />
                        </div>
                        <h4 className="text-2xl font-black text-slate-800 dark:text-white">ส่งข้อมูลตัวอย่างสำเร็จ!</h4>
                        <p className="text-slate-500 text-sm font-medium mt-2">นี่คือ "Data Payload" ที่ระบบฐานข้อมูลจะได้รับจากการกรอกแบบฟอร์มนี้</p>
                     </div>

                     <div className="bg-slate-900 rounded-3xl p-6 overflow-hidden relative">
                        <div className="absolute top-4 right-4 flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                           <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                           <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        </div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-4">JSON OUTPUT PREVIEW</div>
                        <pre className="text-emerald-400 font-mono text-xs overflow-x-auto p-2 custom-scrollbar">
                           {JSON.stringify(testSubmission, null, 2)}
                        </pre>
                     </div>

                     <button 
                        onClick={() => setTestSubmission(null)}
                        className="w-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 font-black py-4 rounded-2xl hover:bg-slate-200 transition-all text-xs uppercase tracking-widest"
                     >
                        เริ่มทดสอบใหม่อีกครั้ง
                     </button>
                  </div>
                )}
              </div>

              <div className="p-8 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-[#030712] flex justify-end shrink-0">
                <button 
                  onClick={() => setIsTestModalOpen(false)}
                  className="bg-slate-800 text-white font-black px-10 py-4 rounded-2xl shadow-xl active:scale-95 transition-all text-xs uppercase tracking-[0.2em]"
                >
                  ปิดโหมดทดสอบ
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
              ? 'bg-emerald-500 text-white border-emerald-400 shadow-emerald-500/20 shadow-lg' 
              : 'bg-rose-500 text-white border-rose-400 shadow-rose-500/20 shadow-lg'
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

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const InputField: React.FC<InputFieldProps> = ({ label, value, onChange, type = 'text', required, disabled, placeholder }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label} {required && '*'}</label>
    <input 
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className={`w-full bg-slate-100 dark:bg-black/20 border-2 border-transparent focus:border-[#74045F]/50 dark:focus:border-[#C7911B]/50 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    />
  </div>
);
