use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use openvr_sys as vr;
use std::ffi::{c_char, CString};

use windows::core::Interface;

use super::buffers::{expected_rgba_size, row_pitch_bytes};
use super::constants::BYTES_PER_PIXEL;
use super::errors::{overlay_error, overlay_error_message, require_fn};
use super::handles::overlay_handle;
use super::manager::OverlayManager;

#[napi]
impl OverlayManager {
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
            let err = set_from_file_fn(handle.as_u64(), c_path.as_ptr() as *mut c_char);

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(napi::Error::from_reason(format!(
                    "SetOverlayFromFile failed: {} (code: {:?}, path: {})",
                    overlay_error_message(overlay, err),
                    err,
                    file_path
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
        if width == 0 || height == 0 {
            return Ok(());
        }
        let overlay = self.overlay();
        let set_raw_fn = require_fn(overlay.SetOverlayRaw, "SetOverlayRaw")?;
        let handle = overlay_handle(handle)?;
        unsafe {
            // Buffer is RGBA, 4 bytes per pixel / バッファはRGBA、ピクセルあたり4バイト
            // Note: Electron capturePage().toBitmap() on Windows is typically BGRA.
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
                handle.as_u64(),
                buffer.as_ptr() as *mut std::ffi::c_void,
                width,
                height,
                BYTES_PER_PIXEL,
            );

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(overlay_error("SetOverlayRaw", overlay, err));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn set_overlay_textures_d3d11(
        &mut self,
        front_handle: i64,
        back_handle: i64,
        buffer: Buffer,
        width: u32,
        height: u32,
    ) -> napi::Result<()> {
        // Set overlay texture using D3D11 shared texture / D3D11共有テクスチャを使用してオーバーレイテクスチャを設定
        // This bypasses file I/O completely and uses GPU memory / ファイルI/Oを完全にバイパスし、GPUメモリを使用
        if width == 0 || height == 0 {
            return Ok(());
        }
        let overlay_ptr = self.overlay_ptr();
        let set_texture_fn = {
            let overlay = unsafe { overlay_ptr.as_ref() };
            require_fn(overlay.SetOverlayTexture, "SetOverlayTexture")?
        };
        let front_handle = overlay_handle(front_handle)?;
        let back_handle = overlay_handle(back_handle)?;
        let d3d11 = self
            .d3d11_mut()
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

            let row_pitch = row_pitch_bytes(width)?;

            // Recreate texture/pipeline resources if size changed / サイズが変わった場合はリソースを再作成
            d3d11.ensure_resources(width, height)?;
            let texture = d3d11
                .output_texture()
                .ok_or_else(|| napi::Error::from_reason("D3D11 output texture not available"))?
                .clone();

            // Upload BGRA bytes and run GPU conversion pass
            d3d11.upload_bgra_buffer(buffer.as_ptr(), row_pitch, width, height)?;
            d3d11.convert_bgra_to_rgba(width, height)?;

            // Set overlay texture using SetOverlayTexture / SetOverlayTextureを使用してオーバーレイテクスチャを設定
            // Get raw pointer for OpenVR / OpenVR用の生ポインタを取得
            let texture_ptr = texture.as_raw();

            let mut vr_texture = vr::Texture_t {
                handle: texture_ptr,
                eType: vr::ETextureType_TextureType_DirectX,
                eColorSpace: vr::EColorSpace_ColorSpace_Auto,
            };

            let err = set_texture_fn(front_handle.as_u64(), &mut vr_texture);

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(overlay_error(
                    "SetOverlayTexture",
                    overlay_ptr.as_ref(),
                    err,
                ));
            }

            if back_handle.as_u64() != 0 {
                let err = set_texture_fn(back_handle.as_u64(), &mut vr_texture);
                if err != vr::EVROverlayError_VROverlayError_None {
                    return Err(overlay_error(
                        "SetOverlayTexture(back)",
                        overlay_ptr.as_ref(),
                        err,
                    ));
                }
            }
        }
        Ok(())
    }
}
