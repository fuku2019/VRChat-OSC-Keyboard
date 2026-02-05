import { mat4, vec3 } from 'gl-matrix';
import { setOverlayTransformAbsoluteAll } from '../overlay.js';
import { state } from './state.js';

function getOverlayWorldTransform(handle) {
  if (!state.overlayManager) {
    throw new Error('Overlay manager not available');
  }
  // 0 = Absolute, 1 = Relative
  const type = state.overlayManager.getOverlayTransformType(handle);
  // console.log(`Overlay transform type: ${type}`);

  // Helper for Relative Logic
  const getRelativeAsWorld = () => {
    // Relative: Compute World = Device * Relative
    const rel = state.overlayManager.getOverlayTransformRelative(handle);

    // Get Device Pose (World)
    const devicePose = state.overlayManager.getControllerPose(
      rel.trackedDeviceIndex,
    );
    if (!devicePose || devicePose.length === 0) {
      throw new Error('Attached device pose not available');
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

  if (type === 0) {
    // Absolute
    try {
      return state.overlayManager.getOverlayTransformAbsolute(handle);
    } catch (e) {
      console.warn(
        `GetOverlayTransformAbsolute failed (Type=0), trying relative fallback. Error: ${e.message}`,
      );
      // Fallback to relative if Absolute fails (Workaround for "InvalidParameter" error)
      return getRelativeAsWorld();
    }
  }
  if (type === 1) {
    // Relative
    return getRelativeAsWorld();
  }
  throw new Error(`Unsupported overlay transform type: ${type}`);
}

export function startDrag(controllerId, poseMatrix, overlayHandle) {
  try {
    console.log(`Starting drag with controller ${controllerId}`);
    state.drag.isDragging = true;
    state.drag.draggingControllerId = controllerId;

    // Calculate Inverse of Start Controller Matrix (Transposed/Column-Major interpretation)
    const startMat = mat4.clone(poseMatrix);
    mat4.invert(state.drag.startControllerInverse, startMat);

    // Get current Overlay Transform (Handling Relative case)
    const overlayTransform = getOverlayWorldTransform(overlayHandle);
    mat4.copy(state.drag.startOverlayTransform, overlayTransform);
  } catch (e) {
    console.error('Failed to start drag:', e);
    endDrag();
  }
}

export function updateDrag(controllerId, poseMatrix, overlayHandle) {
  try {
    // Current Controller Matrix (Row-Major array, treated as Transpose(Current))
    const currentMat = mat4.clone(poseMatrix);

    // Calculate Delta
    // We want Delta = Current * Start^-1
    // In our storage convention (Transposed):
    // Delta_gl = (Current * Start^-1)^T = (Start^-1)^T * Current^T
    // Delta_gl = startControllerInverse * currentMat
    const delta = mat4.create();
    mat4.multiply(delta, state.drag.startControllerInverse, currentMat);

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
    mat4.multiply(newOverlay, state.drag.startOverlayTransform, delta);

    // While dragging, face the overlay toward the HMD
    orientOverlayTowardHmd(newOverlay);

    // Apply to Native / ネイティブに適用
    setOverlayTransformAbsoluteAll(newOverlay);
  } catch (e) {
    console.error('Error updating drag:', e);
  }
}

export function endDrag() {
  if (state.drag.isDragging) {
    console.log('Ending drag');
    state.drag.isDragging = false;
    state.drag.draggingControllerId = null;
  }
}

export function processGripDrag(
  controllerId,
  poseMatrix,
  overlayHandle,
  controllerState,
) {
  // 2. Grip Interaction (Move Overlay)
  // Priority: If already dragging, continue. If not, checking grip press.
  if (!state.drag.isDragging) {
    if (controllerState.gripPressed) {
      startDrag(controllerId, poseMatrix, overlayHandle);
    }
  } else if (state.drag.draggingControllerId === controllerId) {
    if (controllerState.gripPressed) {
      updateDrag(controllerId, poseMatrix, overlayHandle);
    } else {
      endDrag();
    }
  }
}

function orientOverlayTowardHmd(overlayMat) {
  if (!state.overlayManager) return false;
  const hmdPose = state.overlayManager.getControllerPose(0);
  if (!hmdPose || hmdPose.length === 0) return false;

  // Row-major translation
  const overlayPos = vec3.fromValues(
    overlayMat[3],
    overlayMat[7],
    overlayMat[11],
  );
  const hmdPos = vec3.fromValues(hmdPose[3], hmdPose[7], hmdPose[11]);

  const toHmd = vec3.create();
  vec3.subtract(toHmd, hmdPos, overlayPos);
  const distance = vec3.length(toHmd);
  if (!Number.isFinite(distance) || distance < 1e-5) return false;
  vec3.scale(toHmd, toHmd, 1 / distance);

  // OpenVR forward uses -Z axis, so set forward column toward HMD direction
  const forward = vec3.create();
  vec3.scale(forward, toHmd, 1);

  let up = vec3.fromValues(0, 1, 0);
  if (Math.abs(vec3.dot(forward, up)) > 0.95) {
    up = vec3.fromValues(0, 0, 1);
  }

  const right = vec3.create();
  vec3.cross(right, up, forward);
  if (vec3.length(right) < 1e-5) return false;
  vec3.normalize(right, right);

  const trueUp = vec3.create();
  vec3.cross(trueUp, forward, right);
  vec3.normalize(trueUp, trueUp);

  // Set rotation columns (row-major: columns are basis vectors)
  overlayMat[0] = right[0];
  overlayMat[4] = right[1];
  overlayMat[8] = right[2];

  overlayMat[1] = trueUp[0];
  overlayMat[5] = trueUp[1];
  overlayMat[9] = trueUp[2];

  overlayMat[2] = forward[0];
  overlayMat[6] = forward[1];
  overlayMat[10] = forward[2];
  return true;
}
