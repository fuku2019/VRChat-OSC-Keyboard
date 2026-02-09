use napi_derive::napi;
use openvr_sys as vr;

use super::constants::HMD_DEVICE_INDEX;
use super::errors::{overlay_error, require_fn};
use super::handles::overlay_handle;
use super::manager::OverlayManager;
use super::math::validate_matrix;
use super::types::OverlayRelativeTransform;

#[napi]
impl OverlayManager {
    #[napi]
    pub fn set_overlay_transform_hmd(&self, handle: i64, distance: f64) -> napi::Result<()> {
        let overlay = self.overlay();
        let set_transform_fn = require_fn(
            overlay.SetOverlayTransformTrackedDeviceRelative,
            "SetOverlayTransformTrackedDeviceRelative",
        )?;
        let handle = overlay_handle(handle)?;
        unsafe {
            // Create transform matrix: position overlay `distance` meters in front of HMD
            // 変換行列を作成: HMDの前方`distance`メートルにオーバーレイを配置
            let mut transform = vr::HmdMatrix34_t {
                m: [
                    [1.0, 0.0, 0.0, 0.0], // X axis
                    [0.0, 1.0, 0.0, 0.0], // Y axis
                    [0.0, 0.0, 1.0, -(distance as f32)], // Z axis (negative = in front)
                ],
            };

            // k_unTrackedDeviceIndex_Hmd = 0 (HMD device index)
            let err = set_transform_fn(handle.as_u64(), HMD_DEVICE_INDEX, &mut transform);
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(overlay_error(
                    "SetOverlayTransformTrackedDeviceRelative",
                    overlay,
                    err,
                ));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn get_overlay_transform_absolute(&self, handle: i64) -> napi::Result<Vec<f64>> {
        let overlay = self.overlay();
        let get_transform_fn =
            require_fn(overlay.GetOverlayTransformAbsolute, "GetOverlayTransformAbsolute")?;
        let handle = overlay_handle(handle)?;
        unsafe {
            let mut origin = vr::ETrackingUniverseOrigin_TrackingUniverseStanding;
            let mut transform = vr::HmdMatrix34_t { m: [[0.0; 4]; 3] };

            let err = get_transform_fn(handle.as_u64(), &mut origin, &mut transform);

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(overlay_error("GetOverlayTransformAbsolute", overlay, err));
            }

            // Convert 3x4 to 4x4 flattened (Row-Major for JS)
            let m = transform.m;
            let matrix = vec![
                m[0][0] as f64,
                m[0][1] as f64,
                m[0][2] as f64,
                m[0][3] as f64,
                m[1][0] as f64,
                m[1][1] as f64,
                m[1][2] as f64,
                m[1][3] as f64,
                m[2][0] as f64,
                m[2][1] as f64,
                m[2][2] as f64,
                m[2][3] as f64,
                0.0,
                0.0,
                0.0,
                1.0,
            ];

            Ok(matrix)
        }
    }

    #[napi]
    pub fn set_overlay_transform_absolute(
        &self,
        handle: i64,
        matrix: Vec<f64>,
    ) -> napi::Result<()> {
        validate_matrix(&matrix, "transform matrix")?;

        let overlay = self.overlay();
        let set_transform_fn =
            require_fn(overlay.SetOverlayTransformAbsolute, "SetOverlayTransformAbsolute")?;
        let handle = overlay_handle(handle)?;
        unsafe {
            let mut transform = vr::HmdMatrix34_t {
                m: [
                    [
                        matrix[0] as f32,
                        matrix[1] as f32,
                        matrix[2] as f32,
                        matrix[3] as f32,
                    ],
                    [
                        matrix[4] as f32,
                        matrix[5] as f32,
                        matrix[6] as f32,
                        matrix[7] as f32,
                    ],
                    [
                        matrix[8] as f32,
                        matrix[9] as f32,
                        matrix[10] as f32,
                        matrix[11] as f32,
                    ],
                ],
            };

            // Calculate inverse to correct OpenVR's expectation?
            // Actually SetOverlayTransformAbsolute takes the transform from TrackingOrigin to Overlay.
            // If the matrix provided is the world transform of the overlay, it should be correct directly.

            let err = set_transform_fn(
                handle.as_u64(),
                vr::ETrackingUniverseOrigin_TrackingUniverseStanding,
                &mut transform,
            );

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(overlay_error("SetOverlayTransformAbsolute", overlay, err));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn get_overlay_transform_type(&self, handle: i64) -> napi::Result<u32> {
        let overlay = self.overlay();
        let get_transform_type_fn =
            require_fn(overlay.GetOverlayTransformType, "GetOverlayTransformType")?;
        let handle = overlay_handle(handle)?;
        unsafe {
            let mut transform_type = vr::VROverlayTransformType_VROverlayTransform_Absolute;
            let err = get_transform_type_fn(handle.as_u64(), &mut transform_type);

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(overlay_error("GetOverlayTransformType", overlay, err));
            }

            Ok(transform_type as u32)
        }
    }

    #[napi]
    pub fn get_overlay_transform_relative(
        &self,
        handle: i64,
    ) -> napi::Result<OverlayRelativeTransform> {
        let overlay = self.overlay();
        let get_transform_fn = require_fn(
            overlay.GetOverlayTransformTrackedDeviceRelative,
            "GetOverlayTransformTrackedDeviceRelative",
        )?;
        let handle = overlay_handle(handle)?;
        unsafe {
            let mut device_index = 0;
            let mut transform = vr::HmdMatrix34_t { m: [[0.0; 4]; 3] };

            let err = get_transform_fn(handle.as_u64(), &mut device_index, &mut transform);

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(overlay_error(
                    "GetOverlayTransformTrackedDeviceRelative",
                    overlay,
                    err,
                ));
            }

            let m = transform.m;
            let matrix = vec![
                m[0][0] as f64,
                m[0][1] as f64,
                m[0][2] as f64,
                m[0][3] as f64,
                m[1][0] as f64,
                m[1][1] as f64,
                m[1][2] as f64,
                m[1][3] as f64,
                m[2][0] as f64,
                m[2][1] as f64,
                m[2][2] as f64,
                m[2][3] as f64,
                0.0,
                0.0,
                0.0,
                1.0,
            ];

            Ok(OverlayRelativeTransform {
                trackedDeviceIndex: device_index,
                transform: matrix,
            })
        }
    }
}
