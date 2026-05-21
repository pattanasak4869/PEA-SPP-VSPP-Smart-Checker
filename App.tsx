
import React, { useState, useEffect, useCallback } from 'react';
import { ViewState } from './types';
import { db, auth, ensureAuth, logoutUser, seedSampleData } from './src/lib/firebase';
import { doc, onSnapshot, setDoc, updateDoc, collection, query } from 'firebase/firestore';
import { Dashboard } from './components/Dashboard';
import { Profile } from './components/Profile';
import { UserManagement } from './components/UserManagement';
import { FormManagement } from './components/FormManagement';
import { LoginManagement } from './components/LoginManagement';
import { PowerPlantManagement } from './components/PowerPlantManagement';
import { ComplaintManagement } from './components/ComplaintManagement';
import { Login } from './components/Login';
import { NotificationCenter } from './components/NotificationCenter';
import { InspectionRequestForm } from './components/InspectionRequestForm';
import { EquipmentInspection } from './components/EquipmentInspection';
import { InspectionApproval } from './components/InspectionApproval';
import { AdminInspectionManagement } from './components/AdminInspectionManagement';
import { PowerPlantRegistry } from './components/PowerPlantRegistry';
import { VerifyReport } from './components/VerifyReport';
import { SeedManagement } from './components/SeedManagement';
import { Zap, LayoutDashboard, User, Menu, X, Bell, Users, ShieldAlert, Lock, FileText, Fingerprint, MessageSquare, ClipboardList, CheckCircle2, Globe, Inbox, Settings, Loader2, Database } from 'lucide-react';
import { useLanguage } from './contexts/LanguageContext';
import { useNotifications } from './contexts/NotificationContext';
import { useSettings } from './contexts/SettingsContext';
import { motion, AnimatePresence } from 'motion/react';
import { safeParseLocalStorage, safeSetLocalStorage, safeGetLocalStorage, safeRemoveLocalStorage, setSyncingFromFirestore } from './utils/localStorageUtils';
import { compressBase64Image } from './utils/imageUtils';

