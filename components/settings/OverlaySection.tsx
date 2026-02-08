/**
 * Overlay Section - VR overlay related settings
 * オーバーレイセクション - VRオーバーレイ関連の設定
 */

import { FC, useCallback, useEffect, useRef, useState } from 'react';
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
    disableOverlay: string;
    disableOverlayDesc: string;
    steamVrBindingsTitle: string;
    steamVrBindingsEmpty: string;
    steamVrBindingsUnavailable: string;
    steamVrBindingsRefresh: string;
    openSteamVrBindingUi: string;
    steamVrBindingsMissingActions: string;
  };
  onToggleOffscreenCapture: (value: boolean) => void;
  onToggleForceOpaqueAlpha: (value: boolean) => void;
  onToggleDisableOverlay: (value: boolean) => void;
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
  onToggleDisableOverlay,
}) => {
  const [toggleBindings, setToggleBindings] = useState<string[]>([]);
  const [triggerBindings, setTriggerBindings] = useState<string[]>([]);
  const [gripBindings, setGripBindings] = useState<string[]>([]);
  const [initialized, setInitialized] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [triggerBound, setTriggerBound] = useState<boolean>(false);
  const [gripBound, setGripBound] = useState<boolean>(false);
  const delayedRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBindings = useCallback(async () => {
    if (!window.electronAPI?.getSteamVrBindings) {
      setInitialized(false);
      setToggleBindings([]);
      setTriggerBindings([]);
      setGripBindings([]);
      setTriggerBound(false);
      setGripBound(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.getSteamVrBindings();
      if (!result?.success || !result.bindings) {
        setInitialized(false);
        setToggleBindings([]);
        setTriggerBindings([]);
        setGripBindings([]);
        setTriggerBound(false);
        setGripBound(false);
        setError(result?.error || t.steamVrBindingsUnavailable);
        return;
      }
      setInitialized(Boolean(result.bindings.initialized));
      setToggleBindings(result.bindings.toggleOverlay || []);
      setTriggerBindings(result.bindings.triggerBindings || []);
      setGripBindings(result.bindings.gripBindings || []);
      setTriggerBound(Boolean(result.bindings.triggerBound));
      setGripBound(Boolean(result.bindings.gripBound));
    } catch (e) {
      setInitialized(false);
      setToggleBindings([]);
      setTriggerBindings([]);
      setGripBindings([]);
      setTriggerBound(false);
      setGripBound(false);
      setError((e as Error)?.message || t.steamVrBindingsUnavailable);
    } finally {
      setLoading(false);
    }
  }, [t.steamVrBindingsUnavailable]);

  useEffect(() => {
    void loadBindings();
  }, [loadBindings]);

  useEffect(() => {
    return () => {
      if (delayedRefreshTimerRef.current) {
        clearTimeout(delayedRefreshTimerRef.current);
        delayedRefreshTimerRef.current = null;
      }
    };
  }, []);

  const handleOpenBindingUi = async () => {
    if (!window.electronAPI?.openSteamVrBindingUi) return;
    setError('');
    try {
      const result = await window.electronAPI.openSteamVrBindingUi();
      if (!result?.success) {
        setError(result?.error || t.steamVrBindingsUnavailable);
        return;
      }
      await loadBindings();
      if (delayedRefreshTimerRef.current) {
        clearTimeout(delayedRefreshTimerRef.current);
      }
      delayedRefreshTimerRef.current = setTimeout(() => {
        delayedRefreshTimerRef.current = null;
        void loadBindings();
      }, 1500);
    } catch (e) {
      setError((e as Error)?.message || t.steamVrBindingsUnavailable);
    }
  };

  const formatBindings = (entries: string[]) => {
    if (!entries || entries.length === 0) {
      return t.steamVrBindingsEmpty;
    }
    return entries.join(', ');
  };

  return (
    <section className='pt-4 border-t dark:border-slate-700/50 border-slate-200 space-y-5'>
      <label className='block dark:text-slate-300 text-slate-600 mb-1 text-sm font-semibold uppercase tracking-wider'>
        {t.overlayTitle}
      </label>
      <ToggleRow
        label={t.disableOverlay}
        description={t.disableOverlayDesc}
        enabled={localConfig.disableOverlay}
        onToggle={onToggleDisableOverlay}
      />
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

      <div className='rounded-xl border dark:border-slate-600/60 border-slate-200 p-4 space-y-3 dark:bg-slate-700/20 bg-slate-50'>
        <p className='text-sm font-semibold dark:text-slate-200 text-slate-700'>
          {t.steamVrBindingsTitle}
        </p>
        <div className='text-xs text-slate-500 min-h-5'>
          {loading ? (
            <span>Loading...</span>
          ) : !initialized ? (
            <span>{error || t.steamVrBindingsUnavailable}</span>
          ) : (
            <div className='space-y-1'>
              <p>
                <span className='font-semibold'>Toggle:</span>{' '}
                {formatBindings(toggleBindings)}
              </p>
              <p>
                <span className='font-semibold'>Trigger:</span>{' '}
                {formatBindings(triggerBindings)}
              </p>
              <p>
                <span className='font-semibold'>Grip:</span>{' '}
                {formatBindings(gripBindings)}
              </p>
            </div>
          )}
        </div>

        {error && initialized && (
          <p className='text-xs text-red-400'>{error}</p>
        )}
        {initialized && (!triggerBound || !gripBound) && (
          <p className='text-xs text-amber-400'>
            {t.steamVrBindingsMissingActions}
          </p>
        )}

        <div className='flex flex-wrap gap-2'>
          <button
            type='button'
            onClick={() => void loadBindings()}
            className='px-3 py-2 rounded-lg text-xs font-semibold border dark:border-slate-500 border-slate-300 dark:text-slate-200 text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600/60 transition-colors'
          >
            {t.steamVrBindingsRefresh}
          </button>
          <button
            type='button'
            onClick={() => void handleOpenBindingUi()}
            className='px-3 py-2 rounded-lg text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-[rgb(var(--rgb-on-primary))] transition-colors'
          >
            {t.openSteamVrBindingUi}
          </button>
        </div>
      </div>
    </section>
  );
};
