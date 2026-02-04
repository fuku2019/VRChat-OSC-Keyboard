import { getActiveOverlayHandle, getOverlayManager, getAllOverlayHandles } from './overlay.js';

let inputInterval = null;
let overlayManager = null;

/**
 * Start the input handling loop
 * @param {number} fps - Input polling rate (default: 120)
 * @param {Electron.WebContents} webContents - Target webContents for input events
 */
export function startInputLoop(fps = 120, webContents = null) {
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
import { mat4 } from 'gl-matrix';

// State for grip interaction
let isDragging = false;
let draggingControllerId = null;
let startControllerInverse = mat4.create();
let startOverlayTransform = mat4.create();

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
      // 1. Raycast Intersection (Click / Cursor)
      // Call standard OpenVR intersection
      const hit = overlayManager.computeOverlayIntersection(
          overlayHandle, 
          [px, py, pz], 
          [dirX, dirY, dirZ]
      );
      
      const state = overlayManager.getControllerState(id);

      if (hit) {
          // Send mouse move event
          sendMouseEvent(hit.u, hit.v);
          
          // Check trigger button for click (only if valid hit)
          handleTriggerState(id, state.triggerPressed, hit.u, hit.v);
      }

      // 2. Grip Interaction (Move Overlay)
      // Priority: If already dragging, continue. If not, checking grip press.
      
      if (!isDragging) {
          if (state.gripPressed) {
               startDrag(id, poseMatrix, overlayHandle);
          }
      } else if (draggingControllerId === id) {
          if (state.gripPressed) {
              updateDrag(id, poseMatrix, overlayHandle);
          } else {
              endDrag();
          }
      }
      
  } catch (e) {
      console.error("Controller processing error:", e);
      // Reset drag if error occurs
      if (id === draggingControllerId) {
          endDrag();
      }
  }
}



function getOverlayWorldTransform(handle) {
    // 0 = Absolute, 1 = Relative
    const type = overlayManager.getOverlayTransformType(handle);
    // console.log(`Overlay transform type: ${type}`);
    
    // Helper for Relative Logic
    const getRelativeAsWorld = () => {
        // Relative: Compute World = Device * Relative
        const rel = overlayManager.getOverlayTransformRelative(handle);
        
        // Get Device Pose (World)
        const devicePose = overlayManager.getControllerPose(rel.trackedDeviceIndex);
        if (!devicePose || devicePose.length === 0) {
             throw new Error("Attached device pose not available");
        }
        
        const matRelative = mat4.clone(rel.transform);
        const matDevice = mat4.clone(devicePose);
        const matWorld = mat4.create();
        
        mat4.multiply(matWorld, matRelative, matDevice); // Original: Relative * Device (Wait, order?)
        // Order matter:
        // If Child = Parent * Local
        // World = Device * Relative
        // GL (Column Major): World = Relative * Device?
        // Let's re-verify GL Matrix multiplication order.
        // mat4.multiply(out, a, b) -> out = a * b
        // If we want World = Device * Relative (Standard math)
        // In Column Major: World_T = (Device * Relative)^T = Relative^T * Device^T.
        // So we pass (Relative_Transposed, Device_Transposed)
        // And we want World_Transposed.
        // out = a * b.
        // We want out = Relative_Transposed * Device_Transposed.
        // So a = Relative_Transposed, b = Device_Transposed.
        // matRelative is Relative_Transposed.
        // matDevice is Device_Transposed.
        // So multiply(out, rel, dev) is correct.
        
        mat4.multiply(matWorld, matRelative, matDevice);
        
        return Array.from(matWorld);
    };

    if (type === 0) { // Absolute
        try {
            return overlayManager.getOverlayTransformAbsolute(handle);
        } catch (e) {
            console.warn(`GetOverlayTransformAbsolute failed (Type=0), trying relative fallback. Error: ${e.message}`);
            // Fallback to relative if Absolute fails (Workaround for "InvalidParameter" error)
            return getRelativeAsWorld();
        }
    } else if (type === 1) { // Relative
        return getRelativeAsWorld();
    } else {
        throw new Error(`Unsupported overlay transform type: ${type}`);
    }
}

function startDrag(controllerId, poseMatrix, overlayHandle) {
    try {
        console.log(`Starting drag with controller ${controllerId}`);
        isDragging = true;
        draggingControllerId = controllerId;
        
        // Calculate Inverse of Start Controller Matrix (Transposed/Column-Major interpretation)
        const startMat = mat4.clone(poseMatrix);
        mat4.invert(startControllerInverse, startMat);
        
        // Get current Overlay Transform (Handling Relative case)
        const overlayTransform = getOverlayWorldTransform(overlayHandle);
        mat4.copy(startOverlayTransform, overlayTransform);
        
    } catch (e) {
        console.error("Failed to start drag:", e);
        endDrag();
    }
}

function updateDrag(controllerId, poseMatrix, overlayHandle) {
    try {
        // Current Controller Matrix (Row-Major array, treated as Transpose(Current))
        const currentMat = mat4.clone(poseMatrix);
        
        // Calculate Delta
        // We want Delta = Current * Start^-1
        // In our storage convention (Transposed):
        // Delta_gl = (Current * Start^-1)^T = (Start^-1)^T * Current^T
        // Delta_gl = startControllerInverse * currentMat
        const delta = mat4.create();
        mat4.multiply(delta, startControllerInverse, currentMat);
        
        // Calculate New Overlay
        // NewOverlay = Delta * StartOverlay (Apply delta to overlay)
        // Wait, for Rigid body attachment (grabing logic): NewOverlay * Inverse(StartOverlay) = Delta ?
        // Standard "Object follows Controller": 
        // NewOverlay = CurrentController * (StartController^-1 * StartOverlay)
        //            = (CurrentController * StartController^-1) * StartOverlay
        //            = Delta * StartOverlay
        //
        // In storage convention:
        // NewOverlay_gl = (Delta * StartOverlay)^T = StartOverlay^T * Delta^T
        // wait... Delta = Current * Start^-1
        // Delta^T = (Start^-1)^T * Current^T = startControllerInverse * currentMat (This MATCHES `delta` calculation above)
        //
        // So NewOverlay_gl = StartOverlay^T * Delta^T
        // NewOverlay_gl = startOverlayTransform * delta
        
        const newOverlay = mat4.create();
        mat4.multiply(newOverlay, startOverlayTransform, delta);
        
        // Apply to Native
        // Apply to ALL overlay handles to prevent shaking due to double buffering
        const allHandles = getAllOverlayHandles();
        if (allHandles && allHandles.length > 0) {
            allHandles.forEach(handle => {
                if (handle) {
                     overlayManager.setOverlayTransformAbsolute(handle, Array.from(newOverlay));
                }
            });
        }
        
    } catch (e) {
        console.error("Error updating drag:", e);
    }
}

function endDrag() {
    if (isDragging) {
        console.log("Ending drag");
        isDragging = false;
        draggingControllerId = null;
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
