import { state } from './state.js';
import { endDrag, processGripDrag } from './drag.js';
import { handleTriggerInput } from './trigger.js';

export function computeHitFromPose(poseMatrix, overlayHandle) {
  try {
    if (!state.overlayManager) return null;
    // Extract position and forward direction / 位置と前方方向を抽出する
    // Position (Tx, Ty, Tz) / 位置（Tx, Ty, Tz）
    const px = poseMatrix[3];
    const py = poseMatrix[7];
    const pz = poseMatrix[11];

    // Forward vector (-Z axis column of rotation) / 前方ベクトル（回転の -Z 軸列）
    const dirX = -poseMatrix[2];
    const dirY = -poseMatrix[6];
    const dirZ = -poseMatrix[10];

    // Raycast Intersection (Click / Cursor) / レイキャストの交差判定（クリック / カーソル）
    // Call standard OpenVR intersection / 標準のOpenVR交差判定を呼び出す
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
    processGripDrag(
      controllerId,
      poseMatrix,
      overlayHandle,
      controllerState,
      hit,
    );
  } catch (e) {
    console.error('Controller processing error:', e);
    // Reset drag if error occurs / エラーが発生した場合はドラッグをリセットする
    if (controllerId === state.drag.draggingControllerId) {
      endDrag();
    }
  }
}
