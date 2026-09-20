use napi_derive::napi;
use openvr_sys as vr;

use super::constants::{
    AXIS_JOYSTICK, AXIS_TOUCHPAD, AXIS_TRIGGER, BUTTON_GRIP, BUTTON_JOYSTICK, BUTTON_TOUCHPAD,
    BUTTON_TRIGGER,
};
use super::errors::require_fn;
use super::manager::OverlayManager;
use super::math::hmd_matrix34_to_vec;
use super::types::ControllerState;

fn empty_controller_state() -> ControllerState {
    ControllerState {
        triggerPressed: false,
        triggerValue: 0.0,
        gripPressed: false,
        touchpadPressed: false,
        touchpadX: 0.0,
        touchpadY: 0.0,
        joystickPressed: false,
        joystickX: 0.0,
        joystickY: 0.0,
    }
}

#[napi]
impl OverlayManager {
    #[napi]
    pub fn get_controller_ids(&self) -> napi::Result<Vec<u32>> {
        // Get valid controller indices / 有効なコントローラーインデックスを取得
        let mut controllers = Vec::new();
        let system = self.system()?;
        let get_class_fn = require_fn(system.GetTrackedDeviceClass, "GetTrackedDeviceClass")?;
        // Optional: fall back to reporting every controller when the runtime
        // does not expose activity levels.
        // 任意: ランタイムがアクティビティレベルを公開していない場合は、
        // すべてのコントローラーを返す従来どおりの動作に戻す。
        let get_activity_fn = system.GetTrackedDeviceActivityLevel;
        let filter_idle = self.filter_idle_controllers();
        unsafe {
            for i in 0..vr::k_unMaxTrackedDeviceCount {
                let device_class = get_class_fn(i);
                if device_class != vr::ETrackedDeviceClass_TrackedDeviceClass_Controller {
                    continue;
                }
                // A controller that is asleep or has been set down keeps
                // reporting its last pose as valid, so its ray goes on hitting
                // whatever it happened to be crossing and leaves a frozen
                // cursor on the overlay until the device is picked up again.
                // 休止中・置かれたままのコントローラーは最後の姿勢を有効なまま
                // 報告し続けるため、そのレイはたまたま横切っていたものに当たり
                // 続け、再び手に取るまでオーバーレイに固まったカーソルを残す。
                if filter_idle {
                    if let Some(activity_fn) = get_activity_fn {
                        let level = activity_fn(i);
                        if level
                            != vr::EDeviceActivityLevel_k_EDeviceActivityLevel_UserInteraction
                            && level
                                != vr::EDeviceActivityLevel_k_EDeviceActivityLevel_UserInteraction_Timeout
                        {
                            continue;
                        }
                    }
                }
                controllers.push(i);
            }
        }
        Ok(controllers)
    }

    #[napi]
    pub fn get_controller_pose(&self, index: u32) -> napi::Result<Vec<f64>> {
        if index >= vr::k_unMaxTrackedDeviceCount {
            return Err(napi::Error::from_reason("Invalid device index"));
        }

        // Check if cached poses are still fresh (within TTL) / キャッシュされたポーズがまだ新鮮か確認 (TTL以内)
        let cache_hit = self.poses_cache_valid();
        let mut poses = self.borrow_poses_cache()?;
        let pose_count = vr::k_unMaxTrackedDeviceCount as usize;
        debug_assert_eq!(poses.len(), pose_count);
        if poses.len() != pose_count {
            poses.resize_with(pose_count, || unsafe { std::mem::zeroed() });
        }

        unsafe {
            if !cache_hit {
                // Cache miss: fetch all poses from OpenVR API / キャッシュミス: OpenVR APIから全ポーズを取得
                let system = self.system()?;
                let get_pose_fn = require_fn(
                    system.GetDeviceToAbsoluteTrackingPose,
                    "GetDeviceToAbsoluteTrackingPose",
                )?;
                // A prediction horizon of 0 asks for the pose as of now, which
                // is already stale by the time the frame it drives reaches the
                // headset. Predicting forward by roughly that delay is what
                // cancels it. The default stays 0 so behaviour only changes when
                // asked. / 先読み0は「今この瞬間」のポーズを求めるが、それが駆動する
                // フレームがヘッドセットに届く頃には既に古い。その遅延ぶんだけ先を
                // 予測することが打ち消しになる。既定は0のままで、要求されたときだけ
                // 挙動が変わる。
                get_pose_fn(
                    vr::ETrackingUniverseOrigin_TrackingUniverseStanding,
                    self.pose_prediction_seconds(),
                    poses.as_mut_ptr(),
                    vr::k_unMaxTrackedDeviceCount,
                );
                self.mark_poses_cache();
            }

            let pose = &poses[index as usize];
            if !pose.bPoseIsValid || !pose.bDeviceIsConnected {
                return Ok(vec![]); // Valid but not tracking/connected / 有効だが未トラッキング or 未接続
            }

            Ok(hmd_matrix34_to_vec(&pose.mDeviceToAbsoluteTracking.m))
        }
    }

