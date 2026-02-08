use napi_derive::napi;
use openvr_sys as vr;
use std::collections::BTreeSet;
use std::ffi::{c_char, CStr, CString};

use super::errors::{input_error, require_fn};
use super::manager::OverlayManager;
use super::types::CurrentBindings;

const ACTION_SET_PATH: &str = "/actions/vrkb2";
const TOGGLE_ACTION_PATH: &str = "/actions/vrkb2/in/toggle_overlay";
const TRIGGER_ACTION_PATH: &str = "/actions/vrkb2/in/trigger_click";
const GRIP_ACTION_PATH: &str = "/actions/vrkb2/in/grip_click";
const LEFT_HAND_PATH: &str = "/user/hand/left";
const RIGHT_HAND_PATH: &str = "/user/hand/right";
const TOGGLE_RELEASE_STREAK_TO_UNLOCK: u8 = 3;

fn to_cstring(input: &str, label: &str) -> napi::Result<CString> {
    CString::new(input)
        .map_err(|_| napi::Error::from_reason(format!("{label} contains a null byte")))
}

fn input_error_if_needed(action: &str, err: vr::EVRInputError) -> napi::Result<()> {
    if err == vr::EVRInputError_VRInputError_None {
        Ok(())
    } else {
        Err(input_error(action, err))
    }
}

fn is_non_fatal_binding_info_error(err: vr::EVRInputError) -> bool {
    err == vr::EVRInputError_VRInputError_NoData
        || err == vr::EVRInputError_VRInputError_NoActiveActionSet
}

fn read_c_buffer(buf: &[c_char]) -> String {
    let ptr = buf.as_ptr();
    if ptr.is_null() {
        return String::new();
    }
    unsafe { CStr::from_ptr(ptr) }.to_string_lossy().trim().to_string()
}

fn get_binding_labels(
    input: &vr::VR_IVRInput_FnTable,
    action_handle: vr::VRActionHandle_t,
) -> napi::Result<Vec<String>> {
    let get_action_binding_info_fn =
        require_fn(input.GetActionBindingInfo, "GetActionBindingInfo")?;
    let mut bindings: [vr::InputBindingInfo_t; 16] = unsafe { std::mem::zeroed() };
    let mut returned_count: u32 = 0;

    unsafe {
        let err = get_action_binding_info_fn(
            action_handle,
            bindings.as_mut_ptr(),
            std::mem::size_of::<vr::InputBindingInfo_t>() as u32,
            bindings.len() as u32,
            &mut returned_count,
        );
        if err != vr::EVRInputError_VRInputError_None
            && err != vr::EVRInputError_VRInputError_BufferTooSmall
        {
            if is_non_fatal_binding_info_error(err) {
                return Ok(vec![]);
            }
            return Err(input_error("GetActionBindingInfo", err));
        }
    }

    let mut names = BTreeSet::new();
    for info in bindings.iter().take(returned_count as usize) {
        let device = read_c_buffer(&info.rchDevicePathName);
        let input_path = read_c_buffer(&info.rchInputPathName);
        let mode = read_c_buffer(&info.rchModeName);
        let slot = read_c_buffer(&info.rchSlotName);
        let source = read_c_buffer(&info.rchInputSourceType);
        let label = format!("{device} {input_path} {mode} {slot} {source}")
            .trim()
            .replace("  ", " ");
        if !label.is_empty() {
            names.insert(label);
        }
    }

    Ok(names.into_iter().collect())
}

#[napi]
impl OverlayManager {
    #[napi]
    pub fn init_input(&self, manifest_abs_path: String) -> napi::Result<()> {
        let input = self.input()?;
        let manifest = to_cstring(&manifest_abs_path, "manifest path")?;

        let set_manifest_fn = require_fn(input.SetActionManifestPath, "SetActionManifestPath")?;
        let get_action_set_fn = require_fn(input.GetActionSetHandle, "GetActionSetHandle")?;
        let get_action_fn = require_fn(input.GetActionHandle, "GetActionHandle")?;
        let get_input_source_fn = require_fn(input.GetInputSourceHandle, "GetInputSourceHandle")?;

        let action_set_path = to_cstring(ACTION_SET_PATH, "action set path")?;
        let toggle_action_path = to_cstring(TOGGLE_ACTION_PATH, "toggle action path")?;
        let trigger_action_path = to_cstring(TRIGGER_ACTION_PATH, "trigger action path")?;
        let grip_action_path = to_cstring(GRIP_ACTION_PATH, "grip action path")?;
        let left_hand_path = to_cstring(LEFT_HAND_PATH, "left hand path")?;
        let right_hand_path = to_cstring(RIGHT_HAND_PATH, "right hand path")?;

        let mut action_set_handle: vr::VRActionSetHandle_t = vr::k_ulInvalidActionSetHandle;
        let mut toggle_action_handle: vr::VRActionHandle_t = vr::k_ulInvalidActionHandle;
        let mut trigger_action_handle: vr::VRActionHandle_t = vr::k_ulInvalidActionHandle;
        let mut grip_action_handle: vr::VRActionHandle_t = vr::k_ulInvalidActionHandle;
        let mut left_hand_source: vr::VRInputValueHandle_t = vr::k_ulInvalidInputValueHandle;
        let mut right_hand_source: vr::VRInputValueHandle_t = vr::k_ulInvalidInputValueHandle;

        unsafe {
            input_error_if_needed(
                "SetActionManifestPath",
                set_manifest_fn(manifest.as_ptr() as *mut c_char),
            )?;
            input_error_if_needed(
                "GetActionSetHandle",
                get_action_set_fn(
                    action_set_path.as_ptr() as *mut c_char,
                    &mut action_set_handle,
                ),
            )?;
            input_error_if_needed(
                "GetActionHandle",
                get_action_fn(
                    toggle_action_path.as_ptr() as *mut c_char,
                    &mut toggle_action_handle,
                ),
            )?;
            input_error_if_needed(
                "GetActionHandle",
                get_action_fn(
                    trigger_action_path.as_ptr() as *mut c_char,
                    &mut trigger_action_handle,
                ),
            )?;
            input_error_if_needed(
                "GetActionHandle",
                get_action_fn(
                    grip_action_path.as_ptr() as *mut c_char,
                    &mut grip_action_handle,
                ),
            )?;
            input_error_if_needed(
                "GetInputSourceHandle",
                get_input_source_fn(
                    left_hand_path.as_ptr() as *mut c_char,
                    &mut left_hand_source,
                ),
            )?;
            input_error_if_needed(
                "GetInputSourceHandle",
                get_input_source_fn(
                    right_hand_path.as_ptr() as *mut c_char,
                    &mut right_hand_source,
                ),
            )?;
        }

        let mut cache = self.input_cache().borrow_mut();
        cache.initialized = true;
        cache.action_set_handle = action_set_handle;
        cache.toggle_action_handle = toggle_action_handle;
        cache.trigger_action_handle = trigger_action_handle;
        cache.grip_action_handle = grip_action_handle;
        cache.left_hand_source = left_hand_source;
        cache.right_hand_source = right_hand_source;
        cache.last_toggle_state = false;
        cache.toggle_lock = false;
        cache.toggle_release_streak = 0;
        Ok(())
    }

