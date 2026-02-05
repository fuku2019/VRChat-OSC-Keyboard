use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
    D3D11_CREATE_DEVICE_FLAG, D3D11_SDK_VERSION,
};

pub struct D3D11Context {
    pub device: ID3D11Device,
    pub context: ID3D11DeviceContext,
    pub texture: Option<ID3D11Texture2D>,
    pub texture_width: u32,
    pub texture_height: u32,
}

// Initialize D3D11 device and context / D3D11デバイスとコンテキストを初期化
pub fn init() -> napi::Result<D3D11Context> {
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
        )
        .map_err(|e| napi::Error::from_reason(format!("D3D11CreateDevice failed: {:?}", e)))?;

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
