import React from 'react';
import { Wifi, Keyboard, Send, CircleCheck } from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import { Language } from '../types';

interface TutorialOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ isOpen, onClose, language }) => {
  if (!isOpen) return null;

  const t = TRANSLATIONS[language].tutorial;

  const steps = [
    { icon: <Wifi className="text-cyan-400" size={32} />, title: t.step1Title, desc: t.step1Desc },
    { icon: <Keyboard className="text-cyan-400" size={32} />, title: t.step2Title, desc: t.step2Desc },
    { icon: <Send className="text-cyan-400" size={32} />, title: t.step3Title, desc: t.step3Desc },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4 animate-fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-8 md:p-12 text-center overflow-y-auto max-h-full animate-scale-in">
        <h2 
          className="text-3xl md:text-4xl font-black text-white mb-2 tracking-tight opacity-0 animate-slide-up"
          style={{ animationDelay: '100ms' }}
        >
          {t.title}
        </h2>
        <p 
          className="text-slate-400 mb-10 text-lg opacity-0 animate-slide-up"
          style={{ animationDelay: '200ms' }}
        >
          {t.subtitle}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 text-left">
          {steps.map((step, i) => (
            <div 
              key={i} 
              className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50 hover:border-cyan-500/30 transition-colors opacity-0 animate-slide-up"
              style={{ animationDelay: `${300 + (i * 150)}ms` }}
            >
              <div className="mb-4 bg-slate-900 w-12 h-12 rounded-xl flex items-center justify-center border border-slate-700">
                {step.icon}
              </div>
              <h3 className="text-white font-bold mb-2">{step.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="group relative inline-flex items-center justify-center px-10 py-4 font-bold text-white transition-all duration-200 bg-cyan-600 font-pj rounded-2xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600 hover:bg-cyan-500 active:scale-95 shadow-[0_0_20px_rgba(8,145,178,0.3)] opacity-0 animate-slide-up"
          style={{ animationDelay: '750ms' }}
        >
          <CircleCheck className="mr-2" size={20} />
          {t.startButton}
        </button>
      </div>
    </div>
  );
};

export default TutorialOverlay;
