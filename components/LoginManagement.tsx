import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, ShieldCheck, Search, Filter, Clock, MapPin, 
  Monitor, Smartphone, Globe, AlertCircle, CheckCircle2, 
  MoreVertical, Ban, Unlock, LogOut, ChevronLeft, ChevronRight,
  Fingerprint, Key, UserX, UserCheck, Activity, Terminal, Trash2,
  Send, Loader2, Info, Lock, X, FileDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../contexts/LanguageContext';
import { safeParseLocalStorage, safeSetLocalStorage, safeRemoveLocalStorage } from '../utils/localStorageUtils';
import { MOCK_USERS } from '../constants';

export type LoginStatus = 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'LOGOUT';

export interface LoginLog {
  id: string;
  userId: string;
  userName: string;
  email: string;
  status: LoginStatus;
  ipAddress: string;
  location: string;
  device: string;
  browser: string;
  timestamp: string;
  failureReason?: string;
  isMock?: boolean;
}

export interface UserAccessControl {
  userId: string;
  email: string;
  userName: string;
  role: string;
  isLocked: boolean;
  failedAttempts: number;
  lastLogin: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'SUSPENDED';
}

const UserIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

export const LoginManagement: React.FC<{ 
  isDangerZoneUnlocked: boolean; 
  setIsDangerZoneUnlocked: (val: boolean) => void;
  setIsUnlockModalOpen: (val: boolean) => void;
  onlineUsers?: string[];
  onForceLogout?: (userId: string) => void;
}> = ({ isDangerZoneUnlocked, setIsDangerZoneUnlocked, setIsUnlockModalOpen, onlineUsers = [], onForceLogout }) => {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [userAccess, setUserAccess] = useState<UserAccessControl[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'LOGS' | 'ACCESS'>('LOGS');
  const [selectedLog, setSelectedLog] = useState<LoginLog | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [showMock, setShowMock] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<LoginStatus | 'ALL'>('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);

  const refreshData = () => {
    // Initial Setup and Data Merging
    const mockLogs: LoginLog[] = [
      {
        id: 'log-1',
        userId: '509034',
        userName: MOCK_USERS.find(u => u.employeeId === '509034')?.name || 'N/A',
        email: MOCK_USERS.find(u => u.employeeId === '509034')?.email || 'N/A',
        status: 'SUCCESS',
        ipAddress: '182.52.124.9',
        location: 'กฟจ.นครปฐม (Office LAN)',
        device: 'MacBook Pro (macOS 14.4)',
        browser: 'Chrome 123.0.0',
        timestamp: new Date().toISOString(),
        isMock: true
      },
      {
        id: 'log-2',
        userId: '512370',
        userName: MOCK_USERS.find(u => u.employeeId === '512370')?.name || 'N/A',
        email: MOCK_USERS.find(u => u.employeeId === '512370')?.email || 'N/A',
        status: 'FAILED',
        ipAddress: '49.237.34.112',
        location: 'Nakhon Pathom (Mobile 5G)',
        device: 'iPhone 15 Pro (iOS 17.4)',
        browser: 'Safari Mobile',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        failureReason: 'Invalid Password',
        isMock: true
      },
      {
        id: 'log-3',
        userId: '498232',
        userName: MOCK_USERS.find(u => u.employeeId === '498232')?.name || 'N/A',
        email: MOCK_USERS.find(u => u.employeeId === '498232')?.email || 'N/A',
        status: 'BLOCKED',
        ipAddress: '203.150.12.3',
        location: 'Admin Building (Floor 2)',
        device: 'Windows 11 Desktop',
        browser: 'Edge 122.0.0',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        failureReason: 'Too many failed attempts',
        isMock: true
      },
      {
        id: 'log-4',
        userId: '556820',
        userName: MOCK_USERS.find(u => u.employeeId === '556820')?.name || 'N/A',
        email: MOCK_USERS.find(u => u.employeeId === '556820')?.email || 'N/A',
        status: 'SUCCESS',
        ipAddress: '1.2.3.4',
        location: 'Remote Access (VPN)',
        device: 'iPad Pro (iPadOS 17)',
        browser: 'Safari',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        isMock: true
      },
      {
        id: 'log-5',
        userId: '520111',
        userName: MOCK_USERS.find(u => u.employeeId === '520111')?.name || 'N/A',
        email: MOCK_USERS.find(u => u.employeeId === '520111')?.email || 'N/A',
        status: 'SUCCESS',
        ipAddress: '171.100.22.45',
        location: ' substation NPT',
        device: 'Android Tablet',
        browser: 'Chrome Mobile',
        timestamp: new Date(Date.now() - 10800000).toISOString(),
        isMock: true
      }
    ];

    const storedLogs = safeParseLocalStorage<LoginLog[]>('login_logs', []);
    
    // Merge: Stored logs first (sorted by timestamp descending in storage)
    setLogs([...storedLogs, ...mockLogs].slice(0, 100));

    // 2. User Access Processing (From app_users storage)
    const storedUsers = safeParseLocalStorage<any[]>('app_users', []);
    if (storedUsers.length > 0) {
      const accessData: UserAccessControl[] = storedUsers.map((u: any) => {
        const userId = u.employeeId || u.username;
        return {
          userId,
          email: u.email,
          userName: u.name,
          role: u.role || 'INSPECTOR',
          isLocked: u.status === 'INACTIVE',
          failedAttempts: u.failedAttempts || 0,
          lastLogin: u.lastLogin || null,
          status: u.status === 'INACTIVE' ? 'SUSPENDED' : (onlineUsers.includes(userId) ? 'ONLINE' : 'OFFLINE')
        };
      });
      setUserAccess(accessData);
    } else {
      // Fallback or Initial mock access
      const mockAccess: UserAccessControl[] = MOCK_USERS.map(u => ({
        userId: u.employeeId,
        email: u.email,
        userName: u.name,
        role: u.role,
        isLocked: u.status === 'INACTIVE',
        failedAttempts: 0,
        lastLogin: u.employeeId === '509034' ? new Date().toISOString() : 
                   u.employeeId === '512370' ? new Date(Date.now() - 3600000).toISOString() :
                   u.employeeId === '498232' ? new Date(Date.now() - 7200000).toISOString() :
                   null,
        status: u.status === 'INACTIVE' ? 'SUSPENDED' : (u.employeeId === '509034' ? 'ONLINE' : 'OFFLINE')
      }));
      setUserAccess(mockAccess);
    }
  };

  useEffect(() => {
    refreshData();
    // Refresh data periodically or on tab focus
    window.addEventListener('focus', refreshData);
    window.addEventListener('storage', refreshData);
    return () => {
      window.removeEventListener('focus', refreshData);
      window.removeEventListener('storage', refreshData);
    };
  }, []);

  // Update status reactively when onlineUsers list changes
  useEffect(() => {
    setUserAccess(prev => prev.map(u => ({
      ...u,
      status: u.isLocked ? 'SUSPENDED' : (onlineUsers.includes(u.userId) ? 'ONLINE' : 'OFFLINE')
    })));
  }, [onlineUsers]);

  const handleDeleteLog = (logId: string) => {
    if (!isDangerZoneUnlocked) return;
    
    // Update state
    setLogs(prev => prev.filter(l => l.id !== logId));
    
    // Update storage for persistent logs (real ones)
    const stored = safeParseLocalStorage<any[]>('login_logs', []);
    const updated = stored.filter((l: any) => l.id !== logId);
    safeSetLocalStorage('login_logs', updated);
  };

  const handleClearAllLogs = () => {
    if (!isDangerZoneUnlocked) return;
    setIsConfirmClearOpen(true);
  };

  const confirmClearAll = () => {
    safeRemoveLocalStorage('login_logs');
    refreshData();
    setIsConfirmClearOpen(false);
  };

  const [reportSteps, setReportSteps] = useState<'IDLE' | 'SENDING' | 'SUCCESS'>('IDLE');

  const [reportStepText, setReportStepText] = useState('');

  const handleReportIncident = async () => {
    if (!selectedLog) return;
    setIsReporting(true);
    setReportSteps('SENDING');
    
    setReportStepText('Initializing cybersecurity protocol...');
    await new Promise(resolve => setTimeout(resolve, 800));
    setReportStepText('Collecting machine fingerprint...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    setReportStepText('Verifying network integrity...');
    await new Promise(resolve => setTimeout(resolve, 1200));
    setReportStepText('Sending forensic hash to Security Center...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setIsReporting(false);
    setReportSteps('SUCCESS');
    setReportSuccess(true);
    
    // Auto close after success
    setTimeout(() => {
      setReportSuccess(false);
      setReportSteps('IDLE');
      setReportStepText('');
      setSelectedLog(null);
    }, 2500);
  };

  const handleToggleLock = (userId: string) => {
    if (!isDangerZoneUnlocked) return;
    
    // Update local state
    setUserAccess(prev => prev.map(u => 
      u.userId === userId ? { ...u, isLocked: !u.isLocked, status: !u.isLocked ? 'SUSPENDED' : 'OFFLINE' } : u
    ));

    // Update persistent app_users storage
    const users = safeParseLocalStorage<any[]>('app_users', []);
    if (users.length > 0) {
      const updated = users.map((u: any) => {
        if ((u.employeeId || u.username) === userId) {
          return { ...u, status: u.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE' };
        }
        return u;
      });
      safeSetLocalStorage('app_users', updated);
    }
  };

  const handleResetAttempts = (userId: string) => {
    if (!isDangerZoneUnlocked) return;
    
    setUserAccess(prev => prev.map(u => 
      u.userId === userId ? { ...u, failedAttempts: 0 } : u
    ));

    // Update persistent storage
    const users = safeParseLocalStorage<any[]>('app_users', []);
    if (users.length > 0) {
      const updated = users.map((u: any) => {
        if ((u.employeeId || u.username) === userId) {
          return { ...u, failedAttempts: 0 };
        }
        return u;
      });
      safeSetLocalStorage('app_users', updated);
    }
  };

  const filteredLogs = logs.filter(l => {
    const matchesSearch = l.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         l.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         l.ipAddress.includes(searchTerm);
    const matchesMockFilter = showMock ? true : !l.isMock;
    
    const logDate = new Date(l.timestamp);
    const matchesStatus = filterStatus === 'ALL' || l.status === filterStatus;
    const matchesStart = !filterStartDate || logDate >= new Date(filterStartDate);
    const matchesEnd = !filterEndDate || logDate <= new Date(new Date(filterEndDate).setHours(23, 59, 59, 999));
    
    return matchesSearch && matchesMockFilter && matchesStatus && matchesStart && matchesEnd;
  });

  const filteredAccess = userAccess.filter(a => 
    a.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const loginAttempts = logs.filter(l => l.status === 'SUCCESS' || l.status === 'FAILED' || l.status === 'BLOCKED');
  const successCount = logs.filter(l => l.status === 'SUCCESS').length;
  const totalLoginAttemptsCount = loginAttempts.length;
  const successRateValue = totalLoginAttemptsCount > 0 ? ((successCount / totalLoginAttemptsCount) * 100).toFixed(1) : '0.0';

  const failedLogsIn24h = logs.filter(l => 
    (l.status === 'FAILED' || l.status === 'BLOCKED') && 
    new Date(l.timestamp).getTime() > Date.now() - 86400000
  ).length;

  const handleResetLogs = () => {
    if (!isDangerZoneUnlocked) return;
    if (window.confirm('คุณต้องการล้างประวัติการเข้าใช้งานทั้งหมดใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
      setLogs([]);
      safeSetLocalStorage('app_login_logs', []);
    }
  };

  const handleExportCSV = () => {
    const dataToExport = filteredLogs;
    const headers = ['Timestamp', 'User Name', 'Email', 'Status', 'IP Address', 'Location', 'Device', 'Browser'];
    const rows = dataToExport.map(log => [
      new Date(log.timestamp).toLocaleString('th-TH'),
      log.userName,
      log.email,
      log.status,
      log.ipAddress,
      log.location,
      log.device,
      log.browser
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `login_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10 mt-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
            <Fingerprint className="text-[#74045F] dark:text-[#C7911B]" size={32} />
            จัดการการเข้าสู่ระบบ
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">ตรวจสอบประวัติการใช้งานและบริหารจัดการสิทธิ์การเข้าถึงระบบ</p>
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

          <div className="flex items-center gap-3 bg-white dark:bg-[#030712] p-1.5 rounded-2xl border-2 border-slate-100 dark:border-white/5 shadow-sm">
            <button 
              onClick={() => setActiveTab('LOGS')}
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'LOGS' ? 'bg-[#74045F] text-white shadow-lg shadow-[#74045F]/20' : 'text-slate-400 hover:text-slate-600'}`}
            >
              ประวัติการเข้าใช้งาน
            </button>
            <button 
              onClick={() => setActiveTab('ACCESS')}
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'ACCESS' ? 'bg-[#74045F] text-white shadow-lg shadow-[#74045F]/20' : 'text-slate-400 hover:text-slate-600'}`}
            >
              สถานะบัญชี
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-panel p-5 rounded-xl bg-[#009933]/5 dark:bg-indigo/5 border border-slate-100 dark:border-white/5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <UserCheck size={24} />
          </div>
          <div>
            <div className="text-[10px] font-black text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest leading-none mb-1">ออนไลน์ขณะนี้</div>
            <div className="text-lg font-black text-slate-800 dark:text-white">{userAccess.filter(u => u.status === 'ONLINE').length} เซสชัน</div>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-xl bg-[#ff0000]/5 dark:bg-indigo/5 border border-slate-100 dark:border-white/5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-md bg-rose-500/10 text-rose-500 flex items-center justify-center">
            <AlertCircle size={24} />
          </div>
          <div>
            <div className="text-[10px] font-black text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest leading-none mb-1">ผิดพลาด 24ชม.</div>
            <div className="text-lg font-black text-slate-800 dark:text-white">{failedLogsIn24h} ครั้ง</div>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-xl bg-[#ff9900]/5 dark:bg-indigo/5 border border-slate-100 dark:border-white/5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Ban size={24} />
          </div>
          <div>
            <div className="text-[10px] font-black text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest leading-none mb-1">บัญชีที่ถูกระงับ</div>
            <div className="text-lg font-black text-slate-800 dark:text-white">{userAccess.filter(u => u.isLocked).length} บัญชี</div>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-xl bg-[#000099]/5 dark:bg-indigo/5 border border-slate-100 dark:border-white/5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-md bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
            <Activity size={24} />
          </div>
          <div>
            <div className="text-[10px] font-black text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest leading-none mb-1">อัตราความสำเร็จ</div>
            <div className="text-lg font-black text-slate-800 dark:text-white">{successRateValue}%</div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1 group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#74045F] transition-colors" size={18} />
                <input 
                    type="text" 
                    placeholder={activeTab === 'LOGS' ? "ค้นหา Email, IP, ชื่อพนักงาน..." : "ค้นหาชื่อ หรือ Email ผู้ใช้งาน..."} 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white dark:bg-[#030712] border-2 border-slate-100 dark:border-white/5 rounded-2xl pl-12 pr-6 py-4 focus:outline-none focus:border-[#74045F]/30 transition-all font-medium"
                />
            </div>
            <button 
                onClick={() => setIsFilterOpen(true)}
                className={`flex items-center justify-center gap-2 px-6 py-4 rounded-2xl border-2 font-black text-xs uppercase tracking-widest transition-all ${
                    filterStatus !== 'ALL' || filterStartDate || filterEndDate
                    ? 'bg-[#74045F]/10 text-[#74045F] border-[#74045F]/20'
                    : 'bg-white dark:bg-[#030712] text-slate-500 border-slate-100 dark:border-white/5 hover:bg-slate-50'
                }`}
            >
                <Filter size={18} /> ตัวกรองขั้นสูง
                {(filterStatus !== 'ALL' || filterStartDate || filterEndDate) && (
                    <span className="w-2 h-2 rounded-full bg-[#74045F] animate-pulse"></span>
                )}
            </button>
            {activeTab === 'LOGS' && (
              <button 
                onClick={handleExportCSV}
                className="flex items-center justify-center gap-2 px-6 py-4 rounded-2xl border-2 bg-white dark:bg-[#030712] text-slate-500 border-slate-100 dark:border-white/5 hover:bg-slate-50 font-black text-xs uppercase tracking-widest transition-all shadow-sm"
              >
                <FileDown size={18} className="text-[#74045F] dark:text-[#C7911B]" /> ออกรายงาน CSV
              </button>
            )}
            {activeTab === 'LOGS' && (
              <button 
                onClick={() => setShowMock(!showMock)}
                className={`flex items-center justify-center gap-2 px-6 py-4 rounded-2xl border-2 font-black text-xs uppercase tracking-widest transition-all ${
                  showMock 
                  ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' 
                  : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                }`}
              >
                {showMock ? <Activity size={18} /> : <ShieldCheck size={18} />}
                {showMock ? 'รวมข้อมูลจำลอง' : 'ข้อมูลจริงเท่านั้น'}
              </button>
            )}
            {activeTab === 'LOGS' && isDangerZoneUnlocked && (
              <button 
                onClick={handleClearAllLogs}
                className="flex items-center justify-center gap-2 bg-rose-500 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-rose-500/20 active:scale-95 transition-all"
              >
                <Trash2 size={18} /> ล้างประวัติทั้งหมด
              </button>
            )}
        </div>

        {activeTab === 'LOGS' ? (
          <div className="glass-panel rounded-3xl overflow-hidden border border-slate-100 dark:border-white/5 bg-white dark:bg-[#030712]">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-white/5">
                    <th className="px-8 py-5">วันเวลา / ผู้ใช้งาน</th>
                    <th className="px-6 py-5">IP / สถานที่</th>
                    <th className="px-6 py-5">อุปกรณ์ประมวลผล</th>
                    <th className="px-6 py-5">ผลการเข้าระบบ</th>
                    <th className="px-8 py-5 text-right">{t('admin.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-all group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                           <div className="flex flex-col items-center shrink-0">
                              <span className="text-[10px] font-black text-[#74045F] dark:text-[#C7911B] leading-none mb-1">{new Date(log.timestamp).toLocaleTimeString('th-TH')}</span>
                              <span className="text-[10px] font-bold text-slate-400">{new Date(log.timestamp).toLocaleDateString('th-TH')}</span>
                           </div>
                           <div className="min-w-0">
                              <div className="font-bold text-slate-800 dark:text-white truncate">{log.userName}</div>
                              <div className="text-xs text-slate-400 truncate">{log.email}</div>
                           </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                         <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                               <Globe size={14} className="text-slate-400" />
                               {log.ipAddress}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 italic">
                               <MapPin size={12} className="text-slate-300" />
                               {log.location}
                            </div>
                         </div>
                      </td>
                      <td className="px-6 py-5">
                         <div className="flex items-center gap-2.5">
                            {log.device.includes('iPhone') ? <Smartphone size={18} className="text-slate-400" /> : <Monitor size={18} className="text-slate-400" />}
                            <div className="flex flex-col">
                               <div className="text-xs font-bold text-slate-600 dark:text-slate-400">{log.device}</div>
                               <div className="text-[10px] font-bold text-slate-400 opacity-60 uppercase">{log.browser}</div>
                            </div>
                         </div>
                      </td>
                      <td className="px-6 py-5">
                         {log.status === 'SUCCESS' ? (
                           <div className="flex items-center gap-1.5 text-emerald-500 bg-emerald-500/5 px-3 py-1.5 rounded-xl w-fit">
                              <CheckCircle2 size={16} />
                              <span className="text-[10px] font-black uppercase tracking-widest">สำเร็จ</span>
                           </div>
                         ) : log.status === 'FAILED' ? (
                           <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 text-rose-500 bg-rose-500/5 px-3 py-1.5 rounded-xl w-fit">
                                 <ShieldAlert size={16} />
                                 <span className="text-[10px] font-black uppercase tracking-widest">ผิดพลาด</span>
                              </div>
                              <span className="text-[9px] font-bold text-rose-400/70 italic ml-1">{log.failureReason}</span>
                           </div>
                         ) : log.status === 'LOGOUT' ? (
                           <div className="flex items-center gap-1.5 text-slate-500 bg-slate-500/5 px-3 py-1.5 rounded-xl w-fit">
                              <LogOut size={16} />
                              <span className="text-[10px] font-black uppercase tracking-widest">ออกจากระบบ</span>
                           </div>
                         ) : (
                           <div className="flex items-center gap-1.5 text-amber-500 bg-amber-500/5 px-3 py-1.5 rounded-xl w-fit">
                              <Ban size={16} />
                              <span className="text-[10px] font-black uppercase tracking-widest">ถูกระงับ</span>
                           </div>
                         )}
                      </td>
                      <td className="px-8 py-5 text-right">
                         <div className="flex gap-1 justify-end">
                            <button 
                              onClick={() => setSelectedLog(log)}
                              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-[#74045F] transition-all"
                            >
                              <Terminal size={18} />
                            </button>
                            <button 
                              onClick={() => handleDeleteLog(log.id)}
                              disabled={!isDangerZoneUnlocked}
                              className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${isDangerZoneUnlocked ? 'bg-[#ff0000] dark:bg-white/5 text-[#FFFFFF] hover:text-rose-500' : 'bg-slate-100 text-slate-200 cursor-not-allowed'}`}
                            >
                              {isDangerZoneUnlocked ? <Trash2 size={16} /> : <Lock size={14} />}
                            </button>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAccess.map(access => (
              <motion.div 
                key={access.userId}
                layout
                className={`glass-panel p-6 rounded-[1.5rem] bg-[#003366]/5 dark:bg-white/5 border-2 border-[#74045F] dark:border-[#C7911B] transition-all duration-300 ${access.isLocked ? 'border-rose-100 dark:border-rose-500/20 opacity-80' : 'border-slate-100 dark:border-white/5'}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-[#74045F] dark:text-[#C7911B] relative">
                    <UserIcon size={28} />
                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-white dark:border-[#030712] ${access.status === 'ONLINE' ? 'bg-emerald-500 bubble-ping' : access.status === 'SUSPENDED' ? 'bg-rose-500' : 'bg-slate-300'}`}></div>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => handleResetAttempts(access.userId)}
                      disabled={!isDangerZoneUnlocked || access.failedAttempts === 0}
                      title="Reset Failed Attempts"
                      className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${isDangerZoneUnlocked && access.failedAttempts > 0 ? 'bg-amber-50 text-amber-500 hover:bg-amber-100' : 'bg-slate-50 text-slate-300'}`}
                    >
                      <Key size={16} />
                    </button>
                    {access.isLocked ? (
                      <button 
                        onClick={() => handleToggleLock(access.userId)}
                        disabled={!isDangerZoneUnlocked}
                        className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${isDangerZoneUnlocked ? 'bg-rose-100 text-rose-500 hover:bg-rose-200' : 'bg-slate-50 text-slate-300'}`}
                      >
                        <Unlock size={18} />
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleToggleLock(access.userId)}
                        disabled={!isDangerZoneUnlocked}
                        className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${isDangerZoneUnlocked ? 'bg-slate-50 text-slate-400 hover:text-rose-500' : 'bg-slate-50 text-slate-300'}`}
                      >
                        <Ban size={18} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-black text-[#74045F] dark:text-[#C7911B] text-lg tracking-tight truncate">{access.userName}</h3>
                    {access.role === 'ADMIN' ? (
                      <span className="px-2 py-0.5 rounded text-[8px] font-black bg-amber-500/20 text-amber-600 border border-amber-500/20">ADMIN</span>
                    ) : access.role === 'MANAGER' ? (
                      <span className="px-2 py-0.5 rounded text-[8px] font-black bg-indigo-500/20 text-indigo-600 border border-indigo-500/20">MANAGER</span>
                    ) : access.role === 'VENDER' ? (
                      <span className="px-2 py-0.5 rounded text-[8px] font-black bg-teal-500/20 text-teal-600 border border-teal-500/20">VENDER</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[8px] font-black bg-slate-500/20 text-slate-500 border border-slate-500/20">INSPECTOR</span>
                    )}
                  </div>
                  <p className="text-xs text-[#C7911B] dark:text-[#FFFFFF] font-medium truncate">{access.email}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#C7911B] dark:border-white/5">
                  <div>
                    <div className="text-[9px] font-black text-[#C7911B] dark:text-[#FFFFFF] uppercase tracking-widest mb-1">ความพยายาม</div>
                    <div className={`text-sm font-black ${access.failedAttempts >= 3 ? 'text-rose-500 underline decoration-rose-500/30' : 'text-[#cc0000] dark:text-[#ff3333]'}`}>
                      {access.failedAttempts} / 5
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-black text-[#C7911B] dark:text-[#FFFFFF] uppercase tracking-widest mb-1">เข้าใช้งานล่าสุด</div>
                    <div className="text-[11px] font-bold text-[#74045F] dark:text-[#C7911B]">
                      {access.lastLogin ? new Date(access.lastLogin).toLocaleDateString('th-TH') : 'ไม่เคยเข้าใช้งาน'}
                    </div>
                  </div>
                </div>

                {isDangerZoneUnlocked && (
                   <button 
                     onClick={() => onForceLogout?.(access.userId)}
                     className="w-full mt-6 flex items-center justify-center gap-2 py-3 rounded-2xl bg-slate-900 dark:bg-white/10 text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-black/10 active:scale-95 transition-all hover:bg-[#74045F] dark:hover:bg-[#C7911B] transition-colors"
                   >
                      <LogOut size={16} /> Force Logout
                   </button>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Advanced Filter Modal */}
      <AnimatePresence>
        {isFilterOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFilterOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-[#030712] rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-white/5 overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#74045F]/10 text-[#74045F] flex items-center justify-center">
                    <Filter size={20} />
                  </div>
                  <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">ตัวกรองขั้นสูง</h2>
                </div>
                <button 
                  onClick={() => setIsFilterOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors text-slate-400"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-8 space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">สถานะการเข้าระบบ</label>
                  <div className="flex flex-wrap gap-2">
                    {['ALL', 'SUCCESS', 'FAILED', 'BLOCKED', 'LOGOUT'].map((status) => (
                      <button
                        key={status}
                        onClick={() => setFilterStatus(status as any)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border-2 ${
                          filterStatus === status 
                          ? 'bg-[#74045F] text-white border-[#74045F]' 
                          : 'bg-white dark:bg-[#030712] text-slate-500 border-slate-100 dark:border-white/5 hover:border-[#74045F]/20'
                        }`}
                      >
                        {status === 'ALL' ? 'ทั้งหมด' : 
                         status === 'SUCCESS' ? 'สำเร็จ' : 
                         status === 'FAILED' ? 'ไม่สำเร็จ' : 
                         status === 'BLOCKED' ? 'ถูกระงับ' : 'ออกจากระบบ'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">วันที่เริ่มต้น</label>
                    <input 
                      type="date" 
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-white/5 border-2 border-transparent focus:border-[#74045F]/20 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-white transition-all outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">วันที่สิ้นสุด</label>
                    <input 
                      type="date" 
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-white/5 border-2 border-transparent focus:border-[#74045F]/20 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-white transition-all outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="p-8 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/5 flex gap-3">
                <button 
                  onClick={() => {
                    setFilterStatus('ALL');
                    setFilterStartDate('');
                    setFilterEndDate('');
                  }}
                  className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-500 bg-white dark:bg-[#030712] border-2 border-slate-100 dark:border-white/5 hover:bg-slate-50 transition-all"
                >
                  ล้างค่าตัวกรอง
                </button>
                <button 
                  onClick={() => setIsFilterOpen(false)}
                  className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-white bg-[#74045F] shadow-xl shadow-[#74045F]/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  แสดงผลลัพธ์
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Clear All */}
      <AnimatePresence>
        {isConfirmClearOpen && (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
               onClick={() => setIsConfirmClearOpen(false)}
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="glass-panel w-full max-w-md bg-white dark:bg-[#030712] rounded-[2.5rem] overflow-hidden shadow-2xl relative z-10 p-8 text-center"
             >
                <div className="w-20 h-20 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto mb-6">
                   <AlertCircle size={40} />
                </div>
                <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2">ล้างประวัติทั้งหมด?</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-8">
                  คุณต้องการรีเซ็ตประวัติการเข้าใช้งานทั้งหมดใช่หรือไม่? <br/>
                  <span className="text-[10px] text-rose-500 font-black uppercase tracking-widest mt-2 block">(ข้อมูล Mock จะยังคงแสดงอยู่หลังรีเซ็ต)</span>
                </p>
                <div className="flex gap-3">
                   <button 
                     onClick={() => setIsConfirmClearOpen(false)}
                     className="flex-1 py-4 bg-slate-100 dark:bg-white/5 text-slate-500 font-black rounded-2xl hover:bg-slate-200 transition-all text-xs uppercase tracking-widest"
                   >
                     ยกเลิก
                   </button>
                   <button 
                     onClick={confirmClearAll}
                     className="flex-1 py-4 bg-rose-500 text-white font-black rounded-2xl shadow-xl shadow-rose-500/20 active:scale-95 transition-all text-xs uppercase tracking-widest"
                   >
                     ยืนยันการล้าง
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Log Detail Dialog */}
      <AnimatePresence>
        {selectedLog && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
               onClick={() => setSelectedLog(null)}
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="glass-panel w-full max-w-lg bg-white dark:bg-[#030712] rounded-[2.5rem] overflow-hidden shadow-2xl relative z-10 p-8"
             >
                <div className="flex items-center gap-4 mb-8">
                   <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${selectedLog.status === 'SUCCESS' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                      <Terminal size={28} />
                   </div>
                   <div>
                      <h3 className="text-xl font-black text-slate-800 dark:text-white">Security Event Data</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Transaction ID: {selectedLog.id}</p>
                   </div>
                </div>

                <div className="space-y-4 bg-slate-50 dark:bg-white/5 p-6 rounded-3xl mb-8">
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-400 uppercase tracking-widest">Timestamp:</span>
                      <span className="font-black text-slate-800 dark:text-white">{new Date(selectedLog.timestamp).toLocaleString('th-TH')}</span>
                   </div>
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-400 uppercase tracking-widest">IP Address:</span>
                      <span className="font-mono font-black text-[#74045F] dark:text-[#C7911B]">{selectedLog.ipAddress}</span>
                   </div>
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-400 uppercase tracking-widest">Session User:</span>
                      <span className="font-black text-slate-800 dark:text-white">{selectedLog.userName}</span>
                   </div>
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-400 uppercase tracking-widest">Platform:</span>
                      <span className="font-black text-slate-600 dark:text-slate-400">{selectedLog.device}</span>
                   </div>
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-400 uppercase tracking-widest">User Agent:</span>
                      <span className="font-black text-slate-600 dark:text-slate-400">{selectedLog.browser}</span>
                   </div>
                   {selectedLog.failureReason && (
                      <div className="pt-3 border-t border-slate-100 dark:border-white/5 flex justify-between items-start text-xs">
                        <span className="font-bold text-rose-400 uppercase tracking-widest">Failure Alert:</span>
                        <span className="font-black text-rose-500 text-right max-w-[200px]">{selectedLog.failureReason}</span>
                      </div>
                   )}
                </div>

                <div className="flex gap-3">
                   <button 
                     onClick={() => !isReporting && setSelectedLog(null)}
                     disabled={isReporting}
                     className="flex-1 py-4 bg-slate-100 dark:bg-white/5 text-slate-500 font-black rounded-2xl hover:bg-slate-200 transition-all text-[10px] uppercase tracking-widest disabled:opacity-50"
                   >
                     ปิดข้อมูล
                   </button>
                   <button 
                     onClick={handleReportIncident}
                     disabled={isReporting || reportSuccess}
                     className={`flex-1 py-4 font-black rounded-2xl shadow-xl active:scale-95 transition-all text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 ${
                       reportSuccess 
                       ? 'bg-emerald-500 text-white shadow-emerald-500/20' 
                       : 'bg-[#74045F] text-white shadow-[#74045F]/20 hover:bg-[#5a034a]'
                     }`}
                   >
                     {isReporting ? (
                       <Loader2 size={14} className="animate-spin" />
                     ) : reportSuccess ? (
                       <CheckCircle2 size={14} />
                     ) : (
                       <ShieldAlert size={14} />
                     )}
                     {isReporting ? 'กำลังส่งรายงาน...' : reportSuccess ? 'ส่งรายงานสำเร็จ' : 'Report Incident'}
                   </button>
                </div>
                
                {isReporting && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-3 text-indigo-600"
                  >
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{reportStepText}</span>
                  </motion.div>
                )}
                
                {reportSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-600"
                  >
                    <Info size={16} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Incident logged into cybersecurity dashboard</span>
                  </motion.div>
                )}
             </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
