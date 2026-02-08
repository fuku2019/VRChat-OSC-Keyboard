use napi_derive::napi;
use openvr_sys as vr;
use std::cell::RefCell;
use std::marker::PhantomData;
use std::ptr::NonNull;
use std::rc::Rc;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Mutex, OnceLock,
};

use super::constants::{
    DEFAULT_INPUT_INTERFACE, DEFAULT_OVERLAY_INTERFACE, DEFAULT_SYSTEM_INTERFACE,
    INPUT_INTERFACE_ENV, OVERLAY_INTERFACE_ENV, SYSTEM_INTERFACE_ENV,
};
use super::d3d11;
use super::d3d11::D3D11Context;
use super::errors::{cstring_from_env, init_error_message};

static VR_INIT_COUNT: AtomicUsize = AtomicUsize::new(0);
static VR_INIT_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn create_poses_cache() -> Vec<vr::TrackedDevicePose_t> {
    let mut poses = Vec::with_capacity(vr::k_unMaxTrackedDeviceCount as usize);
    poses.resize_with(
        vr::k_unMaxTrackedDeviceCount as usize,
        || unsafe { std::mem::zeroed() },
    );
    poses
}

struct VrContext {
    overlay: NonNull<vr::VR_IVROverlay_FnTable>,
    system: Option<NonNull<vr::VR_IVRSystem_FnTable>>,
    input: Option<NonNull<vr::VR_IVRInput_FnTable>>,
}

pub(super) struct InputActionCache {
    pub initialized: bool,
    pub action_set_handle: vr::VRActionSetHandle_t,
    pub toggle_action_handle: vr::VRActionHandle_t,
    pub trigger_action_handle: vr::VRActionHandle_t,
    pub grip_action_handle: vr::VRActionHandle_t,
    pub left_hand_source: vr::VRInputValueHandle_t,
    pub right_hand_source: vr::VRInputValueHandle_t,
    pub last_toggle_state: bool,
    pub toggle_lock: bool,
    pub toggle_release_streak: u8,
}

impl InputActionCache {
    fn new() -> Self {
        Self {
            initialized: false,
            action_set_handle: 0,
            toggle_action_handle: 0,
            trigger_action_handle: 0,
            grip_action_handle: 0,
            left_hand_source: 0,
            right_hand_source: 0,
            last_toggle_state: false,
            toggle_lock: false,
            toggle_release_streak: 0,
        }
    }
}

/// VRオーバーレイを管理するN-APIラッパー。
///
/// 注意: `!Send` / `!Sync` のため同一スレッドでのみ使用してください。
#[napi]
pub struct OverlayManager {
    context: VrContext,
    d3d11: Option<D3D11Context>,
    poses_cache: RefCell<Vec<vr::TrackedDevicePose_t>>,
    input_cache: RefCell<InputActionCache>,
    _vr_token: Option<isize>,
    // Make the manager !Send/!Sync unless we can prove thread safety.
    _not_send: PhantomData<Rc<()>>,
}

impl OverlayManager {
    pub(super) fn overlay(&self) -> &vr::VR_IVROverlay_FnTable {
        unsafe { self.context.overlay.as_ref() }
    }

    pub(super) fn overlay_ptr(&self) -> NonNull<vr::VR_IVROverlay_FnTable> {
        self.context.overlay
    }

    pub(super) fn system(&self) -> napi::Result<&vr::VR_IVRSystem_FnTable> {
        let ptr = self
            .context
            .system
            .ok_or_else(|| napi::Error::from_reason("System interface is null"))?;
        Ok(unsafe { ptr.as_ref() })
    }

    pub(super) fn d3d11_mut(&mut self) -> Option<&mut D3D11Context> {
        self.d3d11.as_mut()
    }

    pub(super) fn poses_cache(&self) -> &RefCell<Vec<vr::TrackedDevicePose_t>> {
        &self.poses_cache
    }

    pub(super) fn input(&self) -> napi::Result<&vr::VR_IVRInput_FnTable> {
        let ptr = self
            .context
            .input
            .ok_or_else(|| napi::Error::from_reason("Input interface is null"))?;
        Ok(unsafe { ptr.as_ref() })
    }

    pub(super) fn input_cache(&self) -> &RefCell<InputActionCache> {
        &self.input_cache
    }
}

