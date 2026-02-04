import { useState, useEffect } from 'react';

// Extend Window interface for electronAPI
declare global {
  interface Window {
    electronAPI?: {
      onCursorMove: (callback: (data: { u: number, v: number }) => void) => void;
      sendWindowSize?: (width: number, height: number) => void;
    };
  }
}

const CursorOverlay = () => {
  const [position, setPosition] = useState<{u: number, v: number} | null>(null);
  const [visible, setVisible] = useState(false);
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const handleCursorMove = ({ u, v }: { u: number, v: number }) => {
      // OpenVR UV: (0,0) is bottom-left, screen (0,0) is top-left
      // Flip V for screen coordinates
      // console.log('Renderer received cursor:', u.toFixed(2), v.toFixed(2));
      
      setPosition({ u, v: 1.0 - v }); // Flip V
      setVisible(true);
      
      // Hide cursor if no movement for 1 second
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setVisible(false);
      }, 1000);
    };

    if (window.electronAPI?.onCursorMove) {
        window.electronAPI.onCursorMove(handleCursorMove);
    }
    
    // Send initial window size
    if (window.electronAPI?.sendWindowSize) {
        window.electronAPI.sendWindowSize(window.innerWidth, window.innerHeight);
    }
    
    // Handle resize
    const handleResize = () => {
        if (window.electronAPI?.sendWindowSize) {
            window.electronAPI.sendWindowSize(window.innerWidth, window.innerHeight);
        }
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        clearTimeout(timeoutId);
    };
  }, []);

  if (!visible || !position) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: `${position.v * 100}%`,
        left: `${position.u * 100}%`,
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        backgroundColor: 'rgba(255, 0, 0, 0.8)',
        border: '2px solid white',
        boxShadow: '0 0 10px rgba(255, 0, 0, 0.5)',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 9999,
        // transition: 'top 0.05s linear, left 0.05s linear' // Removed for better responsiveness / 応答性向上のため削除
      }}
    />
  );
};

export default CursorOverlay;
