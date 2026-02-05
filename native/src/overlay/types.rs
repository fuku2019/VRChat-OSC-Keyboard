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
