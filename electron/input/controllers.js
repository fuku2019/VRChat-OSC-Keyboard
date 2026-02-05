import { state } from './state.js';
import { endDrag, processGripDrag } from './drag.js';
import { handleTriggerInput } from './trigger.js';

export function computeHitFromPose(poseMatrix, overlayHandle) {
  try {
    if (!state.overlayManager) return null;
    // Extract position and forward direction
    // Position (Tx, Ty, Tz)
    const px = poseMatrix[3];
    const py = poseMatrix[7];
    const pz = poseMatrix[11];

    // Forward vector (-Z axis column of rotation)
    const dirX = -poseMatrix[2];
    const dirY = -poseMatrix[6];
    const dirZ = -poseMatrix[10];

    // Raycast Intersection (Click / Cursor)
    // Call standard OpenVR intersection
    return state.overlayManager.computeOverlayIntersection(
      overlayHandle,
      [px, py, pz],
      [dirX, dirY, dirZ],
    );
  } catch (e) {
    console.error('Controller hit test error:', e);
    return null;
  }
}

export function processController(
  controllerId,
  poseMatrix,
  overlayHandle,
  controllerState,
  hit,
) {
  try {
    handleTriggerInput(controllerId, controllerState, hit);
    processGripDrag(controllerId, poseMatrix, overlayHandle, controllerState, hit);
  } catch (e) {
    console.error('Controller processing error:', e);
    // Reset drag if error occurs
    if (controllerId === state.drag.draggingControllerId) {
      endDrag();
    }
  }
}
