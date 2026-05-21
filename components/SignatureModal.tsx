
import React, { useRef, useEffect, useState } from 'react';
import SignaturePad from 'signature_pad';
import { X, Eraser, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

import { compressBase64Image } from '../utils/imageUtils';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signatureDataUrl: string) => void;
  title: string;
  savedSignature?: string | null;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({ isOpen, onClose, onSave, title, savedSignature }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [useSaved, setUseSaved] = useState(false);

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      // Adjust canvas size to parent container
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);

      signaturePadRef.current = new SignaturePad(canvas, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)'
      });

      signaturePadRef.current.addEventListener("endStroke", () => {
        setIsEmpty(signaturePadRef.current?.isEmpty() || false);
      });
    }

    return () => {
      signaturePadRef.current?.off();
    };
  }, [isOpen]);

  const handleClear = () => {
    signaturePadRef.current?.clear();
    setIsEmpty(true);
  };

  const handleSave = async () => {
    if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
      const dataUrl = signaturePadRef.current.toDataURL('image/png');
      const compressed = await compressBase64Image(dataUrl, 400, 200, 0.5);
      onSave(compressed);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/10 text-indigo-500 rounded-2xl flex items-center justify-center">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-white italic">{title}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ยืนยันตัวตนด้วยลายมือชื่อ</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-8 bg-slate-50 dark:bg-black/20 flex-1">
          {savedSignature && (
            <div className="mb-6 flex p-1 bg-slate-200 dark:bg-white/5 rounded-2xl gap-1">
              <button 
                onClick={() => setUseSaved(false)}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!useSaved ? 'bg-white dark:bg-white/10 text-[#74045F] dark:text-[#C7911B] shadow-sm' : 'text-slate-400'}`}
              >
                ลงนามใหม่ (Draw)
              </button>
              <button 
                onClick={() => {
                  setUseSaved(true);
                  setIsEmpty(false);
                }}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${useSaved ? 'bg-white dark:bg-white/10 text-[#74045F] dark:text-[#C7911B] shadow-sm' : 'text-slate-400'}`}
              >
                ใช้ลายเซ็นในระบบ (Saved)
              </button>
            </div>
          )}

          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/10 overflow-hidden relative" style={{ height: '240px' }}>
            {useSaved && savedSignature ? (
              <div className="w-full h-full flex items-center justify-center p-8 bg-slate-50/50">
                <img src={savedSignature} alt="Saved Signature" className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <canvas 
                ref={canvasRef} 
                className="w-full h-full touch-none"
              />
            )}
            {!useSaved && isEmpty && (
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                  <p className="text-sm font-bold text-slate-400 italic">โปรดลงลายมือชื่อที่นี่</p>
               </div>
            )}
          </div>
        </div>

        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 flex gap-4">
          <button 
            onClick={useSaved ? () => setUseSaved(false) : handleClear}
            className="flex-1 py-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl text-slate-600 dark:text-slate-400 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
          >
            <Eraser size={16} /> {useSaved ? 'ยกเลิก' : 'ล้างหน้าจอ'}
          </button>
          <button 
            onClick={() => {
              if (useSaved && savedSignature) {
                onSave(savedSignature);
                onClose();
              } else {
                handleSave();
              }
            }}
            disabled={!useSaved && isEmpty}
            className="flex-1 py-4 bg-[#74045F] text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-[#74045F]/20 hover:bg-[#74045F]/90 transition-all disabled:opacity-50 disabled:grayscale"
          >
            บันทึกลายเซ็น
          </button>
        </div>
      </motion.div>
    </div>
  );
};
