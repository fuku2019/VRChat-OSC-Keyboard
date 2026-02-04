/**
 * Overlay Section - VR overlay related settings
 * オーバーレイセクション - VRオーバーレイ関連の設定
 */

import { FC } from 'react';
import { Info } from 'lucide-react';
import { OscConfig } from '../../types';

interface OverlaySectionProps {
  localConfig: OscConfig;
  t: {
    overlayTitle: string;
    offscreenCapture: string;
    offscreenCaptureDesc: string;
    forceOpaqueAlpha: string;
    forceOpaqueAlphaDesc: string;
  };
  onToggleOffscreenCapture: (value: boolean) => void;
  onToggleForceOpaqueAlpha: (value: boolean) => void;
}

const ToggleRow: FC<{
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
}> = ({ label, description, enabled, onToggle }) => {
  return (
    <div className='flex items-center justify-between gap-4'>
      <div className='flex-1'>
        <p className='text-sm font-semibold dark:text-slate-200 text-slate-700'>
          {label}
        </p>
        <p className='text-xs text-slate-500 mt-1 flex items-start gap-2'>
          <Info size={14} className='text-slate-400 mt-0.5 flex-shrink-0' />
          <span>{description}</span>
        </p>
      </div>
      <button
        type='button'
        onClick={() => onToggle(!enabled)}
        aria-pressed={enabled}
        className={`relative inline-flex h-8 w-14 items-center rounded-full border transition-colors ${
          enabled
            ? 'bg-primary-500/80 border-primary-500'
            : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
        }`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-7' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};

export const OverlaySection: FC<OverlaySectionProps> = ({
  localConfig,
  t,
  onToggleOffscreenCapture,
  onToggleForceOpaqueAlpha,
}) => {
  return (
    <section className='pt-4 border-t dark:border-slate-700/50 border-slate-200 space-y-5'>
      <label className='block dark:text-slate-300 text-slate-600 mb-1 text-sm font-semibold uppercase tracking-wider'>
        {t.overlayTitle}
      </label>
      <ToggleRow
        label={t.offscreenCapture}
        description={t.offscreenCaptureDesc}
        enabled={localConfig.useOffscreenCapture}
        onToggle={onToggleOffscreenCapture}
      />
      <ToggleRow
        label={t.forceOpaqueAlpha}
        description={t.forceOpaqueAlphaDesc}
        enabled={localConfig.forceOpaqueAlpha}
        onToggle={onToggleForceOpaqueAlpha}
      />
    </section>
  );
};
