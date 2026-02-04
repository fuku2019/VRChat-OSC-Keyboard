import { getActiveOverlayHandle, getOverlayManager } from './overlay.js';

let inputInterval = null;
let overlayManager = null;

/**
 * Start the input handling loop
 * @param {number} fps - Input polling rate (default: 60)
 * @param {Electron.WebContents} webContents - Target webContents for input events
 */
export function startInputLoop(fps = 60, webContents = null) {
  overlayManager = getOverlayManager();
  targetWebContents = webContents;
  
  if (!overlayManager) {
    console.warn('Overlay manager not available for input handling');
    return;
  }
  
  if (inputInterval) {
    clearInterval(inputInterval);
  }
  
  const intervalMs = Math.floor(1000 / fps);
  console.log(`Starting input loop at ${fps} FPS`);
  
  inputInterval = setInterval(() => {
    updateInput();
  }, intervalMs);
}

let targetWebContents = null;

function sendMouseEvent(u, v) {
    if (targetWebContents && !targetWebContents.isDestroyed()) {
        try {
            // console.log(`Sending cursor to renderer: ${u.toFixed(2)}, ${v.toFixed(2)}`);
            targetWebContents.send('input-cursor-move', { u, v });
        } catch (e) {
            console.error('Failed to send cursor event', e);
        }
    }
}

/**
 * Stop the input handling loop
 */
export function stopInputLoop() {
  if (inputInterval) {
    clearInterval(inputInterval);
    inputInterval = null;
    console.log('Input loop stopped');
  }
}

/**
 * Update input state every frame
 */
function updateInput() {
  if (!overlayManager) return;
  
  try {
    const activeHandle = getActiveOverlayHandle();
    if (!activeHandle) return;

    // 1. Get active controllers
    const controllerIds = overlayManager.getControllerIds();
    
    // 2. Process each controller
    for (const id of controllerIds) {
      if (id === 0) continue; // Skip HMD
      
      const poseData = overlayManager.getControllerPose(id);
      
      if (!poseData || poseData.length === 0) {
        continue;
      }
      
      // Use absolute tracking pose directly with ComputeOverlayIntersection
      // ComputeOverlayIntersectionは絶対座標を受け取るため、変換不要
      processController(id, poseData, activeHandle);
    }
    
  } catch (error) {
    // Suppress errors during shutdown
    if (!error.message?.includes('destroyed')) {
      console.error('Input update error:', error);
    }
  }
}

/**
 * Process individual controller data
 * @param {number} id - Controller index
 * @param {Array<number>} poseMatrix - 4x4 transformation matrix (Absolute)
 * @param {number} overlayHandle - Current overlay handle
 */
function processController(id, poseMatrix, overlayHandle) {
  // Extract position and forward direction
  
  // Position (Tx, Ty, Tz)
  const px = poseMatrix[3];
  const py = poseMatrix[7];
  const pz = poseMatrix[11];
  
  // Forward vector (-Z axis column of rotation)
  const dirX = -poseMatrix[2];
  const dirY = -poseMatrix[6];
  const dirZ = -poseMatrix[10];
  
  try {
      // Call standard OpenVR intersection
      // Rust signature: computeOverlayIntersection(handle, source_vec, dir_vec)
      // Returns { x, y, z, u, v, distance } or null/undefined
      
      const hit = overlayManager.computeOverlayIntersection(
          overlayHandle, 
          [px, py, pz], 
          [dirX, dirY, dirZ]
      );
      
      if (hit) {
          // console.log(`Hit! Controller ${id} UV: ${hit.u.toFixed(2)}, ${hit.v.toFixed(2)}`);
          // Send mouse move event
          sendMouseEvent(hit.u, hit.v);
          
          // Check trigger button for click
          const state = overlayManager.getControllerState(id);
          handleTriggerState(id, state.triggerPressed, hit.u, hit.v);
      }
  } catch (e) {
      console.error("Intersection check failed:", e);
  }
}

// Track previous trigger state per controller
const previousTriggerState = {};

function handleTriggerState(controllerId, triggerPressed, u, v) {
    const wasPressed = previousTriggerState[controllerId] || false;
    
    if (triggerPressed && !wasPressed) {
        // Trigger just pressed - send mousedown
        sendClickEvent(u, v, 'mouseDown');
    } else if (!triggerPressed && wasPressed) {
        // Trigger just released - send mouseup
        sendClickEvent(u, v, 'mouseUp');
    }
    
    previousTriggerState[controllerId] = triggerPressed;
}

// Window size state for coordinate mapping
let windowSize = { width: 0, height: 0 };

export function updateWindowSize(width, height) {
    windowSize = { width, height };
    console.log(`Updated window size for input: ${width}x${height}`);
}

function sendClickEvent(u, v, type) {
    if (!targetWebContents || targetWebContents.isDestroyed()) return;
    
    try {
        // Convert UV (0-1) to pixel coordinates
        // Use client area size if available, otherwise fallback to window bounds
        let width, height;
        
        if (windowSize.width > 0 && windowSize.height > 0) {
            width = windowSize.width;
            height = windowSize.height;
        } else {
            const bounds = targetWebContents.getOwnerBrowserWindow().getBounds();
            width = bounds.width;
            height = bounds.height;
        }
        
        const x = Math.floor(u * width);
        const y = Math.floor((1.0 - v) * height); // Invert V to match screen coordinates
        
        console.log(`Sending ${type} at pixel (${x}, ${y}) from UV (${u.toFixed(2)}, ${v.toFixed(2)})`);
        
        targetWebContents.sendInputEvent({
            type: type,
            x: x,
            y: y,
            button: 'left',
            clickCount: 1
        });
    } catch (e) {
        console.error(`Failed to send ${type} event:`, e);
    }
}
