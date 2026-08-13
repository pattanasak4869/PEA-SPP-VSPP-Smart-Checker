
import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, Search, Edit2, Trash2, Shield, 
  Mail, Phone, Building2, MapPin, Check, X, Plus,
  ChevronLeft, ChevronRight, MoreVertical, ShieldAlert,
  ShieldCheck, User, Lock, UserCog, Zap, RefreshCw, Loader2
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { safeParseLocalStorage, safeSetLocalStorage } from '../utils/localStorageUtils';
import { compressBase64Image } from '../utils/imageUtils';
import { MOCK_USERS } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../src/lib/firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, query, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { PaginationControls } from './PaginationControls';

interface AppUser {
  employeeId: string;
  username: string;
  password?: string;
  name: string;
  role: 'ADMIN' | 'INSPECTOR' | 'MANAGER' | 'VENDER';
  position: string;
  email: string;
  phone: string;
  peaOffice: string;
  department: string;
  region: string;
  avatar?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt?: any;
}

interface UserManagementProps {
  isDangerZoneUnlocked: boolean;
  setIsDangerZoneUnlocked: (unlocked: boolean) => void;
  setIsUnlockModalOpen: (open: boolean) => void;
  userProfile?: any;
}

export const UserManagement: React.FC<UserManagementProps> = ({ 
  isDangerZoneUnlocked, 
  setIsDangerZoneUnlocked,
  setIsUnlockModalOpen,
  userProfile
}) => {
  const { t } = useLanguage();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [formData, setFormData] = useState<Partial<AppUser>>({
    role: 'INSPECTOR',
    region: 'นครปฐม',
    status: 'ACTIVE'
  });
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Batch selection and deletion states
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [batchDeleteType, setBatchDeleteType] = useState<'SELECTED' | 'ALL' | null>(null);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);

  const activeUser = userProfile || currentUser || safeParseLocalStorage<any>('user_profile', null);
  const isAdmin = activeUser?.role === 'ADMIN';
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // Allow up to 5MB before compression
        showToast('ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const compressed = await compressBase64Image(reader.result as string, 200, 200, 0.5);
          setFormData({ ...formData, avatar: compressed });
        } catch (err) {
          console.error('Compression failed:', err);
          setFormData({ ...formData, avatar: reader.result as string });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteAvatar = () => {
    setFormData({ ...formData, avatar: '' });
  };

  const PEA_ROLES = ['ADMIN', 'MANAGER', 'INSPECTOR'];
  const isVenderForm = formData.role === 'VENDER';

  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Get current logged in user
    const profile = safeParseLocalStorage<any>('user_profile', null);
    if (profile) {
      setCurrentUser(profile);
    }

    // Subscribe to Firestore users collection
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fbUsers: AppUser[] = [];
      snapshot.forEach((doc) => {
        fbUsers.push(doc.data() as AppUser);
      });
      
      setUsers(fbUsers);
    }, (error) => {
      console.error("Firestore snapshot error:", error);
      showToast("ไม่สามารถโหลดข้อมูลจาก Database ได้", "error");
    });

    return () => unsubscribe();
  }, []);

  const saveToFirestore = async (user: AppUser) => {
    try {
      setIsSyncing(true);
      // We use employeeId as the document ID for simplicity in user management
      const userRef = doc(db, 'users', user.employeeId);
      await setDoc(userRef, {
        ...user,
        createdAt: user.createdAt || serverTimestamp()
      }, { merge: true });
      return true;
    } catch (error) {
      console.error("Error saving user:", error);
      showToast("เกิดข้อผิดพลาดในการบันทึกข้อมูลเข้า Database", "error");
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleOpenAddModal = () => {
    setEditingUser(null);
    setFormData({
      role: 'INSPECTOR',
      region: 'นครปฐม',
      status: 'ACTIVE',
      username: '',
      password: '',
      name: '',
      employeeId: '',
      position: '',
      email: '',
      phone: '',
      peaOffice: '',
      department: '',
      avatar: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (user: AppUser) => {
    setEditingUser(user);
    setFormData({ ...user });
    setIsModalOpen(true);
  };

  const handleDeleteUser = (employeeId: string) => {
    if (!isAdmin) {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์ลบข้อมูล', 'error');
      return;
    }
    if (!isDangerZoneUnlocked) {
      showToast('กรุณาปลดล็อก Danger Zone ก่อนดำเนินการลบข้อมูล', 'error');
      return;
    }
    const user = users.find(u => u.employeeId === employeeId);
    if (!user) return;

    if (activeUser && (activeUser.employeeId === employeeId || activeUser.username === employeeId)) {
        showToast('คุณไม่สามารถลบผู้ใช้งานที่กำลังล็อกอินอยู่ได้', 'error');
        return;
    }

    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!isAdmin) {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์ลบข้อมูล', 'error');
      return;
    }
    if (userToDelete) {
      try {
        setIsSyncing(true);
        await deleteDoc(doc(db, 'users', userToDelete.employeeId));
        setSelectedEmployeeIds(prev => prev.filter(id => id !== userToDelete.employeeId));
        setIsDeleteModalOpen(false);
        setUserToDelete(null);
        showToast(t('users.deleted'));
      } catch (error) {
        console.error("Delete error:", error);
        showToast("ไม่สามารถลบข้อมูลจาก Database ได้", "error");
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedEmployeeIds.length === filteredUsers.length && filteredUsers.length > 0) {
      setSelectedEmployeeIds([]);
    } else {
      setSelectedEmployeeIds(filteredUsers.map(u => u.employeeId));
    }
  };

  const handleToggleSelectOne = (employeeId: string) => {
    setSelectedEmployeeIds(prev => 
      prev.includes(employeeId) ? prev.filter(id => id !== employeeId) : [...prev, employeeId]
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
    if (type === 'SELECTED' && selectedEmployeeIds.length === 0) {
      showToast('กรุณาเลือกรายการผู้ใช้งานที่ต้องการลบอย่างน้อย 1 รายการ', 'error');
      return;
    }
    if (type === 'ALL' && filteredUsers.length === 0) {
      showToast('ไม่พบผู้ใช้งานที่ต้องการลบ', 'error');
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

    let usersToDelete: AppUser[] = [];
    if (batchDeleteType === 'SELECTED') {
      usersToDelete = users.filter(u => selectedEmployeeIds.includes(u.employeeId));
    } else if (batchDeleteType === 'ALL') {
      usersToDelete = [...filteredUsers];
    }

    // Protect current user from deleting themselves
    const currentEmpId = activeUser?.employeeId || activeUser?.username;
    usersToDelete = usersToDelete.filter(u => u.employeeId !== currentEmpId && u.username !== currentEmpId);

    if (usersToDelete.length === 0) {
      showToast('ไม่สามารถลบบัญชีผู้ใช้งานที่เลือกได้ (จำกัดไม่ให้ลบบัญชีของตนเอง)', 'error');
      setIsBatchDeleteModalOpen(false);
      return;
    }

    try {
      setIsSyncing(true);
      const idsToRemove = new Set(usersToDelete.map(u => u.employeeId));
      for (const u of usersToDelete) {
        await deleteDoc(doc(db, 'users', u.employeeId));
      }
      setSelectedEmployeeIds(prev => prev.filter(id => !idsToRemove.has(id)));
      showToast(`ลบข้อมูลผู้ใช้งานสำเร็จจำนวน ${usersToDelete.length} รายการ`);
    } catch (error) {
      console.error("Batch delete users error:", error);
      showToast("เกิดข้อผิดพลาดในการลบข้อมูลจาก Database", "error");
    } finally {
      setIsSyncing(false);
      setIsBatchDeleteModalOpen(false);
      setBatchDeleteType(null);
    }
  };

  const handleResetAllUsers = async () => {
    if (!isDangerZoneUnlocked) return;
    if (window.confirm('คำเตือน: คุณแน่ใจหรือไม่ว่าต้องการรีเซ็ตข้อมูลผู้ใช้งานทั้งหมดให้เป็นค่าเริ่มต้น?')) {
      try {
        setIsSyncing(true);
        // This is a dangerous operation, manually delete then add mocks
        // In a real app we would use a batch
        for (const user of users) {
          await deleteDoc(doc(db, 'users', user.employeeId));
        }
        for (const mockUser of MOCK_USERS) {
          await setDoc(doc(db, 'users', mockUser.employeeId), {
            ...mockUser,
            createdAt: serverTimestamp()
          });
        }
        showToast('รีเซ็ตข้อมูลผู้ใช้งานทั้งหมดสำเร็จ');
      } catch (error) {
        showToast('เกิดข้อผิดพลาดในการรีเซ็ตข้อมูล', 'error');
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleSyncWithMock = async () => {
    if (!isDangerZoneUnlocked) return;
    if (window.confirm('คุณต้องการซิงค์ข้อมูลผู้ใช้งานในระบบให้ตรงกับค่าเริ่มต้นหรือไม่?')) {
      try {
        setIsSyncing(true);
        for (const mockUser of MOCK_USERS) {
          await setDoc(doc(db, 'users', mockUser.employeeId), {
            ...mockUser,
            createdAt: serverTimestamp()
          }, { merge: true });
        }
        showToast('ซิงค์ข้อมูลกับค่าเริ่มต้นสำเร็จ');
      } catch (error) {
        showToast('เกิดข้อผิดพลาดในการซิงค์ข้อมูล', 'error');
      } finally {
        setIsSyncing(false);
      }
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.employeeId || !formData.name || !formData.username || !formData.email) {
        showToast('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (รหัสพนักงาน, ชื่อ, ชื่อผู้ใช้, อีเมล)', 'error');
        return;
    }

    const userData = { ...formData } as AppUser;
    if (!userData.password) userData.password = 'PEA1234'; // Default password

    if (editingUser) {
      const success = await saveToFirestore(userData);
      if (success) {
        showToast('แก้ไขข้อมูลผู้ใช้งานสำเร็จ');
        setIsModalOpen(false);
      }
    } else {
      // Create new
      if (users.some(u => u.employeeId === formData.employeeId || u.username === formData.username)) {
        showToast('รหัสพนักงานหรือชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว', 'error');
        return;
      }
      
      const success = await saveToFirestore(userData);
      if (success) {
        showToast('เพิ่มผู้ใช้งานใหม่สำเร็จ');
        setIsModalOpen(false);
      }
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN': return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1 w-fit"><ShieldCheck size={10} /> ADMIN</span>;
      case 'MANAGER': return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center gap-1 w-fit"><Shield size={10} /> MANAGER</span>;
      case 'VENDER': return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/20 flex items-center gap-1 w-fit"><User size={10} /> VENDER</span>;
      default: return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/20 text-slate-600 dark:text-slate-400 border border-slate-500/20 flex items-center gap-1 w-fit"><User size={10} /> INSPECTOR</span>;
    }
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.employeeId.includes(searchQuery) ||
    u.position.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-8 animate-fade-in pb-10 mt-10">
      {/* Header & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
            <Users className="text-[#74045F] dark:text-[#C7911B]" size={32} />
            จัดการข้อมูลผู้ใช้งาน
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">บริหารจัดการบัญชีผู้ใช้งานและกำหนดสิทธิ์การเข้าถึงระบบ</p>
        </div>
        
        <div className="flex flex-wrap items-center justify-start md:justify-end gap-3 lg:gap-4">
          <div className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-[#030712] border border-slate-100 dark:border-white/5 rounded-2xl shadow-sm">
              <div className="flex flex-col text-right">
                  <span className="text-[8px] font-black text-rose-500 uppercase tracking-[0.2em] leading-none mb-1">{t('admin.security_panel')}</span>
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

          <AnimatePresence>
            {isDangerZoneUnlocked && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-2"
              >
                <button 
                  onClick={handleSyncWithMock}
                  className="p-3 bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500 hover:text-white rounded-2xl transition-all border border-indigo-500/20 shadow-sm"
                  title="ซิงค์ข้อมูลกับค่าเริ่มต้น"
                >
                  <RefreshCw size={18} />
                </button>
                <button 
                  onClick={handleResetAllUsers}
                  className="p-3 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-2xl transition-all border border-rose-500/20 shadow-sm"
                  title="รีเซ็ตข้อมูลทั้งหมด"
                >
                  <Trash2 size={18} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={handleOpenAddModal}
            className="bg-gradient-to-r from-[#74045F] to-[#C7911B] text-white font-bold py-3 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#74045F]/20 dark:shadow-[#C7911B]/20 transition-all active:scale-95 group whitespace-nowrap"
          >
            <UserPlus size={18} className="group-hover:scale-110 transition-transform" />
            เพิ่มผู้ใช้งานใหม่
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-gray-200 dark:border-white/5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500"><Users size={24} /></div>
            <div>
                <div className="text-[10px] font-bold text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest leading-none mb-1">ทั้งหมด</div>
                <div className="text-xl font-black text-slate-800 dark:text-white">{users.length} คน</div>
            </div>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-gray-200 dark:border-white/5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500"><ShieldCheck size={24} /></div>
            <div>
                <div className="text-[10px] font-bold text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest leading-none mb-1">ผู้บริหารหน่วยงาน</div>
                <div className="text-xl font-black text-slate-800 dark:text-white">{users.filter(u => u.role === 'MANAGER').length} คน</div>
            </div>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-gray-200 dark:border-white/5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-500"><User size={24} /></div>
            <div>
                <div className="text-[10px] font-bold text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest leading-none mb-1">พนักงาน กฟภ.</div>
                <div className="text-xl font-black text-slate-800 dark:text-white">{users.filter(u => u.role === 'INSPECTOR'||u.role === 'ADMIN').length} คน</div>
            </div>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-gray-200 dark:border-white/5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500"><Zap size={24} /></div>
            <div>
                <div className="text-[10px] font-bold text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest leading-none mb-1">ผู้ประสานงานโรงไฟฟ้า</div>
                <div className="text-xl font-black text-slate-800 dark:text-white">{users.filter(u => u.role === 'VENDER').length} คน</div>
            </div>
        </div>
      </div>

      {/* Batch Selection & Deletion Toolbar */}
      {isDangerZoneUnlocked ? (
        <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-200/60 dark:border-white/10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="flex items-center gap-2.5 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-[#74045F] transition-all shadow-sm"
            >
              <input 
                type="checkbox"
                checked={selectedEmployeeIds.length > 0 && selectedEmployeeIds.length === filteredUsers.length}
                onChange={() => {}}
                className="w-4 h-4 rounded text-[#74045F] accent-[#74045F] cursor-pointer"
              />
              <span>{selectedEmployeeIds.length === filteredUsers.length && filteredUsers.length > 0 ? 'ยกเลิกการเลือกทั้งหมด' : 'เลือกทั้งหมด'}</span>
            </button>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              เลือกอยู่ <span className="text-[#74045F] dark:text-[#C7911B] font-black">{selectedEmployeeIds.length}</span> จาก <span className="font-bold">{filteredUsers.length}</span> คน
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenBatchDeleteModal('SELECTED')}
                  disabled={selectedEmployeeIds.length === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm ${
                    selectedEmployeeIds.length > 0
                      ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20 active:scale-95 cursor-pointer'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
                  }`}
                  title="ลบเฉพาะผู้ใช้งานที่เลือก"
                >
                  <Trash2 size={15} />
                  ลบเฉพาะที่เลือก ({selectedEmployeeIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenBatchDeleteModal('ALL')}
                  disabled={filteredUsers.length === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm ${
                    filteredUsers.length > 0
                      ? 'bg-rose-700 text-white hover:bg-rose-800 shadow-rose-700/20 active:scale-95 cursor-pointer'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
                  }`}
                  title="ลบผู้ใช้งานทั้งหมดตามตัวกรอง"
                >
                  <Trash2 size={15} />
                  ลบทั้งหมด ({filteredUsers.length})
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
      ) : (
        <div className="bg-amber-500/5 border border-amber-500/20 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-amber-700 dark:text-amber-400">
          <div className="flex items-center gap-2.5 font-bold">
            <Lock size={16} className="text-amber-500 flex-shrink-0" />
            <span>ฟังก์ชันเลือกและลบข้อมูลแบบกลุ่ม (Batch Delete) ถูกจำกัดเฉพาะเมื่อปลดล็อก Danger Zone เท่านั้น</span>
          </div>
          <button
            type="button"
            onClick={() => setIsUnlockModalOpen(true)}
            className="px-3.5 py-1.5 bg-amber-500 text-white rounded-xl font-extrabold text-[11px] uppercase tracking-wider hover:bg-amber-600 transition-all shadow-sm flex items-center gap-1.5"
          >
            <Lock size={12} />
            ปลดล็อก Danger Zone
          </button>
        </div>
      )}

      {/* Users Table / List */}
      <div className="glass-panel rounded-2xl border border-gray-200 dark:border-white/5 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-white/5 bg-white/50 dark:bg-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder={t('admin.search')}
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full bg-slate-100 dark:bg-black/30 border border-transparent focus:border-[#74045F]/50 dark:focus:border-[#C7911B]/50 py-2.5 pl-12 pr-4 rounded-xl text-sm transition-all"
                    />
                </div>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>แสดง {filteredUsers.length} จาก {users.length} รายการ</span>
            </div>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-gray-200 dark:border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        {isDangerZoneUnlocked && (
                          <th className="px-4 py-4 text-center w-12">
                            <input 
                              type="checkbox"
                              checked={selectedEmployeeIds.length > 0 && selectedEmployeeIds.length === filteredUsers.length}
                              onChange={handleToggleSelectAll}
                              className="w-4 h-4 rounded text-[#74045F] accent-[#74045F] cursor-pointer"
                              title="เลือกทั้งหมด"
                            />
                          </th>
                        )}
                        <th className="px-6 py-4">ผู้ใช้งาน</th>
                        <th className="px-6 py-4">ตำแหน่ง / สิทธิ์</th>
                        <th className="px-6 py-4">ติดต่อ</th>
                        <th className="px-6 py-4">สังกัด</th>
                        <th className="px-6 py-4 text-right">{t('admin.actions')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-white/5">
                    {paginatedUsers.map((user) => (
                        <tr key={user.employeeId} className={`hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group ${selectedEmployeeIds.includes(user.employeeId) ? 'bg-[#74045F]/[0.03] dark:bg-[#C7911B]/[0.05]' : ''}`}>
                            {isDangerZoneUnlocked && (
                              <td className="px-4 py-4 text-center">
                                <input 
                                  type="checkbox"
                                  checked={selectedEmployeeIds.includes(user.employeeId)}
                                  onChange={() => handleToggleSelectOne(user.employeeId)}
                                  className="w-4 h-4 rounded text-[#74045F] accent-[#74045F] cursor-pointer"
                                />
                              </td>
                            )}
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex-shrink-0 overflow-hidden border border-gray-200 dark:border-white/10">
                                        <img 
                                          src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=74045F&color=fff`} 
                                          alt={user.name} 
                                          className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-slate-800 dark:text-white truncate">{user.name}</span>
                                            {user.status === 'INACTIVE' && (
                                                <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black bg-rose-500 text-white uppercase tracking-tighter">Suspended</span>
                                            )}
                                        </div>
                                        <span className="text-[10px] font-mono text-slate-400 tracking-tighter">ID: {user.employeeId} | @{user.username}</span>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{user.position}</span>
                                    {getRoleBadge(user.role)}
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex flex-col gap-1 text-[11px] text-slate-500">
                                    <div className="flex items-center gap-1.5"><Mail size={12} className="text-slate-400" /> {user.email}</div>
                                    <div className="flex items-center gap-1.5"><Phone size={12} className="text-slate-400" /> {user.phone}</div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex flex-col gap-1 text-[11px] text-slate-500">
                                    <div className="flex items-center gap-1.5"><Building2 size={12} className="text-[#74045F] dark:text-[#C7911B]" /> {user.department}</div>
                                    <div className="text-[9px] font-bold text-slate-400 uppercase">{user.peaOffice}</div>
                                </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                      onClick={() => handleOpenEditModal(user)}
                                      title="แก้ไข"
                                      className="p-2 bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white rounded-lg transition-all"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteUser(user.employeeId)}
                                      title={isDangerZoneUnlocked ? "ลบ" : " Danger Zone ถูกล็อก"}
                                      className={`p-2 transition-all rounded-lg relative ${
                                        isDangerZoneUnlocked 
                                        ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white' 
                                        : 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed opacity-50 grayscale'
                                      }`}
                                    >
                                        {isDangerZoneUnlocked ? <Trash2 size={16} /> : <Lock size={16} />}
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                        <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                <Users size={48} className="mx-auto mb-4 opacity-20" />
                                <p>ไม่พบข้อมูลผู้ใช้งานที่ค้นหา</p>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
        <PaginationControls
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          totalItems={filteredUsers.length}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={setItemsPerPage}
          pageSizeOptions={[5, 10, 20, 50, 100]}
        />
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
                    <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">ยืนยันการลบข้อมูล?</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
                        คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้งาน <br/>
                        <span className="font-bold text-slate-900 dark:text-white">{userToDelete?.name}</span> <br/>
                        ออกจากระบบ? การกระทำนี้ไม่สามารถย้อนกลับได้
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => setIsDeleteModalOpen(false)}
                            className="bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 font-bold py-3 rounded-2xl hover:bg-slate-200 transition-all"
                        >
                            ยกเลิก
                        </button>
                        <button 
                            onClick={confirmDelete}
                            className="bg-rose-500 text-white font-bold py-3 rounded-2xl shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
                        >
                            ลบข้อมูล
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Add / Edit User Modal */}
      <AnimatePresence>
        {isModalOpen && (
            <div className="fixed inset-0 xl:left-72 xl:top-[65px] z-[300] flex items-center justify-center p-4 transition-all duration-300">
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                    onClick={() => setIsModalOpen(false)}
                />
                <motion.div 
                    initial={{ opacity: 0, y: 100, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 100, scale: 0.9 }}
                    className="glass-panel w-full max-w-xl bg-white dark:bg-[#030712] rounded-[2rem] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[68vh] sm:max-h-[72vh]"
                >
                    <div className="p-8 border-b border-gray-200 dark:border-white/5 bg-white/80 dark:bg-black/20 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-[#74045F]/10 dark:bg-[#C7911B]/10 flex items-center justify-center text-[#74045F] dark:text-[#C7911B]">
                                {editingUser ? <UserCog size={24} /> : <UserPlus size={24} />}
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-800 dark:text-white">
                                    {editingUser ? 'แก้ไขข้อมูลผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}
                                </h3>
                                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-0.5">
                                    {isVenderForm ? 'External User (Vender)' : 'Internal User (PEA Staff)'}
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setIsModalOpen(false)}
                            className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
                        <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
                            {/* Avatar Selection */}
                            <div className="flex flex-col items-center mb-8">
                                <div className="relative group">
                                    <div 
                                        className="w-24 h-24 rounded-full border-4 border-[#74045F]/20 dark:border-[#C7911B]/20 p-1 bg-white dark:bg-[#030712] shadow-xl overflow-hidden cursor-pointer"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <img 
                                            src={formData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name || 'User')}&background=74045F&color=fff`} 
                                            alt="User Avatar" 
                                            className="w-full h-full rounded-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Edit2 size={20} className="text-white" />
                                        </div>
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 flex gap-1">
                                        <button 
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="p-1.5 bg-[#74045F] dark:bg-[#C7911B] text-white dark:text-slate-900 rounded-full shadow-lg border border-white/20 hover:scale-110 transition-transform"
                                        >
                                            <Plus size={12} />
                                        </button>
                                        {formData.avatar && (
                                            <button 
                                                type="button"
                                                onClick={handleDeleteAvatar}
                                                className="p-1.5 bg-rose-500 text-white rounded-full shadow-lg border border-white/20 hover:scale-110 transition-transform"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        accept="image/*" 
                                        onChange={handleAvatarUpload}
                                    />
                                </div>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{editingUser ? 'แก้ไขรูปโปรไฟล์' : 'เพิ่มรูปโปรไฟล์ (ไม่บังคับ)'}</div>
                            </div>

                            {/* Form Type Selector - Only show when creating new user */}
                            {!editingUser && (
                                <div className="mb-8 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 text-center">เลือกประเภทผู้ใช้งาน</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            type="button"
                                            onClick={() => setFormData({...formData, role: 'INSPECTOR'})}
                                            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all border-2 ${!isVenderForm ? 'bg-[#74045F] border-[#74045F] text-white shadow-lg shadow-[#74045F]/20' : 'bg-transparent border-slate-200 dark:border-white/10 text-slate-500 hover:border-[#74045F]/30'}`}
                                        >
                                            <Building2 size={16} />
                                            พนักงาน กฟภ.
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setFormData({...formData, role: 'VENDER'})}
                                            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all border-2 ${isVenderForm ? 'bg-teal-500 border-teal-500 text-white shadow-lg shadow-teal-500/20' : 'bg-transparent border-slate-200 dark:border-white/10 text-slate-500 hover:border-teal-500/30'}`}
                                        >
                                            <Zap size={16} />
                                            พนักงานโรงไฟฟ้า
                                        </button>
                                    </div>
                                </div>
                            )}

                            {isVenderForm ? (
                                /* VENDER FORM - Powered by Power Plant */
                                <div className="space-y-6 animate-fade-in">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <InputField 
                                            label="รหัสผู้ประสานงาน *" 
                                            value={formData.employeeId || ''} 
                                            onChange={(val) => setFormData({...formData, employeeId: val})}
                                            disabled={!!editingUser}
                                            placeholder="ระบุรหัสผู้ประสานงาน"
                                        />
                                        <InputField 
                                            label="ชื่อ-นามสกุล *" 
                                            value={formData.name || ''} 
                                            onChange={(val) => setFormData({...formData, name: val})}
                                            placeholder="ระบุชื่อจริง-นามสกุล"
                                        />
                                        <InputField 
                                            label="ชื่อล็อกอิน (Username) *" 
                                            value={formData.username || ''} 
                                            onChange={(val) => setFormData({...formData, username: val})}
                                            disabled={!!editingUser}
                                            placeholder="ระบุชื่อผู้ใช้งาน"
                                        />
                                        <InputField 
                                            label={editingUser ? "รหัสผ่าน (เว้นว่างหากไม่ต้องการเปลี่ยน)" : "รหัสผ่าน *"} 
                                            type="password" 
                                            value={formData.password || ''} 
                                            onChange={(val) => setFormData({...formData, password: val})}
                                            placeholder={editingUser ? "••••••••" : "ระบุรหัสผ่านเข้าสู่ระบบ"}
                                        />
                                        <InputField 
                                            label="ตำแหน่ง" 
                                            value={formData.position || ''} 
                                            onChange={(val) => setFormData({...formData, position: val})}
                                            placeholder="เช่น ผู้ช่วยวิศวกรโครงการ"
                                        />
                                        <InputField 
                                            label="อีเมล" 
                                            type="email"
                                            value={formData.email || ''} 
                                            onChange={(val) => setFormData({...formData, email: val})}
                                            placeholder="example@email.com"
                                        />
                                        <InputField 
                                            label="เบอร์โทรศัพท์" 
                                            value={formData.phone || ''} 
                                            onChange={(val) => setFormData({...formData, phone: val})}
                                            placeholder="0xx-xxxxxxx"
                                        />
                                        <InputField 
                                            label="ชื่อโรงไฟฟ้า / บริษัท *" 
                                            value={formData.peaOffice || ''} 
                                            onChange={(val) => setFormData({...formData, peaOffice: val})}
                                            placeholder="ระบุชื่อโรงไฟฟ้าหรือบริษัทต้นสังกัด"
                                        />
                                        <div className="md:col-span-2">
                                            <InputField 
                                                label="หน่วยงาน / โครงการ" 
                                                value={formData.department || ''} 
                                                onChange={(val) => setFormData({...formData, department: val})}
                                                placeholder="ระบุชื่อโครงการหรืองานที่รับผิดชอบ"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* PEA STAFF FORM - ADMIN, MANAGER, INSPECTOR */
                                <div className="space-y-6 animate-fade-in">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <InputField 
                                            label="รหัสพนักงาน *" 
                                            value={formData.employeeId || ''} 
                                            onChange={(val) => setFormData({...formData, employeeId: val})}
                                            disabled={!!editingUser}
                                            placeholder="ระบุรหัสพนักงาน 6 หลัก"
                                        />
                                        <InputField 
                                            label="ชื่อ-นามสกุล *" 
                                            value={formData.name || ''} 
                                            onChange={(val) => setFormData({...formData, name: val})}
                                            placeholder="ระบุชื่อจริง-นามสกุล"
                                        />
                                        
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">สิทธิ์การใช้งาน (Role) *</label>
                                            <select 
                                                className="w-full bg-slate-100 dark:bg-white/5 border-2 border-transparent focus:border-[#74045F]/50 dark:focus:border-[#C7911B]/50 rounded-xl px-4 py-3 text-sm focus:outline-none transition-all"
                                                value={formData.role}
                                                onChange={(e) => setFormData({...formData, role: e.target.value as any})}
                                            >
                                                <option value="ADMIN">ADMIN (ผู้ดูแลระบบ)</option>
                                                <option value="MANAGER">MANAGER (ผู้บริหาร)</option>
                                                <option value="INSPECTOR">INSPECTOR (ผู้ตรวจสอบ)</option>
                                            </select>
                                        </div>

                                        <InputField 
                                            label="ตำแหน่ง" 
                                            value={formData.position || ''} 
                                            onChange={(val) => setFormData({...formData, position: val})}
                                            placeholder="เช่น วิศวกรไฟฟ้า"
                                        />
                                        <InputField 
                                            label="ชื่อล็อกอิน (รหัสพนักงาน) *" 
                                            value={formData.username || ''} 
                                            onChange={(val) => setFormData({...formData, username: val})}
                                            disabled={!!editingUser}
                                            placeholder="ใช้รหัสพนักงานในการเข้าสู่ระบบ"
                                        />
                                        <InputField 
                                            label={editingUser ? "รหัสผ่าน (เว้นว่างหากไม่ต้องการเปลี่ยน)" : "รหัสผ่าน *"} 
                                            type="password" 
                                            value={formData.password || ''} 
                                            onChange={(val) => setFormData({...formData, password: val})}
                                            placeholder="ระบุรหัสผ่านเข้าสู่ระบบ"
                                        />
                                        <InputField 
                                            label="อีเมล" 
                                            type="email"
                                            value={formData.email || ''} 
                                            onChange={(val) => setFormData({...formData, email: val})}
                                            placeholder="example@pea.co.th"
                                        />
                                        <InputField 
                                            label="เบอร์โทรศัพท์" 
                                            value={formData.phone || ''} 
                                            onChange={(val) => setFormData({...formData, phone: val})}
                                            placeholder="0xx-xxxxxxx"
                                        />
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">สังกัดสำนักงานเขต *</label>
                                            <select 
                                                className="w-full bg-slate-100 dark:bg-white/5 border-2 border-transparent focus:border-[#74045F]/50 dark:focus:border-[#C7911B]/50 rounded-xl px-4 py-3 text-sm focus:outline-none transition-all"
                                                value={formData.peaOffice || ''}
                                                onChange={(e) => setFormData({...formData, peaOffice: e.target.value})}
                                            >
                                                <option value="" disabled>เลือกสังกัดสำนักงานเขต</option>
                                                <option value="การไฟฟ้าส่วนภูมิภาค เขต 1 (ภาคเหนือ) จังหวัดเชียงใหม่">การไฟฟ้าส่วนภูมิภาค เขต 1 (ภาคเหนือ) จังหวัดเชียงใหม่</option>
                                                <option value="การไฟฟ้าส่วนภูมิภาค เขต 2 (ภาคเหนือ) จังหวัดพิษณุโลก">การไฟฟ้าส่วนภูมิภาค เขต 2 (ภาคเหนือ) จังหวัดพิษณุโลก</option>
                                                <option value="การไฟฟ้าส่วนภูมิภาค เขต 3 (ภาคเหนือ) จังหวัดลพบุรี">การไฟฟ้าส่วนภูมิภาค เขต 3 (ภาคเหนือ) จังหวัดลพบุรี</option>
                                                <option value="การไฟฟ้าส่วนภูมิภาค เขต 1 (ภาคตะวันออกเฉียงเหนือ) จังหวัดอุดรธานี">การไฟฟ้าส่วนภูมิภาค เขต 1 (ภาคตะวันออกเฉียงเหนือ) จังหวัดอุดรธานี</option>
                                                <option value="การไฟฟ้าส่วนภูมิภาค เขต 2 (ภาคตะวันออกเฉียงเหนือ) จังหวัดอุบลราชธานี">การไฟฟ้าส่วนภูมิภาค เขต 2 (ภาคตะวันออกเฉียงเหนือ) จังหวัดอุบลราชธานี</option>
                                                <option value="การไฟฟ้าส่วนภูมิภาค เขต 3 (ภาคตะวันออกเฉียงเหนือ) จังหวัดนครราชสีมา">การไฟฟ้าส่วนภูมิภาค เขต 3 (ภาคตะวันออกเฉียงเหนือ) จังหวัดนครราชสีมา</option>
                                                <option value="การไฟฟ้าส่วนภูมิภาค เขต 1 (ภาคกลาง) จังหวัดพระนครศรีอยุธยา">การไฟฟ้าส่วนภูมิภาค เขต 1 (ภาคกลาง) จังหวัดพระนครศรีอยุธยา</option>
                                                <option value="การไฟฟ้าส่วนภูมิภาค เขต 2 (ภาคกลาง) จังหวัดชลบุรี">การไฟฟ้าส่วนภูมิภาค เขต 2 (ภาคกลาง) จังหวัดชลบุรี</option>
                                                <option value="การไฟฟ้าส่วนภูมิภาค เขต 3 (ภาคกลาง) จังหวัดนครปฐม">การไฟฟ้าส่วนภูมิภาค เขต 3 (ภาคกลาง) จังหวัดนครปฐม</option>
                                                <option value="การไฟฟ้าส่วนภูมิภาค เขต 1 (ภาคใต้) จังหวัดเพชรบุรี">การไฟฟ้าส่วนภูมิภาค เขต 1 (ภาคใต้) จังหวัดเพชรบุรี</option>
                                                <option value="การไฟฟ้าส่วนภูมิภาค เขต 2 (ภาคใต้) จังหวัดนครศรีธรรมราช">การไฟฟ้าส่วนภูมิภาค เขต 2 (ภาคใต้) จังหวัดนครศรีธรรมราช</option>
                                                <option value="การไฟฟ้าส่วนภูมิภาค เขต 3 (ภาคใต้) จังหวัดยะลา">การไฟฟ้าส่วนภูมิภาค เขต 3 (ภาคใต้) จังหวัดยะลา</option>
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">สังกัดกอง *</label>
                                            <select 
                                                className="w-full bg-slate-100 dark:bg-white/5 border-2 border-transparent focus:border-[#74045F]/50 dark:focus:border-[#C7911B]/50 rounded-xl px-4 py-3 text-sm focus:outline-none transition-all"
                                                value={formData.department || ''}
                                                onChange={(e) => setFormData({...formData, department: e.target.value})}
                                            >
                                                <option value="" disabled>เลือกสังกัดกอง</option>
                                                <option value="กองสนับสนุนงานเขต">กองสนับสนุนงานเขต</option>
                                                <option value="กองวิศวกรรมและวางแผน">กองวิศวกรรมและวางแผน</option>
                                                <option value="กองบริการลูกค้า">กองบริการลูกค้า</option>
                                                <option value="กองก่อสร้างระบบไฟฟ้าและงานโยธา">กองก่อสร้างระบบไฟฟ้าและงานโยธา</option>
                                                <option value="กองปฏิบัติการ">กองปฏิบัติการ</option>
                                                <option value="กองบำรุงรักษาระบบจำหน่าย">กองบำรุงรักษาระบบจำหน่าย</option>
                                                <option value="กองบำรุงรักษาสถานีไฟฟ้า">กองบำรุงรักษาสถานีไฟฟ้า</option>
                                                <option value="กองบัญชีและเศรษฐกิจพลังงานไฟฟ้า">กองบัญชีและเศรษฐกิจพลังงานไฟฟ้า</option>
                                                <option value="กองบริหารพัสดุ">กองบริหารพัสดุ</option>
                                                <option value="กองเทคโนโลยีดิจิทัลและการสื่อสาร">กองเทคโนโลยีดิจิทัลและการสื่อสาร</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Status and Account Management */}
                            <div className="mt-8 p-4 rounded-2xl border transition-all flex items-center justify-between bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${formData.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                        {formData.status === 'ACTIVE' ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                            สถานะบัญชี (Account Status)
                                        </div>
                                        <div className="text-[10px] text-slate-500 uppercase tracking-widest">{formData.status === 'ACTIVE' ? 'Active Account' : 'Inactive Account'}</div>
                                    </div>
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => setFormData({...formData, status: formData.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'})}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                        formData.status === 'ACTIVE' 
                                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                                          : 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                                    }`}
                                >
                                    {formData.status === 'ACTIVE' ? 'Active' : 'Suspended'}
                                </button>
                            </div>
                        </div>

                        <div className="p-5 border-t border-gray-200 dark:border-white/5 bg-white/50 dark:bg-white/5 flex gap-3 flex-shrink-0">
                            <button 
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                disabled={isSyncing}
                                className="flex-1 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 font-bold py-2.5 rounded-2xl hover:bg-slate-200 dark:hover:bg-white/10 transition-all disabled:opacity-50"
                            >
                                ยกเลิก
                            </button>
                            <button 
                                type="submit"
                                disabled={isSyncing}
                                className={`flex-[2] bg-gradient-to-r ${isVenderForm ? 'from-teal-500 to-emerald-500' : 'from-[#74045F] to-[#C7911B]'} text-white font-bold py-2.5 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50`}
                            >
                                {isSyncing && <Loader2 className="animate-spin" size={16} />}
                                {isSyncing ? 'กำลังบันทึก...' : (editingUser ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ใช้งานใหม่')}
                            </button>
                        </div>
                    </form>
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
                {batchDeleteType === 'SELECTED' ? 'ยืนยันการลบผู้ใช้งานเฉพาะที่เลือก?' : 'ยืนยันการลบผู้ใช้งานทั้งหมด?'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                {batchDeleteType === 'SELECTED' ? (
                  <>คุณกำลังจะลบบัญชีผู้ใช้งานที่เลือกจำนวน <span className="font-black text-rose-500">{selectedEmployeeIds.length}</span> รายการ ข้อมูลในระบบและ Firebase จะถูกลบถาวร</>
                ) : (
                  <>คุณกำลังจะลบบัญชีผู้ใช้งานทั้งหมดตามตัวกรองจำนวน <span className="font-black text-rose-500">{filteredUsers.length}</span> รายการ ข้อมูลในระบบและ Firebase จะถูกลบถาวร</>
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

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className={`fixed bottom-8 right-8 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-[1000] ${
                  toast.type === 'success' 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-rose-500 text-white'
              }`}
          >
              {toast.type === 'success' ? <Check size={20} /> : <ShieldAlert size={20} />}
              <span className="font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const InputField: React.FC<{ label: string; value: string; onChange: (v: string) => void; type?: string; disabled?: boolean; placeholder?: string }> = ({ label, value, onChange, type = "text", disabled = false, placeholder = "" }) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
    <input 
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full bg-slate-100 dark:bg-white/5 border-2 border-transparent focus:border-[#74045F]/50 dark:focus:border-[#C7911B]/50 rounded-xl px-4 py-3 text-sm focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    />
  </div>
);

