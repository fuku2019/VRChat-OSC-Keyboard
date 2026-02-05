import { mat4, quat, vec3 } from 'gl-matrix';

// Configuration for "Ideal Position" / "理想的な位置"の設定
const SPAWN_OFFSET_Y = -0.3; // 30cm down
const SPAWN_OFFSET_Z = -0.5; // 50cm forward
const SPAWN_PITCH_ANGLE = -30 * (Math.PI / 180); // 30 degrees tilt up (invert to fix downward tilt)

/**
 * Calculate spawn position relative to HMD
 * HMDに対して相対的なスポーン位置を計算
 */
export function getSpawnTransform(hmdPose) {
  // Use constants defined at top / 上部で定義された定数を使用
  // const OFFSET_Y = -0.3;
  // const OFFSET_Z = -0.5;
  // const PITCH_ANGLE = 30 * (Math.PI / 180);

  // Input is Row-Major (OpenVR), gl-matrix needs Column-Major
  // Treat input array as flattened Row-Major 4x4
  const hmdMatRow = mat4.clone(hmdPose);
  const hmdMat = mat4.create();
  mat4.transpose(hmdMat, hmdMatRow); // Row-Major -> Column-Major

  // Check if valid rotation (sometimes it's all zeros)
  // 0,0,0,0 quaternion is invalid
  const hmdRot = quat.create();
  mat4.getRotation(hmdRot, hmdMat);
  if (
    hmdRot[0] === 0 &&
    hmdRot[1] === 0 &&
    hmdRot[2] === 0 &&
    hmdRot[3] === 0
  ) {
    throw new Error('Invalid HMD rotation');
  }

  // 1. Calculate position
  const hmdPos = vec3.create();
  mat4.getTranslation(hmdPos, hmdMat);

  // Create offset vector (in HMD local space)
  // HMDローカル空間でのオフセットベクトルを作成
  // Create offset vector (in HMD local space)
  // HMDローカル空間でのオフセットベクトルを作成
  const offset = vec3.fromValues(0, SPAWN_OFFSET_Y, SPAWN_OFFSET_Z);

  // Rotate offset by HMD rotation to get World offset
  // HMDの回転でオフセットを回転させ、ワールドオフセットを取得
  vec3.transformQuat(offset, offset, hmdRot);

  // Add to HMD position to get Target World Position
  // HMD位置に加算してターゲットワールド位置を取得
  const targetPos = vec3.create();
  vec3.add(targetPos, hmdPos, offset);

  // 2. Calculate Rotation (Yaw-only from HMD, keep overlay horizontal)
  // Extract HMD forward (+Z) and project onto XZ plane (invert if facing is reversed)
  const hmdForward = vec3.fromValues(0, 0, 1);
  vec3.transformQuat(hmdForward, hmdForward, hmdRot);
  hmdForward[1] = 0;
  if (vec3.length(hmdForward) < 1e-5) {
    vec3.set(hmdForward, 0, 0, -1);
  } else {
    vec3.normalize(hmdForward, hmdForward);
  }

  const worldUp = vec3.fromValues(0, 1, 0);
  const right = vec3.create();
  vec3.cross(right, worldUp, hmdForward);
  if (vec3.length(right) < 1e-5) {
    vec3.set(right, 1, 0, 0);
  } else {
    vec3.normalize(right, right);
  }

  const trueUp = vec3.create();
  vec3.cross(trueUp, hmdForward, right);
  vec3.normalize(trueUp, trueUp);

  // Build yaw-only rotation matrix (column-major)
  const yawMat = mat4.fromValues(
    right[0],
    right[1],
    right[2],
    0,
    trueUp[0],
    trueUp[1],
    trueUp[2],
    0,
    hmdForward[0],
    hmdForward[1],
    hmdForward[2],
    0,
    0,
    0,
    0,
    1,
  );

  const targetRot = quat.create();
  mat4.getRotation(targetRot, yawMat);

  // Local X axis rotation for Tilt (optional)
  if (SPAWN_PITCH_ANGLE !== 0) {
    const tilt = quat.create();
    quat.setAxisAngle(tilt, vec3.fromValues(1, 0, 0), SPAWN_PITCH_ANGLE);
    quat.multiply(targetRot, targetRot, tilt);
  }

  // 3. Compose Matrix (Column-Major)
  const targetMatCol = mat4.create();
  mat4.fromRotationTranslation(targetMatCol, targetRot, targetPos);

  // 4. Convert back to Row-Major for OpenVR
  const targetMatRow = mat4.create();
  mat4.transpose(targetMatRow, targetMatCol); // Column-Major -> Row-Major

  return targetMatRow;
}

export function computeBackTransform(frontMatRow) {
  const frontCol = mat4.create();
  mat4.transpose(frontCol, frontMatRow);

  const backCol = mat4.create();
  mat4.rotateY(backCol, frontCol, Math.PI);

  const backRow = mat4.create();
  mat4.transpose(backRow, backCol);
  return backRow;
}
