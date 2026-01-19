import React, { useState } from 'react';
import { X, Save, Info } from 'lucide-react';
import { OscConfig, Language } from '../types';
import { TRANSLATIONS } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: OscConfig;
  onSave: (config: OscConfig) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, config, onSave }) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl border border-slate-600 shadow-2xl overflow-hidden">
        
        <div className="flex justify-between items-center p-6 border-b border-slate-700 bg-slate-800">
          <h2 className="text-2xl font-bold text-cyan-400">{t.title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Language Selection */}
          <div>
            <label className="block text-slate-300 mb-2 text-sm font-semibold">{t.language}</label>
            <div className="flex gap-2">
              <button 
                onClick={() => handleLanguageChange('ja')}
                className={`flex-1 py-2 px-4 rounded border transition-colors ${localConfig.language === 'ja' ? 'bg-cyan-900/50 border-cyan-500 text-cyan-300' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
              >
                日本語
              </button>
              <button 
                onClick={() => handleLanguageChange('en')}
                className={`flex-1 py-2 px-4 rounded border transition-colors ${localConfig.language === 'en' ? 'bg-cyan-900/50 border-cyan-500 text-cyan-300' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
              >
                English
              </button>
            </div>
          </div>

          {/* URL Config */}
          <div>
            <label className="block text-slate-300 mb-2 text-sm font-semibold">{t.oscUrl}</label>
            <input 
              type="text" 
              value={localConfig.bridgeUrl}
              onChange={(e) => setLocalConfig({...localConfig, bridgeUrl: e.target.value})}
              className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white focus:border-cyan-500 focus:outline-none font-mono text-sm"
              placeholder="ws://127.0.0.1:8080"
            />
            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <Info size={12} />
              {t.defaultUrl}
            </p>
          </div>

          <div className="bg-slate-800/50 rounded p-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t.instructionsTitle}</h4>
            <ul className="text-xs text-slate-500 list-disc pl-4 space-y-1">
              {t.instructions.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>

        </div>

        <div className="p-6 border-t border-slate-700 bg-slate-800 flex justify-end">
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-cyan-900/20 active:translate-y-0.5 w-full md:w-auto justify-center"
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