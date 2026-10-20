import { useEffect, useState } from 'react';
import type { ImeEngineStatus } from '../types/ime';

/** Read-only status polling also works in the separate settings renderer. */
export const useImeEngineStatus = () => {
  const [status, setStatus] = useState<ImeEngineStatus>({ state: 'starting' });
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      let next: ImeEngineStatus;
      try {
        next = window.electronAPI?.imeGetStatus
          ? await window.electronAPI.imeGetStatus()
          : { state: 'ready', engine: 'kana', reason: 'browser-preview' };
      } catch {
        next = { state: 'unavailable', engine: 'kana' };
      }
      if (disposed) return;
      setStatus(previous => previous.state === next.state && previous.engine === next.engine
        && previous.reason === next.reason ? previous : next);
      if (window.electronAPI?.imeGetStatus) timer = setTimeout(() => { void read(); }, 1000);
    };
    void read();
    return () => { disposed = true; clearTimeout(timer); };
  }, []);
  return status;
};
