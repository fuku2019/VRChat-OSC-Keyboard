import { addCaptureFrameListener, getActiveOverlayHandle, getOverlayManager } from './overlay.js';

let inputInterval = null;
let overlayManager = null;
let captureSyncUnsubscribe = null;
let inputInProgress = false;
let inputFallbackInterval = null;
let lastCaptureFrameAt = 0;
const TRIGGER_DRAG_THRESHOLD = 0.015;
const TRIGGER_SCROLL_MULTIPLIER = 0.9;
const TRIGGER_SCROLL_MAX = 180;

/**
 * Start the input handling loop
 * @param {number} fps - Input polling rate (default: 120)
 * @param {Electron.WebContents} webContents - Target webContents for input events
 */
export function startInputLoop(fps = 120, webContents = null, options = {}) {
  overlayManager = getOverlayManager();
  targetWebContents = webContents;
  
  if (!overlayManager) {
    console.warn('Overlay manager not available for input handling');
    return;
  }
  
  stopInputLoop();

  const syncWithCapture = options.syncWithCapture !== false;
  if (syncWithCapture && typeof addCaptureFrameListener === 'function') {
    captureSyncUnsubscribe = addCaptureFrameListener(() => {
      lastCaptureFrameAt = Date.now();
      if (inputInProgress) return;
      inputInProgress = true;
      try {
        updateInput();
      } finally {
        inputInProgress = false;
      }
    });
    console.log('Input loop synced to capture frames');

    const fallbackFps = Number.isFinite(options.fallbackFps)
      ? Math.max(1, options.fallbackFps)
      : Math.max(1, Math.min(30, fps));
    const fallbackIntervalMs = Math.floor(1000 / fallbackFps);
    lastCaptureFrameAt = Date.now();
    inputFallbackInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastCaptureFrameAt < fallbackIntervalMs * 2) {
        return;
      }
      if (inputInProgress) return;
      inputInProgress = true;
      try {
        updateInput();
      } finally {
        inputInProgress = false;
      }
    }, fallbackIntervalMs);

    return;
  }

  const intervalMs = Math.floor(1000 / fps);
  console.log(`Starting input loop at ${fps} FPS`);
  
  inputInterval = setInterval(() => {
    if (inputInProgress) return;
    inputInProgress = true;
    try {
      updateInput();
    } finally {
      inputInProgress = false;
    }
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

function sendScrollEvent(deltaY) {
    if (targetWebContents && !targetWebContents.isDestroyed()) {
        try {
            targetWebContents.send('input-scroll', { deltaY });
        } catch (e) {
            console.error('Failed to send scroll event', e);
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
  }
  if (inputFallbackInterval) {
    clearInterval(inputFallbackInterval);
    inputFallbackInterval = null;
  }
  if (captureSyncUnsubscribe) {
    captureSyncUnsubscribe();
    captureSyncUnsubscribe = null;
  }
  inputInProgress = false;
  lastCaptureFrameAt = 0;
  console.log('Input loop stopped');
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
      
      const state = overlayManager.getControllerState(id);
      if (!state) {
          continue;
      }
      // Use absolute tracking pose directly with ComputeOverlayIntersection
      // ComputeOverlayIntersectionは絶対座標を受け取るため、変換不要
      processController(id, poseData, activeHandle, state);
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
 * @param {object} state - Controller state
 */
import { mat4 } from 'gl-matrix';

// State for grip interaction
let isDragging = false;
let draggingControllerId = null;
let startControllerInverse = mat4.create();
let startOverlayTransform = mat4.create();

function processController(id, poseMatrix, overlayHandle, state) {
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

      handleTriggerInput(id, state, hit);
      
      if (hit) {
          // Send mouse move event
          sendMouseEvent(hit.u, hit.v);
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
        
        // Apply to Native / ネイティブに適用
        overlayManager.setOverlayTransformAbsolute(overlayHandle, Array.from(newOverlay));
        
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

const triggerDragState = {};

function handleTriggerInput(controllerId, state, hit) {
    if (!state) return;
    const pressed = !!state.triggerPressed;
    const existing = triggerDragState[controllerId];

    if (pressed) {
        if (!existing) {
            if (!hit) return;
            triggerDragState[controllerId] = {
                startU: hit.u,
                startV: hit.v,
                lastU: hit.u,
                lastV: hit.v,
                dragging: false,
            };
            return;
        }

        if (!hit) return;
        const totalV = hit.v - existing.startV;
        const deltaV = hit.v - existing.lastV;
        if (!existing.dragging && Math.abs(totalV) > TRIGGER_DRAG_THRESHOLD) {
            existing.dragging = true;
        }
        if (existing.dragging) {
            const height = windowSize.height > 0 ? windowSize.height : 700;
            const rawDelta = deltaV * height * TRIGGER_SCROLL_MULTIPLIER;
            const clamped = Math.max(-TRIGGER_SCROLL_MAX, Math.min(TRIGGER_SCROLL_MAX, rawDelta));
            if (clamped !== 0) {
                sendScrollEvent(clamped);
            }
        }
        existing.lastU = hit.u;
        existing.lastV = hit.v;
        return;
    }

    if (existing) {
        if (!existing.dragging) {
            sendClickEvent(existing.startU, existing.startV, 'mouseDown');
            sendClickEvent(existing.startU, existing.startV, 'mouseUp');
        }
        delete triggerDragState[controllerId];
    }
}

// Window size state for coordinate mapping
let windowSize = { width: 0, height: 0 };
let windowScale = { devicePixelRatio: 1, zoomFactor: 1 };

export function updateWindowSize(width, height, devicePixelRatio = null, zoomFactor = null) {
    windowSize = { width, height };
    if (Number.isFinite(devicePixelRatio) && devicePixelRatio > 0) {
        windowScale.devicePixelRatio = devicePixelRatio;
    }
    if (Number.isFinite(zoomFactor) && zoomFactor > 0) {
        windowScale.zoomFactor = zoomFactor;
    }
    console.log(
        `Updated window size for input: ${width}x${height} (dpr=${windowScale.devicePixelRatio}, zoom=${windowScale.zoomFactor})`,
    );
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
