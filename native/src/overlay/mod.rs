use napi::bindgen_prelude::*;
use napi_derive::napi;
use openvr_sys as vr;
use std::cell::RefCell;
use std::ffi::{c_char, CString};
use std::marker::PhantomData;
use std::ptr::NonNull;
use std::rc::Rc;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Mutex, OnceLock,
};

// DirectX11 imports / DirectX11インポート
use windows::Win32::Graphics::Direct3D11::{
    ID3D11Texture2D, D3D11_BIND_SHADER_RESOURCE, D3D11_CPU_ACCESS_WRITE,
    D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_WRITE_DISCARD, D3D11_TEXTURE2D_DESC,
    D3D11_USAGE_DYNAMIC,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::core::Interface;

mod d3d11;
mod types;

pub use types::{ControllerState, IntersectionResult, OverlayRelativeTransform};

use d3d11::D3D11Context;

static VR_INIT_COUNT: AtomicUsize = AtomicUsize::new(0);
static VR_INIT_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

const OVERLAY_INTERFACE_ENV: &str = "OPENVR_IVR_OVERLAY_VERSION";
const SYSTEM_INTERFACE_ENV: &str = "OPENVR_IVR_SYSTEM_VERSION";
const DEFAULT_OVERLAY_INTERFACE: &str = "FnTable:IVROverlay_028";
const DEFAULT_SYSTEM_INTERFACE: &str = "FnTable:IVRSystem_023";

fn cstring_from_env(env_key: &str, default: &str) -> napi::Result<CString> {
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

fn require_fn<T>(opt: Option<T>, name: &'static str) -> napi::Result<T> {
    opt.ok_or_else(|| napi::Error::from_reason(format!("{name} not available")))
}

fn overlay_handle(handle: i64) -> napi::Result<u64> {
    if handle < 0 {
        return Err(napi::Error::from_reason(
            "Overlay handle must be a non-negative integer",
        ));
    }
    Ok(handle as u64)
}

fn handle_to_i64(handle: u64) -> napi::Result<i64> {
    i64::try_from(handle)
        .map_err(|_| napi::Error::from_reason("Overlay handle exceeds i64 range"))
}

fn expected_rgba_size(width: u32, height: u32) -> napi::Result<usize> {
    let width = usize::try_from(width)
        .map_err(|_| napi::Error::from_reason("width is too large"))?;
    let height = usize::try_from(height)
        .map_err(|_| napi::Error::from_reason("height is too large"))?;
    width
        .checked_mul(height)
        .and_then(|v| v.checked_mul(4))
        .ok_or_else(|| napi::Error::from_reason("width/height too large"))
}

fn vec3_f32(name: &str, values: &[f64]) -> napi::Result<[f32; 3]> {
    if values.len() != 3 {
        return Err(napi::Error::from_reason(format!(
            "{name} must have length 3"
        )));
    }
    Ok([values[0] as f32, values[1] as f32, values[2] as f32])
}


struct VrContext {
    overlay: NonNull<vr::VR_IVROverlay_FnTable>,
    system: Option<NonNull<vr::VR_IVRSystem_FnTable>>,
}

#[napi]
pub struct OverlayManager {
    context: VrContext,
    d3d11: Option<D3D11Context>,
    poses_cache: RefCell<Vec<vr::TrackedDevicePose_t>>,
    _vr_token: Option<isize>,
    // Make the manager !Send/!Sync unless we can prove thread safety.
    _not_send: PhantomData<Rc<()>>,
}

impl OverlayManager {
    fn overlay(&self) -> &vr::VR_IVROverlay_FnTable {
        unsafe { self.context.overlay.as_ref() }
    }

    fn system(&self) -> napi::Result<&vr::VR_IVRSystem_FnTable> {
        let ptr = self
            .context
            .system
            .ok_or_else(|| napi::Error::from_reason("System interface is null"))?;
        Ok(unsafe { ptr.as_ref() })
    }
}

#[napi]
impl OverlayManager {
    #[napi(constructor)]
    pub fn new() -> napi::Result<Self> {
        let overlay_ver = cstring_from_env(OVERLAY_INTERFACE_ENV, DEFAULT_OVERLAY_INTERFACE)?;
        let system_ver = cstring_from_env(SYSTEM_INTERFACE_ENV, DEFAULT_SYSTEM_INTERFACE)?;

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
                        "VR_Init failed: {:?}",
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
                return Err(napi::Error::from_reason("Failed to get IVROverlay interface"));
            }
            let overlay_ptr =
                NonNull::new(overlay_raw).expect("overlay interface pointer must be non-null");

            // Get IVRSystem interface // IVRSystem interface取得 (必要であれば)
            let mut error = vr::EVRInitError_VRInitError_None;
            let system_raw = vr::VR_GetGenericInterface(system_ver.as_ptr(), &mut error)
                as *mut vr::VR_IVRSystem_FnTable;

            let system_ptr = if system_raw.is_null() || error != vr::EVRInitError_VRInitError_None {
                // System interface is not mandatory but kept // Systemインターフェースは必須ではないが取っておく
                // Error handling omitted // エラーハンドリングは省略
                None
            } else {
                NonNull::new(system_raw)
            };

            VR_INIT_COUNT.fetch_add(1, Ordering::SeqCst);

            // Initialize D3D11 device for texture sharing / テクスチャ共有用のD3D11デバイスを初期化
            let d3d11_ctx = d3d11::init().ok();

            Ok(OverlayManager {
                context: VrContext {
                    overlay: overlay_ptr,
                    system: system_ptr,
                },
                d3d11: d3d11_ctx,
                poses_cache: RefCell::new(Vec::new()),
                _vr_token: init_token,
                _not_send: PhantomData,
            })
        }
    }

    #[napi]
    pub fn create_overlay(&self, key: String, name: String) -> napi::Result<i64> {
        let c_key = CString::new(key).map_err(|_| napi::Error::from_reason("Overlay key contains null byte"))?;
        let c_name = CString::new(name).map_err(|_| napi::Error::from_reason("Overlay name contains null byte"))?;
        let mut handle = vr::k_ulOverlayHandleInvalid;

        let overlay = self.overlay();
        let create_overlay_fn = require_fn(overlay.CreateOverlay, "CreateOverlay")?;
        unsafe {
            let err = create_overlay_fn(
                c_key.as_ptr() as *mut c_char,
                c_name.as_ptr() as *mut c_char,
                &mut handle,
            );

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("CreateOverlay failed: {:?}", err)));
            }
        }

        // u64 -> i64 cast (Napi compatibility)
        handle_to_i64(handle)
    }

    #[napi]
    pub fn show_overlay(&self, handle: i64) -> napi::Result<()> {
        let overlay = self.overlay();
        let show_overlay_fn = require_fn(overlay.ShowOverlay, "ShowOverlay")?;
        let handle = overlay_handle(handle)?;
        unsafe {
            let err = show_overlay_fn(handle);
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("ShowOverlay failed: {:?}", err)));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn hide_overlay(&self, handle: i64) -> napi::Result<()> {
        let overlay = self.overlay();
        let hide_overlay_fn = require_fn(overlay.HideOverlay, "HideOverlay")?;
        let handle = overlay_handle(handle)?;
        unsafe {
            let err = hide_overlay_fn(handle);
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("HideOverlay failed: {:?}", err)));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn set_overlay_width(&self, handle: i64, width_meters: f64) -> napi::Result<()> {
        let overlay = self.overlay();
        let set_width_fn = require_fn(overlay.SetOverlayWidthInMeters, "SetOverlayWidthInMeters")?;
        let handle = overlay_handle(handle)?;
        unsafe {
            let err = set_width_fn(handle, width_meters as f32);
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!(
                    "SetOverlayWidthInMeters failed: {:?}",
                    err
                )));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn set_overlay_texture_bounds(
        &self,
        handle: i64,
        u_min: f64,
        v_min: f64,
        u_max: f64,
        v_max: f64,
    ) -> napi::Result<()> {
        let overlay = self.overlay();
        let set_bounds_fn = require_fn(overlay.SetOverlayTextureBounds, "SetOverlayTextureBounds")?;
        let handle = overlay_handle(handle)?;
        unsafe {
            let mut bounds = vr::VRTextureBounds_t {
                uMin: u_min as f32,
                vMin: v_min as f32,
                uMax: u_max as f32,
                vMax: v_max as f32,
            };

            let err = set_bounds_fn(handle, &mut bounds);
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!(
                    "SetOverlayTextureBounds failed: {:?}",
                    err
                )));
            }
        }
        Ok(())
    }

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
            let err = set_transform_fn(handle, 0, &mut transform);
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!(
                    "SetOverlayTransformTrackedDeviceRelative failed: {:?}",
                    err
                )));
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

            let err = get_transform_fn(handle, &mut origin, &mut transform);

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!(
                    "GetOverlayTransformAbsolute failed: {:?}",
                    err
                )));
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
        if matrix.len() != 16 {
            return Err(napi::Error::from_reason("Matrix must have 16 elements"));
        }

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
                handle,
                vr::ETrackingUniverseOrigin_TrackingUniverseStanding,
                &mut transform,
            );

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!(
                    "SetOverlayTransformAbsolute failed: {:?}",
                    err
                )));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn set_overlay_from_file(&self, handle: i64, file_path: String) -> napi::Result<()> {
        // Set overlay texture from image file (PNG, JPG, etc.)
        // 画像ファイルからテクスチャを設定 (PNG, JPG等)
        let c_path = CString::new(file_path.as_str())
            .map_err(|_| napi::Error::from_reason("File path contains null byte"))?;

        let overlay = self.overlay();
        let set_from_file_fn = require_fn(overlay.SetOverlayFromFile, "SetOverlayFromFile")?;
        let handle = overlay_handle(handle)?;
        unsafe {
            let err = set_from_file_fn(handle, c_path.as_ptr() as *mut c_char);

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!(
                    "SetOverlayFromFile failed: {:?} (path: {})",
                    err, file_path
                )));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn set_overlay_raw(
        &self,
        handle: i64,
        buffer: Buffer,
        width: u32,
        height: u32,
    ) -> napi::Result<()> {
        // Set overlay texture from raw RGBA buffer / RGBAバッファからテクスチャを設定
        // Buffer from Electron's capturePage().toBitmap() / ElectronのcapturePage().toBitmap()からのバッファ
        let overlay = self.overlay();
        let set_raw_fn = require_fn(overlay.SetOverlayRaw, "SetOverlayRaw")?;
        let handle = overlay_handle(handle)?;
        unsafe {
            // Buffer is RGBA, 4 bytes per pixel / バッファはRGBA、ピクセルあたり4バイト
            // Note: Electron capturePage().toBitmap() on Windows is typically BGRA.
            let bytes_per_pixel: u32 = 4;
            let expected_size = expected_rgba_size(width, height)?;

            if buffer.len() != expected_size {
                return Err(napi::Error::from_reason(format!(
                    "Buffer size mismatch: expected {} bytes ({}x{}x4), got {} bytes",
                    expected_size,
                    width,
                    height,
                    buffer.len()
                )));
            }

            let err = set_raw_fn(
                handle,
                buffer.as_ptr() as *mut std::ffi::c_void,
                width,
                height,
                bytes_per_pixel,
            );

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("SetOverlayRaw failed: {:?}", err)));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn set_overlay_texture_d3d11(
        &mut self,
        handle: i64,
        buffer: Buffer,
        width: u32,
        height: u32,
    ) -> napi::Result<()> {
        // Set overlay texture using D3D11 shared texture / D3D11共有テクスチャを使用してオーバーレイテクスチャを設定
        // This bypasses file I/O completely and uses GPU memory / ファイルI/Oを完全にバイパスし、GPUメモリを使用
        let set_texture_fn = {
            let overlay = self.overlay();
            require_fn(overlay.SetOverlayTexture, "SetOverlayTexture")?
        };
        let handle = overlay_handle(handle)?;
        let d3d11 = self
            .d3d11
            .as_mut()
            .ok_or_else(|| napi::Error::from_reason("D3D11 context not initialized"))?;
        unsafe {

            // Buffer is typically BGRA on Windows from Electron capturePage().toBitmap()
            // WindowsのElectron capturePage().toBitmap()は通常BGRA
            let expected_size = expected_rgba_size(width, height)?;
            if buffer.len() != expected_size {
                return Err(napi::Error::from_reason(format!(
                    "Buffer size mismatch: expected {} bytes ({}x{}x4), got {} bytes",
                    expected_size,
                    width,
                    height,
                    buffer.len()
                )));
            }

            // Recreate texture if size changed / サイズが変わった場合はテクスチャを再作成
            if d3d11.texture.is_none()
                || d3d11.texture_width != width
                || d3d11.texture_height != height
            {
                let desc = D3D11_TEXTURE2D_DESC {
                    Width: width,
                    Height: height,
                    MipLevels: 1,
                    ArraySize: 1,
                    Format: DXGI_FORMAT_R8G8B8A8_UNORM,
                    SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                    Usage: D3D11_USAGE_DYNAMIC,
                    BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
                    CPUAccessFlags: D3D11_CPU_ACCESS_WRITE.0 as u32,
                    MiscFlags: 0,
                };

                let mut texture: Option<ID3D11Texture2D> = None;
                d3d11
                    .device
                    .CreateTexture2D(&desc, None, Some(&mut texture))
                    .map_err(|e| {
                        napi::Error::from_reason(format!("CreateTexture2D failed: {:?}", e))
                    })?;

                d3d11.texture = texture;
                d3d11.texture_width = width;
                d3d11.texture_height = height;
            }

            // Update texture data / テクスチャデータを更新
            let texture = d3d11.texture.as_ref().unwrap();

            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            d3d11
                .context
                .Map(texture, 0, D3D11_MAP_WRITE_DISCARD, 0, Some(&mut mapped))
                .map_err(|e| napi::Error::from_reason(format!("Map failed: {:?}", e)))?;

            // Copy buffer to texture with BGRA -> RGBA swap
            // バッファをテクスチャにコピー（BGRA -> RGBA の R/B スワップ）
            let src = buffer.as_ptr();
            let dst = mapped.pData as *mut u8;
            let row_pitch = (width as usize) * 4;
            let dst_pitch = mapped.RowPitch as usize;

            // Fast path when aligned to 4 bytes
            let aligned = (src as usize & 3) == 0
                && (dst as usize & 3) == 0
                && (row_pitch & 3) == 0
                && (dst_pitch & 3) == 0;

            if aligned {
                for y in 0..height {
                    let src_row = src.add((y as usize) * row_pitch) as *const u32;
                    let dst_row = dst.add((y as usize) * dst_pitch) as *mut u32;

                    for x in 0..width {
                        let v = *src_row.add(x as usize);
                        // v is AARRGGBB (little-endian bytes: B,G,R,A)
                        // swap R and B => AABBGGRR (bytes: R,G,B,A)
                        let rb_swapped = (v & 0xFF00FF00)
                            | ((v & 0x00FF0000) >> 16)
                            | ((v & 0x000000FF) << 16);
                        *dst_row.add(x as usize) = rb_swapped;
                    }
                }
            } else {
                // Safe fallback for unaligned pointers
                for y in 0..height {
                    let src_row = src.add((y as usize) * row_pitch);
                    let dst_row = dst.add((y as usize) * dst_pitch);

                    for x in 0..width {
                        let p = src_row.add((x as usize) * 4);
                        let d = dst_row.add((x as usize) * 4);

                        // BGRA -> RGBA
                        *d.add(0) = *p.add(2);
                        *d.add(1) = *p.add(1);
                        *d.add(2) = *p.add(0);
                        *d.add(3) = *p.add(3);
                    }
                }
            }

            d3d11.context.Unmap(texture, 0);

            // Set overlay texture using SetOverlayTexture / SetOverlayTextureを使用してオーバーレイテクスチャを設定
            // Get raw pointer for OpenVR / OpenVR用の生ポインタを取得
            let texture_ptr = texture.as_raw();

            let mut vr_texture = vr::Texture_t {
                handle: texture_ptr as *mut std::ffi::c_void,
                eType: vr::ETextureType_TextureType_DirectX,
                eColorSpace: vr::EColorSpace_ColorSpace_Auto,
            };

            let err = set_texture_fn(handle, &mut vr_texture);

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!(
                    "SetOverlayTexture failed: {:?}",
                    err
                )));
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
            let err = get_transform_type_fn(handle, &mut transform_type);

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!(
                    "GetOverlayTransformType failed: {:?}",
                    err
                )));
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

            let err = get_transform_fn(handle, &mut device_index, &mut transform);

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!(
                    "GetOverlayTransformTrackedDeviceRelative failed: {:?}",
                    err
                )));
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

        let mut poses = self.poses_cache.borrow_mut();
        let pose_count = vr::k_unMaxTrackedDeviceCount as usize;
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
    pub fn compute_overlay_intersection(
        &self,
        handle: i64,
        source: Vec<f64>,
        direction: Vec<f64>,
    ) -> napi::Result<Option<IntersectionResult>> {
        let overlay = self.overlay();
        let compute_intersection_fn = require_fn(
            overlay.ComputeOverlayIntersection,
            "ComputeOverlayIntersection",
        )?;
        let handle = overlay_handle(handle)?;
        let source = vec3_f32("source", &source)?;
        let direction = vec3_f32("direction", &direction)?;
        unsafe {
            let mut params = vr::VROverlayIntersectionParams_t {
                vSource: vr::HmdVector3_t { v: source },
                vDirection: vr::HmdVector3_t { v: direction },
                eOrigin: vr::ETrackingUniverseOrigin_TrackingUniverseStanding,
            };

            let mut results = vr::VROverlayIntersectionResults_t {
                vPoint: vr::HmdVector3_t { v: [0.0; 3] },
                vNormal: vr::HmdVector3_t { v: [0.0; 3] },
                vUVs: vr::HmdVector2_t { v: [0.0; 2] },
                fDistance: 0.0,
            };

            let success =
                compute_intersection_fn(handle, &mut params, &mut results);

            if success {
                Ok(Some(IntersectionResult {
                    x: results.vPoint.v[0] as f64,
                    y: results.vPoint.v[1] as f64,
                    z: results.vPoint.v[2] as f64,
                    u: results.vUVs.v[0] as f64,
                    v: results.vUVs.v[1] as f64,
                    distance: results.fDistance as f64,
                }))
            } else {
                Ok(None)
            }
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

            // Button bitmask constants
            const BUTTON_TRIGGER: u64 = 1u64 << 33; // k_EButton_SteamVR_Trigger
            const BUTTON_GRIP: u64 = 1u64 << 2; // k_EButton_Grip
            const BUTTON_TOUCHPAD: u64 = 1u64 << 32; // k_EButton_SteamVR_Touchpad
            const BUTTON_JOYSTICK: u64 = 1u64 << 34; // k_EButton_Axis2 (often joystick click)

            // Axis indices
            const AXIS_TRIGGER: usize = 1;
            const AXIS_TOUCHPAD: usize = 0;
            const AXIS_JOYSTICK: usize = 2;

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