const App: React.FC = () => {
  const { t } = useLanguage();
  const { unreadCount, addNotification } = useNotifications();
  const { settings } = useSettings();
  
  const [isAuthenticated, setIsAuthenticated] = useState(() => safeGetLocalStorage('app_auth') === 'true');
  const [userProfile, setUserProfile] = useState(() => safeParseLocalStorage<any>('user_profile', null));
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [logoutMessage, setLogoutMessage] = useState<string | null>(() => {
    const msg = safeGetLocalStorage('logout_message');
    if (msg) {
      safeRemoveLocalStorage('logout_message');
      return msg;
    }
    return null;
  });

  // Firebase Auth Synchronization
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        console.log("Firebase Auth synced: ", user.uid, user.email);
        setIsAuthenticated(true);
        safeSetLocalStorage('app_auth', 'true');
      } else {
        console.log("Firebase Auth: Not signed in");
        // If local storage says we are authenticated, but Firebase says otherwise,
        // we should try an anonymous sign-in to at least have a valid 'request.auth'
        // for Firestore security rules.
        if (safeGetLocalStorage('app_auth') === 'true') {
          console.log("Locally authenticated, waiting for user to perform manual Firebase login if required.");
        }
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);
  const [view, setView] = useState<ViewState>(() => {
    // Priority 1: Check URL Parameters for Public Verification
    const params = new URLSearchParams(window.location.search);
    if (params.get('verify')) return 'VERIFY_REPORT';
    
    // Priority 2: Check Local Storage
    return (safeGetLocalStorage('current_view', 'DASHBOARD') as ViewState);
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNotiOpen, setIsNotiOpen] = useState(false);
  
  // Real-time Firestore Profile Sync
  useEffect(() => {
    if (!isAuthenticated || !userProfile?.employeeId) return;

    // Listen to the user's document in Firestore
    const userRef = doc(db, 'users', userProfile.employeeId);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        console.log("Real-time profile update from Firestore:", data.employeeId);
        
        // Merge with local state to ensure we don't lose local blobs if they are accidentally stripped in DB
        setUserProfile((prev: any) => {
          const updated = { ...prev, ...data };
          // Only update if something actually changed to avoid infinite cycles
          if (JSON.stringify(prev) !== JSON.stringify(updated)) {
            safeSetLocalStorage('user_profile', updated);
            return updated;
          }
          return prev;
        });
      }
    }, (error) => {
      console.warn("Firestore Profile Sync (Read) Error:", error);
    });

    return () => unsubscribe();
  }, [isAuthenticated, userProfile?.employeeId]);

  // Session Recovery: Ensure blobs are loaded from dedicated keys if missing in main profile state
  useEffect(() => {
    if (isAuthenticated && userProfile && userProfile.employeeId) {
      let needsUpdate = false;
      const updated = { ...userProfile };
      
      const savedAvatar = safeGetLocalStorage(`user_avatar_${userProfile.employeeId}`);
      const savedSignature = safeGetLocalStorage(`user_signature_${userProfile.employeeId}`);
      
      if (!updated.avatar && savedAvatar) {
        updated.avatar = savedAvatar;
        needsUpdate = true;
      }
      
      if (!updated.signature && savedSignature) {
        updated.signature = savedSignature;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        console.log('Session Recovery: Restored blobs from dedicated storage');
        setUserProfile(updated);
        safeSetLocalStorage('user_profile', updated);
      }
    }
  }, [isAuthenticated, userProfile?.employeeId]);
  
  // Admin Security Status (Shared State)
  const [isAdminSecurityUnlocked, setIsAdminSecurityUnlocked] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState({
    complaint: 0,
    inspectionApproval: 0
  });

  // Global Real-time Firestore Bidirectional Sync
  useEffect(() => {
    const SYNC_KEYS: Record<string, { col: string, pk: string }> = {
      'power_plants': { col: 'powerPlants', pk: 'id' },
      'app_users': { col: 'users', pk: 'employeeId' },
      'app_inspection_forms': { col: 'inspectionForms', pk: 'id' },
      'app_inspection_requests': { col: 'inspectionRequests', pk: 'id' },
      'app_inspections': { col: 'inspections', pk: 'id' },
      'app_complaints': { col: 'complaints', pk: 'id' },
      'login_logs': { col: 'loginLogs', pk: 'id' }
    };

    const unsubscribes = Object.keys(SYNC_KEYS).map((key) => {
      const { col, pk } = SYNC_KEYS[key];
      const q = query(collection(db, col));
      
      return onSnapshot(q, (snapshot) => {
        if (key === 'app_users' && snapshot.empty) {
          console.log("Firestore users collection is empty. Auto-seeding default database elements...");
          seedSampleData().catch((err) => console.error("Auto seeding failed:", err));
        }

        const firestoreData: any[] = [];
        snapshot.forEach((doc) => {
          const item = {
            ...doc.data(),
            [pk]: doc.id
          };
          
          // Handle timestamps gracefully (convert firestore timestamps to ISO strings)
          for (const k in item) {
            if (item[k] && typeof item[k] === 'object' && 'toDate' in item[k]) {
              try {
                item[k] = (item[k] as any).toDate().toISOString();
              } catch (e) {}
            }
          }
          firestoreData.push(item);
        });

        // Set the syncing flag so write-back doesn't trigger
        setSyncingFromFirestore(true);
        try {
          safeSetLocalStorage(key, firestoreData);
          // Dispatch a local storage update event to force active UI components to reload
          window.dispatchEvent(new Event('storage'));
        } finally {
          setSyncingFromFirestore(false);
        }
      }, (error) => {
        console.warn(`Firestore Sync Error for key ${key}:`, error);
      });
    });

    return () => {
      unsubscribes.forEach((un) => un());
    };
  }, []);

  // Background optimization for existing large profile data
  useEffect(() => {
    if (isAuthenticated && userProfile) {
      const optimizeProfile = async () => {
        let changed = false;
        const updated = { ...userProfile };

        // Proactive size check and emergency recovery
        const profileStr = JSON.stringify(updated);
        const sizeInKB = profileStr.length / 1024;
        
        if (sizeInKB > 800) {
          console.warn(`Profile size high: ${sizeInKB.toFixed(2)} KB. Optimizing...`);
          // Emergency cleanup: strip large blobs if basic compression isn't working
          if (updated.avatar && updated.avatar.length > 150 * 1024) {
            updated.avatar = await compressBase64Image(updated.avatar, 150, 150, 0.4);
            changed = true;
          }
          if (updated.signature && updated.signature.length > 150 * 1024) {
            updated.signature = await compressBase64Image(updated.signature, 300, 150, 0.4);
            changed = true;
          }
          
          // Last resort truncation for stability
          const stillTooBig = JSON.stringify(updated).length / 1024 > 1000;
          if (stillTooBig) {
             console.error('Truncated profile blobs to prevent localStorage crash');
             // We don't want to lose data, so we don't truncate unless absolutely forced by QuotaExceededError in safeSetLocalStorage
          }
        } else {
          // Standard background optimization
          if (updated.avatar && updated.avatar.length > 120 * 1024) {
            updated.avatar = await compressBase64Image(updated.avatar, 200, 200, 0.5);
            changed = true;
          }

          if (updated.signature && updated.signature.length > 120 * 1024) {
            updated.signature = await compressBase64Image(updated.signature, 400, 200, 0.5);
            changed = true;
          }
        }

        if (changed) {
          console.log('Optimized user profile size');
          setUserProfile(updated);
          safeSetLocalStorage('user_profile', updated);
          
          // Sync with DB - STRIP BLOBS to save quota
          const savedProfiles = safeParseLocalStorage<Record<string, any>>('user_profiles_db', {});
          if (updated.employeeId) {
            const { avatar, signature, ...strippedProfile } = updated;
            savedProfiles[updated.employeeId] = strippedProfile;
            safeSetLocalStorage('user_profiles_db', savedProfiles);
          }
        }
      };
      
      const timer = setTimeout(optimizeProfile, 3000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  const calculateBadges = useCallback(() => {
    try {
      // Only track Pending Complaints
      const complaints = safeParseLocalStorage<any[]>('app_complaints', []);
      const pendingComplaints = complaints.filter((c: any) => c.status === 'PENDING').length;

      // Track Pending Inspections for Approval
      const inspections = safeParseLocalStorage<any[]>('app_inspections', []);
      const pendingInspections = inspections.filter((i: any) => i.status === 'SUBMITTED').length;

      setBadgeCounts({
        complaint: pendingComplaints,
        inspectionApproval: pendingInspections
      });
    } catch (e) {
      console.error('Error calculating badges:', e);
    }
  }, []);

  useEffect(() => {
    calculateBadges();
    
    const handleStorageChange = (e: StorageEvent) => {
      // Refresh badges on complaint update
      if (e.key === 'app_complaints') {
        calculateBadges();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    // Refresh badges periodically
    const interval = setInterval(calculateBadges, 30000); // 30s
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [calculateBadges, view]);

  const lastActivityRef = React.useRef<number>(Date.now());
  const notifiedMarksRef = React.useRef<Set<number>>(new Set());

  const hasShownWelcome = React.useRef(false);
  const networkStatusRef = React.useRef(navigator.onLine);
  
  // WebSocket User Tracking
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const wsRef = React.useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !userProfile) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ 
        type: 'IDENTIFY', 
        payload: { userId: userProfile.employeeId || userProfile.username } 
      }));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ONLINE_USERS') {
          setOnlineUsers(data.payload);
        } else if (data.type === 'FORCE_LOGOUT') {
          const currentUserId = userProfile?.employeeId || userProfile?.username;
          if (data.payload.userId === currentUserId) {
             handleLogout('คุณถูกสั่งให้ออกจากระบบโดยผู้ดูแลระบบ (Force Logout by Admin)');
          }
        }
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [isAuthenticated, userProfile]);

  const handleLogout = useCallback((message?: any) => {
    // Record Logout Log
    const currentUser = safeParseLocalStorage<any>('user_profile', null);
    if (currentUser) {
      const logs = safeParseLocalStorage<any[]>('login_logs', []);
      const newLog = {
        id: `log-logout-${Date.now()}`,
        userId: currentUser.employeeId || currentUser.username,
        userName: currentUser.name,
        email: currentUser.email,
        status: 'LOGOUT',
        ipAddress: '127.0.0.1 (Local)', 
        location: 'Bangkok, Thailand (Browser)',
        device: navigator.platform,
        browser: 'Web Browser',
        timestamp: new Date().toISOString(),
      };
      safeSetLocalStorage('login_logs', [newLog, ...logs].slice(0, 50));
    }

    // Reset all states instead of reloading for speed
    setIsAuthenticated(false);
    setUserProfile(null);
    setView('DASHBOARD');
    setIsSidebarOpen(false);
    setIsNotiOpen(false);
    setIsAdminSecurityUnlocked(false);
    
    safeRemoveLocalStorage('app_auth');
    safeRemoveLocalStorage('current_view');
    safeRemoveLocalStorage('user_profile');
    
    // Explicitly logout from Firebase Auth session
    logoutUser().catch(err => console.error("Firebase logout error:", err));
    
    hasShownWelcome.current = false;
    
    const msg = typeof message === 'string' ? message : 'ออกจากระบบเรียบร้อยแล้ว';
    setLogoutMessage(msg);
    safeSetLocalStorage('logout_message', msg);
  }, [addNotification]);

  // Auto-Logout & Inactivity Monitoring
  useEffect(() => {
    if (!isAuthenticated) return;

    lastActivityRef.current = Date.now();
    notifiedMarksRef.current.clear();

    const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutes
    const NOTIFY_INTERVAL = 5 * 60 * 1000; // 5 minutes

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      if (notifiedMarksRef.current.size > 0) {
        notifiedMarksRef.current.clear();
      }
    };

    // Activity Listeners
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => window.addEventListener(event, updateActivity));

    // Inactivity Checker
    const interval = setInterval(() => {
      const now = Date.now();
      const inactiveTime = now - lastActivityRef.current;

      // Check for Logout
      if (inactiveTime >= INACTIVITY_LIMIT) {
        handleLogout('เซสชันหมดอายุเนื่องจากไม่มีการใช้งานเกิน 15 นาที');
        clearInterval(interval);
        return;
      }

      // Check for Notifications
      const minutesInactive = Math.floor(inactiveTime / NOTIFY_INTERVAL);
      if (minutesInactive > 0 && !notifiedMarksRef.current.has(minutesInactive)) {
        const remainingTime = Math.ceil((INACTIVITY_LIMIT - inactiveTime) / 60000);
        addNotification(
          'INFO', 
          'แจ้งเตือนการใช้งาน (Inactivity Warning)', 
          `คุณไม่มีการใช้งานมาแล้ว ${minutesInactive * 5} นาที ระบบจะออกจากระบบอัตโนมัติในอีก ${remainingTime} นาที`,
          `Inactive Time: ${minutesInactive * 5} min\nRemaining: ${remainingTime} min`
        );
        notifiedMarksRef.current.add(minutesInactive);
      }
    }, 10000);

    return () => {
      events.forEach(event => window.removeEventListener(event, updateActivity));
      clearInterval(interval);
    };
  }, [isAuthenticated, addNotification, handleLogout]);

  // Midnight Auto-Logout
  useEffect(() => {
    if (!isAuthenticated) return;

    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);

    const timeUntilMidnight = nextMidnight.getTime() - now.getTime();

    const timer = setTimeout(() => {
      handleLogout('เซสชันหมดอายุเนื่องจากถึงเวลาเที่ยงคืน กรุณาเข้าสู่ระบบใหม่');
    }, timeUntilMidnight);

    return () => clearTimeout(timer);
  }, [isAuthenticated, handleLogout]);

  useEffect(() => {
    safeSetLocalStorage('current_view', view);
  }, [view]);

  // System Anomaly: Network Monitoring
  useEffect(() => {
    const handleOnline = () => {
        if (!networkStatusRef.current) {
            networkStatusRef.current = true;
            addNotification('SUCCESS', 'ระบบออนไลน์ (System Online)', 'การเชื่อมต่อเครือข่ายกลับมาทำงานปกติ');
        }
    };
    
    const handleOffline = () => {
        if (networkStatusRef.current) {
            networkStatusRef.current = false;
            addNotification('ALERT', 'ระบบออฟไลน์ (System Offline)', 'ขาดการเชื่อมต่อเครือข่าย');
        }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, [addNotification]);

  useEffect(() => {
    if (isAuthenticated) {
      if (!hasShownWelcome.current) {
        addNotification('SUCCESS', 'เข้าสู่ระบบสำเร็จ', 'ยินดีต้อนรับกลับสู่ระบบ PEA SPP Smart Tracker');
        hasShownWelcome.current = true;
      }
    }
  }, [isAuthenticated, addNotification]);

  const getAvatarUrl = (avatar?: string, name?: string) => {
    if (avatar) return avatar;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=74045F&color=fff`;
  };

  if (isAuthLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-[#020617] text-[#74045F] dark:text-[#C7911B]">
        <Loader2 className="w-12 h-12 animate-spin mb-4" />
        <p className="text-sm font-bold uppercase tracking-widest animate-pulse">Syncing Session...</p>
      </div>
    );
  }

  if (view === 'VERIFY_REPORT') {
    return <VerifyReport />;
  }

  if (!isAuthenticated) return (
    <Login 
      onLogin={(user) => { 
        // 1. Pull from Persistent Profile DB
        const savedProfiles = safeParseLocalStorage<Record<string, any>>('user_profiles_db', {});
        const persistentProfile = savedProfiles[user.employeeId];
        
        // 2. Pull from Individual Blob Storage (Fail-safe for persistent data)
        // We check BOTH the dedicated keys AND the persistent profile (in case it still has them)
        const savedAvatar = safeGetLocalStorage(`user_avatar_${user.employeeId}`) || persistentProfile?.avatar || user.avatar || "";
        const savedSignature = safeGetLocalStorage(`user_signature_${user.employeeId}`) || persistentProfile?.signature || "";

        const finalUser = { 
          ...user, 
          ...(persistentProfile || {}),
          avatar: savedAvatar,
          signature: savedSignature
        };

        setIsAuthenticated(true); 
        setUserProfile(finalUser);
        safeSetLocalStorage('app_auth', 'true'); 
        safeSetLocalStorage('user_profile', finalUser);
        setLogoutMessage(null); 
      }} 
      logoutMessage={logoutMessage} 
    />
  );

  const isVendor = userProfile?.role === 'VENDER';
  const isInspector = userProfile?.role === 'INSPECTOR';
  const isManager = userProfile?.role === 'MANAGER';
  const isAdmin = userProfile?.role === 'ADMIN';

  const navItems = [
    { id: 'DASHBOARD', icon: <LayoutDashboard size={18} />, label: t('nav.dashboard') },
    
    // Vendor Role (VENDER) only
    ...(isVendor ? [
        { id: 'INSPECTION_REQUEST', icon: <Inbox size={18} />, label: t('nav.inspection_request') },
    ] : []),

    // Inspector Role (INSPECTOR) only
    ...(isInspector ? [
        { id: 'EQUIPMENT_INSPECTION', icon: <ClipboardList size={18} />, label: t('nav.inspection_tasks') },
    ] : []),

    // Manager Role (MANAGER) only
    ...(isManager ? [
        { id: 'INSPECTION_APPROVAL', icon: <CheckCircle2 size={18} />, label: t('nav.inspection_approval'), badge: badgeCounts.inspectionApproval, badgeColor: 'bg-amber-500' },
    ] : []),

    // Plant Registry (Vendor, Inspector, Manager)
    ...(isVendor || isInspector || isManager ? [
        { id: 'POWER_PLANT_REGISTRY', icon: <Globe size={18} />, label: t('nav.plants') },
    ] : []),

    ...(isAdmin ? [
        { id: 'POWER_PLANT_MANAGEMENT', icon: <Zap size={18} />, label: t('nav.admin_plants') },
        { id: 'INSPECTION_MANAGEMENT', icon: <Settings size={18} />, label: t('nav.admin_inspection') },
        { id: 'FORM_MANAGEMENT', icon: <FileText size={18} />, label: t('nav.admin_forms') },
        { id: 'LOGIN_MANAGEMENT', icon: <Fingerprint size={18} />, label: t('nav.admin_logs') },
        { id: 'COMPLAINT_MANAGEMENT', icon: <MessageSquare size={18} />, label: t('nav.admin_complaints') },
        { id: 'USER_MANAGEMENT', icon: <Users size={18} />, label: t('nav.admin_users') },
        { id: 'SEED_DATA', icon: <Database size={18} />, label: t('nav.admin_seeds') }
    ] : []),
    { id: 'PROFILE', icon: <User size={18} />, label: t('nav.profile') },
  ];

  return (
    <div className="h-screen w-full bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white font-sans flex relative overflow-hidden selection:bg-indigo-500/30 transition-colors duration-300">
      
      {/* Desktop Sidebar */}
      <aside className="hidden xl:flex flex-col w-72 h-full border-r border-gray-200 dark:border-white/5 bg-white dark:bg-[#030712] z-[100] transition-colors duration-300">
        <div className="p-8 flex items-center gap-4 mb-8">
            <div className="bg-[#74045F] dark:bg-[#C7911B] p-2.5 rounded-lg shadow-lg shadow-[#74045F]/20 dark:shadow-[#C7911B]/20">
                <Zap size={24} className="text-white" fill="currentColor" />
            </div>
            <div className="flex flex-col">
                <h1 className="text-base font-black text-[#74045F] dark:text-[#C7911B] tracking-tight leading-none mb-1">{t('app.title')}</h1>
                <span className="text-[10px] text-slate-900 dark:text-[#FFFFFF] font-bold uppercase tracking-[0.15em]">{t('app.division')}</span>
            </div>
        </div>

        <nav className="flex-1 px-4 space-y-2">
            <span className="px-4 text-[10px] font-black text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest mb-4 block">Main Navigation</span>
            {navItems.map(item => (
                <button 
                  key={item.id}
                  onClick={() => setView(item.id as ViewState)}
                  className={`w-full flex items-center gap-3 text-sm font-bold transition-all px-4 py-3 rounded-2xl border ${
                    view === item.id 
                    ? 'bg-[#74045F]/10 text-[#74045F] border-[#74045F]/20 dark:bg-[#C7911B]/10 dark:text-[#C7911B] dark:border-[#C7911B]/20 shadow-sm' 
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-100/5'
                  }`}
                >
                   {item.icon}
                   <span className="flex-1 text-left truncate">{item.label}</span>
                   {(item as any).badge > 0 && (
                     <span className={`px-1.5 py-0.5 rounded-lg text-[10px] font-black text-white min-w-[20px] text-center shadow-lg ${(item as any).badgeColor || 'bg-indigo-500'}`}>
                       {(item as any).badge}
                     </span>
                   )}
                   {view === item.id && <div className="w-1.5 h-1.5 rounded-full bg-[#74045F] dark:bg-[#C7911B] shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>}
                </button>
            ))}
        </nav>

        <div className="p-6 border-t border-gray-200 dark:border-white/5">
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5">
                <div className="h-10 w-10 rounded-full bg-[#74045F] dark:bg-[#C7911B] from-indigo-500 to-violet-500 p-[2px] transition-transform overflow-hidden">
                   <img src={getAvatarUrl(userProfile?.avatar, userProfile?.name)} alt="Avatar" className="w-full h-full object-cover rounded-full" />
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-[#74045F] dark:text-[#C7911B] truncate">{userProfile?.name || 'User'}</span>
                    <span className="text-[10px] text-slate-500 dark:text-[#FFFFFF] font-medium truncate">{userProfile?.position || 'Guest'}</span>
                </div>
            </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto overflow-x-hidden relative custom-scrollbar">
        {/* Mobile / Action Header */}
        <header className="shrink-0 border-b border-gray-200 dark:border-white/5 px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center z-[90] sticky top-0 bg-white/80 dark:bg-[#020617]/80 backdrop-blur-2xl transition-colors duration-300">
          <div className="flex items-center gap-3 xl:hidden">
              <div className="bg-[#74045F] dark:bg-[#C7911B] p-2 rounded-lg shadow-lg shadow-[#74045F]/20 dark:shadow-[#C7911B]/20">
                  <Zap size={20} className="text-white" fill="currentColor" />
              </div>
              <h1 className="text-base font-bold tracking-tight">{t('app.title')}</h1>
          </div>
          
          <div className="hidden xl:block">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[#74045F] dark:text-[#C7911B]">
                {view === 'DASHBOARD' ? t('nav.dashboard') : 
                 view === 'POWER_PLANT_MANAGEMENT' ? t('nav.admin_plants') :
                 view === 'USER_MANAGEMENT' ? t('nav.admin_users') : 
                 view === 'FORM_MANAGEMENT' ? t('nav.admin_forms') : 
                 view === 'LOGIN_MANAGEMENT' ? t('nav.admin_logs') :
                 view === 'COMPLAINT_MANAGEMENT' ? t('nav.admin_complaints') :
                 view === 'SEED_DATA' ? t('nav.admin_seeds') :
                 view === 'INSPECTION_REQUEST' ? t('nav.inspection_request') :
                 view === 'EQUIPMENT_INSPECTION' ? t('nav.inspection_tasks') :
                 view === 'INSPECTION_APPROVAL' ? t('nav.inspection_approval') :
                 view === 'INSPECTION_MANAGEMENT' ? t('nav.admin_inspection') :
                 view === 'POWER_PLANT_REGISTRY' ? t('nav.plants') :
                 t('nav.profile')}
              </h2>
          </div>

          <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsNotiOpen(true)}
                className="relative p-2.5 text-[#74045F] dark:text-[#C7911B] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white dark:border-[#020617] shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>
                )}
              </button>

              {userProfile?.role === 'ADMIN' && (
                <button 
                  onClick={() => isAdminSecurityUnlocked ? setIsLockModalOpen(true) : setIsUnlockModalOpen(true)}
                  className={`relative p-2.5 rounded-xl transition-all shadow-lg flex items-center justify-center ${isAdminSecurityUnlocked ? 'bg-rose-500 text-white shadow-rose-500/20' : 'bg-slate-100 dark:bg-white/5 text-slate-400'}`}
                  title={isAdminSecurityUnlocked ? 'System Unlocked - Dangerous Actions Enabled' : 'System Locked - Protective Mode'}
                >
                  {isAdminSecurityUnlocked ? <ShieldAlert size={20} /> : <Lock size={20} />}
                  <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-[#020617] ${isAdminSecurityUnlocked ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                </button>
              )}

              <button className="xl:hidden p-2.5 text-[#74045F] dark:text-[#C7911B] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl" onClick={() => setIsSidebarOpen(true)}>
                <Menu size={20} />
              </button>
              
              <button 
                onClick={() => setView('PROFILE')}
                className="xl:hidden h-9 w-9 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 p-[2px] hover:scale-110 transition-transform overflow-hidden"
              >
                <img src={getAvatarUrl(userProfile?.avatar, userProfile?.name)} alt="Avatar" className="w-full h-full object-cover rounded-full border-2 border-white dark:border-[#020617]" />
              </button>
          </div>
        </header>

        <NotificationCenter isOpen={isNotiOpen} onClose={() => setIsNotiOpen(false)} />

        {/* Swipeable / Mobile Sidebar */}
        <div className={`fixed inset-0 z-[150] transition-opacity duration-300 xl:hidden ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsSidebarOpen(false)}></div>
            <div className={`absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-[#030712] border-r border-gray-200 dark:border-white/10 p-6 flex flex-col transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-3">
                    <div className="bg-[#74045F] dark:bg-[#C7911B] p-2 rounded-lg shadow-lg shadow-[#74045F]/20 dark:shadow-[#C7911B]/20">
                      <Zap size={20} className="text-white" fill="currentColor" />
                    </div>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">PEA SPP&VSPP<br/>Smart Tracker</span>
                  </div>
                  <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-slate-100 dark:bg-white/5 rounded-full text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"><X size={18} /></button>
                </div>
                <div className="space-y-2 flex-1">
                    {navItems.map(item => (
                        <button 
                          key={item.id} 
                          onClick={() => { setView(item.id as ViewState); setIsSidebarOpen(false); }} 
                          className={`flex items-center gap-4 w-full p-4 rounded-xl text-sm font-bold transition-all border relative ${
                            view === item.id 
                            ? 'bg-[#74045F] dark:bg-[#C7911B] text-white dark:text-slate-900 border-[#74045F] dark:border-[#C7911B] shadow-lg shadow-[#74045F]/20 dark:shadow-[#C7911B]/20' 
                            : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                          }`}
                        >
                            {item.icon} 
                            <span className="flex-1 text-left">{item.label}</span>
                            {(item as any).badge > 0 && (
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black text-white ${(item as any).badgeColor || 'bg-indigo-500'}`}>
                                {(item as any).badge}
                              </span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="pt-6 border-t border-gray-100 dark:border-white/5">
                    <button 
                      onClick={() => { handleLogout(); setIsSidebarOpen(false); }}
                      className="w-full flex items-center justify-center gap-2 p-4 text-xs font-black uppercase tracking-widest text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                    >
                      Logout
                    </button>
                </div>
            </div>
        </div>

        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1440px] mx-auto pb-10">
            <div className="animate-fade-in">
                {view === 'DASHBOARD' && <Dashboard />}
                {view === 'POWER_PLANT_MANAGEMENT' && userProfile?.role === 'ADMIN' && (
                  <PowerPlantManagement 
                    isDangerZoneUnlocked={isAdminSecurityUnlocked} 
                    setIsDangerZoneUnlocked={setIsAdminSecurityUnlocked}
                    setIsUnlockModalOpen={setIsUnlockModalOpen}
                  />
                )}
                {view === 'FORM_MANAGEMENT' && userProfile?.role === 'ADMIN' && (
                  <FormManagement 
                    isDangerZoneUnlocked={isAdminSecurityUnlocked} 
                    setIsDangerZoneUnlocked={setIsAdminSecurityUnlocked}
                    setIsUnlockModalOpen={setIsUnlockModalOpen}
                  />
                )}
                {view === 'USER_MANAGEMENT' && userProfile?.role === 'ADMIN' && (
                  <UserManagement 
                    isDangerZoneUnlocked={isAdminSecurityUnlocked}
                    setIsDangerZoneUnlocked={setIsAdminSecurityUnlocked}
                    setIsUnlockModalOpen={setIsUnlockModalOpen}
                  />
                )}
                {view === 'LOGIN_MANAGEMENT' && userProfile?.role === 'ADMIN' && (
                  <LoginManagement 
                    isDangerZoneUnlocked={isAdminSecurityUnlocked} 
                    setIsDangerZoneUnlocked={setIsAdminSecurityUnlocked}
                    setIsUnlockModalOpen={setIsUnlockModalOpen}
                    onlineUsers={onlineUsers} 
                    onForceLogout={(userId) => {
                      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({
                          type: 'FORCE_LOGOUT',
                          payload: { userId }
                        }));
                      }
                    }}
                  />
                )}
                {view === 'COMPLAINT_MANAGEMENT' && userProfile?.role === 'ADMIN' && (
                  <ComplaintManagement 
                    isDangerZoneUnlocked={isAdminSecurityUnlocked} 
                    setIsDangerZoneUnlocked={setIsAdminSecurityUnlocked}
                    setIsUnlockModalOpen={setIsUnlockModalOpen}
                  />
                )}
                {view === 'SEED_DATA' && userProfile?.role === 'ADMIN' && (
                  <SeedManagement 
                    isDangerZoneUnlocked={isAdminSecurityUnlocked} 
                    setIsDangerZoneUnlocked={setIsAdminSecurityUnlocked}
                    setIsUnlockModalOpen={setIsUnlockModalOpen}
                  />
                )}
                {view === 'INSPECTION_MANAGEMENT' && userProfile?.role === 'ADMIN' && (
                  <AdminInspectionManagement
                    isDangerZoneUnlocked={isAdminSecurityUnlocked}
                    setIsDangerZoneUnlocked={setIsAdminSecurityUnlocked}
                    setIsUnlockModalOpen={setIsUnlockModalOpen}
                  />
                )}
                {view === 'INSPECTION_REQUEST' && isVendor && (
                  <InspectionRequestForm userProfile={userProfile} />
                )}
                {view === 'EQUIPMENT_INSPECTION' && isInspector && (
                  <EquipmentInspection userProfile={userProfile} />
                )}
                {view === 'INSPECTION_APPROVAL' && isManager && (
                  <InspectionApproval userProfile={userProfile} />
                )}
                {view === 'POWER_PLANT_REGISTRY' && (isVendor || isInspector || isManager) && (
                  <PowerPlantRegistry userProfile={userProfile} />
                )}
                {(view as string) === 'VERIFY_REPORT' && <VerifyReport />}
                {view === 'PROFILE' && (
                  <Profile 
                    onBack={() => setView('DASHBOARD')} 
                    onLogout={handleLogout} 
                    userProfile={userProfile}
                    isDangerZoneUnlocked={isAdminSecurityUnlocked}
                    setIsDangerZoneUnlocked={setIsAdminSecurityUnlocked}
                    setIsUnlockModalOpen={setIsUnlockModalOpen}
                    onUpdateProfile={async (updated) => {
                      // 1. Data optimization before saving
                      const optimized = { ...updated };
                      
                      // Ensure strings aren't ridiculously long
                      if (optimized.signature && optimized.signature.length > 500000) {
                        console.warn('Signature too large, discarding for safety');
                        optimized.signature = ""; 
                      }
                      
                      setUserProfile(optimized);
                      safeSetLocalStorage('user_profile', optimized);
                      
                      // 1.25. Save heavy blobs to dedicated keys as fail-safe backup (Primary storage for Blobs)
                      if (optimized.employeeId) {
                        if (optimized.avatar) safeSetLocalStorage(`user_avatar_${optimized.employeeId}`, optimized.avatar);
                        if (optimized.signature) safeSetLocalStorage(`user_signature_${optimized.employeeId}`, optimized.signature);
                      }

                      // 1.5. Sync with Firestore
                      if (optimized.employeeId) {
                        try {
                          const userRef = doc(db, 'users', optimized.employeeId);
                          await setDoc(userRef, optimized, { merge: true });
                        } catch (error) {
                          console.error("Firestore Profile Sync Error:", error);
                        }
                      }
                      
                      // 1.75. Sync with primary DB (local fallback) - STRIP HEAVY BLOBS to save quota
                      const savedProfiles = safeParseLocalStorage<Record<string, any>>('user_profiles_db', {});
                      if (optimized.employeeId) {
                        const { avatar, signature, ...strippedProfile } = optimized;
                        savedProfiles[optimized.employeeId] = strippedProfile;
                        safeSetLocalStorage('user_profiles_db', savedProfiles);
                      }
                      
                      // 2. Sync with global user list (minimal sync)
                      const savedUsers = safeParseLocalStorage<any[]>('app_users', []);
                      if (savedUsers.length > 0) {
                        const updatedUsers = savedUsers.map((u: any) => {
                          if (u.employeeId === optimized.employeeId) {
                            // Don't carry heavy blobs into the global list if possible
                            const { avatar, signature, ...rest } = optimized;
                            return { ...u, ...rest };
                          }
                          return u;
                        });
                        safeSetLocalStorage('app_users', updatedUsers);
                      }
                    }}
                  />
                )}
            </div>
        </main>

        <AnimatePresence>
            {isUnlockModalOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
                        onClick={() => setIsUnlockModalOpen(false)}
                    />
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="glass-panel w-full max-w-md bg-white dark:bg-[#030712] rounded-3xl overflow-hidden shadow-2xl relative z-10 p-10 text-center border-t-4 border-rose-500"
                    >
                        <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
                            <ShieldAlert size={40} />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white mb-3 tracking-tight">ยืนยันการปลดล็อกระบบ?</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                            การปลดล็อก <span className="font-bold text-rose-500 italic">Danger Zone</span> จะทำให้สิทธิ์ในการลบและระงับบัญชีผู้ใช้งานถูกเปิดใช้งาน <br/>
                            <span className="text-xs mt-2 block opacity-70 italic font-medium">กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการเพื่อป้องกันข้อผิดพลาด</span>
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={() => setIsUnlockModalOpen(false)}
                                className="bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 font-bold py-4 rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-xs"
                            >
                                ยกเลิก
                            </button>
                            <button 
                                onClick={() => {
                                    setIsAdminSecurityUnlocked(true);
                                    setIsUnlockModalOpen(false);
                                }}
                                className="bg-rose-500 text-white font-bold py-4 rounded-2xl shadow-xl shadow-rose-500/20 active:scale-95 transition-all uppercase tracking-widest text-xs"
                            >
                                ยืนยันปลดล็อก
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {isLockModalOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
                        onClick={() => setIsLockModalOpen(false)}
                    />
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="glass-panel w-full max-w-md bg-white dark:bg-[#030712] rounded-3xl overflow-hidden shadow-2xl relative z-10 p-10 text-center border-t-4 border-indigo-500"
                    >
                        <div className="w-20 h-20 bg-indigo-500/10 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Lock size={40} />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white mb-3 tracking-tight">ยืนยันการปิดระบบป้องกัน?</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                            ระบบจะกลับเข้าสู่สถานะ <span className="font-bold text-indigo-500 italic">Protected Mode</span> เพื่อป้องกันการลบข้อมูลโดยไม่ตั้งใจ
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={() => {
                                    setIsAdminSecurityUnlocked(false);
                                    setIsLockModalOpen(false);
                                }}
                                className="bg-indigo-500 text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-500/20 active:scale-95 transition-all uppercase tracking-widest text-xs"
                            >
                                ยืนยันปิด
                            </button>
                            <button 
                                onClick={() => setIsLockModalOpen(false)}
                                className="bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 font-bold py-4 rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-xs"
                            >
                                ยกเลิก
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default App;
