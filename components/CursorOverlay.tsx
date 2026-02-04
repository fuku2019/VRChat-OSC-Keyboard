import { useState, useEffect } from 'react';

// Extend Window interface for electronAPI
declare global {
  interface Window {
    electronAPI?: {
      onCursorMove: (callback: (data: { u: number; v: number; controllerId?: number }) => void) => void;
      onCursorHide?: (callback: (data: { controllerId?: number }) => void) => void;
      removeCursorHideListener?: (callback: (data: { controllerId?: number }) => void) => void;
      sendWindowSize?: (width: number, height: number) => void;
      sendRendererMetrics?: (metrics: { width: number; height: number; devicePixelRatio: number }) => void;
    };
  }
}

const CursorOverlay = () => {
  const [cursors, setCursors] = useState<Record<number, { u: number; v: number; visible: boolean }>>({});

  useEffect(() => {
    const hideTimeouts: Record<number, NodeJS.Timeout> = {};
    let dprQuery: MediaQueryList | null = null;
    
    const handleCursorMove = ({ u, v, controllerId }: { u: number; v: number; controllerId?: number }) => {
      // OpenVR UV: (0,0) is bottom-left, screen (0,0) is top-left
      // Flip V for screen coordinates
      // console.log('Renderer received cursor:', u.toFixed(2), v.toFixed(2));

      const id = Number.isFinite(controllerId) ? Number(controllerId) : 0;
      const flippedV = 1.0 - v;

      setCursors((prev) => ({
        ...prev,
        [id]: { u, v: flippedV, visible: true },
      }));

      // Hide cursor if no movement for a short time
      if (hideTimeouts[id]) {
        clearTimeout(hideTimeouts[id]);
      }
      hideTimeouts[id] = setTimeout(() => {
        setCursors((prev) => {
          const current = prev[id];
          if (!current) return prev;
          return {
            ...prev,
            [id]: { ...current, visible: false },
          };
        });
      }, 200);
    };

    if (window.electronAPI?.onCursorMove) {
        window.electronAPI.onCursorMove(handleCursorMove);
    }

    const handleCursorHide = ({ controllerId }: { controllerId?: number }) => {
      const id = Number.isFinite(controllerId) ? Number(controllerId) : 0;
      if (hideTimeouts[id]) {
        clearTimeout(hideTimeouts[id]);
      }
      setCursors((prev) => {
        const current = prev[id];
        if (!current) return prev;
        return {
          ...prev,
          [id]: { ...current, visible: false },
        };
      });
    };

    if (window.electronAPI?.onCursorHide) {
      window.electronAPI.onCursorHide(handleCursorHide);
    }
    
    const sendMetrics = () => {
        const metrics = {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio,
        };
        if (window.electronAPI?.sendRendererMetrics) {
            window.electronAPI.sendRendererMetrics(metrics);
        } else if (window.electronAPI?.sendWindowSize) {
            window.electronAPI.sendWindowSize(metrics.width, metrics.height);
        }
    };
    
    const setupDprListener = () => {
        if (dprQuery) {
            dprQuery.removeEventListener('change', handleDprChange);
        }
        dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        dprQuery.addEventListener('change', handleDprChange);
    };
    
    const handleDprChange = () => {
        sendMetrics();
        setupDprListener();
    };
    
    // Send initial metrics
    sendMetrics();
    setupDprListener();
    
    // Handle resize
    const handleResize = () => {
        sendMetrics();
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        if (dprQuery) {
            dprQuery.removeEventListener('change', handleDprChange);
        }
        if (window.electronAPI?.removeCursorHideListener) {
          window.electronAPI.removeCursorHideListener(handleCursorHide);
        }
        Object.values(hideTimeouts).forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, []);

  const visibleCursors = Object.entries(cursors).filter(([, cursor]) => cursor.visible);
  if (visibleCursors.length === 0) return null;

  return (
    <>
      {visibleCursors.map(([id, cursor]) => (
        <div
          key={id}
          style={{
            position: 'fixed',
            top: `${cursor.v * 100}%`,
            left: `${cursor.u * 100}%`,
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            backgroundColor: 'rgb(var(--rgb-primary-500))',
            border: '2px solid rgb(var(--rgb-primary-500))',
            boxShadow: '0 0 10px rgba(var(--rgb-primary-500), 0.5)',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 9999,
            // transition: 'top 0.05s linear, left 0.05s linear' // Removed for better responsiveness / 応答性向上のため削除
          }}
        />
      ))}
    </>
  );
};

export default CursorOverlay;
