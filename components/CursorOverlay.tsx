import { useState, useEffect, useRef } from 'react';

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
  const hoveredByControllerRef = useRef<Map<number, HTMLElement>>(new Map());
  const hoverCountRef = useRef<Map<HTMLElement, number>>(new Map());

  useEffect(() => {
    const hideTimeouts: Record<number, NodeJS.Timeout> = {};
    let dprQuery: MediaQueryList | null = null;

    const addHover = (element: HTMLElement) => {
      const hoverCount = hoverCountRef.current.get(element) ?? 0;
      if (hoverCount === 0) {
        element.classList.add('vr-hover');
      }
      hoverCountRef.current.set(element, hoverCount + 1);
    };

    const removeHover = (element: HTMLElement) => {
      const hoverCount = hoverCountRef.current.get(element);
      if (!hoverCount) return;
      if (hoverCount <= 1) {
        hoverCountRef.current.delete(element);
        element.classList.remove('vr-hover');
      } else {
        hoverCountRef.current.set(element, hoverCount - 1);
      }
    };

    const clearHoverForController = (controllerId: number) => {
      const previous = hoveredByControllerRef.current.get(controllerId);
      if (previous) {
        removeHover(previous);
        hoveredByControllerRef.current.delete(controllerId);
      }
    };

    const getHoverTarget = (u: number, v: number) => {
      if (typeof document === 'undefined') return null;
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (width <= 0 || height <= 0) return null;
      const x = Math.min(width - 1, Math.max(0, Math.round(u * (width - 1))));
      const y = Math.min(height - 1, Math.max(0, Math.round((1.0 - v) * (height - 1))));
      const element = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!element) return null;
      return element.closest('button[data-vr-key]') as HTMLElement | null;
    };

    const updateHoverForController = (controllerId: number, u: number, v: number) => {
      const target = getHoverTarget(u, v);
      const previous = hoveredByControllerRef.current.get(controllerId) ?? null;
      if (previous === target) return;
      if (previous) removeHover(previous);
      if (target) {
        addHover(target);
        hoveredByControllerRef.current.set(controllerId, target);
      } else {
        hoveredByControllerRef.current.delete(controllerId);
      }
    };
    
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
      updateHoverForController(id, u, v);

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
      clearHoverForController(id);
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
        Array.from(hoveredByControllerRef.current.keys()).forEach(clearHoverForController);
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
