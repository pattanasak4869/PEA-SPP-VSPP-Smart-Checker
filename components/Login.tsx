
import React, { useState } from 'react';
import { User, Lock, Loader2, Zap, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { safeParseLocalStorage, safeSetLocalStorage } from '../utils/localStorageUtils';
import { MOCK_USERS } from '../constants';

import { collection, query, where, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../src/lib/firebase';

interface LoginProps {
  onLogin: (user: any) => void;
  logoutMessage?: string | null;
}

export const Login: React.FC<LoginProps> = ({ onLogin, logoutMessage }) => {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');



  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
        setError('กรุณากรอกรหัสผู้ใช้งานและรหัสผ่าน');
        return;
    }

    setIsLoading(true);
    
    try {
      // 1. User Lookup
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', username), where('password', '==', password));
      const querySnapshot = await getDocs(q);

      let user: any = null;

      if (querySnapshot && !querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        user = userDoc.data();
        
        // 2. Perform updates in background
        updateDoc(userDoc.ref, {
          lastLogin: new Date().toISOString(),
          failedAttempts: 0
        }).catch(() => {});
      }

      // 3. Prevent Fallback to Local Storage / MOCK_USERS
      if (user) {
        if (user.status === 'INACTIVE') {
          setIsLoading(false);
          setError('บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
          return;
        }

        setIsLoading(false);
        onLogin(user);
      } else {
        setIsLoading(false);
        setError('รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
      }
    } catch (err) {
      console.error("Login error:", err);
      setIsLoading(false);
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล');
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] dark:bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden font-sans transition-colors duration-500">
        {/* Background Effects */}
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-blue-100 dark:bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none opacity-60 dark:opacity-100"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-purple-100 dark:bg-blue-600/20 rounded-full blur-[120px] pointer-events-none opacity-60 dark:opacity-100"></div>

        <div className="glass-panel w-full max-w-md p-8 rounded-3xl border border-gray-200 dark:border-white/10 shadow-2xl relative z-10 animate-fade-in">
            <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 bg-gradient-to-br from-neon-blue to-neon-purple rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(116,4,95,0.3)] dark:shadow-[0_0_20px_rgba(195,145,27,0.3)] mb-4">
                    <Zap size={32} className="text-[#74045F] dark:text-[#C7911B]" />
                </div>
                <h1 className="text-3xl font-bold text-[#74045F] dark:text-[#C7911B] mb-1">{t('app.title')}</h1>
                <p className="text-slate-500 dark:text-[#FFFFFF] text-sm">{t('app.subtitle')}</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
                {logoutMessage && (
                    <div className="bg-[#74045F]/10 dark:bg-[#C7911B]/10 border border-[#74045F] dark:border-[#C7911B]/20 text-[#74045F] dark:text-[#C7911B] p-3 rounded-xl text-xs font-bold animate-fade-in flex items-center gap-2">
                        <Zap size={14} fill="currentColor" /> {logoutMessage}
                    </div>
                )}
                {error && (
                    <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 p-3 rounded-xl text-xs font-bold animate-shake flex items-center gap-2">
                        <AlertTriangle size={14} /> {error}
                    </div>
                )}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#74045F] dark:text-[#C7911B] ml-1 uppercase tracking-wider">{t('login.userid')}</label>
                    <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 group-focus-within:text-neon-blue transition-colors">
                            <User size={18} />
                        </div>
                        <input 
                            type="text" 
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Ex. 50XXXX"
                            className="w-full bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-[#74045F] dark:text-[#C7911B] placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-neon-blue/50 focus:ring-1 focus:ring-[#74045F]/50 dark:focus:ring-[#C7911B]/50 transition-all"
                            required
                        />
                    </div>
                </div>

                <div className="space-y-2 animate-fade-in">
                    <label className="text-xs font-semibold text-[#74045F] dark:text-[#C7911B] ml-1 uppercase tracking-wider">{t('login.password')}</label>
                    <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 group-focus-within:text-neon-blue transition-colors">
                            <Lock size={18} />
                        </div>
                        <input 
                            type={showPassword ? "text" : "password"} 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-xl py-3.5 pl-11 pr-12 text-[#74045F] dark:text-[#C7911B] placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-neon-blue/50 focus:ring-1 focus:ring-[#74045F]/50 dark:focus:ring-[#C7911B]/50 transition-all"
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-[#74045F] dark:hover:text-[#C7911B] transition-colors focus:outline-none"
                            tabIndex={-1}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                <div className="pt-4 space-y-3">
                    <button 
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-[#74045F] to-[#C7911B] text-white font-bold py-3.5 rounded-xl shadow-[0_0_20px_rgba(116,4,95,0.3)] dark:shadow-[0_0_20px_rgba(195,145,27,0.3)] hover:shadow-[0_0_30px_rgba(0,243,255,0.5)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? <Loader2 className="animate-spin" /> : t('login.submit')}
                    </button>


                </div>
            </form>
            <div className="mt-8 text-center">
                <p className="text-xs text-slate-500 dark:text-gray-500">
                    {t('login.footer')} <span className="text-slate-400 dark:text-gray-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">Terms of Service</span> & <span className="text-slate-400 dark:text-gray-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">Privacy Policy</span>
                </p>
            </div>
        </div>
    </div>
  );
};
