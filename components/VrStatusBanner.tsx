/**
 * VR Status Banner - Explains why no keyboard has appeared yet
 * VR状態バナー - キーボードがまだ現れない理由を説明する
 *
 * The app is VR-only: the keyboard exists only inside the SteamVR overlay.
 * Launched before SteamVR - the normal way to start it from the desktop - the
 * settings window is the only thing on screen, and without this it would give
 * no hint that the app is waiting rather than broken. Hidden once the overlay
 * is running.
 * このアプリはVR専用で、キーボードは SteamVR オーバーレイの中にしか存在しない。
 * SteamVR より先に起動した場合 (デスクトップから起動する普通の手順である)、画面に
 * 出ているのは設定ウィンドウだけで、これがないとアプリが壊れているのではなく
 * 待機中であることが一切伝わらない。オーバーレイが動き出したら非表示になる。
 */

import { FC, useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import { useConfigStore } from '../stores/configStore';
import type { VrStatus } from '../types';

const VrStatusBanner: FC = () => {
  const language = useConfigStore((state) => state.config.language);
  const t = TRANSLATIONS[language].settings;
  const [status, setStatus] = useState<VrStatus>('starting');

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.getVrStatus) return;
    let active = true;

    // Subscribe before asking, so a change that lands between the two is not
    // lost. / 問い合わせより先に購読し、その間に届いた変化を取りこぼさないようにする。
    const handleChange = (next: VrStatus) => {
      if (active) setStatus(next);
    };
    api.onVrStatusChanged?.(handleChange);
    void api.getVrStatus().then((current) => {
      if (active) setStatus(current);
    });

    return () => {
      active = false;
      api.removeVrStatusChangedListener?.(handleChange);
    };
  }, []);

  if (status === 'running') return null;

  const failed = status === 'failed';
  const message =
    status === 'waiting'
      ? t.vrStatusWaiting
      : failed
        ? t.vrStatusFailed
        : t.vrStatusStarting;

  return (
    <div
      role='status'
      className={`flex items-center gap-3 px-5 py-3 text-sm border-b ${
        failed
          ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30'
          : 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/30'
      }`}
    >
      {failed ? (
        <AlertTriangle size={18} className='shrink-0' />
      ) : (
        <Loader2 size={18} className='shrink-0 animate-spin' />
      )}
      <span>{message}</span>
    </div>
  );
};

export default VrStatusBanner;
