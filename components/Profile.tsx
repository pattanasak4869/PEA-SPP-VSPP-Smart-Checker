
import React, { useState, useEffect, useRef } from 'react';
import { User, Settings, Bell, HelpCircle, LogOut, ChevronRight, Shield, Award, Calendar, Mail, Phone, MapPin, ArrowLeft, Save, Check, Lock, Smartphone, Globe, Moon, RefreshCw, Volume2, MessageSquare, Sun, Building2, Briefcase, Trash2, PenTool, Image as ImageIcon, RotateCcw, Eye, EyeOff, ShieldAlert, Send, BookOpen } from 'lucide-react';
import SignaturePad from 'signature_pad';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSettings } from '../contexts/SettingsContext';
import { Language } from '../types';
import { safeParseLocalStorage, safeSetLocalStorage, safeRemoveLocalStorage } from '../utils/localStorageUtils';
import { compressBase64Image } from '../utils/imageUtils';
import { db } from '../src/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

interface ProfileProps {
  onBack: () => void;
  onLogout: () => void;
  userProfile: any;
  onUpdateProfile: (data: any) => void;
  isDangerZoneUnlocked: boolean;
  setIsDangerZoneUnlocked: (unlocked: boolean) => void;
  setIsUnlockModalOpen: (open: boolean) => void;
}

type ProfileSection = 'MAIN' | 'EDIT_PROFILE' | 'NOTIFICATIONS' | 'SECURITY' | 'SETTINGS' | 'SUPPORT' | 'SIGNATURE';

// Default Profile Data (Matches first user in MOCK_USERS)
const DEFAULT_PROFILE = {
    employeeId: '509034',
    username: '509034', 
    password: 'PEA509034', 
    name: 'นายพัฒนศักดิ์ เกิดอู่ม', 
    role: 'ADMIN',
    position: 'พนักงานบันทึกข้อมูลคอมพิวเตอร์',
    email: 'pattanasak.ker@pea.co.th',
    phone: '080-4357084',
    peaOffice: 'การไฟฟ้าส่วนภูมิภาค เขต 3 (ภาคกลาง) จังหวัดนครปฐม',
    department: 'กองปฏิบัติการ',
    region: 'นครปฐม',
    status: 'ACTIVE',
    signature: "",
    avatar: ""
};

interface SignatureViewProps {
  theme: string;
  profileData: any;
  t: (key: any) => string;
  handleSaveProfile: (newData: any) => void;
  setSection: (section: ProfileSection) => void;
  showToast: (msg: string) => void;
  signatureMode: 'DRAW' | 'UPLOAD';
  setSignatureMode: (mode: 'DRAW' | 'UPLOAD') => void;
  uploadedSignature: string | null;
  setUploadedSignature: (sig: string | null) => void;
}

