use napi_derive::napi;
use napi::bindgen_prelude::*;
use std::ffi::CString;
use std::cell::RefCell;
use openvr_sys as vr;

// DirectX11 imports / DirectX11インポート
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
    D3D11_BIND_SHADER_RESOURCE, D3D11_CPU_ACCESS_WRITE, D3D11_CREATE_DEVICE_FLAG,
    D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_WRITE_DISCARD, D3D11_SDK_VERSION,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_DYNAMIC,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::core::Interface;

struct VrContext {
    system: *mut vr::VR_IVRSystem_FnTable,
    overlay: *mut vr::VR_IVROverlay_FnTable,
}

// D3D11 context for texture management / テクスチャ管理用のD3D11コンテキスト
struct D3D11Context {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    texture: Option<ID3D11Texture2D>,
    texture_width: u32,
    texture_height: u32,
}

unsafe impl Send for VrContext {}
unsafe impl Sync for VrContext {}
unsafe impl Send for D3D11Context {}
unsafe impl Sync for D3D11Context {}

#[napi]
pub struct OverlayManager {
    context: VrContext,
    d3d11: Option<RefCell<D3D11Context>>,
}

#[napi]
impl OverlayManager {
    #[napi(constructor)]
    pub fn new() -> napi::Result<Self> {
        let mut error = vr::EVRInitError_VRInitError_None;
        unsafe {
            if !vr::VR_IsHmdPresent() {
                 return Err(napi::Error::from_reason("VR Headset not found"));
            }

            // Use VR_InitInternal instead of VR_Init (return value ignored) // VR_InitではなくVR_InitInternalを使用 (戻り値はSystemのトークンだが今回は無視)
            // C++ API VR_Init is helper, C API uses InitInternal // C++ APIでは VR_Init はヘルパー関数だが、C API (openvr_sys) では InitInternal を呼ぶ
            vr::VR_InitInternal(&mut error, vr::EVRApplicationType_VRApplication_Overlay);
            
            if error != vr::EVRInitError_VRInitError_None {
                 return Err(napi::Error::from_reason(format!("VR_Init failed: {:?}", error)));
            }

            // Get IVROverlay interface // IVROverlay interface取得
            // C bindings require FnTable_ prefix for function table access
            // CバインディングではFnTable_プレフィックスが必要
            let overlay_ver = CString::new("FnTable:IVROverlay_028").unwrap();
            let mut error = vr::EVRInitError_VRInitError_None;
            let overlay_ptr = vr::VR_GetGenericInterface(overlay_ver.as_ptr(), &mut error) as *mut vr::VR_IVROverlay_FnTable;
            
            if overlay_ptr.is_null() || error != vr::EVRInitError_VRInitError_None {
                 return Err(napi::Error::from_reason("Failed to get IVROverlay interface"));
            }
            
            // Get IVRSystem interface // IVRSystem interface取得 (必要であれば)
            let system_ver = CString::new("FnTable:IVRSystem_023").unwrap(); // bindings.rsより
            let mut error = vr::EVRInitError_VRInitError_None;
            let system_ptr = vr::VR_GetGenericInterface(system_ver.as_ptr(), &mut error) as *mut vr::VR_IVRSystem_FnTable;

             if system_ptr.is_null() {
                 // System interface is not mandatory but kept // Systemインターフェースは必須ではないが取っておく
                 // Error handling omitted // エラーハンドリングは省略
            }

            // Initialize D3D11 device for texture sharing / テクスチャ共有用のD3D11デバイスを初期化
            let d3d11_ctx = Self::init_d3d11().ok().map(|ctx| RefCell::new(ctx));

            Ok(OverlayManager {
                context: VrContext {
                    system: system_ptr,
                    overlay: overlay_ptr,
                },
                d3d11: d3d11_ctx,
            })
        }
    }

