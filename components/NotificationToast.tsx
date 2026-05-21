import React, { useEffect, useState } from 'react';
import { AppNotification } from '../types';
import { Bell, AlertTriangle, CheckCircle, X, ChevronDown, ChevronUp, FileText, Activity } from 'lucide-react';

interface NotificationToastProps {
  notification: AppNotification;
  onDismiss: (id: string) => void;
}

// Shared AudioContext to prevent overloading browser
let sharedAudioCtx: AudioContext | null = null;

export const NotificationToast: React.FC<NotificationToastProps> = ({ notification, onDismiss }) => {
  const DURATION = 8000;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Sound Effect Logic
  useEffect(() => {
    const playSound = async () => {
      try {
        if (!sharedAudioCtx) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) sharedAudioCtx = new AudioContextClass();
        }

        if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') return;
        if (sharedAudioCtx.state === 'suspended') await sharedAudioCtx.resume();

        const ctx = sharedAudioCtx;
        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        const now = ctx.currentTime;

        if (notification.type === 'SUCCESS') {
          const osc1 = ctx.createOscillator();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(523.25, now);
          osc1.connect(gainNode);
          osc1.start(now);
          osc1.stop(now + 0.3);

          const osc2 = ctx.createOscillator();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(659.25, now + 0.1);
          osc2.connect(gainNode);
          osc2.start(now + 0.1);
          osc2.stop(now + 0.4);
          
          gainNode.gain.setValueAtTime(0, now);
          gainNode.gain.linearRampToValueAtTime(0.05, now + 0.05);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        } else if (notification.type === 'ALERT') {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(110, now);
          osc.frequency.linearRampToValueAtTime(220, now + 0.1);
          osc.frequency.linearRampToValueAtTime(110, now + 0.2);
          osc.frequency.linearRampToValueAtTime(220, now + 0.3);
          
          osc.connect(gainNode);
          osc.start(now);
          osc.stop(now + 0.4);
          
          gainNode.gain.setValueAtTime(0.05, now);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        } else {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, now);
          
          osc.connect(gainNode);
          osc.start(now);
          osc.stop(now + 0.15);
          
          gainNode.gain.setValueAtTime(0, now);
          gainNode.gain.linearRampToValueAtTime(0.03, now + 0.02);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        }
      } catch (e) {
        console.warn("Audio play failed, likely user interaction missing", e);
      }
    };

    playSound();
  }, [notification.type]);

  // Auto dismiss logic
  useEffect(() => {
    if (isExpanded || isPaused) return;

    const timer = setTimeout(() => {
      onDismiss(notification.id);
    }, DURATION);
    return () => clearTimeout(timer);
  }, [notification.id, onDismiss, isExpanded, isPaused]);

  const getStyles = () => {
    switch (notification.type) {
      case 'ALERT':
        return {
          wrapper: 'bg-white dark:bg-[#1a0f0f] border-l-4 border-l-rose-500 border-y border-r border-gray-200 dark:border-rose-900/30',
          iconBg: 'bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400',
          title: 'text-rose-700 dark:text-rose-400',
          desc: 'text-slate-600 dark:text-rose-200/70',
          btn: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-800',
          detailBox: 'bg-rose-50/50 dark:bg-black/20 border-rose-100 dark:border-rose-900/20 text-rose-800 dark:text-rose-200'
        };
      case 'SUCCESS':
        return {
          wrapper: 'bg-white dark:bg-[#0f1a15] border-l-4 border-l-emerald-500 border-y border-r border-gray-200 dark:border-emerald-900/30',
          iconBg: 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
          title: 'text-emerald-700 dark:text-emerald-400',
          desc: 'text-slate-600 dark:text-emerald-200/70',
          btn: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800',
          detailBox: 'bg-emerald-50/50 dark:bg-black/20 border-emerald-100 dark:border-emerald-900/20 text-emerald-800 dark:text-emerald-200'
        };
      default:
        return {
          wrapper: 'bg-white dark:bg-[#0f121a] border-l-4 border-l-indigo-500 border-y border-r border-gray-200 dark:border-indigo-900/30',
          iconBg: 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400',
          title: 'text-indigo-700 dark:text-indigo-400',
          desc: 'text-slate-600 dark:text-indigo-200/70',
          btn: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800',
          detailBox: 'bg-indigo-50/50 dark:bg-black/20 border-indigo-100 dark:border-indigo-900/20 text-indigo-800 dark:text-indigo-200'
        };
    }
  };

  const s = getStyles();

  return (
    <div 
      className={`
        pointer-events-auto w-full max-w-md mb-4 rounded-xl shadow-2xl shadow-black/5 dark:shadow-black/20
        transform transition-all duration-500 ease-out overflow-hidden
        ${s.wrapper} animate-slide-in-right
      `}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="p-4 flex gap-4 relative">
        {/* Icon Area */}
        <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${s.iconBg} mt-1`}>
          {notification.type === 'ALERT' ? <AlertTriangle size={20} /> : 
           notification.type === 'SUCCESS' ? <CheckCircle size={20} /> : <Bell size={20} />}
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0 pr-6">
          <h4 className={`font-bold text-sm leading-tight mb-1 ${s.title}`}>
            {notification.title}
          </h4>
          <p className={`text-xs font-medium leading-relaxed ${s.desc}`}>
            {notification.message}
          </p>

          {/* Action Button */}
          {notification.details && (
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className={`
                mt-3 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide
                flex items-center gap-2 transition-all active:scale-95 ${s.btn}
              `}
            >
              {isExpanded ? <ChevronUp size={14} /> : <FileText size={14} />}
              {isExpanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด (View Details)'}
            </button>
          )}
        </div>

        {/* Close Button */}
        <button 
          onClick={() => onDismiss(notification.id)}
          className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Expandable Details Section */}
      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className={`mx-4 mb-4 p-3 rounded-lg border text-xs font-mono whitespace-pre-wrap leading-relaxed shadow-inner ${s.detailBox}`}>
           <div className="flex items-center gap-2 mb-2 opacity-70 border-b border-black/10 pb-1">
              <Activity size={12} />
              <span className="font-bold uppercase tracking-widest">Technical Data</span>
           </div>
           {notification.details}
        </div>
      </div>

      {/* Progress Bar */}
      {!isExpanded && !isPaused && (
        <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-transparent to-current opacity-20 w-full">
           <div 
             className="h-full bg-current opacity-50 animate-shrink" 
             style={{ 
               width: '100%',
               animationDuration: `${DURATION}ms`
             }} 
           />
        </div>
      )}
    </div>
  );
};
