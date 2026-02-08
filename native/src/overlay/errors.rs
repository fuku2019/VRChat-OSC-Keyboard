use openvr_sys as vr;
use std::ffi::{c_char, CStr, CString};

pub(super) fn cstring_from_env(env_key: &str, default: &str) -> napi::Result<CString> {
    if let Ok(value) = std::env::var(env_key) {
        if !value.is_empty() {
            return CString::new(value).map_err(|_| {
                napi::Error::from_reason(format!("{env_key} contains a null byte"))
            });
        }
    }
    CString::new(default).map_err(|_| {
        napi::Error::from_reason("Interface version string contains a null byte")
    })
}

pub(super) fn require_fn<T>(opt: Option<T>, name: &'static str) -> napi::Result<T> {
    opt.ok_or_else(|| napi::Error::from_reason(format!("{name} not available")))
}

pub(super) fn cstr_to_string(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    Some(unsafe { CStr::from_ptr(ptr) }
        .to_string_lossy()
        .into_owned())
}

pub(super) fn init_error_message(err: vr::EVRInitError) -> String {
    let symbol = unsafe { cstr_to_string(vr::VR_GetVRInitErrorAsSymbol(err)) };
    let description = unsafe { cstr_to_string(vr::VR_GetVRInitErrorAsEnglishDescription(err)) };

    match (symbol, description) {
        (Some(symbol), Some(description)) => format!("{symbol}: {description}"),
        (Some(symbol), None) => symbol,
        (None, Some(description)) => description,
        (None, None) => format!("{:?}", err),
    }
}

pub(super) fn overlay_error_message(
    overlay: &vr::VR_IVROverlay_FnTable,
    err: vr::EVROverlayError,
) -> String {
    if let Some(get_name_fn) = overlay.GetOverlayErrorNameFromEnum {
        let name = unsafe { get_name_fn(err) };
        if let Some(message) = cstr_to_string(name as *const c_char) {
            return message;
        }
    }
    format!("{:?}", err)
}

pub(super) fn overlay_error(
    action: &str,
    overlay: &vr::VR_IVROverlay_FnTable,
    err: vr::EVROverlayError,
) -> napi::Error {
    napi::Error::from_reason(format!(
        "{action} failed: {} (code: {:?})",
        overlay_error_message(overlay, err),
        err
    ))
}

pub(super) fn input_error(action: &str, err: vr::EVRInputError) -> napi::Error {
    napi::Error::from_reason(format!(
        "{action} failed: {:?} (code: {:?})",
        err, err
    ))
}