#[napi]
impl OverlayManager {
    #[napi(constructor)]
    pub fn new() -> napi::Result<Self> {
        let overlay_ver = cstring_from_env(OVERLAY_INTERFACE_ENV, DEFAULT_OVERLAY_INTERFACE)?;
        let system_ver = cstring_from_env(SYSTEM_INTERFACE_ENV, DEFAULT_SYSTEM_INTERFACE)?;
        let input_ver = cstring_from_env(INPUT_INTERFACE_ENV, DEFAULT_INPUT_INTERFACE)?;

        let init_lock = VR_INIT_LOCK.get_or_init(|| Mutex::new(()));
        let _guard = init_lock
            .lock()
            .map_err(|_| napi::Error::from_reason("VR init lock poisoned"))?;

        let mut init_token = None;

        unsafe {
            if !vr::VR_IsHmdPresent() {
                return Err(napi::Error::from_reason("VR Headset not found"));
            }

            let do_init = VR_INIT_COUNT.load(Ordering::SeqCst) == 0;

            if do_init {
                // Use VR_InitInternal instead of VR_Init (token stored) // VR_InitではなくVR_InitInternalを使用 (戻り値トークンを保持)
                // C++ API VR_Init is helper, C API uses InitInternal // C++ APIでは VR_Init はヘルパー関数だが、C API (openvr_sys) では InitInternal を呼ぶ
                let mut error = vr::EVRInitError_VRInitError_None;
                let token =
                    vr::VR_InitInternal(&mut error, vr::EVRApplicationType_VRApplication_Overlay);

                if error != vr::EVRInitError_VRInitError_None {
                    return Err(napi::Error::from_reason(format!(
                        "VR_Init failed: {} (code: {:?})",
                        init_error_message(error),
                        error
                    )));
                }

                init_token = Some(token as isize);
            }

            // Get IVROverlay interface // IVROverlay interface取得
            // C bindings require FnTable_ prefix for function table access
            // CバインディングではFnTable_プレフィックスが必要
            let mut error = vr::EVRInitError_VRInitError_None;
            let overlay_raw = vr::VR_GetGenericInterface(overlay_ver.as_ptr(), &mut error)
                as *mut vr::VR_IVROverlay_FnTable;

            if overlay_raw.is_null() || error != vr::EVRInitError_VRInitError_None {
                if do_init {
                    vr::VR_ShutdownInternal();
                }
                return Err(napi::Error::from_reason(format!(
                    "Failed to get IVROverlay interface: {} (code: {:?})",
                    init_error_message(error),
                    error
                )));
            }
            let overlay_ptr = NonNull::new(overlay_raw).ok_or_else(|| {
                napi::Error::from_reason("overlay interface pointer must be non-null")
            })?;

            // Get IVRSystem interface // IVRSystem interface取得 (必要であれば)
            let mut error = vr::EVRInitError_VRInitError_None;
            let system_raw = vr::VR_GetGenericInterface(system_ver.as_ptr(), &mut error)
                as *mut vr::VR_IVRSystem_FnTable;

            let system_ptr = if system_raw.is_null() || error != vr::EVRInitError_VRInitError_None
            {
                // System interface is not mandatory but kept // Systemインターフェースは必須ではないが取っておく
                // Error handling omitted // エラーハンドリングは省略
                None
            } else {
                NonNull::new(system_raw)
            };

            // Get IVRInput interface // IVRInput interface取得 (SteamVR Input)
            let mut error = vr::EVRInitError_VRInitError_None;
            let input_raw = vr::VR_GetGenericInterface(input_ver.as_ptr(), &mut error)
                as *mut vr::VR_IVRInput_FnTable;

            let input_ptr = if input_raw.is_null() || error != vr::EVRInitError_VRInitError_None {
                None
            } else {
                NonNull::new(input_raw)
            };

            VR_INIT_COUNT.fetch_add(1, Ordering::SeqCst);

            // Initialize D3D11 device for texture sharing / テクスチャ共有用のD3D11デバイスを初期化
            let d3d11_ctx = d3d11::init().ok();

            Ok(OverlayManager {
                context: VrContext {
                    overlay: overlay_ptr,
                    system: system_ptr,
                    input: input_ptr,
                },
                d3d11: d3d11_ctx,
                poses_cache: RefCell::new(create_poses_cache()),
                input_cache: RefCell::new(InputActionCache::new()),
                _vr_token: init_token,
                _not_send: PhantomData,
            })
        }
    }
}

impl Drop for OverlayManager {
    fn drop(&mut self) {
        let init_lock = VR_INIT_LOCK.get_or_init(|| Mutex::new(()));
        let _guard = match init_lock.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };

        let prev = VR_INIT_COUNT.load(Ordering::SeqCst);
        if prev == 0 {
            debug_assert!(false, "VR_INIT_COUNT underflow");
            return;
        }

        let prev = VR_INIT_COUNT.fetch_sub(1, Ordering::SeqCst);
        if prev == 1 {
            unsafe { vr::VR_ShutdownInternal() };
        }
    }
}