    // Initialize D3D11 device and context / D3D11デバイスとコンテキストを初期化
    fn init_d3d11() -> napi::Result<D3D11Context> {
        unsafe {
            let mut device: Option<ID3D11Device> = None;
            let mut context: Option<ID3D11DeviceContext> = None;

            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_HARDWARE,
                None,
                D3D11_CREATE_DEVICE_FLAG(0),
                None,
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            ).map_err(|e| napi::Error::from_reason(format!("D3D11CreateDevice failed: {:?}", e)))?;

            let device = device.ok_or_else(|| napi::Error::from_reason("D3D11 device is null"))?;
            let context = context.ok_or_else(|| napi::Error::from_reason("D3D11 context is null"))?;

            Ok(D3D11Context {
                device,
                context,
                texture: None,
                texture_width: 0,
                texture_height: 0,
            })
        }
    }

    #[napi]
    pub fn create_overlay(&self, key: String, name: String) -> napi::Result<i64> {
        let c_key = CString::new(key).unwrap();
        let c_name = CString::new(name).unwrap();
        let mut handle = vr::k_ulOverlayHandleInvalid;

        unsafe {
            if self.context.overlay.is_null() {
                return Err(napi::Error::from_reason("Overlay interface is null"));
            }
            let create_overlay_fn = (*self.context.overlay).CreateOverlay
                .ok_or_else(|| napi::Error::from_reason("CreateOverlay function not available"))?;
            let err = create_overlay_fn(c_key.as_ptr() as *mut i8, c_name.as_ptr() as *mut i8, &mut handle);
            
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("CreateOverlay failed: {:?}", err)));
            }
        }

        // u64 -> i64 cast (Napi compatibility)
        Ok(handle as i64)
    }

    #[napi]
    pub fn show_overlay(&self, handle: i64) -> napi::Result<()> {
        unsafe {
            if self.context.overlay.is_null() {
                return Err(napi::Error::from_reason("Overlay interface is null"));
            }
            let show_overlay_fn = (*self.context.overlay).ShowOverlay
                .ok_or_else(|| napi::Error::from_reason("ShowOverlay function not available"))?;
            let err = show_overlay_fn(handle as u64);
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("ShowOverlay failed: {:?}", err)));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn hide_overlay(&self, handle: i64) -> napi::Result<()> {
        unsafe {
            if self.context.overlay.is_null() {
                return Err(napi::Error::from_reason("Overlay interface is null"));
            }
            let hide_overlay_fn = (*self.context.overlay).HideOverlay
                .ok_or_else(|| napi::Error::from_reason("HideOverlay function not available"))?;
            let err = hide_overlay_fn(handle as u64);
             if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("HideOverlay failed: {:?}", err)));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn set_overlay_width(&self, handle: i64, width_meters: f64) -> napi::Result<()> {
        unsafe {
            if self.context.overlay.is_null() {
                return Err(napi::Error::from_reason("Overlay interface is null"));
            }
            let set_width_fn = (*self.context.overlay).SetOverlayWidthInMeters
                .ok_or_else(|| napi::Error::from_reason("SetOverlayWidthInMeters not available"))?;
            let err = set_width_fn(handle as u64, width_meters as f32);
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("SetOverlayWidthInMeters failed: {:?}", err)));
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
        unsafe {
            if self.context.overlay.is_null() {
                return Err(napi::Error::from_reason("Overlay interface is null"));
            }

            let set_bounds_fn = (*self.context.overlay).SetOverlayTextureBounds
                .ok_or_else(|| napi::Error::from_reason("SetOverlayTextureBounds not available"))?;

            let mut bounds = vr::VRTextureBounds_t {
                uMin: u_min as f32,
                vMin: v_min as f32,
                uMax: u_max as f32,
                vMax: v_max as f32,
            };

            let err = set_bounds_fn(handle as u64, &mut bounds);
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
        unsafe {
            if self.context.overlay.is_null() {
                return Err(napi::Error::from_reason("Overlay interface is null"));
            }
            
            // Create transform matrix: position overlay `distance` meters in front of HMD
            // 変換行列を作成: HMDの前方`distance`メートルにオーバーレイを配置
            let mut transform = vr::HmdMatrix34_t {
                m: [
                    [1.0, 0.0, 0.0, 0.0],           // X axis
                    [0.0, 1.0, 0.0, 0.0],           // Y axis
                    [0.0, 0.0, 1.0, -(distance as f32)], // Z axis (negative = in front)
                ]
            };
            
            let set_transform_fn = (*self.context.overlay).SetOverlayTransformTrackedDeviceRelative
                .ok_or_else(|| napi::Error::from_reason("SetOverlayTransformTrackedDeviceRelative not available"))?;
            
            // k_unTrackedDeviceIndex_Hmd = 0 (HMD device index)
            let err = set_transform_fn(handle as u64, 0, &mut transform);
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("SetOverlayTransformTrackedDeviceRelative failed: {:?}", err)));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn get_overlay_transform_absolute(&self, handle: i64) -> napi::Result<Vec<f64>> {
        unsafe {
            if self.context.overlay.is_null() {
                return Err(napi::Error::from_reason("Overlay interface is null"));
            }

            let get_transform_fn = (*self.context.overlay).GetOverlayTransformAbsolute
                .ok_or_else(|| napi::Error::from_reason("GetOverlayTransformAbsolute not available"))?;

            let mut origin = vr::ETrackingUniverseOrigin_TrackingUniverseStanding;
            let mut transform = vr::HmdMatrix34_t {
                m: [[0.0; 4]; 3]
            };

            let err = get_transform_fn(handle as u64, &mut origin, &mut transform);
            
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("GetOverlayTransformAbsolute failed: {:?}", err)));
            }

            // Convert 3x4 to 4x4 flattened (Row-Major for JS)
            let m = transform.m;
            let matrix = vec![
                m[0][0] as f64, m[0][1] as f64, m[0][2] as f64, m[0][3] as f64,
                m[1][0] as f64, m[1][1] as f64, m[1][2] as f64, m[1][3] as f64,
                m[2][0] as f64, m[2][1] as f64, m[2][2] as f64, m[2][3] as f64,
                0.0,            0.0,            0.0,            1.0
            ];
            
            Ok(matrix)
        }
    }

    #[napi]
    pub fn set_overlay_transform_absolute(&self, handle: i64, matrix: Vec<f64>) -> napi::Result<()> {
        unsafe {
             if self.context.overlay.is_null() {
                return Err(napi::Error::from_reason("Overlay interface is null"));
            }
            
            if matrix.len() != 16 {
                return Err(napi::Error::from_reason("Matrix must have 16 elements"));
            }

            let set_transform_fn = (*self.context.overlay).SetOverlayTransformAbsolute
                .ok_or_else(|| napi::Error::from_reason("SetOverlayTransformAbsolute not available"))?;

            let transform = vr::HmdMatrix34_t {
                m: [
                    [matrix[0] as f32, matrix[1] as f32, matrix[2] as f32, matrix[3] as f32],
                    [matrix[4] as f32, matrix[5] as f32, matrix[6] as f32, matrix[7] as f32],
                    [matrix[8] as f32, matrix[9] as f32, matrix[10] as f32, matrix[11] as f32],
                ]
            };

            // Calculate inverse to correct OpenVR's expectation? 
            // Actually SetOverlayTransformAbsolute takes the transform from TrackingOrigin to Overlay.
            // If the matrix provided is the world transform of the overlay, it should be correct directly.

            let err = set_transform_fn(
                handle as u64, 
                vr::ETrackingUniverseOrigin_TrackingUniverseStanding, 
                &transform as *const _ as *mut _
            );

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("SetOverlayTransformAbsolute failed: {:?}", err)));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn set_overlay_from_file(&self, handle: i64, file_path: String) -> napi::Result<()> {
        // Set overlay texture from image file (PNG, JPG, etc.)
        // 画像ファイルからテクスチャを設定 (PNG, JPG等)
        let c_path = CString::new(file_path.clone()).unwrap();
        
        unsafe {
            if self.context.overlay.is_null() {
                return Err(napi::Error::from_reason("Overlay interface is null"));
            }
            
            let set_from_file_fn = (*self.context.overlay).SetOverlayFromFile
                .ok_or_else(|| napi::Error::from_reason("SetOverlayFromFile not available"))?;
            
            let err = set_from_file_fn(handle as u64, c_path.as_ptr() as *mut i8);
            
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("SetOverlayFromFile failed: {:?} (path: {})", err, file_path)));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn set_overlay_raw(&self, handle: i64, buffer: Buffer, width: u32, height: u32) -> napi::Result<()> {
        // Set overlay texture from raw RGBA buffer / RGBAバッファからテクスチャを設定
        // Buffer from Electron's capturePage().toBitmap() / ElectronのcapturePage().toBitmap()からのバッファ
        unsafe {
            if self.context.overlay.is_null() {
                return Err(napi::Error::from_reason("Overlay interface is null"));
            }
            
            let set_raw_fn = (*self.context.overlay).SetOverlayRaw
                .ok_or_else(|| napi::Error::from_reason("SetOverlayRaw not available"))?;
            
            // Buffer is RGBA, 4 bytes per pixel / バッファはRGBA、ピクセルあたり4バイト
            let bytes_per_pixel: u32 = 4;
            let expected_size = (width * height * bytes_per_pixel) as usize;
            
            if buffer.len() != expected_size {
                return Err(napi::Error::from_reason(format!(
                    "Buffer size mismatch: expected {} bytes ({}x{}x4), got {} bytes",
                    expected_size, width, height, buffer.len()
                )));
            }
            
            let err = set_raw_fn(
                handle as u64,
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
    pub fn set_overlay_texture_d3d11(&self, handle: i64, buffer: Buffer, width: u32, height: u32) -> napi::Result<()> {
        // Set overlay texture using D3D11 shared texture / D3D11共有テクスチャを使用してオーバーレイテクスチャを設定
        // This bypasses file I/O completely and uses GPU memory / ファイルI/Oを完全にバイパスし、GPUメモリを使用
        unsafe {
            if self.context.overlay.is_null() {
                return Err(napi::Error::from_reason("Overlay interface is null"));
            }

            let d3d11_ref = self.d3d11.as_ref()
                .ok_or_else(|| napi::Error::from_reason("D3D11 context not initialized"))?;
            
            let mut d3d11 = d3d11_ref.borrow_mut();

            // Buffer is RGBA, 4 bytes per pixel / バッファはRGBA、ピクセルあたり4バイト
            let expected_size = (width * height * 4) as usize;
            if buffer.len() != expected_size {
                return Err(napi::Error::from_reason(format!(
                    "Buffer size mismatch: expected {} bytes ({}x{}x4), got {} bytes",
                    expected_size, width, height, buffer.len()
                )));
            }

            // Recreate texture if size changed / サイズが変わった場合はテクスチャを再作成
            if d3d11.texture.is_none() || d3d11.texture_width != width || d3d11.texture_height != height {
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
                d3d11.device.CreateTexture2D(&desc, None, Some(&mut texture))
                    .map_err(|e| napi::Error::from_reason(format!("CreateTexture2D failed: {:?}", e)))?;

                d3d11.texture = texture;
                d3d11.texture_width = width;
                d3d11.texture_height = height;
            }

            // Update texture data / テクスチャデータを更新
            let texture = d3d11.texture.as_ref().unwrap();
            
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            d3d11.context.Map(texture, 0, D3D11_MAP_WRITE_DISCARD, 0, Some(&mut mapped))
                .map_err(|e| napi::Error::from_reason(format!("Map failed: {:?}", e)))?;

            // Copy buffer to texture with BGRA -> RGBA swap
            // バッファをテクスチャにコピー（BGRA -> RGBA の R/B スワップ）
            let src = buffer.as_ptr();
            let dst = mapped.pData as *mut u8;
            let row_pitch = (width * 4) as usize;
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
            let set_texture_fn = (*self.context.overlay).SetOverlayTexture
                .ok_or_else(|| napi::Error::from_reason("SetOverlayTexture not available"))?;

            // Get raw pointer for OpenVR / OpenVR用の生ポインタを取得
            let texture_ptr = texture.as_raw();

            let vr_texture = vr::Texture_t {
                handle: texture_ptr as *mut std::ffi::c_void,
                eType: vr::ETextureType_TextureType_DirectX,
                eColorSpace: vr::EColorSpace_ColorSpace_Auto,
            };

            let err = set_texture_fn(handle as u64, &vr_texture as *const _ as *mut _);

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("SetOverlayTexture failed: {:?}", err)));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn get_overlay_transform_type(&self, handle: i64) -> napi::Result<u32> {
        unsafe {
             if self.context.overlay.is_null() {
                return Err(napi::Error::from_reason("Overlay interface is null"));
            }
            let get_transform_type_fn = (*self.context.overlay).GetOverlayTransformType
                .ok_or_else(|| napi::Error::from_reason("GetOverlayTransformType not available"))?;
            
            let mut transform_type = vr::VROverlayTransformType_VROverlayTransform_Absolute;
            let err = get_transform_type_fn(handle as u64, &mut transform_type);
            
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("GetOverlayTransformType failed: {:?}", err)));
            }
            
            Ok(transform_type as u32)
        }
    }

    #[napi]
    pub fn get_overlay_transform_relative(&self, handle: i64) -> napi::Result<OverlayRelativeTransform> {
        unsafe {
             if self.context.overlay.is_null() {
                return Err(napi::Error::from_reason("Overlay interface is null"));
            }
            let get_transform_fn = (*self.context.overlay).GetOverlayTransformTrackedDeviceRelative
                .ok_or_else(|| napi::Error::from_reason("GetOverlayTransformTrackedDeviceRelative not available"))?;
            
            let mut device_index = 0;
            let mut transform = vr::HmdMatrix34_t { m: [[0.0; 4]; 3] };
            
            let err = get_transform_fn(handle as u64, &mut device_index, &mut transform);
            
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!("GetOverlayTransformTrackedDeviceRelative failed: {:?}", err)));
            }
            
            let m = transform.m;
            let matrix = vec![
                m[0][0] as f64, m[0][1] as f64, m[0][2] as f64, m[0][3] as f64,
                m[1][0] as f64, m[1][1] as f64, m[1][2] as f64, m[1][3] as f64,
                m[2][0] as f64, m[2][1] as f64, m[2][2] as f64, m[2][3] as f64,
                0.0,            0.0,            0.0,            1.0
            ];
            
            Ok(OverlayRelativeTransform {
                trackedDeviceIndex: device_index,
                transform: matrix
            })
        }
    }

    #[napi]
    pub fn get_controller_ids(&self) -> napi::Result<Vec<u32>> {
        // Get valid controller indices / 有効なコントローラーインデックスを取得
        let mut controllers = Vec::new();
        unsafe {
            if self.context.system.is_null() {
                return Err(napi::Error::from_reason("System interface is null"));
            }
            
            let get_class_fn = (*self.context.system).GetTrackedDeviceClass
                .ok_or_else(|| napi::Error::from_reason("GetTrackedDeviceClass not available"))?;
                
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
        unsafe {
            if self.context.system.is_null() {
                return Err(napi::Error::from_reason("System interface is null"));
            }
            
            let get_pose_fn = (*self.context.system).GetDeviceToAbsoluteTrackingPose
                .ok_or_else(|| napi::Error::from_reason("GetDeviceToAbsoluteTrackingPose not available"))?;
                
            // Getting generic tracker pose
            // OpenVR API gets array of poses.
            
            let mut poses_array: Vec<vr::TrackedDevicePose_t> = vec![std::mem::zeroed(); vr::k_unMaxTrackedDeviceCount as usize];
            
            get_pose_fn(
                vr::ETrackingUniverseOrigin_TrackingUniverseStanding,
                0.0,
                poses_array.as_mut_ptr(),
                vr::k_unMaxTrackedDeviceCount,
            );
            
            if index >= vr::k_unMaxTrackedDeviceCount {
                 return Err(napi::Error::from_reason("Invalid device index"));
            }
            
            let pose = &poses_array[index as usize];
            if !pose.bPoseIsValid {
                 return Ok(vec![]); // Valid but not tracking / 有効だがトラッキングされていない
            }
            
            let m = pose.mDeviceToAbsoluteTracking.m;
            // Convert 3x4 to 4x4 flattened (column-major for WebGL/Three.js usually? No, let's return row-major and handle in JS)
            // Three.js Matrix4.set() takes row-major (n11, n12, n13, n14, ...)
            
            let matrix = vec![
                m[0][0] as f64, m[0][1] as f64, m[0][2] as f64, m[0][3] as f64,
                m[1][0] as f64, m[1][1] as f64, m[1][2] as f64, m[1][3] as f64,
                m[2][0] as f64, m[2][1] as f64, m[2][2] as f64, m[2][3] as f64,
                0.0,            0.0,            0.0,            1.0
            ];
            
            Ok(matrix)
        }
    }

    #[napi]
    pub fn compute_overlay_intersection(&self, handle: i64, source: Vec<f64>, direction: Vec<f64>) -> napi::Result<Option<IntersectionResult>> {
        unsafe {
            if self.context.overlay.is_null() {
                return Err(napi::Error::from_reason("Overlay interface is null"));
            }
            
            let compute_intersection_fn = (*self.context.overlay).ComputeOverlayIntersection
                .ok_or_else(|| napi::Error::from_reason("ComputeOverlayIntersection not available"))?;
                
            let mut params = vr::VROverlayIntersectionParams_t {
                vSource: vr::HmdVector3_t { v: [source[0] as f32, source[1] as f32, source[2] as f32] },
                vDirection: vr::HmdVector3_t { v: [direction[0] as f32, direction[1] as f32, direction[2] as f32] },
                eOrigin: vr::ETrackingUniverseOrigin_TrackingUniverseStanding,
            };
            
            let mut results = vr::VROverlayIntersectionResults_t {
                vPoint: vr::HmdVector3_t { v: [0.0; 3] },
                vNormal: vr::HmdVector3_t { v: [0.0; 3] },
                vUVs: vr::HmdVector2_t { v: [0.0; 2] },
                fDistance: 0.0,
            };
            
            let success = compute_intersection_fn(
                handle as u64,
                &mut params,
                &mut results
            );
            
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
        unsafe {
            if self.context.system.is_null() {
                return Err(napi::Error::from_reason("System interface is null"));
            }

            let get_controller_state_fn = (*self.context.system).GetControllerState
                .ok_or_else(|| napi::Error::from_reason("GetControllerState not available"))?;

            let mut state: vr::VRControllerState_t = std::mem::zeroed();
            let success = get_controller_state_fn(
                controller_index,
               &mut state,
                std::mem::size_of::<vr::VRControllerState_t>() as u32,
            );

            if !success {
                return Ok(ControllerState {
                    trigger_pressed: false,
                    trigger_value: 0.0,
                    grip_pressed: false,
                    touchpad_pressed: false,
                    touchpad_x: 0.0,
                    touchpad_y: 0.0,
                    joystick_pressed: false,
                    joystick_x: 0.0,
                    joystick_y: 0.0,
                });
            }

            // Button bitmask constants
            const BUTTON_TRIGGER: u64 = 1u64 << 33; // k_EButton_SteamVR_Trigger
            const BUTTON_GRIP: u64 = 1u64 << 2;     // k_EButton_Grip
            const BUTTON_TOUCHPAD: u64 = 1u64 << 32; // k_EButton_SteamVR_Touchpad
            const BUTTON_JOYSTICK: u64 = 1u64 << 34; // k_EButton_Axis2 (often joystick click)

            // Axis indices
            const AXIS_TRIGGER: usize = 1;
            const AXIS_TOUCHPAD: usize = 0;
            const AXIS_JOYSTICK: usize = 2;

            Ok(ControllerState {
                trigger_pressed: (state.ulButtonPressed & BUTTON_TRIGGER) != 0,
                trigger_value: state.rAxis[AXIS_TRIGGER].x as f64,
                grip_pressed: (state.ulButtonPressed & BUTTON_GRIP) != 0,
                touchpad_pressed: (state.ulButtonPressed & BUTTON_TOUCHPAD) != 0,
                touchpad_x: state.rAxis[AXIS_TOUCHPAD].x as f64,
                touchpad_y: state.rAxis[AXIS_TOUCHPAD].y as f64,
                joystick_pressed: (state.ulButtonPressed & BUTTON_JOYSTICK) != 0,
                joystick_x: state.rAxis[AXIS_JOYSTICK].x as f64,
                joystick_y: state.rAxis[AXIS_JOYSTICK].y as f64,
            })
        }
    }
}

#[napi(object)]
pub struct IntersectionResult {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub u: f64,
    pub v: f64,
    pub distance: f64,
}

#[napi(object)]
pub struct ControllerState {
    pub trigger_pressed: bool,
    pub trigger_value: f64,
    pub grip_pressed: bool,
    pub touchpad_pressed: bool,
    pub touchpad_x: f64,
    pub touchpad_y: f64,
    pub joystick_pressed: bool,
    pub joystick_x: f64,
    pub joystick_y: f64,
}

#[napi(object)]
pub struct OverlayRelativeTransform {
    pub trackedDeviceIndex: u32,
    pub transform: Vec<f64>, // 4x4 flattened
}

