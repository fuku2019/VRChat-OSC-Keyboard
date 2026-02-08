pub(super) const OVERLAY_INTERFACE_ENV: &str = "OPENVR_IVR_OVERLAY_VERSION";
pub(super) const SYSTEM_INTERFACE_ENV: &str = "OPENVR_IVR_SYSTEM_VERSION";
pub(super) const INPUT_INTERFACE_ENV: &str = "OPENVR_IVR_INPUT_VERSION";
pub(super) const DEFAULT_OVERLAY_INTERFACE: &str = "FnTable:IVROverlay_028";
pub(super) const DEFAULT_SYSTEM_INTERFACE: &str = "FnTable:IVRSystem_023";
pub(super) const DEFAULT_INPUT_INTERFACE: &str = "FnTable:IVRInput_010";
pub(super) const BYTES_PER_PIXEL: u32 = 4;
pub(super) const HMD_DEVICE_INDEX: u32 = 0;

// Controller button bitmasks
pub(super) const BUTTON_TRIGGER: u64 = 1u64 << 33; // k_EButton_SteamVR_Trigger
pub(super) const BUTTON_GRIP: u64 = 1u64 << 2; // k_EButton_Grip
pub(super) const BUTTON_TOUCHPAD: u64 = 1u64 << 32; // k_EButton_SteamVR_Touchpad
pub(super) const BUTTON_JOYSTICK: u64 = 1u64 << 34; // k_EButton_Axis2 (often joystick click)

// Controller axis indices
pub(super) const AXIS_TRIGGER: usize = 1;
pub(super) const AXIS_TOUCHPAD: usize = 0;
pub(super) const AXIS_JOYSTICK: usize = 2;
