
import React from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { NotificationToast } from './NotificationToast';
import { X, Bell, Trash2, CheckCircle2, AlertCircle, Info, ChevronRight } from 'lucide-react';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ isOpen, onClose }) => {
  const { notifications, clearAll, dismissNotification } = useNotifications();

  return (
    <>
      {/* Toast Overlay - Shows recent ones on top */}
      <div className="fixed top-24 right-6 z-[200] w-full max-w-sm pointer-events-none flex flex-col items-end">
        {notifications.slice(0, 3).map((n) => (
          <NotificationToast key={n.id} notification={n} onDismiss={dismissNotification} />
        ))}
      </div>

      {/* Full Inbox Sidebar */}
      <div className={`fixed inset-0 z-[210] transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
        <div className={`absolute right-0 top-0 bottom-0 w-full md:w-[450px] bg-slate-900 border-l border-white/10 shadow-2xl transform transition-transform duration-500 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          
          <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <div className="flex items-center gap-4">
               <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-2xl">
                 <Bell size={24} />
               </div>
               <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">ศูนย์แจ้งเตือน</h2>
                  <p className="text-xs text-slate-500 uppercase font-black tracking-widest mt-1">Notification Center</p>
               </div>
            </div>
            <div className="flex items-center gap-2">
               {notifications.length > 0 && (
                 <button onClick={clearAll} className="p-2.5 text-slate-500 hover:text-red-400 transition-colors" title="ล้างทั้งหมด">
                   <Trash2 size={20} />
                 </button>
               )}
               <button onClick={onClose} className="p-2.5 text-slate-400 hover:text-white transition-colors bg-white/5 rounded-full">
                 <X size={20} />
               </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
            {notifications.length > 0 ? (
              notifications.map((n) => (
                <div key={n.id} className="minimal-card p-5 bg-white/[0.01] border-white/5 hover:bg-white/[0.03] transition-all group relative">
                   <div className="flex items-start gap-4">
                      <div className={`p-2.5 rounded-xl shrink-0 ${
                        n.type === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400' :
                        n.type === 'ALERT' ? 'bg-red-500/10 text-red-400' : 'bg-sky-500/10 text-sky-400'
                      }`}>
                         {n.type === 'SUCCESS' ? <CheckCircle2 size={18} /> : n.type === 'ALERT' ? <AlertCircle size={18} /> : <Info size={18} />}
                      </div>
                      <div className="flex-1 min-w-0">
                         <h4 className="font-bold text-sm text-slate-200 mb-1">{n.title}</h4>
                         <p className="text-xs text-slate-400 leading-relaxed font-light">{n.message}</p>
                         <span className="text-[9px] text-slate-600 font-mono mt-3 block">{new Date(parseInt(n.id)).toLocaleString('th-TH')}</span>
                      </div>
                      <button onClick={() => dismissNotification(n.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-white transition-all">
                        <X size={14} />
                      </button>
                   </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-20">
                <Bell size={64} className="mb-6" />
                <p className="text-sm font-bold uppercase tracking-widest">ไม่มีการแจ้งเตือนใหม่</p>
              </div>
            )}
          </div>

          {notifications.length > 0 && (
             <div className="p-8 border-t border-white/5 bg-black/20">
                <button onClick={clearAll} className="w-full py-4 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-2xl text-xs font-bold uppercase tracking-widest transition-all">
                   ล้างการแจ้งเตือนทั้งหมด
                </button>
             </div>
          )}
        </div>
      </div>
    </>
  );
};
