use napi_derive::napi;
use openvr_sys as vr;

use super::constants::{
    AXIS_JOYSTICK, AXIS_TOUCHPAD, AXIS_TRIGGER, BUTTON_GRIP, BUTTON_JOYSTICK, BUTTON_TOUCHPAD,
    BUTTON_TRIGGER,
};
use super::errors::require_fn;
use super::manager::OverlayManager;
use super::types::ControllerState;

#[napi]
impl OverlayManager {
    #[napi]
    pub fn get_controller_ids(&self) -> napi::Result<Vec<u32>> {
        // Get valid controller indices / 有効なコントローラーインデックスを取得
        let mut controllers = Vec::new();
        let system = self.system()?;
        let get_class_fn = require_fn(system.GetTrackedDeviceClass, "GetTrackedDeviceClass")?;
        unsafe {
            for i in 0..vr::k_unMaxTrackedDeviceCount {
                let device_class = get_class_fn(i);
                if device_class == vr::ETrackedDeviceClass_TrackedDeviceClass_Controller {
                    controllers.push(i);
                }
            }
        }
        Ok(controllers)
    }

    #[napi]
    pub fn get_controller_pose(&self, index: u32) -> napi::Result<Vec<f64>> {
        // Get pose matrix for controller (4x4 flattened) / コントローラーのポーズ行列を取得 (4x4フラット)
        let system = self.system()?;
        let get_pose_fn = require_fn(
            system.GetDeviceToAbsoluteTrackingPose,
            "GetDeviceToAbsoluteTrackingPose",
        )?;

        if index >= vr::k_unMaxTrackedDeviceCount {
            return Err(napi::Error::from_reason("Invalid device index"));
        }

        let mut poses = self.poses_cache().borrow_mut();
        let pose_count = vr::k_unMaxTrackedDeviceCount as usize;
        debug_assert_eq!(poses.len(), pose_count);
        if poses.len() != pose_count {
            poses.resize_with(pose_count, || unsafe { std::mem::zeroed() });
        }

        unsafe {
            // Getting generic tracker pose
            // OpenVR API gets array of poses.
            get_pose_fn(
                vr::ETrackingUniverseOrigin_TrackingUniverseStanding,
                0.0,
                poses.as_mut_ptr(),
                vr::k_unMaxTrackedDeviceCount,
            );

            let pose = &poses[index as usize];
            if !pose.bPoseIsValid || !pose.bDeviceIsConnected {
                return Ok(vec![]); // Valid but not tracking/connected / 有効だが未トラッキング or 未接続
            }

            let m = pose.mDeviceToAbsoluteTracking.m;
            // Convert 3x4 to 4x4 flattened (column-major for WebGL/Three.js usually? No, let's return row-major and handle in JS)
            // Three.js Matrix4.set() takes row-major (n11, n12, n13, n14, ...)

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
    pub fn get_controller_state(&self, controller_index: u32) -> napi::Result<ControllerState> {
        let system = self.system()?;
        let get_controller_state_fn =
            require_fn(system.GetControllerState, "GetControllerState")?;

        if controller_index >= vr::k_unMaxTrackedDeviceCount {
            return Err(napi::Error::from_reason("Invalid device index"));
        }

        unsafe {
            let mut state: vr::VRControllerState_t = std::mem::zeroed();
            let success = get_controller_state_fn(
                controller_index,
                &mut state,
                std::mem::size_of::<vr::VRControllerState_t>() as u32,
            );

            if !success {
                return Ok(ControllerState {
                    triggerPressed: false,
                    triggerValue: 0.0,
                    gripPressed: false,
                    touchpadPressed: false,
                    touchpadX: 0.0,
                    touchpadY: 0.0,
                    joystickPressed: false,
                    joystickX: 0.0,
                    joystickY: 0.0,
                });
            }

            Ok(ControllerState {
                triggerPressed: (state.ulButtonPressed & BUTTON_TRIGGER) != 0,
                triggerValue: state.rAxis[AXIS_TRIGGER].x as f64,
                gripPressed: (state.ulButtonPressed & BUTTON_GRIP) != 0,
                touchpadPressed: (state.ulButtonPressed & BUTTON_TOUCHPAD) != 0,
                touchpadX: state.rAxis[AXIS_TOUCHPAD].x as f64,
                touchpadY: state.rAxis[AXIS_TOUCHPAD].y as f64,
                joystickPressed: (state.ulButtonPressed & BUTTON_JOYSTICK) != 0,
                joystickX: state.rAxis[AXIS_JOYSTICK].x as f64,
                joystickY: state.rAxis[AXIS_JOYSTICK].y as f64,
            })
        }
    }
}