    /// Report a device's activity level, for diagnostics.
    /// 診断用にデバイスのアクティビティレベルを返す。
    #[napi]
    pub fn get_controller_activity_level(&self, index: u32) -> napi::Result<i32> {
        if index >= vr::k_unMaxTrackedDeviceCount {
            return Err(napi::Error::from_reason("Invalid device index"));
        }
        let system = self.system()?;
        let activity_fn = require_fn(
            system.GetTrackedDeviceActivityLevel,
            "GetTrackedDeviceActivityLevel",
        )?;
        Ok(unsafe { activity_fn(index) })
    }

    /// Exclude controllers that are asleep or set down.
    /// 休止中・置かれたままのコントローラーを除外する。
    #[napi]
    pub fn set_filter_idle_controllers(&self, enabled: bool) -> napi::Result<()> {
        self.apply_idle_controller_filter(enabled);
        Ok(())
    }

    /// Predict controller poses this far ahead of now, in seconds.
    /// コントローラーのポーズを現在から何秒先まで予測するかを設定する。
    #[napi]
    pub fn set_pose_prediction_seconds(&self, seconds: f64) -> napi::Result<()> {
        if !seconds.is_finite() || !(0.0..=0.1).contains(&seconds) {
            return Err(napi::Error::from_reason(
                "Pose prediction must be between 0 and 0.1 seconds",
            ));
        }
        self.set_pose_prediction(seconds as f32);
        Ok(())
    }

    #[napi]
    pub fn get_controller_state(&self, controller_index: u32) -> napi::Result<ControllerState> {
        let system = self.system()?;
        let get_controller_state_fn = require_fn(system.GetControllerState, "GetControllerState")?;
        let get_role_fn = system.GetControllerRoleForTrackedDeviceIndex;

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

            let mut result = if !success {
                empty_controller_state()
            } else {
                ControllerState {
                    triggerPressed: (state.ulButtonPressed & BUTTON_TRIGGER) != 0,
                    triggerValue: state.rAxis[AXIS_TRIGGER].x as f64,
                    gripPressed: (state.ulButtonPressed & BUTTON_GRIP) != 0,
                    touchpadPressed: (state.ulButtonPressed & BUTTON_TOUCHPAD) != 0,
                    touchpadX: state.rAxis[AXIS_TOUCHPAD].x as f64,
                    touchpadY: state.rAxis[AXIS_TOUCHPAD].y as f64,
                    joystickPressed: (state.ulButtonPressed & BUTTON_JOYSTICK) != 0,
                    joystickX: state.rAxis[AXIS_JOYSTICK].x as f64,
                    joystickY: state.rAxis[AXIS_JOYSTICK].y as f64,
                }
            };

            // SteamVR Input integration:
            // Read action data from the most recent UpdateActionState (called by poll_toggle_clicked).
            // SteamVR Input 統合:
            // poll_toggle_clicked で呼ばれた最新の UpdateActionState の結果からアクションデータを読み取る。
            if let Ok(input) = self.input() {
                let cache = self.borrow_input_cache()?;
                if cache.initialized {
                    if let Some(get_digital_action_data_fn) = input.GetDigitalActionData {
                        let preferred_source = if let Some(get_role_fn) = get_role_fn {
                            match get_role_fn(controller_index) {
                                vr::ETrackedControllerRole_TrackedControllerRole_LeftHand => {
                                    cache.left_hand_source
                                }
                                vr::ETrackedControllerRole_TrackedControllerRole_RightHand => {
                                    cache.right_hand_source
                                }
                                _ => vr::k_ulInvalidInputValueHandle,
                            }
                        } else {
                            vr::k_ulInvalidInputValueHandle
                        };

                        let sources = [preferred_source, vr::k_ulInvalidInputValueHandle];
                        let source_count = if preferred_source == vr::k_ulInvalidInputValueHandle {
                            1
                        } else {
                            2
                        };

                        let mut trigger_overridden = false;
                        let mut grip_overridden = false;
                        for source in sources.iter().take(source_count).copied() {
                            if !trigger_overridden {
                                let mut trigger_data: vr::InputDigitalActionData_t =
                                    std::mem::zeroed();
                                let trigger_err = get_digital_action_data_fn(
                                    cache.trigger_action_handle,
                                    &mut trigger_data,
                                    std::mem::size_of::<vr::InputDigitalActionData_t>() as u32,
                                    source,
                                );
                                if trigger_err == vr::EVRInputError_VRInputError_None
                                    && trigger_data.bActive
                                {
                                    result.triggerPressed = trigger_data.bState;
                                    trigger_overridden = true;
                                }
                            }

                            if !grip_overridden {
                                let mut grip_data: vr::InputDigitalActionData_t =
                                    std::mem::zeroed();
                                let grip_err = get_digital_action_data_fn(
                                    cache.grip_action_handle,
                                    &mut grip_data,
                                    std::mem::size_of::<vr::InputDigitalActionData_t>() as u32,
                                    source,
                                );
                                if grip_err == vr::EVRInputError_VRInputError_None
                                    && grip_data.bActive
                                {
                                    result.gripPressed = grip_data.bState;
                                    grip_overridden = true;
                                }
                            }

                            if trigger_overridden && grip_overridden {
                                break;
                            }
                        }
                    }
                }
            }

            Ok(result)
        }
    }
}
