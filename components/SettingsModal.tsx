import React, { useState } from 'react';
import { X, Save, Info, HelpCircle } from 'lucide-react';
import { OscConfig, Language } from '../types';
import { TRANSLATIONS } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: OscConfig;
  onSave: (config: OscConfig) => void;
  onShowTutorial: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, config, onSave, onShowTutorial }) => {
  const [localConfig, setLocalConfig] = useState(config);
  
  if (!isOpen) return null;

  const t = TRANSLATIONS[config.language || 'ja'].settings;

  const handleSave = () => {
    onSave(localConfig);
    onClose();
  };

  const handleLanguageChange = (lang: Language) => {
    setLocalConfig({ ...localConfig, language: lang });
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-slate-600 shadow-2xl overflow-hidden">
        
        <div className="flex justify-between items-center p-6 border-b border-slate-700 bg-slate-800">
          <h2 className="text-2xl font-bold text-cyan-400">{t.title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Language Selection */}
          <section>
            <label className="block text-slate-300 mb-3 text-sm font-semibold uppercase tracking-wider">{t.language}</label>
            <div className="flex gap-2">
              <button 
                onClick={() => handleLanguageChange('ja')}
                className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.language === 'ja' ? 'bg-cyan-900/40 border-cyan-500 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
              >
                日本語
              </button>
              <button 
                onClick={() => handleLanguageChange('en')}
                className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.language === 'en' ? 'bg-cyan-900/40 border-cyan-500 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
              >
                English
              </button>
            </div>
          </section>

          {/* URL Config */}
          <section>
            <label className="block text-slate-300 mb-3 text-sm font-semibold uppercase tracking-wider">{t.oscUrl}</label>
            <div className="relative group">
              <input 
                type="text" 
                value={localConfig.bridgeUrl}
                onChange={(e) => setLocalConfig({...localConfig, bridgeUrl: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 focus:outline-none font-mono text-sm transition-all"
                placeholder="ws://127.0.0.1:8080"
              />
            </div>
            <p className="text-xs text-slate-500 mt-3 flex items-center gap-2 px-1">
              <Info size={14} className="text-slate-400" />
              {t.defaultUrl}
            </p>
          </section>

          {/* Tutorial Trigger */}
          <section className="pt-4 border-t border-slate-700/50">
            <button 
              onClick={onShowTutorial}
              className="w-full flex items-center justify-between p-4 bg-slate-700/30 hover:bg-slate-700/50 rounded-xl border border-slate-600/50 text-slate-300 hover:text-white transition-all group"
            >
              <div className="flex items-center gap-3">
                <HelpCircle size={20} className="text-cyan-500" />
                <span className="font-medium text-sm">{t.resetWelcome}</span>
              </div>
              <span className="text-slate-500 group-hover:translate-x-1 transition-transform">→</span>
            </button>
          </section>

        </div>

        <div className="p-6 border-t border-slate-700 bg-slate-800/50">
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-4 rounded-xl font-bold shadow-lg shadow-cyan-900/30 active:scale-95 transition-all w-full justify-center"
          >
            <Save size={20} />
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
