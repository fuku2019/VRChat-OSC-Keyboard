use napi_derive::napi;
use openvr_sys as vr;
use std::ffi::{c_char, CString};

use super::errors::{overlay_error, require_fn};
use super::handles::{overlay_handle, OverlayHandle};
use super::manager::OverlayManager;
use super::math::vec3_f32;
use super::types::IntersectionResult;

#[napi]
impl OverlayManager {
    #[napi]
    pub fn create_overlay(&self, key: String, name: String) -> napi::Result<i64> {
        let c_key = CString::new(key)
            .map_err(|_| napi::Error::from_reason("Overlay key contains null byte"))?;
        let c_name = CString::new(name)
            .map_err(|_| napi::Error::from_reason("Overlay name contains null byte"))?;
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
                return Err(overlay_error("CreateOverlay", overlay, err));
            }
        }

        // u64 -> i64 cast (Napi compatibility)
        OverlayHandle::from_u64(handle).to_i64()
    }

    #[napi]
    pub fn destroy_overlay(&self, handle: i64) -> napi::Result<()> {
        let overlay = self.overlay();
        let destroy_overlay_fn = require_fn(overlay.DestroyOverlay, "DestroyOverlay")?;
        let handle = overlay_handle(handle)?;
        unsafe {
            let err = destroy_overlay_fn(handle.as_u64());
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(overlay_error("DestroyOverlay", overlay, err));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn show_overlay(&self, handle: i64) -> napi::Result<()> {
        let overlay = self.overlay();
        let show_overlay_fn = require_fn(overlay.ShowOverlay, "ShowOverlay")?;
        let handle = overlay_handle(handle)?;
        unsafe {
            let err = show_overlay_fn(handle.as_u64());
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(overlay_error("ShowOverlay", overlay, err));
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
            let err = hide_overlay_fn(handle.as_u64());
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(overlay_error("HideOverlay", overlay, err));
            }
        }
        Ok(())
    }

    #[napi]
    pub fn toggle_overlay(&self, handle: i64) -> napi::Result<()> {
        let overlay = self.overlay();
        let is_visible_fn = require_fn(overlay.IsOverlayVisible, "IsOverlayVisible")?;
        let show_overlay_fn = require_fn(overlay.ShowOverlay, "ShowOverlay")?;
        let hide_overlay_fn = require_fn(overlay.HideOverlay, "HideOverlay")?;
        let handle = overlay_handle(handle)?;

        unsafe {
            if is_visible_fn(handle.as_u64()) {
                let err = hide_overlay_fn(handle.as_u64());
                if err != vr::EVROverlayError_VROverlayError_None {
                    return Err(overlay_error("HideOverlay", overlay, err));
                }
            } else {
                let err = show_overlay_fn(handle.as_u64());
                if err != vr::EVROverlayError_VROverlayError_None {
                    return Err(overlay_error("ShowOverlay", overlay, err));
                }
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
            let err = set_width_fn(handle.as_u64(), width_meters as f32);
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(overlay_error("SetOverlayWidthInMeters", overlay, err));
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
        let set_bounds_fn =
            require_fn(overlay.SetOverlayTextureBounds, "SetOverlayTextureBounds")?;
        let handle = overlay_handle(handle)?;
        unsafe {
            let mut bounds = vr::VRTextureBounds_t {
                uMin: u_min as f32,
                vMin: v_min as f32,
                uMax: u_max as f32,
                vMax: v_max as f32,
            };

            let err = set_bounds_fn(handle.as_u64(), &mut bounds);
            if err != vr::EVROverlayError_VROverlayError_None {
                return Err(overlay_error("SetOverlayTextureBounds", overlay, err));
            }
        }
        Ok(())
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
                compute_intersection_fn(handle.as_u64(), &mut params, &mut results);

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
}