const SignatureView: React.FC<SignatureViewProps> = ({ 
  theme, 
  profileData, 
  t, 
  handleSaveProfile, 
  setSection, 
  showToast,
  signatureMode,
  setSignatureMode,
  uploadedSignature,
  setUploadedSignature
}) => {
  const signatureUploadRef = useRef<HTMLInputElement>(null);
  const signaturePadRef = useRef<SignaturePad | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (signatureMode === 'DRAW' && canvasRef.current) {
      if (signaturePadRef.current) {
        signaturePadRef.current.off();
      }
      
      signaturePadRef.current = new SignaturePad(canvasRef.current, {
        backgroundColor: 'rgba(255, 255, 255, 0)',
        penColor: theme === 'dark' ? '#C7911B' : '#74045F'
      });

      const resizeCanvas = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          const ratio = Math.max(window.devicePixelRatio || 1, 1);
          canvas.width = canvas.offsetWidth * ratio;
          canvas.height = canvas.offsetHeight * ratio;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.scale(ratio, ratio);
          }
          signaturePadRef.current?.clear(); 
        }
      };

      window.addEventListener("resize", resizeCanvas);
      resizeCanvas();

      return () => {
        window.removeEventListener("resize", resizeCanvas);
        signaturePadRef.current?.off();
        signaturePadRef.current = null;
      };
    }
  }, [theme, signatureMode]);

  const handleClear = () => {
    if (signatureMode === 'DRAW') {
      signaturePadRef.current?.clear();
    } else {
      setUploadedSignature(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast("ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 2MB)");
        return;
      }
      
      const reader = new FileReader();
      reader.onloadstart = () => {
        // Clear previous during load to show loading state if we want, but let's just wait
      };
      reader.onloadend = async () => {
        const result = reader.result as string;
        if (result) {
          // Process image to make white background transparent
          const transparentResult = await makeBackgroundTransparent(result);
          // More aggressive compression for signature
          const compressed = await compressBase64Image(transparentResult, 400, 200, 0.5);
          setUploadedSignature(compressed);
          showToast(t('status.completed'));
        } else {
          showToast("ไม่สามารถอ่านไฟล์ได้");
        }
      };
      reader.onerror = () => {
        showToast("เกิดข้อผิดพลาดในการอ่านไฟล์");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    let signatureDataUrl = "";

    if (signatureMode === 'DRAW') {
      if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
        if (!profileData.signature) {
          showToast(t('profile.signature_empty'));
          return;
        }
        signatureDataUrl = profileData.signature;
      } else {
      signatureDataUrl = signaturePadRef.current.toDataURL('image/png');
    }
  } else {
    if (!uploadedSignature && !profileData.signature) {
      showToast(t('profile.signature_empty'));
      return;
    }
    signatureDataUrl = uploadedSignature || profileData.signature;
  }
    
  // Compress drawn signature or uploaded one before saving
  const compressed = await compressBase64Image(signatureDataUrl, 400, 200, 0.5);
  handleSaveProfile({ signature: compressed });
};

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const handleDeleteCurrent = () => {
    handleSaveProfile({ signature: '' });
    setIsConfirmingDelete(false);
    signaturePadRef.current?.clear();
    setUploadedSignature(null);
    // Stay in SIGNATURE section by resetting it after handleSaveProfile (which sets it to MAIN)
    setTimeout(() => setSection('SIGNATURE'), 0);
  };

  return (
    <div className="space-y-6 animate-slide-in-top">
      <div className="glass-panel p-6 rounded-2xl border-t border-gray-200 dark:border-white/10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#74045F]/10 text-[#74045F] dark:bg-[#C7911B]/10 dark:text-[#C7911B]">
              <PenTool size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">{t('profile.signature')}</h3>
              <p className="text-xs text-slate-500 dark:text-gray-500">{t('profile.signature_desc')}</p>
            </div>
          </div>
          {profileData.signature && !isConfirmingDelete && (
            <button 
              onClick={() => setIsConfirmingDelete(true)}
              className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors flex items-center gap-2 text-xs font-bold"
            >
              <Trash2 size={16} /> ลบลายเซ็น
            </button>
          )}
        </div>

        {isConfirmingDelete && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl animate-pulse-subtle">
              <div className="text-sm font-bold text-rose-600 dark:text-rose-400 mb-3 text-center">ยืนยันการลบลายเซ็นปัจจุบัน?</div>
              <div className="flex gap-2">
                  <button 
                      onClick={handleDeleteCurrent}
                      className="flex-1 bg-rose-500 text-white py-2 rounded-lg text-xs font-bold shadow-lg"
                  >
                      ยืนยันการลบ
                  </button>
                  <button 
                      onClick={() => setIsConfirmingDelete(false)}
                      className="flex-1 bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-300 py-2 rounded-lg text-xs font-bold"
                  >
                      ยกเลิก
                  </button>
              </div>
          </div>
        )}

        <div className="space-y-4">
          {/* Mode Selector */}
          <div className="flex p-1 bg-gray-100 dark:bg-white/5 rounded-xl gap-1">
            <button 
              onClick={() => setSignatureMode('DRAW')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${signatureMode === 'DRAW' ? 'bg-white dark:bg-white/10 text-[#74045F] dark:text-[#C7911B] shadow-sm' : 'text-gray-500'}`}
            >
              {t('profile.signature_mode_draw')}
            </button>
            <button 
              onClick={() => setSignatureMode('UPLOAD')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${signatureMode === 'UPLOAD' ? 'bg-white dark:bg-white/10 text-[#74045F] dark:text-[#C7911B] shadow-sm' : 'text-gray-500'}`}
            >
              {t('profile.signature_mode_upload')}
            </button>
          </div>

          <div className="relative group">
            <div className="bg-white dark:bg-black/40 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden aspect-[3/1] flex items-center justify-center p-2 relative group-focus-within:border-[#74045F] dark:group-focus-within:border-[#C7911B] transition-all">
              {signatureMode === 'DRAW' ? (
                <>
                  <canvas 
                    ref={canvasRef}
                    className="w-full h-full cursor-crosshair touch-none relative z-10"
                  />
                  
                  {/* Visual Guides */}
                  <div className="absolute inset-x-8 bottom-12 h-px bg-gray-200 dark:bg-white/10 pointer-events-none z-0"></div>
                  
                  {/* Instruction Overlay (fades on touch) */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-20 group-hover:opacity-5 transition-opacity z-0">
                    <PenTool size={48} className="text-gray-400 mb-2" />
                    <span className="text-sm font-medium text-gray-400 uppercase tracking-widest">{t('profile.signature_draw')}</span>
                  </div>
                </>
              ) : (
                <div 
                  onClick={() => signatureUploadRef.current?.click()}
                  className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  <input 
                    type="file" 
                    ref={signatureUploadRef}
                    className="hidden" 
                    accept="image/*"
                    onChange={handleFileUpload}
                  />
                  {uploadedSignature || (profileData.signature && signatureMode === 'UPLOAD') ? (
                    <img 
                      key={uploadedSignature || 'current'}
                      src={uploadedSignature || profileData.signature} 
                      alt="Signature Preview" 
                      className="max-h-full max-w-full object-contain p-4" 
                    />
                  ) : (
                    <>
                      <ImageIcon size={32} className="text-gray-400 mb-2" />
                      <span className="text-xs text-gray-500 text-center px-4">{t('profile.signature_upload_hint')}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <button 
              onClick={handleClear}
              className="absolute top-4 right-4 p-2 bg-white/50 dark:bg-black/50 hover:bg-rose-500 hover:text-white rounded-lg text-rose-500 transition-all border border-rose-500/20 backdrop-blur-md z-10"
              title={t('profile.signature_clear')}
            >
              <RotateCcw size={18} />
            </button>
          </div>

          {profileData.signature && !uploadedSignature && (
              <div className="mt-4 p-4 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                      <Check size={10} /> {t('status.completed')} (Current Signature / ลายเซ็นปัจจุบัน)
                  </div>
                  <div className="h-20 flex items-center justify-center bg-white dark:bg-black/20 rounded-lg p-2">
                      <img src={profileData.signature} alt="Current Signature" className="max-h-full max-w-full object-contain" />
                  </div>
              </div>
          )}
          
          <div className="flex gap-3 pt-4">
            <button 
              onClick={() => setSection('MAIN')}
              className="flex-1 py-3.5 rounded-xl border border-gray-200 dark:border-white/10 text-slate-600 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-white/5 transition-all"
            >
              {t('btn.cancel')}
            </button>
            <button 
              onClick={handleSave}
              className="flex-1 bg-[#74045F] dark:bg-[#C7911B] text-white dark:text-slate-900 py-3.5 rounded-xl font-bold shadow-lg shadow-[#74045F]/20 dark:shadow-[#C7911B]/20 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Save size={18} /> {t('btn.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface EditProfileViewProps {
    profileData: any;
    t: (key: any) => string;
    handleSaveProfile: (newData: any) => void;
    showToast: (msg: string) => void;
    isDangerZoneUnlocked?: boolean;
    isAdmin?: boolean;
}

const EditProfileView: React.FC<EditProfileViewProps> = ({ 
    profileData, 
    t, 
    handleSaveProfile, 
    showToast,
    isDangerZoneUnlocked,
    isAdmin
}) => {
    const [formData, setFormData] = useState(profileData);
    const editFileInputRef = useRef<HTMLInputElement>(null);

    const handleEditAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          showToast("ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)");
          return;
        }
        
        const reader = new FileReader();
        reader.onloadend = async () => {
          // More aggressive compression for profile avatar
          const compressed = await compressBase64Image(reader.result as string, 200, 200, 0.5);
          setFormData({ ...formData, avatar: compressed });
          showToast(t('status.completed'));
        };
        reader.readAsDataURL(file);
      }
    };

    const handleDeleteAvatar = () => {
        setFormData({ ...formData, avatar: "" });
        showToast("ลบรูปโปรไฟล์แล้ว");
    };

    // If there's a draft for the SAME user, load it
    useEffect(() => {
        const parsed = safeParseLocalStorage<any>('draft_profile_edit', null);
        if (parsed) {
            if (parsed.employeeId === profileData.employeeId) {
                setFormData(parsed);
            }
        }
    }, [profileData.employeeId]);

    useEffect(() => {
        safeSetLocalStorage('draft_profile_edit', formData);
    }, [formData]);

    return (
        <div className="space-y-6 animate-slide-in-top">
        <div className="glass-panel p-6 rounded-2xl border-t border-gray-200 dark:border-white/10">
            <div className="flex flex-col items-center mb-10 mt-4">
                <div className="relative group">
                    <div 
                        className="w-32 h-32 rounded-full border-4 border-white dark:border-[#020617] bg-gray-200 dark:bg-gray-800 overflow-hidden relative shadow-2xl cursor-pointer"
                        onClick={() => editFileInputRef.current?.click()}
                    >
                        <img src={getAvatarUrl(formData.avatar, formData.name)} alt="Profile" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                            <span className="text-xs font-bold text-white border border-white/30 px-3 py-1 rounded-full">{t('profile.avatar_upload')}</span>
                        </div>
                    </div>
                    <div className="absolute bottom-1 right-1 flex gap-1 z-10">
                        <button 
                            onClick={() => editFileInputRef.current?.click()}
                            className="bg-[#74045F] dark:bg-[#C7911B] p-2 rounded-full text-white dark:text-slate-900 shadow-lg hover:scale-110 transition-transform border border-white/20"
                        >
                            <ImageIcon size={16} />
                        </button>
                        {formData.avatar && (
                            <button 
                                onClick={handleDeleteAvatar}
                                className="bg-rose-500 p-2 rounded-full text-white shadow-lg hover:scale-110 transition-transform border border-white/20"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                    <input 
                        type="file" 
                        ref={editFileInputRef} 
                        onChange={handleEditAvatarUpload} 
                        className="hidden" 
                        accept="image/*"
                    />
                </div>
                <h2 className="text-xl font-bold mt-4 text-slate-900 dark:text-white">{formData.name}</h2>
                <div className="flex items-center gap-2 mt-2">
                    <span className="text-[#74045F] dark:text-[#C7911B] text-xs bg-[#74045F]/10 dark:bg-[#C7911B]/10 px-3 py-1 rounded-full border border-[#74045F]/20 dark:border-[#C7911B]/20 font-mono">
                        {t('profile.empid')}: {formData.employeeId}
                    </span>
                </div>
            </div>

            <div className="grid gap-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InputField label={t('profile.name')} value={formData.name} onChange={() => {}} icon={<User size={18} />} readOnly />
                    <InputField label={t('profile.position')} value={formData.position} onChange={() => {}} icon={<Award size={18} />} readOnly />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InputField label={t('profile.email')} value={formData.email} onChange={(v) => setFormData({...formData, email: v})} icon={<Mail size={18} />} />
                    <InputField label={t('profile.phone')} value={formData.phone} onChange={(v) => setFormData({...formData, phone: v})} icon={<Phone size={18} />} />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="relative">
                        <InputField 
                            label="รหัสผ่านเข้าสู่ระบบ" 
                            type="password" 
                            value={formData.password || ''} 
                            onChange={(v) => setFormData({...formData, password: v})} 
                            icon={<Lock size={18} />} 
                            readOnly={isAdmin && !isDangerZoneUnlocked}
                        />
                        {isAdmin && !isDangerZoneUnlocked && (
                            <div className="absolute right-0 top-0 text-[8px] font-bold text-rose-500 uppercase tracking-widest bg-rose-500/10 px-2 py-0.5 rounded-bl-lg rounded-tr-xl flex items-center gap-1 border-b border-l border-rose-500/20">
                                <Lock size={8} /> Danger Zone Locked
                            </div>
                        )}
                    </div>
                    <InputField label={t('profile.zone')} value={formData.region} onChange={() => {}} icon={<MapPin size={18} />} readOnly />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InputField label={t('profile.office')} value={formData.peaOffice} onChange={() => {}} icon={<Building2 size={18} />} readOnly />
                    <InputField label={t('profile.department')} value={formData.department} onChange={() => {}} icon={<Briefcase size={18} />} readOnly />
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-white/10 flex justify-end">
                <button 
                    onClick={() => handleSaveProfile(formData)}
                    className="bg-[#74045F] dark:bg-[#C7911B] hover:opacity-90 text-white dark:text-slate-900 font-bold py-3.5 px-8 rounded-xl flex items-center gap-2 shadow-lg shadow-[#74045F]/20 dark:shadow-[#C7911B]/20 transition-all active:scale-95"
                >
                    <Save size={18} /> {t('btn.save')}
                </button>
            </div>
        </div>
        </div>
    );
};

interface SettingsViewProps {
    t: (key: any) => string;
    language: Language;
    setLanguage: (lang: Language) => void;
    theme: 'light' | 'dark';
    setTheme: (theme: 'light' | 'dark') => void;
    settings: any;
    updateSettings: (settings: any) => void;
    setSection: (section: ProfileSection) => void;
    showToast: (msg: string) => void;
    isDangerZoneUnlocked?: boolean;
    setIsUnlockModalOpen?: (open: boolean) => void;
    setIsDangerZoneUnlocked?: (unlocked: boolean) => void;
    isAdmin?: boolean;
}

const SettingsView: React.FC<SettingsViewProps> = ({ 
    t, 
    language, 
    setLanguage, 
    theme, 
    setTheme, 
    settings, 
    updateSettings, 
    setSection, 
    showToast,
    isDangerZoneUnlocked,
    setIsUnlockModalOpen,
    setIsDangerZoneUnlocked,
    isAdmin
}) => {
    const [isConfirmingClear, setIsConfirmingClear] = useState(false);

    const handleClearAll = async () => {
        if (!isDangerZoneUnlocked) {
            showToast("กรุณาปลดล็อก Danger Zone ก่อนล้างข้อมูลระบบ");
            return;
        }
        safeRemoveLocalStorage('app_data_inspections');
        safeRemoveLocalStorage('app_data_plants');
        safeRemoveLocalStorage('app_data_tools');
        
        showToast("ล้างข้อมูลทั้งหมดสำเร็จ");
        setIsConfirmingClear(false);
    };

    return (
        <div className="space-y-6 animate-slide-in-top">
            <div className="glass-panel p-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDangerZoneUnlocked ? 'bg-rose-500 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-400'}`}>
                        <ShieldAlert size={20} />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">Danger Zone</div>
                        <div className="text-[10px] text-slate-500">ปลดล็อกเพื่อเข้าถึงการตั้งค่าที่สำคัญ</div>
                    </div>
                </div>
                <button 
                    onClick={() => {
                        if (isDangerZoneUnlocked) setIsDangerZoneUnlocked?.(false);
                        else setIsUnlockModalOpen?.(true);
                    }}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        isDangerZoneUnlocked 
                        ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' 
                        : 'bg-slate-300 dark:bg-white/10 text-slate-500'
                    }`}
                >
                    {isDangerZoneUnlocked ? 'Unlocked' : 'Locked'}
                </button>
            </div>

            <div className="glass-panel p-6 rounded-2xl">
                 <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800 dark:text-white"><Settings className="text-orange-400" /> {t('profile.settings')}</h3>
                 
                 <div className="space-y-4">
                     <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-3">
                            <Globe size={20} className="text-gray-500 dark:text-gray-400" />
                            <div>
                                <div className="font-medium text-slate-800 dark:text-white">{t('profile.lang')}</div>
                                <div className="text-xs text-gray-500">{t('profile.lang_desc')}</div>
                            </div>
                        </div>
                        <select 
                          value={language}
                          onChange={(e) => setLanguage(e.target.value as Language)}
                          className="bg-white dark:bg-black/30 text-slate-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#74045F] dark:focus:border-[#C7911B]"
                        >
                            <option value="TH">ไทย (Thai)</option>
                            <option value="EN">English</option>
                            <option value="CN">中文 (Chinese)</option>
                        </select>
                     </div>

                     <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-3">
                            {theme === 'dark' ? <Moon size={20} className="text-gray-500 dark:text-gray-400" /> : <Sun size={20} className="text-orange-500" />}
                            <div>
                                <div className="font-medium text-slate-800 dark:text-white">{t('profile.theme')}</div>
                                <div className="text-xs text-gray-500">{t('profile.theme_desc')}</div>
                            </div>
                        </div>
                         <select 
                            value={theme}
                            onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
                            className="bg-white dark:bg-black/30 text-slate-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#74045F] dark:focus:border-[#C7911B]"
                         >
                            <option value="dark">Dark Mode</option>
                            <option value="light">Light Mode</option>
                        </select>
                     </div>

                     <Toggle 
                        label={t('profile.sync')} 
                        description={t('profile.sync_desc')}
                        checked={settings.autoSync} 
                        onChange={() => updateSettings({ autoSync: !settings.autoSync })} 
                    />

                    <Toggle 
                        label={t('profile.data_saver')} 
                        description={t('profile.data_saver_desc')}
                        checked={settings.dataSaver} 
                        onChange={() => updateSettings({ dataSaver: !settings.dataSaver })} 
                    />

                    <div className="pt-4 mt-4 border-t border-gray-200 dark:border-white/5">
                        <h4 className="text-xs font-black text-rose-500 uppercase tracking-widest mb-4">Danger Zone</h4>
                        {!isConfirmingClear ? (
                            <button 
                                onClick={() => setIsConfirmingClear(true)}
                                className="w-full flex items-center justify-between p-4 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 rounded-xl transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <Trash2 size={20} className="text-rose-500" />
                                    <div className="text-left">
                                        <div className="font-bold text-rose-600 dark:text-rose-400">ล้างข้อมูลทั้งหมด (Clear All Data)</div>
                                        <div className="text-[10px] text-rose-500/70">ลบข้อมูลการตรวจสอบ โรงไฟฟ้า และเครื่องมือทั้งหมดออกจากระบบ</div>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-rose-400 group-hover:translate-x-1 transition-transform" />
                            </button>
                        ) : (
                            <div className="p-4 bg-rose-500 rounded-xl text-white animate-pulse-subtle">
                                <div className="font-bold mb-2 text-center">ยืนยันการลบข้อมูลทั้งหมด?</div>
                                <div className="text-xs text-white/80 mb-4 text-center">การดำเนินการนี้ไม่สามารถย้อนกลับได้ ข้อมูลทั้งหมดจะถูกลบถาวร</div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={handleClearAll}
                                        className="flex-1 bg-white text-rose-600 font-black py-2 rounded-lg text-xs hover:bg-rose-50 shadow-lg"
                                    >
                                        ใช่, ลบทั้งหมด
                                    </button>
                                    <button 
                                        onClick={() => setIsConfirmingClear(false)}
                                        className="flex-1 bg-rose-700 text-white font-black py-2 rounded-lg text-xs hover:bg-rose-800"
                                    >
                                        ยกเลิก
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                 </div>

                 <div className="mt-8 pt-6 border-t border-gray-200 dark:border-white/10 flex justify-end">
                    <button 
                        onClick={() => {
                            showToast(t('btn.save') + ' ' + t('status.completed'));
                            setSection('MAIN');
                        }}
                        className="bg-orange-500 hover:bg-orange-400 text-white font-bold py-3 px-8 rounded-xl flex items-center gap-2 shadow-lg shadow-orange-900/20 transition-all active:scale-95"
                    >
                        <Save size={18} /> {t('btn.save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

const Toggle: React.FC<{ label: string; checked: boolean; onChange: () => void; description?: string }> = ({ label, checked, onChange, description }) => (
  <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors cursor-pointer" onClick={onChange}>
    <div>
      <div className="font-medium text-slate-800 dark:text-white">{label}</div>
      {description && <div className="text-xs text-slate-500 dark:text-gray-500 mt-1">{description}</div>}
    </div>
    <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${checked ? 'bg-[#74045F] dark:bg-[#C7911B]' : 'bg-gray-300 dark:bg-gray-700'}`}>
      <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-300 ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
    </div>
  </div>
);

const InputField: React.FC<{ label: string; value: string; icon: React.ReactNode; type?: string; onChange: (val: string) => void; readOnly?: boolean }> = ({ label, value, icon, type = "text", onChange, readOnly }) => {
  const [showPassword, setShowPassword] = useState(false);
  
  const isPassword = type === "password";
  const inputType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 ml-1 uppercase tracking-wider">{label}</label>
      <div className="relative group">
        <div className={`absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-colors ${!readOnly ? 'group-focus-within:text-[#74045F] dark:group-focus-within:text-[#C7911B]' : ''}`}>
          {icon}
        </div>
        <input 
          type={inputType}
          value={value}
          onChange={(e) => !readOnly && onChange(e.target.value)}
          readOnly={readOnly}
          className={`w-full border rounded-xl py-3.5 pl-11 pr-4 transition-all placeholder-gray-400 dark:placeholder-gray-600 ${
              readOnly 
              ? 'bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-white/5 text-gray-400 dark:text-gray-500 cursor-not-allowed italic' 
              : 'bg-white dark:bg-black/20 border-gray-200 dark:border-white/10 text-[#74045F] dark:text-[#C7911B] focus:outline-none focus:border-[#74045F]/50 dark:focus:border-[#C7911B]/50 focus:ring-1 focus:ring-[#74045F]/50 dark:focus:ring-[#C7911B]/50'
          }`}
        />
        {isPassword && !readOnly && (
          <button 
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#74045F] dark:hover:text-[#C7911B] transition-colors"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </div>
  );
};

// Helper to make background transparent and clean up dust/smudges for uploaded signatures
const makeBackgroundTransparent = (base64: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      /**
       * Image Processing Algorithm:
       * 1. Calculate luminosity for each pixel.
       * 2. Apply a "Levels" adjustment to blow out light gray (dust/noise) into transparency.
       * 3. Solidify dark pixels (ink) to pure black for a professional digital look.
       * 4. Use non-linear interpolation for smooth edges (anti-aliasing).
       */
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];

        // Standard Luminosity formula
        const v = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        // Thresholds: 
        // Above 190 (of 255) is treated as "Background/Noise" -> Transparent
        // Below 100 (of 255) is treated as "Pure Ink" -> Solid Black/Dark
        if (v > 190) {
          data[i + 3] = 0; // Completely transparent
        } else if (v < 100) {
          // Normalize ink color to be dark and crisp
          data[i] = 20;   // Near black R
          data[i+1] = 20; // Near black G
          data[i+2] = 20; // Near black B
          data[i+3] = 255;
        } else {
          // Intermediate pixels (potential edges or faint smudges)
          // Scale alpha based on distance between thresholds
          const range = 190 - 100;
          const dist = 190 - v;
          const alphaRatio = dist / range;
          
          // Use power function to make the transition sharper (removes faint dust effectively)
          data[i + 3] = Math.pow(alphaRatio, 1.2) * 255;
          
          // Ensure color is also dark for these intermediate pixels
          data[i] = 20;
          data[i+1] = 20;
          data[i+2] = 20;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
};

const getAvatarUrl = (avatar?: string, name?: string) => {
  if (avatar) return avatar;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=74045F&color=fff`;
};

interface MainProfileViewProps {
  profileData: any;
  t: (key: any) => string;
  setSection: (section: ProfileSection) => void;
  handleAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDeleteAvatar: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onLogout: () => void;
  language: any;
}

const MainProfileView: React.FC<MainProfileViewProps> = ({ profileData, t, setSection, handleAvatarUpload, handleDeleteAvatar, fileInputRef, onLogout, language }) => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
    {/* Left Column: ID Card & Quick Stats */}
    <div className="space-y-6">
        {/* Identity Card */}
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden border-t border-gray-200 dark:border-white/10 group">
            <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-[#74045F]/20 to-[#C7911B]/20"></div>
            
            <div className="relative flex flex-col items-center mt-4">
                <div className="relative group/avatar">
                    <div 
                        className="w-24 h-24 rounded-full border-4 border-white dark:border-[#020617] p-1 bg-gradient-to-br from-[#74045F] to-[#C7911B] shadow-lg shadow-[#74045F]/20 overflow-hidden cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <img 
                            src={getAvatarUrl(profileData.avatar, profileData.name)} 
                            alt="Profile" 
                            className="w-full h-full rounded-full object-cover bg-gray-200 dark:bg-gray-800"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity underline-offset-4">
                            <ImageIcon size={20} className="text-white" />
                        </div>
                    </div>
                    
                    <div className="absolute -bottom-1 -right-1 flex gap-1 z-10">
                        <button 
                            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                            className="p-2 bg-[#74045F] dark:bg-[#C7911B] text-white dark:text-slate-900 rounded-full shadow-lg hover:scale-110 transition-transform border border-white/20"
                        >
                            <ImageIcon size={14} />
                        </button>
                        {profileData.avatar && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteAvatar(); }}
                                className="p-2 bg-rose-500 text-white rounded-full shadow-lg hover:scale-110 transition-transform border border-white/20"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleAvatarUpload} 
                        className="hidden" 
                        accept="image/*"
                    />
                </div>
                
                <div className="text-center mt-3">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{profileData.name}</h2>
                    <p className="text-sm text-[#74045F] dark:text-[#C7911B] font-medium mt-1">{profileData.position}</p>
                    <div className="flex items-center justify-center gap-2 mt-2">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/5 text-gray-500 dark:text-gray-300">{t('profile.empid')}: {profileData.employeeId}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-green-500/20 border border-green-500/30 text-green-600 dark:text-green-400 font-bold flex items-center gap-1">
                            <Shield size={10} /> VERIFIED
                        </span>
                    </div>
                </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-white/5 space-y-3">
                <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400">
                        <Mail size={16} />
                    </div>
                    <span className="truncate">{profileData.email}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400">
                        <Phone size={16} />
                    </div>
                    <span>{profileData.phone}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center text-[#74045F] dark:text-[#C7911B]">
                        <Building2 size={16} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{t('profile.office')}</span>
                        <span className="truncate">{profileData.peaOffice}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center text-[#74045F] dark:text-[#C7911B]">
                        <Briefcase size={16} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{t('profile.department')}</span>
                        <span className="truncate">{profileData.department}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center text-[#74045F] dark:text-[#C7911B]">
                        <MapPin size={16} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{t('profile.zone')}</span>
                        <span>{profileData.region}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    {/* Right Column: Settings & Menus */}
    <div className="lg:col-span-2 space-y-6">
        
        <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-white/5 bg-white/50 dark:bg-white/5">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">{t('profile.account')}</h3>
            </div>
            
            <div className="divide-y divide-gray-200 dark:divide-white/5">
                <button onClick={() => setSection('EDIT_PROFILE')} className="w-full p-4 flex items-center justify-between hover:bg-white/50 dark:hover:bg-white/5 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 dark:text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                            <User size={20} />
                        </div>
                        <div className="text-left">
                            <div className="text-sm font-medium text-slate-900 dark:text-white">{t('btn.edit')}</div>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-400 group-hover:text-slate-900 dark:group-hover:text-white" />
                </button>

                <button onClick={() => setSection('NOTIFICATIONS')} className="w-full p-4 flex items-center justify-between hover:bg-white/50 dark:hover:bg-white/5 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                            <BookOpen size={20} />
                        </div>
                        <div className="text-left">
                            <div className="text-sm font-medium text-slate-900 dark:text-white">
                                {language === 'TH' ? 'คู่มือสถาปัตยกรรมและเอกสารอ้างอิงข้อมูลทางเทคนิค' : 'Project Architecture & Technical Guide'}
                            </div>
                            <div className="text-xs text-gray-500 justify-start">
                                {language === 'TH' ? 'คู่มือพัฒนา บันทึกสัญจรสคีมา และสูตรคำนวณพิกัด Geofence' : 'Developer manual, Firestore schemas, and Geofence math'}
                            </div>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-400 group-hover:text-slate-900 dark:group-hover:text-white" />
                </button>

                <button onClick={() => setSection('SECURITY')} className="w-full p-4 flex items-center justify-between hover:bg-white/50 dark:hover:bg-white/5 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 group-hover:bg-green-500 group-hover:text-white transition-colors">
                            <Shield size={20} />
                        </div>
                        <div className="text-left">
                            <div className="text-sm font-medium text-slate-900 dark:text-white">{t('profile.security')}</div>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-400 group-hover:text-slate-900 dark:group-hover:text-white" />
                </button>

                <button onClick={() => setSection('SIGNATURE')} className="w-full p-4 flex items-center justify-between hover:bg-white/50 dark:hover:bg-white/5 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                            <PenTool size={20} />
                        </div>
                        <div className="text-left">
                            <div className="text-sm font-medium text-slate-900 dark:text-white">{t('profile.signature')}</div>
                            <div className="text-xs text-gray-500">{t('profile.signature_desc')}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {profileData.signature ? (
                            <div className="h-8 w-16 bg-white dark:bg-white/10 rounded flex items-center justify-center border border-gray-200 dark:border-white/10 group-hover:border-indigo-500/50 transition-colors">
                                <img src={profileData.signature} alt="Signature" className="max-h-full max-w-full opacity-60" />
                            </div>
                        ) : (
                            <span className="text-[10px] text-rose-500 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">EMPTY</span>
                        )}
                        <ChevronRight size={18} className="text-gray-400 group-hover:text-slate-900 dark:group-hover:text-white" />
                    </div>
                </button>
            </div>
        </div>

        <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-white/5 bg-white/50 dark:bg-white/5">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">{t('profile.other')}</h3>
            </div>
            
            <div className="divide-y divide-gray-200 dark:divide-white/5">
                <button onClick={() => setSection('SETTINGS')} className="w-full p-4 flex items-center justify-between hover:bg-white/50 dark:hover:bg-white/5 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500 dark:text-orange-400 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                            <Settings size={20} />
                        </div>
                        <div className="text-left">
                            <div className="text-sm font-medium text-slate-900 dark:text-white">{t('profile.settings')}</div>
                            <div className="text-xs text-gray-500">{t('profile.lang')}, {t('profile.theme')}</div>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-400 group-hover:text-slate-900 dark:group-hover:text-white" />
                </button>

                <button onClick={() => setSection('SUPPORT')} className="w-full p-4 flex items-center justify-between hover:bg-white/50 dark:hover:bg-white/5 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 group-hover:bg-teal-500 group-hover:text-white transition-colors">
                            <MessageSquare size={20} />
                        </div>
                        <div className="text-left">
                            <div className="text-sm font-medium text-slate-900 dark:text-white">แจ้งปัญหาการใช้งาน</div>
                            <div className="text-xs text-gray-500">แจ้งข้อร้องเรียนหรือปัญหาเทคนิค</div>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-400 group-hover:text-slate-900 dark:group-hover:text-white" />
                </button>
            </div>
        </div>

        <button 
            onClick={(e) => {
                e.preventDefault();
                onLogout();
            }}
            className="w-full p-4 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 dark:hover:text-red-300 transition-all flex items-center justify-center gap-2 font-bold shadow-lg shadow-red-500/10 dark:shadow-red-900/20"
        >
            <LogOut size={20} />
            {t('nav.logout')}
        </button>

         <p className="text-center text-xs text-gray-500 dark:text-gray-600 mt-4">
            SPP Smart Tracker v1.1.0 &copy; 2024 Energy Regulatory Commission
        </p>
    </div>
  </div>
);

const SupportView = ({ profileData, setSection, showToast }: { profileData: any; setSection: any; showToast: any }) => {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<'TECHNICAL' | 'ACCOUNT' | 'DATA' | 'BUG' | 'OTHER'>('TECHNICAL');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'FORM' | 'STATUS'>('FORM');
  const [userComplaints, setUserComplaints] = useState<any[]>([]);
  const [selectedMyComplaint, setSelectedMyComplaint] = useState<any | null>(null);
  const [userReply, setUserReply] = useState('');

  useEffect(() => {
    const savedComplaints = safeParseLocalStorage<any[]>('app_complaints', []);
    if (savedComplaints.length > 0) {
      const myComplaints = savedComplaints.filter((c: any) => c.submittedBy.employeeId === profileData.employeeId);
      setUserComplaints(myComplaints);
      
      // Update selected complaint if it exists
      if (selectedMyComplaint) {
        const updated = myComplaints.find((c: any) => c.id === selectedMyComplaint.id);
        if (updated) setSelectedMyComplaint(updated);
      }
    }
  }, [profileData.employeeId, activeTab]);

  const handleUserReply = async () => {
    if (!userReply.trim() || !selectedMyComplaint) return;

    const allComplaints = safeParseLocalStorage<any[]>('app_complaints', []);
    
    const newResponse = {
      id: `R-${Date.now()}`,
      message: userReply,
      author: profileData.name,
      role: 'USER',
      timestamp: new Date().toISOString()
    };

    const targetComplaint = allComplaints.find((c: any) => c.id === selectedMyComplaint.id);
    if (!targetComplaint) return;

    const updatedComplaint = {
      ...targetComplaint,
      responses: [...(targetComplaint.responses || []), newResponse],
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'complaints', selectedMyComplaint.id), updatedComplaint);
    } catch (err) {
      console.error("Firestore user reply error:", err);
    }

    const updated = allComplaints.map((c: any) => 
      c.id === selectedMyComplaint.id ? updatedComplaint : c
    );

    safeSetLocalStorage('app_complaints', updated);
    
    // Refresh local list
    const myUpdated = updated.filter((c: any) => c.submittedBy.employeeId === profileData.employeeId);
    setUserComplaints(myUpdated);
    setSelectedMyComplaint(myUpdated.find((c: any) => c.id === selectedMyComplaint.id));
    
    setUserReply('');
    showToast("ส่งข้อความตอบกลับแล้ว");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      showToast("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }

    setIsSubmitting(true);

    const complaints = safeParseLocalStorage<any[]>('app_complaints', []);

    const newId = `C-${Math.floor(Math.random() * 900 + 100).toString()}`;
    const newComplaint = {
      id: newId,
      subject,
      description,
      category,
      priority,
      status: 'PENDING',
      submittedBy: {
        name: profileData.name,
        employeeId: profileData.employeeId,
        role: profileData.role || 'USER',
        email: profileData.email,
        phone: profileData.phone,
        position: profileData.position,
        peaOffice: profileData.peaOffice,
        department: profileData.department
      },
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      responses: []
    };

    try {
      await setDoc(doc(db, 'complaints', newId), newComplaint);
    } catch (err) {
      console.error("Firestore submit complaint error:", err);
    }

    const updated = [newComplaint, ...complaints];
    safeSetLocalStorage('app_complaints', updated);

    setTimeout(() => {
      setIsSubmitting(false);
      showToast("ส่งเรื่องร้องเรียนสำเร็จ เจ้าหน้าที่จะรีบดำเนินการตรวจสอบ");
      setActiveTab('STATUS');
      setSubject('');
      setDescription('');
    }, 500);
  };

  const getStatusInfo = (status: string) => {
    switch(status) {
      case 'PENDING': return { label: 'รอดำเนินการ', color: 'text-slate-400', bg: 'bg-slate-100' };
      case 'INVESTIGATING': return { label: 'กำลังตรวจสอบ', color: 'text-amber-500', bg: 'bg-amber-100' };
      case 'RESOLVED': return { label: 'แก้ไขแล้ว', color: 'text-emerald-500', bg: 'bg-emerald-100' };
      case 'CLOSED': return { label: 'ปิดรายการ', color: 'text-indigo-500', bg: 'bg-indigo-100' };
      default: return { label: status, color: 'text-slate-400', bg: 'bg-slate-100' };
    }
  };

  return (
    <div className="space-y-6 animate-slide-in-top pb-10">
      {!selectedMyComplaint ? (
        <>
          <div className="flex gap-4">
              <button 
                onClick={() => setActiveTab('FORM')}
                className={`flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'FORM' ? 'bg-[#74045F] dark:bg-[#C7911B] text-white shadow-lg' : 'bg-white dark:bg-white/5 text-slate-400'}`}
              >
                แจ้งเรื่องใหม่
              </button>
              <button 
                onClick={() => setActiveTab('STATUS')}
                className={`flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'STATUS' ? 'bg-[#74045F] dark:bg-[#C7911B] text-white shadow-lg' : 'bg-white dark:bg-white/5 text-slate-400'}`}
              >
                สถานะรายการ ({userComplaints.length})
              </button>
          </div>

          {activeTab === 'FORM' ? (
            <div className="glass-panel p-8 rounded-3xl border-t border-gray-200 dark:border-white/10">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-14 h-14 bg-teal-500/10 text-teal-600 rounded-2xl flex items-center justify-center">
                        <MessageSquare size={28} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white italic">แจ้งปัญหาการใช้งาน</h3>
                        <p className="text-xs text-slate-500 dark:text-gray-500 mt-1 uppercase tracking-widest font-bold">Report Issues & Feedback</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">ประเภทปัญหา</label>
                            <select 
                              value={category}
                              onChange={(e) => setCategory(e.target.value as any)}
                              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                            >
                              <option value="TECHNICAL">ปัญหาทางเทคนิค</option>
                              <option value="ACCOUNT">ปัญหาบัญชีผู้ใช้</option>
                              <option value="DATA">ปัญหาข้อมูล</option>
                              <option value="BUG">พบจุดผิดสังเกต (Bug)</option>
                              <option value="OTHER">อื่นๆ</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">ความเร่งด่วน</label>
                            <select 
                              value={priority}
                              onChange={(e) => setPriority(e.target.value as any)}
                              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                            >
                              <option value="LOW">ต่ำ</option>
                              <option value="MEDIUM">ปกติ</option>
                              <option value="HIGH">สูง</option>
                              <option value="URGENT">ด่วนมาก</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">หัวข้อเรื่อง</label>
                        <input 
                          type="text"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          placeholder="สรุปปัญหาเบื้องต้น..."
                          className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">รายละเอียด</label>
                        <textarea 
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="อธิบายรายละเอียดปัญหาที่พบ..."
                          rows={4}
                          className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all resize-none"
                        />
                    </div>

                    <div className="p-4 bg-teal-500/5 rounded-2xl border border-teal-500/20">
                        <div className="flex gap-3">
                            <div className="mt-1"><Shield size={16} className="text-teal-600" /></div>
                            <p className="text-[10px] text-teal-600 font-bold leading-relaxed">
                                ข้อมูลและประวัติการแจ้งปัญหาจะถูกจัดเก็บไว้ในระบบเพื่อใช้ในการปรับปรุงการทำงาน <br/>
                                เจ้าหน้าที่จะตอบกลับผ่านระบบภายใน 24 ชม. ทำการ
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button 
                          type="button"
                          onClick={() => setSection('MAIN')}
                          className="flex-1 py-4 rounded-2xl text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                        >
                          ย้อนกลับ
                        </button>
                        <button 
                          type="submit"
                          disabled={isSubmitting}
                          className="flex-[2] bg-teal-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-teal-500/20 active:scale-95 transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                        >
                          {isSubmitting ? (
                              <>
                                  <RefreshCw size={18} className="animate-spin" />
                                  กำลังส่งข้อมูล...
                              </>
                          ) : (
                              <>
                                  <Send size={18} />
                                  ส่งเรื่องร้องเรียน
                              </>
                          )}
                        </button>
                    </div>
                </form>
            </div>
          ) : (
            <div className="space-y-4">
                {userComplaints.length > 0 ? (
                    userComplaints.map(complaint => (
                        <div 
                          key={complaint.id} 
                          onClick={() => setSelectedMyComplaint(complaint)}
                          className="glass-panel p-6 rounded-3xl border border-slate-100 dark:border-white/5 animate-fade-in cursor-pointer hover:border-indigo-500/30 transition-all group"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Case ID: {complaint.id}</span>
                                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${getStatusInfo(complaint.status).bg} ${getStatusInfo(complaint.status).color}`}>
                                    {getStatusInfo(complaint.status).label}
                                </div>
                            </div>
                            <h4 className="text-sm font-black text-slate-800 dark:text-white mb-2 italic group-hover:text-indigo-500 transition-colors">{complaint.subject}</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 italic mb-4">{complaint.description}</p>
                            
                            {complaint.responses.length > 0 && (
                                <div className="mt-4 p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <MessageSquare size={12} className="text-indigo-500" />
                                        <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">การตอบกลับล่าสุด</span>
                                    </div>
                                    <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 italic">
                                        "{complaint.responses[complaint.responses.length - 1].message}"
                                    </p>
                                </div>
                            )}

                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
                                <span className="text-[8px] text-slate-400 font-bold uppercase">{new Date(complaint.submittedAt).toLocaleDateString('th-TH')}</span>
                                <div className="flex items-center gap-2">
                                    <div className="flex -space-x-1">
                                        {complaint.responses.length > 0 && (
                                            <div className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[8px] border-2 border-white dark:border-slate-900 font-bold">
                                                ADM
                                            </div>
                                        )}
                                        <div className="w-6 h-6 rounded-full bg-slate-300 dark:bg-white/20 text-slate-500 dark:text-white flex items-center justify-center text-[8px] border-2 border-white dark:border-slate-900 font-bold">
                                            {profileData.name[0]}
                                        </div>
                                    </div>
                                    <ChevronRight size={14} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="glass-panel py-20 rounded-3xl text-center border-dashed border-2 border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5">
                        <MessageSquare size={48} className="mx-auto text-slate-300 mb-4" />
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">ไม่พบประวัติการแจ้งปัญหา</p>
                    </div>
                )}
                
                <button 
                    onClick={() => setSection('MAIN')}
                    className="w-full py-4 text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-all italic underline underline-offset-4"
                >
                    ย้อนกลับไปยังโปรไฟล์
                </button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-6 animate-slide-in-right">
            <button 
                onClick={() => setSelectedMyComplaint(null)}
                className="text-xs font-bold text-slate-500 flex items-center gap-2 hover:text-[#74045F] transition-colors uppercase tracking-widest mb-2"
            >
                <ArrowLeft size={16} /> ย้อนกลับไปรายการ
            </button>

            <div className="glass-panel p-6 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-xl shadow-slate-200/20 dark:shadow-none space-y-6">
                <div>
                   <div className="flex justify-between items-start mb-2">
                        <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusInfo(selectedMyComplaint.status).bg} ${getStatusInfo(selectedMyComplaint.status).color}`}>
                            {getStatusInfo(selectedMyComplaint.status).label}
                        </div>
                   </div>
                   <h3 className="text-xl font-black text-slate-800 dark:text-white italic leading-tight">{selectedMyComplaint.subject}</h3>
                   <div className="flex items-center gap-4 mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                       <span>Ref: {selectedMyComplaint.id}</span>
                       <span>•</span>
                       <span>{new Date(selectedMyComplaint.submittedAt).toLocaleString('th-TH')}</span>
                   </div>
                </div>

                <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/5">
                    <p className="text-sm text-slate-600 dark:text-slate-300 italic leading-relaxed">
                        {selectedMyComplaint.description}
                    </p>
                </div>

                <div className="space-y-6 pt-6 border-t border-slate-100 dark:border-white/5">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">ประวัติการสนทนา ({selectedMyComplaint.responses.length})</h4>
                    
                    <div className="space-y-4">
                        {selectedMyComplaint.responses.map((res: any) => (
                            <div key={res.id} className={`flex ${res.role === 'ADMIN' ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-[85%] p-4 rounded-2xl ${
                                    res.role === 'ADMIN' 
                                    ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm border border-slate-100 dark:border-white/5 rounded-tl-none' 
                                    : 'bg-teal-600 text-white shadow-lg shadow-teal-500/20 rounded-tr-none'
                                }`}>
                                    <p className="text-xs font-bold leading-relaxed mb-2">{res.message}</p>
                                    <div className={`flex items-center gap-2 text-[8px] font-black uppercase tracking-widest ${
                                        res.role === 'ADMIN' ? 'text-slate-400' : 'text-white/60'
                                    }`}>
                                        <span>{res.author}</span>
                                        <span>•</span>
                                        <span>{new Date(res.timestamp).toLocaleTimeString('th-TH')}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {selectedMyComplaint.responses.length === 0 && (
                            <p className="text-center py-4 text-[10px] font-black text-slate-300 uppercase italic">รอกำลังตรวจสอบและตอบกลับจากเจ้าหน้าที่</p>
                        )}
                    </div>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-white/5">
                    <div className="relative group">
                        <textarea 
                            value={userReply}
                            onChange={(e) => setUserReply(e.target.value)}
                            placeholder="พิมพ์ข้อความตอบกลับหรือเพิ่มรายละเอียด..."
                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-white/5 focus:border-[#74045F] dark:focus:border-[#C7911B] transition-all rounded-3xl p-5 pr-14 text-sm font-bold resize-none shadow-inner h-24"
                        />
                        <button 
                            onClick={handleUserReply}
                            disabled={!userReply.trim()}
                            className={`absolute right-3 bottom-3 w-10 h-10 flex items-center justify-center rounded-2xl transition-all ${
                                userReply.trim() 
                                ? 'bg-[#74045F] dark:bg-[#C7911B] text-white shadow-lg shadow-[#74045F]/20 active:scale-95' 
                                : 'bg-slate-200 dark:bg-white/10 text-slate-400'
                            }`}
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

const NotificationsView = ({ t, setSection, language }: { t: any; setSection: any; language: Language }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChapter, setSelectedChapter] = useState(0);
  const [lat1, setLat1] = useState('13.7563');
  const [lng1, setLng1] = useState('100.5018');
  const [lat2, setLat2] = useState('13.7590');
  const [lng2, setLng2] = useState('100.5019');

  const getDistanceResult = () => {
    const l1 = parseFloat(lat1);
    const n1 = parseFloat(lng1);
    const l2 = parseFloat(lat2);
    const n2 = parseFloat(lng2);
    if (isNaN(l1) || isNaN(n1) || isNaN(l2) || isNaN(n2)) return null;

    const R = 6371000; // Earth radius in meters
    const dLat = ((l2 - l1) * Math.PI) / 180;
    const dLon = ((n2 - n1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((l1 * Math.PI) / 180) *
        Math.cos((l2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const distanceResult = getDistanceResult();

  const chapters = [
    {
      title: language === 'TH' ? "บทที่ 1: ข้อมูลปฐมภูมิและสมรรถนะภาพรวมของระบบ" : "Chapter 1: General Information & System Capabilities",
      subtitle: "System Architecture & Core Capabilities",
      icon: <Building2 size={18} />,
      content: (
        <div className="space-y-4 text-xs md:text-sm">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-justify">
            {language === 'TH' ? (
              <>
                ระบบ <strong>PEA PQ SMART TRACKER</strong> พัฒนาขึ้นมาเพื่อตอบสนองการตรวจสอบและติดตามระดับเกณฑ์มาตรฐานความเข้ากันได้ทางแม่เหล็กไฟฟ้าและการจ่ายกำลังไฟฟ้าขยับถอย (Power Quality Compliance) ของสถานีย์ขนานไฟผู้ผลิตฟ้ารายเล็กและรายเล็กมาก (SPP/VSPP) เพื่อรองรับยุทธศาสตร์องค์กรอัจฉริยะ (Digital Utility Digital Transformation) ของการไฟฟ้าส่วนภูมิภาค (PEA) อย่างมั่นคงสูงสุด
              </>
            ) : (
              <>
                The <strong>PEA PQ SMART TRACKER</strong> platform integrates high-performance analytics to monitor and evaluate Power Quality Compliance of Very Small Power Producers (VSPP) and Small Power Producers (SPP) grid-interconnected with the Provincial Electricity Authority (PEA) main network.
              </>
            )}
          </p>
          
          <div className="p-5 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-white/5 dark:to-white/10 rounded-2xl border border-slate-200 dark:border-white/10 space-y-3">
            <h4 className="font-black text-xs uppercase tracking-widest text-[#74045F] dark:text-[#C7911B] flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#74045F] dark:bg-[#C7911B]" />
              {language === 'TH' ? 'โครงสร้างสถาปัตยกรรมแบบ 3 ชั้นระดับวิศวกรรม (Rigorous 3-Tier Layer Architecture)' : 'Engineering 3-Tier Client-Server Architecture'}
            </h4>
            <div className="grid md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <span className="font-extrabold text-[#74045F] dark:text-[#C7911B] block uppercase text-[10px]">1. Presentation UI Layer</span>
                <p className="text-slate-500 dark:text-gray-400 leading-relaxed text-[11px]">
                  {language === 'TH' ? 'เรนเดอร์ UI ชั้นหน้าสัมผัสผ่าน React 18 และคอมไพล์ความเร็วระดับสูงด้วย Vite พร้อมด้วยการปรับตามขนาดสกรีนและโหมดสีระดับเข้มข้นด้วย Tailwind CSS v4' : 'Vite-powered React UI with seamless responsive layouts using Tailwind CSS v4 to prevent transformer screen glares.'}
                </p>
              </div>
              <div className="space-y-1">
                <span className="font-extrabold text-[#74045F] dark:text-[#C7911B] block uppercase text-[10px]">2. Logical API Layer</span>
                <p className="text-slate-500 dark:text-gray-400 leading-relaxed text-[11px]">
                  {language === 'TH' ? 'ประยุกต์จัดทำ Express Server ยิงสระข้อมูลเข้าพอร์ตคุมแอป 3000 ผ่าน Node TypeScript ถอดโค้ดชนิดจำแลง ป้องกันการรั่วไหลของรหัสการสื่อสารและ API Keys ลับ' : 'Express.js backend bound securely to port 3000 proxies external services and preserves enterprise key secrets from the browser.'}
                </p>
              </div>
              <div className="space-y-1">
                <span className="font-extrabold text-[#74045F] dark:text-[#C7911B] block uppercase text-[10px]">3. State Storage Layer</span>
                <p className="text-slate-500 dark:text-gray-400 leading-relaxed text-[11px]">
                  {language === 'TH' ? 'พึ่งระบบคลาวด์จัดเก็บ Cloud Firestore พร้อมยืนยันสิทธ์ตัวตนดวล Firebase Auth กั้นพาร์ทข้อมูลด้วย Firestore Security Rules เพื่อล็อคป้องกันประวัติสลับหน้างาน' : 'Firestore database for schema structures and Firebase Auth context verified under rigid Security Rules.'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/20 space-y-1">
              <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                LIGHT MODE OPTIMIZATIONS
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-justify">
                {language === 'TH' ? 'ตัดปัญหาจอสะท้อนแสงอาทิตย์ (High Contrast WebAIM Compliant) ขณะเดินหน้าลานหม้อแปลงจำจ่ายนอกอาคารแรงดันสูง' : 'Engineered with safe WebAIM high-contrast metrics ensuring outdoor readability under direct high transformer solar glare.'}
              </p>
            </div>
            <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/20 space-y-1">
              <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                DARK MODE REFINEMENTS
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-justify">
                {language === 'TH' ? 'โครงสี slate คาร์บอนลึก ช่วยประหยัดสายตาและรักษาความล้าสำหรับการวิเคราะห์ผลของบอร์ดบริหารในห้องแสงมืด' : 'Atmospheric dark slate frames designed to minimize optical fatigue during prolonged night shift audits.'}
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      title: language === 'TH' ? "บทที่ 2: ลำดับขั้นตอนการทำงานและกระบวนการเวิร์กโฟลว์" : "Chapter 2: System Workflow Procedures",
      subtitle: "Detailed Workflow & State Transitions",
      icon: <Briefcase size={18} />,
      content: (
        <div className="space-y-4 text-xs md:text-sm">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            {language === 'TH' ? 'กระบวนการเคลื่อนย้ายสิทธิ์เปลี่ยนสถานะ (State Transition Invariants) ดำเนินไปอย่างเป็นลำดับและควบคุมสิทธิ์เข้มข้นตามระดับบทบาทบัญชีผู้ใช้:' : 'The inspection workflow transitions systematically, locking modifications based on authentication contexts and state validators:'}
          </p>
          <div className="p-4 bg-slate-950 dark:bg-black/40 rounded-2xl border border-slate-200 dark:border-white/10 font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed text-slate-300 dark:text-slate-400 shadow-inner">
{` +------------+    ลงทะเบียนสถานีโรงไฟฟ้า      +-------------+
 |   VENDOR   | -------------------------> |  PENDING    | (ยื่นนัดคำขอวิเคราะห์)
 +------------+                            +-------------+
                                                  |
                                                  | เจ้าหน้าที่ กฟภ. กดรับภารกิจ
                                                  v
                                           +-------------+
                                           |  ACCEPTED   | (ผูกประจำ assignedInspector)
                                           +-------------+
                                                  |
                                                  | วิศวกรลงหน้างาน + ผ่าน Geofencing
                                                  | (ปลดล็อคแบบฟอร์มตรวจสอบและลายมือเขียน)
                                                  v
                                           +-------------+
                                           |  AWAITING_  | (ส่งบันทึกตู้ไฟฟ้าเข้า Firestore)
                                           |  APPROVAL   |
                                           +-------------+
                                            /           \\
                    หัวหน้างานตรวจสอบผ่านสิทธิ์ /             \\ ตรวจพบบกพร่องรุนแรง
                                          v               v
                                   +-------------+ +-------------+
                                   |  COMPLETED  | |  REJECTED   | (แจ้งกลับ Vendor ด่วน)
                                   | (เสร็จสมบูรณ์) | |  (ปรับปรุงคลัง) |
                                   +-------------+ +-------------+`}
          </div>
          
          <div className="p-4 bg-indigo-50/50 dark:bg-white/5 rounded-xl border border-indigo-100 dark:border-white/5 text-xs text-slate-600 dark:text-slate-400 space-y-2">
            <span className="font-black text-indigo-700 dark:text-indigo-400 block uppercase tracking-wide">
              {language === 'TH' ? 'กฎเหล็กความถูกต้องของประวัติ (Inspection Data Integrity Bylaw):' : 'Bylaw of Data Immutability:'}
            </span>
            <p className="leading-relaxed">
              {language === 'TH' ? (
                <>
                  หลังจากวิศวกรผู้ตรวจสอบและประทับตราลายเซ็นดิจิทัลแล้วเสร็จ ทะเบียนสถานะคำขอจะขยับสู่สถานะ <code className="bg-slate-100 dark:bg-white/10 px-1 py-0.5 rounded text-[#74045F] dark:text-[#C7911B] font-semibold font-mono">AWAITING_APPROVAL</code> ซึ่งจะบล็อกสิทธิและตัดลอจิกตัวเครื่องมิให้ผู้ผลิตไฟฟ้าตัดต่อ แก้ไขตัวเลข หรือปรับขนาดพิกัดงานเด็ดขาด เพื่อความถูกต้องของมาตรฐาน
                </>
              ) : (
                <>
                  Once the active field inspectors append their valid digital signatures and upload to the server, the record moves to <code className="bg-slate-100 dark:bg-white/10 px-1 py-0.5 rounded text-indigo-650 dark:text-amber-500 font-mono">AWAITING_APPROVAL</code>. Direct edit permissions are strictly severed to prevent retrospective metrics tampering.
                </>
              )}
            </p>
          </div>
        </div>
      )
    },
    {
      title: language === 'TH' ? "บทที่ 3: แค็ตตาล็อกฟิเจอร์และโมดูลการทำงานภายในแอปพลิเคชัน" : "Chapter 3: All System Features & Functions",
      subtitle: "Application Modules & Client-Side Design",
      icon: <Settings size={18} />,
      content: (
        <div className="space-y-4 text-xs md:text-sm animate-fade-in">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            {language === 'TH' ? 'การออกแบบแบ่งพาร์ทโครงข่ายประยุกต์และตัวเร่งเพื่อประสิทธิภาพการโหลดเบาหวิวข้ามสภาพหน้าจำกัดคลื่น:' : 'Underlying modules and speed strategies configured inside the smart tracker layout:'}
          </p>
          
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 space-y-2">
              <h5 className="font-bold text-xs text-slate-800 dark:text-white flex items-center gap-2">
                <span className="p-1 bg-[#74045F]/10 dark:bg-[#C7911B]/10 text-[#74045F] dark:text-[#C7911B] rounded-lg">📸</span>
                {language === 'TH' ? '1. ตัวย่อขนาดรูปเบราว์เซอร์ลัดด้วยคณิตกราฟิก (HTML5 Canvas Memory Downscaler)' : '1. On-the-fly Image Downscaling via HTML5 Canvas'}
              </h5>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-justify">
                {language === 'TH' ? (
                  <>
                    ภาพถ่ายจริงพิกัดขอบร้อนสะสมขั้วต่อในตู้ไฟฟ้า มักมีขนาด 8MB - 12MB ซึ่งยากต่อการอัปสรุปผลระหว่างคลื่นจำกัดเขาสูง โปรแกรมในหน้า <code className="font-mono bg-slate-200 dark:bg-white/10 px-1 py-0.5 rounded text-indigo-600">EquipmentInspection.tsx</code> ดึงรูปขึ้นโหลดวาดเข้าสู่หน่วยความจำ HTML5 Canvas คำนวณขยายเกณฑ์จำกัดค่าสเกลแนวกว้างไม่เกิน 1200px แล้วบีบลงฟอร์แมต <code className="font-mono">image/jpeg</code> คุณภาพ <code className="font-mono text-emerald-500 font-bold">70%</code> ทำให้ตัวไฟล์หดเล็กรวดเร็วเหลือเพียง <code className="font-mono text-emerald-500">150KB - 300KB</code> โกงอัตราสปีดการอัปโหลดข้ามวินาที
                  </>
                ) : (
                  <>
                    Real photos taken on field often range from 8MB to 12MB. The client-side compressor intercepts files in <code className="font-mono text-sm bg-slate-100 dark:bg-white/10 px-1 rounded">EquipmentInspection.tsx</code>, draws onto temporary HTML5 Canvas, downsamples width limits to 1200px and exports JPEG Base64 quality index at 0.70 (70%) shrinking sizes to raw 150KB - 300KB for bandwidth-friendly uploads.
                  </>
                )}
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 space-y-2">
              <h5 className="font-bold text-xs text-slate-800 dark:text-white flex items-center gap-2">
                <span className="p-1 bg-[#74045F]/10 dark:bg-[#C7911B]/10 text-[#74045F] dark:text-[#C7911B] rounded-lg">🔌</span>
                {language === 'TH' ? '2. สเตจแคชสำลองเพื่อหลบจุดอับสัญญาณคลื่น (Offline State Persistence Mirror)' : '2. Offline Work Persistence Safeguard'}
              </h5>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-justify">
                {language === 'TH' ? (
                  <>
                    ลงลานสนามภูเขาคลื่นดับระงับ ระบบจะผลักลายมือชื่อป้อน และคำข้อมูลจัดเก็บเข้าแคช <code className="font-mono">LocalStorage</code> รอยหน้า เมื่อสัญญาณโทรศัพท์กลับคืนสู่โลกออนไลน์ ไคลเอนต์จะอัปคิวดึงเข้า Firestore ไล่พิกัดทันสมัย ปราศจากบันทึกตกหล่นสูญหาย
                  </>
                ) : (
                  <>
                    Under zero cellular reception inside metallic substations, inputs and canvas paths are queued inside persistent local structures. Once reception resurrects, the synchronization engine flushes states securely without concurrency faults.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      title: language === 'TH' ? "บทที่ 4: รายการสัญญาอนุญาตซอฟต์แวร์และเครื่องมือประกอบพัฒนา" : "Chapter 4: All System Licenses",
      subtitle: "Licensing & Dependencies Catalog",
      icon: <Award size={18} />,
      content: (
        <div className="space-y-4 text-xs md:text-sm">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-justify border-b border-dashed border-slate-205 dark:border-white/10 pb-2">
            {language === 'TH' ? 'รายการข่ายซอฟต์แวร์ที่สากลยอมรับสำหรับเป้าหมายเปิดต้นโค้ดและปลอดภาระกรรมสิทธิ์หน่วยงานพัฒนา:' : 'List of third-party libraries and their active licenses compiled carefully in the tracker pipeline:'}
          </p>
          <div className="overflow-hidden rounded-2xl border border-slate-205 dark:border-white/10 shadow-sm">
            <table className="w-full text-left border-collapse text-xs text-slate-600 dark:text-slate-300">
              <thead>
                <tr className="bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white font-bold">
                  <th className="p-3 border-b border-slate-205 dark:border-white/10">{language === 'TH' ? 'ไลบรารีพัฒนา' : 'Dependency Name'}</th>
                  <th className="p-3 border-b border-slate-205 dark:border-white/10">{language === 'TH' ? 'ใบอนุญาตสากล' : 'License'}</th>
                  <th className="p-3 border-b border-slate-205 dark:border-white/10">{language === 'TH' ? 'วัตถุประสงค์เชิงลึก' : 'Engineering Purpose'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 dark:divide-white/5 bg-white/50 dark:bg-transparent">
                <tr className="hover:bg-slate-55 dark:hover:bg-white/5">
                  <td className="p-3 font-mono font-bold text-[#74045F] dark:text-[#C7911B]">@google/genai</td>
                  <td className="p-3"><span className="bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded text-[10px] font-black">Apache 2.0</span></td>
                  <td className="p-3 leading-relaxed">{language === 'TH' ? 'เชื่อมโมเดลอัจฉริยะ Gemini 3.5 เพื่อจัดสรุปรายงานไร้ความเสี่ยงด้านลิขสิทธิ์กังวล' : 'Enables native access to Google Gemini models for analytics & schema structures.'}</td>
                </tr>
                <tr className="hover:bg-slate-55 dark:hover:bg-white/5">
                  <td className="p-3 font-mono font-bold text-[#74045F] dark:text-[#C7911B]">React 18 & Vite</td>
                  <td className="p-3"><span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-455 px-2 py-0.5 rounded text-[10px] font-black">MIT License</span></td>
                  <td className="p-3 leading-relaxed">{language === 'TH' ? 'จัดพาร์ทเรนเดอร์ UI คอร์และโมดูลเชื่อมเสริฟรวดเร็วประหยัดแบตเตอรี่ในคอมพิวเตอร์พกพา' : 'Dynamic Virtual DOM renders of inspection logs with quick state hooks.'}</td>
                </tr>
                <tr className="hover:bg-slate-55 dark:hover:bg-white/5">
                  <td className="p-3 font-mono font-bold text-[#74045F] dark:text-[#C7911B]">Tailwind CSS v4</td>
                  <td className="p-3"><span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-455 px-2 py-0.5 rounded text-[10px] font-black">MIT License</span></td>
                  <td className="p-3 leading-relaxed">{language === 'TH' ? 'กำหนดสไตล์รอยหยักประหยัดโหลด คุมธีมแสงประจบแดดจ้าและธีมมืด' : 'Ultra-fast utility CSS for adaptive and eyes-friendly screen designs.'}</td>
                </tr>
                <tr className="hover:bg-slate-55 dark:hover:bg-white/5">
                  <td className="p-3 font-mono font-bold text-[#74045F] dark:text-[#C7911B]">Recharts</td>
                  <td className="p-3"><span className="bg-amber-500/10 text-amber-600 dark:text-amber-455 px-2 py-0.5 rounded text-[10px] font-black">MIT License</span></td>
                  <td className="p-3 leading-relaxed">{language === 'TH' ? 'วิเคราะห์กราฟเทรนด์สถิติคุณภาพทางแรงดัน Swells/Sags ให้แก่หน้าแดชบอร์ด' : 'Line and bar visualizations tracking PQ Swells, Sags and Outages.'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )
    },
    {
      title: language === 'TH' ? "บทที่ 5: โครงสร้างเอกสาร แผนผังฐานข้อมูล และสิทธิ์ความปลอดภัย Firestore" : "Chapter 5: Database Blueprints & Security Rules",
      subtitle: "Database Blueprints & Security Rules",
      icon: <ShieldAlert size={18} />,
      content: (
        <div className="space-y-4 text-xs md:text-sm">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-justify">
            {language === 'TH' ? 'แผนผัง NoSQL คอลเลกชันหลักและการประจุคีย์เอกสาร (Firestore Database Physical Layout Model):' : 'Detailed database maps in Firestore and relational models applied in the tracker ecosystem:'}
          </p>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-205 dark:border-white/10 space-y-2">
              <strong className="text-[#74045F] dark:text-[#C7911B] font-extrabold block uppercase tracking-wide">📂 Collection: /users {'{uid}'}</strong>
              <div className="space-y-1 font-mono text-[10px] text-slate-500 dark:text-slate-400 pl-2">
                <p>• employeeId: <span className="text-emerald-600 dark:text-emerald-400">string (รหัสพนักงาน)</span></p>
                <p>• name | email: <span className="text-pink-600">string</span></p>
                <p>• role: <span className="text-blue-500 font-bold">"ADMIN" | "INSPECTOR" | "MANAGER" | "VENDOR"</span></p>
                <p>• peaOffice | department: <span className="text-indigo-500">string</span></p>
                <p>• signature: <span className="text-amber-500">string (Base64 vector path)</span></p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-205 dark:border-white/10 space-y-2">
              <strong className="text-[#74045F] dark:text-[#C7911B] font-extrabold block uppercase tracking-wide">📂 Collection: /powerPlants {'{plantId}'}</strong>
              <div className="space-y-1 font-mono text-[10px] text-slate-500 dark:text-slate-400 pl-2">
                <p>• id | name: <span className="text-pink-600">string</span></p>
                <p>• type: <span className="text-amber-600">"Solar" | "Wind" | "Biomass" | "Waste"</span></p>
                <p>• capacity: <span className="text-emerald-500">number (Megawatt: MW)</span></p>
                <p>• connectionPoint: <span className="text-indigo-500">string (จุดเชื่อมโยงสายส่ง)</span></p>
                <p>• gps: <span className="text-purple-500">object {'{ latitude, longitude }'}</span></p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-205 dark:border-white/10 space-y-2">
              <strong className="text-[#74045F] dark:text-[#C7911B] font-extrabold block uppercase tracking-wide">📂 Collection: /inspections {'{id}'}</strong>
              <div className="space-y-1 font-mono text-[10px] text-slate-500 dark:text-slate-400 pl-2">
                <p>• requestId | inspectorId: <span className="text-pink-600">string</span></p>
                <p>• inspectorName: <span className="text-pink-600">string</span></p>
                <p>• geoCheck: <span className="text-indigo-500">{'object { userLat, userLng, distanceMeters }'}</span></p>
                <p>• formData: <span className="text-emerald-600 font-bold">object (ประวัติการเช็คจุดควบคุม)</span></p>
                <p>• photos: <span className="text-amber-600">array [string Base64]</span></p>
                <p>• inspectorSignature: <span className="text-purple-600">string</span></p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-205 dark:border-white/10 space-y-2">
              <strong className="text-[#74045F] dark:text-[#C7911B] font-extrabold block uppercase tracking-wide">📂 Collection: /complaints {'{id}'}</strong>
              <div className="space-y-1 font-mono text-[10px] text-slate-500 dark:text-slate-400 pl-2">
                <p>• trackerId | title: <span className="text-pink-600">string</span></p>
                <p>• category: <span className="text-amber-600 font-bold">"TECHNICAL" | "ACCOUNT" | "DATA"</span></p>
                <p>• reporterName | details: <span className="text-pink-600">string</span></p>
                <p>• status: <span className="text-rose-500 font-bold">"OPEN" | "RESOLVED" | "CLOSED"</span></p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-rose-500/5 rounded-2xl border border-rose-500/20 text-xs text-slate-600 dark:text-slate-400 leading-relaxed text-justify space-y-1">
            <strong className="text-rose-600 dark:text-rose-400 block uppercase font-bold text-[10px] tracking-widest">
              {language === 'TH' ? 'สิทธิ์ความปลอดภัยที่ทนทาน (Firestore Security Rules Constraint):' : 'Access Protection via Firestore Security Rules:'}
            </strong>
            <p>
              {language === 'TH' ? (
                <>
                  กั้นกระบวนสิทธิ์ในไฟล์ <code className="font-mono bg-slate-100 dark:bg-white/10 px-1 py-0.5 rounded text-rose-600 font-bold">firestore.rules</code> บังคับให้อ่านและเขียนข้อมูลเฉพาะบัญชีผู้ที่ผ่านการเซ็นรับรับรองความถูกต้อง โดยจำกัดตัวเขียน <code className="font-mono">assignedInspector</code> สัมพันธ์เท่านั้น บล็อกสิทธิ์ผู้ค้าไม่ให้เข้ามาเขียนหรือแก้ไขรายงานผู้อื่นโดยพละการเด็ดขาด
                </>
              ) : (
                <>
                  Strict access control rules deployed in <code className="bg-slate-100 dark:bg-white/10 px-1 rounded font-mono text-xs">firestore.rules</code> dictate that read/write operations for inspections are reserved strictly for the associated inspector ID to block malicious remote document overrides.
                </>
              )}
            </p>
          </div>
        </div>
      )
    },
    {
      title: language === 'TH' ? "บทที่ 6: ทฤษฎีคณิตศาสตร์พิกัดพื้นผิวโค้ง Geofencing และแบบจำลองระยะ" : "Chapter 6: Geolocation, Geodesy & Haversine formula",
      subtitle: "Geolocation, Geodesy & Haversine formula",
      icon: <Globe size={18} />,
      content: (
        <div className="space-y-4 text-xs md:text-sm font-sans">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-justify">
            {language === 'TH' ? (
              <>
                การระบุระยะผิวโค้งโลกบนสัณฐานทรงกลมที่ระดับเสตจจริงใช้ <strong>สูตรฮาเวอร์ซีน (Haversine Formula)</strong> โดยวัดเปรียบเทียบจากรัศมีของโลกโดยเฉลี่ย $R = 6,371,000$ เมตร เพื่อปิดลูปห้ามอัปโหลดสวมรอยข้ามสิทธิ์กรณีผู้ลงงานอยู่นอกระยะรัศมี <code className="bg-[#74045F]/10 dark:bg-[#C7911B]/10 text-[#74045F] dark:text-[#C7911B] px-1 py-0.5 font-bold rounded">500 เมตร</code>
              </>
            ) : (
              <>
                To prevent remote reporting fraud, the geofence locks inspection submittals unless the hardware GPS reports coordinates within the <strong>500-meter threshold</strong> of the power station. Calculations leverage the <strong>Great-Circle Haversine Formula</strong> where $R = 6,371,000$ meters.
              </>
            )}
          </p>

          <div className="p-4 bg-slate-950 dark:bg-black/40 rounded-2xl border border-slate-200 dark:border-white/10 font-mono text-[11px] text-slate-300 dark:text-slate-400 space-y-1 leading-relaxed">
            <span className="font-bold text-indigo-400 block text-xs underline mb-1">{language === 'TH' ? 'ขั้นตอนทางคณิตศาสตร์สากล (Mathematical Haversine steps):' : 'Mathematical Haversine Formula:'}</span>
            <p>1. dLat = (lat2 - lat1) * Math.PI / 180</p>
            <p>2. dLon = (lng2 - lng1) * Math.PI / 180</p>
            <p>3. a = sin²(dLat / 2) + cos(lat1) * cos(lat2) * sin²(dLon / 2)</p>
            <p>4. c = 2 * atan2(√a, √(1 - a))</p>
            <p>5. d = EARTH_RADIUS (6,371,000 meters) * c</p>
          </div>

          {/* Interactive Calculator Card */}
          <div className="p-5 bg-[#74045F]/5 dark:bg-[#C7911B]/5 rounded-2xl border border-[#74045F]/10 dark:border-[#C7911B]/10 space-y-4 shadow-sm">
            <h5 className="font-black text-xs uppercase tracking-widest text-[#74045F] dark:text-[#C7911B] flex items-center gap-2">
              <RefreshCw size={13} className="animate-spin text-[#74045F] dark:text-[#C7911B]" />
              {language === 'TH' ? 'เครื่องมือคำนวณระยะพิกัดผิวโค้งโลกจำลอง (Haversine Sandbox Calculator)' : 'Haversine Sandbox Live Calculator'}
            </h5>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1.5">
                <span className="font-extrabold text-slate-600 dark:text-slate-400 block text-[10px] uppercase">
                  {language === 'TH' ? 'พิกัดพนักงานตรวจ (ตำแหน่งที่ 1)' : 'Position 1 (Inspector GPS)'}
                </span>
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <label className="text-[9px] text-slate-400 dark:text-slate-500 font-bold block mb-0.5">Latitude</label>
                    <input type="number" step="any" value={lat1} onChange={e => setLat1(e.target.value)} className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-2 font-mono text-[11px]" />
                  </div>
                  <div className="w-1/2">
                    <label className="text-[9px] text-slate-400 dark:text-slate-500 font-bold block mb-0.5">Longitude</label>
                    <input type="number" step="any" value={lng1} onChange={e => setLng1(e.target.value)} className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-2 font-mono text-[11px]" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="font-extrabold text-slate-600 dark:text-slate-400 block text-[10px] uppercase">
                  {language === 'TH' ? 'พิกัดโรงเก็บเป้าหมาย (ตำแหน่งที่ 2)' : 'Position 2 (Power Plant Target)'}
                </span>
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <label className="text-[9px] text-slate-400 dark:text-slate-500 font-bold block mb-0.5">Latitude</label>
                    <input type="number" step="any" value={lat2} onChange={e => setLat2(e.target.value)} className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-2 font-mono text-[11px]" />
                  </div>
                  <div className="w-1/2">
                    <label className="text-[9px] text-slate-400 dark:text-slate-500 font-bold block mb-0.5">Longitude</label>
                    <input type="number" step="any" value={lng2} onChange={e => setLng2(e.target.value)} className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-2 font-mono text-[11px]" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-black/30 p-4 rounded-xl border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-widest mb-1">
                {language === 'TH' ? 'ผลลัพธ์ผ่านสูตรคำนวณ Great-Circle Range' : 'Computed Great-Circle Surface Distance'}
              </span>
              {distanceResult !== null ? (
                <div>
                  <span className="text-xl font-black font-mono text-[#74045F] dark:text-[#C7911B] leading-none block">
                    {distanceResult.toFixed(2)} เมตร (m)
                  </span>
                  <span className={`text-[10px] font-black tracking-wider inline-block mt-2 uppercase px-3 py-1 rounded-full border ${distanceResult <= 500 ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-500 bg-rose-500/10 border-rose-500/20'}`}>
                    {distanceResult <= 500 ? (language === 'TH' ? '● ในรัศมีตรวจปฏิบัติงานได้ (GEOFENCE ACCEPTED)' : '● Geofence Approved') : (language === 'TH' ? '✕ นอกรัศมีส่งคำสิทธิ์ตรวจ (GEOFENCE ENFORCED BLOCK)' : '✕ Geofence Blocked')}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-rose-500 italic">ตัวเลของศาไม่ครบถ้วน...</span>
              )}
            </div>
          </div>
        </div>
      )
    },
    {
      title: language === 'TH' ? "บทที่ 7: พิมพ์เขียวความยั่งยืนของระบบและยุทธศาสตร์ Google Gemini AI" : "Chapter 7: Future AI Strategic Roadmap",
      subtitle: "Enterprise AI Implementation Roadmaps",
      icon: <Award size={18} />,
      content: (
        <div className="space-y-4 text-xs md:text-sm animate-fade-in">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-justify">
            {language === 'TH' ? (
              <>
                แผนงานปรับตัวสู่โครงข่ายไฟฟ้าพลังงานยุคหน้าคาร์บอนสุทธิศูนย์ โดยขยายการเรียกคำสั่งโมเดลปัญญาประดิษฐ์สัญจร <code className="font-mono bg-indigo-500/10 px-1 text-indigo-500 rounded">Google Gemini 3.5 Flash</code> และ <code className="font-mono bg-indigo-500/10 px-1 text-indigo-500 rounded">Gemini 3.1 Pro</code> ผ่าน 5 ยอดกลวิเศษนวัตกรรม:
              </>
            ) : (
              <>
                Evolution path transforming the Smart Tracker platform with generative models <code className="font-mono bg-slate-100 dark:bg-white/10 px-1 rounded text-indigo-500 font-bold">Google Gemini 3.5 Flash</code> using the native TypeScript SDK across 5 critical enterprise use cases:
              </>
            )}
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-205 dark:border-white/10 space-y-1">
              <span className="text-[10px] font-black text-[#74045F] dark:text-[#C7911B] tracking-wide uppercase block">Q1 Target: Multimodal Safety Scan</span>
              <p className="text-xs text-slate-800 dark:text-white font-bold">{language === 'TH' ? '1. ระบบเฝ้าระวังกราฟิกจุดไหม้สายส่งด่วน' : '1. Thermal & Corrosion Vision Classifier'}</p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed text-justify">
                {language === 'TH' ? 'ถ่ายภาพรังสีความร้อนอินฟราเรดแผงสวิตช์ส่งให้ Gemini ตรวจจับอุณหภูมิผิดที่ ขี้สนิมกรามจุดต่อสายไฟ ป้องกันการระเบิดเชิงอัคคีภัยล่วงหน้า (KPI ความแม่นยำ > 95%)' : 'Inspect infrared camera artifacts of panels using multimodal prompts to detect chemical rust build-ups and thermal hotspots before arc explosions occur.'}
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-205 dark:border-white/10 space-y-1">
              <span className="text-[10px] font-black text-[#74045F] dark:text-[#C7911B] tracking-wide uppercase block">Q2 Target: Voice Integration Co-Pilot</span>
              <p className="text-xs text-slate-800 dark:text-white font-bold">{language === 'TH' ? '2. สั่งรายงานไร้ถุงมือกรอกด้วยแชทเสียง' : '2. Hands-Free Voice-to-Form Copilot'}</p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed text-justify">
                {language === 'TH' ? 'อำนวยแก่พนักงานที่หิ้วอุปกรณ์เครื่องวัดจนนิ้วเลอะคราบน้ำมัน โดยส่งเสียงบันทึกคำเป็นตัวแปร Voltage ปานกลาง ให้ระบบแรพปิ้งหยอดลงฟลอร์แบบฟอร์มให้เอง' : 'Enable field personnel to speak current volt-meters and high-harmonic metrics out-loud which are parsed into structured JSON schemas automatically.'}
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-205 dark:border-white/10 space-y-1">
              <span className="text-[10px] font-black text-[#74045F] dark:text-[#C7911B] tracking-wide uppercase block">Q3 Target: Executive Smart Summary</span>
              <p className="text-xs text-slate-800 dark:text-white font-bold">{language === 'TH' ? '3. อนุมัติย่อยเชิงลึกกระดาศแผ่นเดียว' : '3. Executive AI Summarization Stream'}</p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed text-justify">
                {language === 'TH' ? 'แปลงรายงานการตรวจเป็นสรุปเข้มกะทัดรัด (One Page Summary) ปักไฮไลท์สีเตือนสัญกรณ์บกพร่อง ให้แก่หัวหน้างานระดับสูงกดเซ็นและเปลี่ยนสถานะรวดเร็ว' : 'Condense dense technical checklists, complaints and annotations into a sharp one-page Th/En executive brief with key warnings optimized.'}
              </p>
            </div>

            <div className="p-4 bg-slate-51 dark:bg-white/5 rounded-2xl border border-slate-205 dark:border-white/10 space-y-1">
              <span className="text-[10px] font-black text-[#74045F] dark:text-[#C7911B] tracking-wide uppercase block">Q4-Q5 Target: Outage Predictor</span>
              <p className="text-xs text-slate-800 dark:text-white font-bold">{language === 'TH' ? '4. วิเคราะห์การกระตุกคลื่นเสี่ยงดรอป' : '4. Predictive Swell/Sag & Outage scheduler'}</p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed text-justify">
                {language === 'TH' ? 'ดึงบันทึกข้อบกพร่องสถิติของตุ่มโรงไฟฟ้าจำจัดพัด ร่วมความต่างระดับฮาร์มอนิกรายสัปดาห์ คาดวันชำรุดเชิงป้องกันล่วงหน้าเพื่อปิดประตูกระแสวิกฤตดับในลูปส่ง' : 'Aggregating harmonic historical fluctuations and technician notes through timeseries vectors to predict voltage dropouts & set schedules proactively.'}
              </p>
            </div>
          </div>
        </div>
      )
    }
  ];

  const filteredChapters = chapters.filter(chap =>
    chap.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chap.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-slide-in-top pb-10">
      <div className="glass-panel p-6 rounded-3xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 shadow-xl">
        <div className="flex flex-row justify-between items-center gap-4 mb-6 border-b border-slate-150 dark:border-white/5 pb-4">
          <div>
            <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
              <BookOpen size={22} className="text-[#74045F] dark:text-[#C7911B]" />
              <span className="italic">{language === 'TH' ? 'คู่มือสถาปัตยกรรมและเอกสารอ้างอิงข้อมูลทางเทคนิค' : 'Architecture & Technical Guide'}</span>
            </h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-black mt-1">PEA PQ Smart Tracker Reference System v1.1.0</p>
          </div>
          <button 
            onClick={() => setSection('MAIN')} 
            className="text-xs bg-slate-150 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 font-black text-slate-650 dark:text-slate-300 transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
          >
            <ArrowLeft size={14} />
            {language === 'TH' ? 'ย้อนกลับ' : 'Back'}
          </button>
        </div>

        {/* Search Input */}
        <div className="mb-6 relative">
          <input 
            type="text"
            placeholder={language === 'TH' ? "ค้นหาบทคู่มือ หัวข้อ สคีมา หรือคำนวณ..." : "Search chapters, schemas, or calculations..."}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-white/5 border border-slate-250 dark:border-white/10 rounded-2xl p-4 pl-12 text-xs md:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner"
          />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
        </div>

        {/* Dynamic Multi-column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List panel (left side) */}
          <div className="lg:col-span-1 space-y-2 lg:border-r border-slate-100 dark:border-white/5 pr-4 max-h-[500px] overflow-y-auto">
            {filteredChapters.map((chap, i) => {
              const chapIndex = chapters.indexOf(chap);
              const isActive = selectedChapter === chapIndex;
              return (
                <button
                  key={`chap-${i}`}
                  onClick={() => setSelectedChapter(chapIndex)}
                  className={`w-full text-left p-4 rounded-2xl transition-all duration-200 flex items-start gap-3 border ${isActive ? 'bg-[#74045F] dark:bg-[#C7911B] text-white border-[#74045F]/20 dark:border-[#C7911B]/20 shadow-lg shadow-[#74045F]/15 dark:shadow-[#C7911B]/15 scale-[1.01]' : 'bg-transparent border-transparent hover:bg-slate-55 dark:hover:bg-white/5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                >
                  <div className={`mt-0.5 p-1 px-1.5 rounded-lg text-[10px] font-black select-none ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>
                    0{chapIndex + 1}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-black truncate leading-tight ${isActive ? 'text-white' : 'text-slate-800 dark:text-white'}`}>
                      {language === 'TH' ? (chap.title.split(': ')[1] || chap.title) : (chap.title.split(': ')[1] || chap.title)}
                    </p>
                    <p className={`text-[9px] truncate mt-1 font-semibold ${isActive ? 'text-slate-100/70' : 'text-slate-400 dark:text-slate-500'}`}>
                      {chap.subtitle}
                    </p>
                  </div>
                </button>
              );
            })}
            {filteredChapters.length === 0 && (
              <div className="text-center py-6 text-xs text-slate-400 italic">
                {language === 'TH' ? 'ไม่พบหัวข้อคู่มือที่คุณค้นหา' : 'No matching chapters found'}
              </div>
            )}
          </div>

          {/* Chapter Content View panel (right side) */}
          <div className="lg:col-span-2 space-y-4 pl-2 min-h-[350px]">
            {chapters[selectedChapter] ? (
              <div className="animate-fade-in space-y-4">
                <div className="border-b border-dashed border-slate-150 dark:border-white/10 pb-4">
                  <span className="text-[10px] font-black text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest block mb-1">
                    CHAPTER 0{selectedChapter + 1}
                  </span>
                  <h4 className="text-base font-black text-slate-800 dark:text-white italic leading-tight">
                    {chapters[selectedChapter].title}
                  </h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 tracking-wider font-extrabold uppercase mt-1">
                    {chapters[selectedChapter].subtitle}
                  </p>
                </div>
                
                <div className="py-2 text-slate-700 dark:text-slate-100">
                  {chapters[selectedChapter].content}
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 italic text-xs">
                {language === 'TH' ? 'กรุณาเลือกบทคู่มือเพื่ออ่านข้อมูลเชิงลึก' : 'Please select a chapter to load system reference details.'}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Footer License */}
      <div className="flex md:flex-row flex-col justify-between items-center text-[10px] text-slate-400 dark:text-slate-500 font-black tracking-wide italic px-2">
        <span>PEA SYSTEM BLUEPRINT SPECIFICATION PRODUCED ON MAY 2026</span>
        <span>PEA-PQ-3314-ASSET CONFIDENTIALITY MATRIX</span>
      </div>
    </div>
  );
};

const SecurityView = ({ t, setSection }: { t: any; setSection: any }) => (
  <div className="space-y-6 animate-slide-in-top">
      <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800 dark:text-white"><Shield className="text-green-400" /> {t('profile.security')}</h3>
          <div className="text-gray-600 dark:text-gray-300">
              Password and security settings.
          </div>
           <div className="mt-8 pt-6 border-t border-gray-200 dark:border-white/10 flex justify-end">
              <button onClick={() => setSection('MAIN')} className="text-gray-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white">{t('btn.back')}</button>
           </div>
      </div>
  </div>
);

export const Profile: React.FC<ProfileProps> = ({ 
  onBack, 
  onLogout, 
  userProfile, 
  onUpdateProfile, 
  isDangerZoneUnlocked, 
  setIsDangerZoneUnlocked,
  setIsUnlockModalOpen
}) => {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings } = useSettings();
  const [section, setSection] = useState<ProfileSection>('MAIN');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Signature Screen State
  const [signatureMode, setSignatureMode] = useState<'DRAW' | 'UPLOAD'>('DRAW');
  const [uploadedSignature, setUploadedSignature] = useState<string | null>(null);

  // Profile Data State using userProfile prop
  const [profileData, setProfileData] = useState(userProfile || DEFAULT_PROFILE);

  useEffect(() => {
    if (userProfile) {
        setProfileData(userProfile);
    }
  }, [userProfile]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSaveProfile = (newData: any) => {
      const updated = { ...profileData, ...newData };
      setProfileData(updated);
      onUpdateProfile(updated);
      safeRemoveLocalStorage('draft_profile_edit');
      showToast(t('btn.save') + ' ' + t('status.completed'));
      setSection('MAIN');
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showToast("ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)");
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        // More aggressive compression
        const compressed = await compressBase64Image(base64, 200, 200, 0.5);
        handleSaveProfile({ avatar: compressed });
        showToast(t('profile.avatar_upload') + ' ' + t('status.completed'));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteAvatar = () => {
    handleSaveProfile({ avatar: "" });
  };

  return (
    <div className="space-y-6 animate-fade-in w-full pb-24 md:pb-0 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-green-500 text-white px-6 py-3 rounded-full shadow-[0_0_20px_rgba(34,197,94,0.4)] flex items-center gap-2 animate-fade-in border border-green-400 font-medium">
            <div className="bg-white rounded-full p-0.5 text-green-600"><Check size={12} strokeWidth={4} /></div>
            {toastMessage}
        </div>
      )}

      {/* Header / Back */}
      <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={section === 'MAIN' ? onBack : () => setSection('MAIN')} className="text-gray-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors text-sm flex items-center gap-1">
                {section === 'MAIN' ? (
                    <>← {t('btn.back')}</>
                ) : (
                    <><ArrowLeft size={16} /> {t('btn.back')}</>
                )}
            </button>
            <span className="text-gray-400 dark:text-gray-600">/</span>
            <span className="text-slate-900 dark:text-gray-200 text-sm">
                {section === 'MAIN' && t('profile.title')}
                {section === 'EDIT_PROFILE' && t('btn.edit')}
                {section === 'SIGNATURE' && t('profile.signature')}
                {section === 'SETTINGS' && t('profile.settings')}
                {section === 'SUPPORT' && 'แจ้งปัญหาการใช้งาน'}
                {section !== 'MAIN' && section !== 'EDIT_PROFILE' && section !== 'SETTINGS' && section !== 'SUPPORT' && section}
            </span>
          </div>
      </div>

      {section === 'MAIN' && (
        <MainProfileView 
          profileData={profileData} 
          t={t} 
          setSection={setSection} 
          handleAvatarUpload={handleAvatarUpload} 
          handleDeleteAvatar={handleDeleteAvatar} 
          fileInputRef={fileInputRef} 
          onLogout={onLogout}
          language={language}
        />
      )}
      {section === 'EDIT_PROFILE' && (
        <EditProfileView 
          profileData={profileData} 
          t={t} 
          handleSaveProfile={handleSaveProfile} 
          showToast={showToast} 
          isDangerZoneUnlocked={isDangerZoneUnlocked}
          isAdmin={userProfile?.role === 'ADMIN'}
        />
      )}
      {section === 'SIGNATURE' && (
        <SignatureView 
          theme={theme} 
          profileData={profileData} 
          t={t} 
          handleSaveProfile={handleSaveProfile} 
          setSection={setSection} 
          showToast={showToast} 
          signatureMode={signatureMode}
          setSignatureMode={setSignatureMode}
          uploadedSignature={uploadedSignature}
          setUploadedSignature={setUploadedSignature}
        />
      )}
      {section === 'NOTIFICATIONS' && <NotificationsView t={t} setSection={setSection} language={language} />}
      {section === 'SECURITY' && <SecurityView t={t} setSection={setSection} />}
      {section === 'SETTINGS' && (
        <SettingsView 
          t={t} 
          language={language} 
          setLanguage={setLanguage} 
          theme={theme} 
          setTheme={setTheme} 
          settings={settings} 
          updateSettings={updateSettings} 
          setSection={setSection} 
          showToast={showToast} 
          isDangerZoneUnlocked={isDangerZoneUnlocked}
          setIsUnlockModalOpen={setIsUnlockModalOpen}
          setIsDangerZoneUnlocked={setIsDangerZoneUnlocked}
          isAdmin={userProfile?.role === 'ADMIN'}
        />
      )}
      {section === 'SUPPORT' && (
        <SupportView 
          profileData={profileData} 
          setSection={setSection} 
          showToast={showToast} 
        />
      )}

    </div>
  );
};
