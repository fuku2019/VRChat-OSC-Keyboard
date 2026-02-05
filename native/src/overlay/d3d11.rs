use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
    D3D11_BIND_SHADER_RESOURCE, D3D11_CPU_ACCESS_WRITE, D3D11_CREATE_DEVICE_FLAG,
    D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DYNAMIC,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_SAMPLE_DESC};

pub struct D3D11Context {
    pub device: ID3D11Device,
    pub context: ID3D11DeviceContext,
    pub texture: Option<ID3D11Texture2D>,
    pub texture_width: u32,
    pub texture_height: u32,
}

impl D3D11Context {
    pub fn reset_texture(&mut self) {
        self.texture = None;
        self.texture_width = 0;
        self.texture_height = 0;
    }

    pub fn ensure_texture(&mut self, width: u32, height: u32) -> napi::Result<()> {
        if self.texture.is_some()
            && self.texture_width == width
            && self.texture_height == height
        {
            return Ok(());
        }

        if width == 0 || height == 0 {
            self.reset_texture();
            return Ok(());
        }

        self.reset_texture();

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
        unsafe {
            self.device
                .CreateTexture2D(&desc, None, Some(&mut texture))
                .map_err(|e| napi::Error::from_reason(format!("CreateTexture2D failed: {:?}", e)))?;
        }

        let texture = texture.ok_or_else(|| {
            napi::Error::from_reason("CreateTexture2D returned a null texture")
        })?;

        self.texture = Some(texture);
        self.texture_width = width;
        self.texture_height = height;

        Ok(())
    }
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
