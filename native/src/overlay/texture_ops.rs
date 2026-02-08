use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use openvr_sys as vr;
use std::ffi::{c_char, CString};

use windows::core::Interface;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_WRITE_DISCARD, ID3D11Resource,
};

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
    pub fn set_overlay_texture_d3d11(
        &mut self,
        handle: i64,
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
        let handle = overlay_handle(handle)?;
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

            // Recreate texture if size changed / サイズが変わった場合はテクスチャを再作成
            d3d11.ensure_texture(width, height)?;
            let texture = d3d11
                .texture
                .as_ref()
                .ok_or_else(|| {
                    napi::Error::from_reason("D3D11 texture not available after creation")
                })?
                .clone();
            let resource: ID3D11Resource = texture.cast().map_err(|e| {
                napi::Error::from_reason(format!("Texture cast to ID3D11Resource failed: {:?}", e))
            })?;

            // Update texture data / テクスチャデータを更新
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            d3d11
                .context
                .Map(&resource, 0, D3D11_MAP_WRITE_DISCARD, 0, Some(&mut mapped))
                .map_err(|e| napi::Error::from_reason(format!("Map failed: {:?}", e)))?;

            // Copy buffer to texture with BGRA -> RGBA swap
            // バッファをテクスチャにコピー（BGRA -> RGBA の R/B スワップ）
            let src = buffer.as_ptr();
            let dst = mapped.pData as *mut u8;
            let dst_pitch = mapped.RowPitch as usize;
            if dst.is_null() {
                d3d11.context.Unmap(&resource, 0);
                return Err(napi::Error::from_reason("Mapped texture pointer is null"));
            }
            if dst_pitch < row_pitch {
                d3d11.context.Unmap(&resource, 0);
                return Err(napi::Error::from_reason(
                    "Mapped row pitch is smaller than source row size",
                ));
            }
            if (height as usize).checked_mul(dst_pitch).is_none() {
                d3d11.context.Unmap(&resource, 0);
                return Err(napi::Error::from_reason("Row pitch overflow"));
            }

            // Fast path when aligned to 4 bytes
            let aligned = (src as usize & 3) == 0
                && (dst as usize & 3) == 0
                && (row_pitch & 3) == 0
                && (dst_pitch & 3) == 0;

            if aligned {
                for y in 0..height {
                    let src_row = src.add((y as usize) * row_pitch) as *const u32;
                    let dst_row = dst.add((y as usize) * dst_pitch) as *mut u32;

                    let src_slice = std::slice::from_raw_parts(src_row, width as usize);
                    let dst_slice = std::slice::from_raw_parts_mut(dst_row, width as usize);

                    for (v, d) in src_slice.iter().zip(dst_slice.iter_mut()) {
                        // v is AARRGGBB (little-endian bytes: B,G,R,A)
                        // swap R and B => AABBGGRR (bytes: R,G,B,A)
                        let rb_swapped = (*v & 0xFF00FF00)
                            | ((*v & 0x00FF0000) >> 16)
                            | ((*v & 0x000000FF) << 16);
                        *d = rb_swapped;
                    }
                }
            } else {
                // Safe fallback for unaligned pointers
                for y in 0..height {
                    let src_ptr = src.add((y as usize) * row_pitch);
                    let dst_ptr = dst.add((y as usize) * dst_pitch);

                    let row_len = (width as usize) * (BYTES_PER_PIXEL as usize);
                    let src_slice = std::slice::from_raw_parts(src_ptr, row_len);
                    let dst_slice = std::slice::from_raw_parts_mut(dst_ptr, row_len);

                    for (s, d) in src_slice.chunks_exact(4).zip(dst_slice.chunks_exact_mut(4)) {
                        // BGRA -> RGBA
                        d[0] = s[2];
                        d[1] = s[1];
                        d[2] = s[0];
                        d[3] = s[3];
                    }
                }
            }

            d3d11.context.Unmap(&resource, 0);

            // Set overlay texture using SetOverlayTexture / SetOverlayTextureを使用してオーバーレイテクスチャを設定
            // Get raw pointer for OpenVR / OpenVR用の生ポインタを取得
            let texture_ptr = texture.as_raw();

            let mut vr_texture = vr::Texture_t {
                handle: texture_ptr,
                eType: vr::ETextureType_TextureType_DirectX,
                eColorSpace: vr::EColorSpace_ColorSpace_Auto,
            };

            let err = set_texture_fn(handle.as_u64(), &mut vr_texture);

            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(overlay_error(
                    "SetOverlayTexture",
                    overlay_ptr.as_ref(),
                    err,
                ));
            }
        }
        Ok(())
    }
}