    #[napi]
    pub fn poll_toggle_clicked(&self) -> napi::Result<bool> {
        let input = self.input()?;
        let mut cache = self.input_cache().borrow_mut();
        if !cache.initialized {
            return Err(napi::Error::from_reason("SteamVR input is not initialized"));
        }

        let update_action_state_fn = require_fn(input.UpdateActionState, "UpdateActionState")?;
        let get_digital_action_data_fn =
            require_fn(input.GetDigitalActionData, "GetDigitalActionData")?;

        let mut active_set = vr::VRActiveActionSet_t {
            ulActionSet: cache.action_set_handle,
            ulRestrictedToDevice: vr::k_ulInvalidInputValueHandle,
            ulSecondaryActionSet: vr::k_ulInvalidActionSetHandle,
            unPadding: 0,
            nPriority: 0,
        };

        let mut digital: vr::InputDigitalActionData_t = unsafe { std::mem::zeroed() };

        unsafe {
            input_error_if_needed(
                "UpdateActionState",
                update_action_state_fn(&mut active_set, std::mem::size_of::<vr::VRActiveActionSet_t>() as u32, 1),
            )?;
            input_error_if_needed(
                "GetDigitalActionData",
                get_digital_action_data_fn(
                    cache.toggle_action_handle,
                    &mut digital,
                    std::mem::size_of::<vr::InputDigitalActionData_t>() as u32,
                    vr::k_ulInvalidInputValueHandle,
                ),
            )?;
        }

        let current_state = digital.bActive && digital.bState;

        // Latch toggle while held:
        // avoid repeated toggles if SteamVR briefly drops action activity/state
        // during overlay visibility changes.
        if current_state {
            cache.toggle_release_streak = 0;
        } else if cache.toggle_release_streak < u8::MAX {
            cache.toggle_release_streak = cache.toggle_release_streak.saturating_add(1);
            if cache.toggle_release_streak >= TOGGLE_RELEASE_STREAK_TO_UNLOCK {
                cache.toggle_lock = false;
            }
        }

        let clicked = current_state && !cache.toggle_lock;
        if clicked {
            cache.toggle_lock = true;
        }
        cache.last_toggle_state = current_state;
        Ok(clicked)
    }

    #[napi]
    pub fn open_binding_ui(&self, app_key: String, show_on_desktop: bool) -> napi::Result<()> {
        let input = self.input()?;
        let cache = self.input_cache().borrow();
        if !cache.initialized {
            return Err(napi::Error::from_reason("SteamVR input is not initialized"));
        }

        let open_binding_ui_fn = require_fn(input.OpenBindingUI, "OpenBindingUI")?;
        if app_key.trim().is_empty() {
            return Err(napi::Error::from_reason("app key is required"));
        }
        let app_key_ptr = to_cstring(&app_key, "app key")?.into_raw();

        let result = unsafe {
            let res = input_error_if_needed(
                "OpenBindingUI",
                open_binding_ui_fn(
                    app_key_ptr,
                    cache.action_set_handle,
                    vr::k_ulInvalidInputValueHandle,
                    show_on_desktop,
                ),
            );
            if !app_key_ptr.is_null() {
                let _ = CString::from_raw(app_key_ptr);
            }
            res
        };

        result
    }

    #[napi]
    pub fn get_current_bindings(&self) -> napi::Result<CurrentBindings> {
        let input = self.input()?;
        let cache = self.input_cache().borrow();
        if !cache.initialized {
            return Ok(CurrentBindings {
                initialized: false,
                toggleOverlay: vec![],
                triggerBindings: vec![],
                gripBindings: vec![],
                triggerBound: false,
                gripBound: false,
            });
        }

        let toggle_labels = get_binding_labels(input, cache.toggle_action_handle)?;
        let trigger_labels = get_binding_labels(input, cache.trigger_action_handle)?;
        let grip_labels = get_binding_labels(input, cache.grip_action_handle)?;

        Ok(CurrentBindings {
            initialized: true,
            toggleOverlay: toggle_labels,
            triggerBindings: trigger_labels.clone(),
            gripBindings: grip_labels.clone(),
            triggerBound: !trigger_labels.is_empty(),
            gripBound: !grip_labels.is_empty(),
        })
    }
}
