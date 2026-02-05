#![allow(non_snake_case)]
use napi_derive::napi;

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
    pub triggerPressed: bool,
    pub triggerValue: f64,
    pub gripPressed: bool,
    pub touchpadPressed: bool,
    pub touchpadX: f64,
    pub touchpadY: f64,
    pub joystickPressed: bool,
    pub joystickX: f64,
    pub joystickY: f64,
}

#[napi(object)]

pub struct OverlayRelativeTransform {
    pub trackedDeviceIndex: u32,
    pub transform: Vec<f64>, // 4x4 flattened
}
