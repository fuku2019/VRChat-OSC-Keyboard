use std::ffi::c_void;

use windows::core::Interface;
use windows::core::PCSTR;
use windows::Win32::Graphics::Direct3D::{
    Fxc::D3DCompile, ID3DBlob, D3D_DRIVER_TYPE_HARDWARE, D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST,
};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11PixelShader,
    ID3D11RenderTargetView, ID3D11Resource, ID3D11SamplerState, ID3D11ShaderResourceView,
    ID3D11Texture2D, ID3D11VertexShader, D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE,
    D3D11_CPU_ACCESS_READ, D3D11_CPU_ACCESS_WRITE, D3D11_CREATE_DEVICE_FLAG,
    D3D11_FILTER_MIN_MAG_MIP_POINT, D3D11_MAP_READ, D3D11_MAP_WRITE_DISCARD,
    D3D11_MAPPED_SUBRESOURCE, D3D11_SAMPLER_DESC, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC,
    D3D11_TEXTURE_ADDRESS_CLAMP, D3D11_USAGE_DEFAULT, D3D11_USAGE_DYNAMIC, D3D11_USAGE_STAGING,
    D3D11_VIEWPORT,
};
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_SAMPLE_DESC,
};

pub struct D3D11Context {
    pub device: ID3D11Device,
    pub context: ID3D11DeviceContext,
    pub staging_bgra_texture: Option<ID3D11Texture2D>,
    pub output_rgba_texture: Option<ID3D11Texture2D>,
    pub bgra_srv: Option<ID3D11ShaderResourceView>,
    pub rgba_rtv: Option<ID3D11RenderTargetView>,
    pub vertex_shader: Option<ID3D11VertexShader>,
    pub pixel_shader_passthrough: Option<ID3D11PixelShader>,
    pub pixel_shader_swizzle: Option<ID3D11PixelShader>,
    pub swap_rb_required: bool,
    pub channel_probe_done: bool,
    pub sampler_state: Option<ID3D11SamplerState>,
    pub texture_width: u32,
    pub texture_height: u32,
}

impl D3D11Context {
    pub fn reset_texture(&mut self) {
        self.staging_bgra_texture = None;
        self.output_rgba_texture = None;
        self.bgra_srv = None;
        self.rgba_rtv = None;
        self.texture_width = 0;
        self.texture_height = 0;
    }

    pub fn ensure_resources(&mut self, width: u32, height: u32) -> napi::Result<()> {
        self.ensure_shaders()?;

        if self.staging_bgra_texture.is_some()
            && self.output_rgba_texture.is_some()
            && self.bgra_srv.is_some()
            && self.rgba_rtv.is_some()
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

        let staging_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_DYNAMIC,
            BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
            CPUAccessFlags: D3D11_CPU_ACCESS_WRITE.0 as u32,
            MiscFlags: 0,
        };
        let output_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_R8G8B8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: (D3D11_BIND_SHADER_RESOURCE.0 | D3D11_BIND_RENDER_TARGET.0) as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };

        let mut staging_texture: Option<ID3D11Texture2D> = None;
        let mut output_texture: Option<ID3D11Texture2D> = None;
        unsafe {
            self.device
                .CreateTexture2D(&staging_desc, None, Some(&mut staging_texture))
                .map_err(|e| napi::Error::from_reason(format!("CreateTexture2D failed: {:?}", e)))?;
            self.device
                .CreateTexture2D(&output_desc, None, Some(&mut output_texture))
                .map_err(|e| {
                    napi::Error::from_reason(format!(
                        "Create output texture failed: {:?}",
                        e
                    ))
                })?;
        }

        let staging_texture = staging_texture.ok_or_else(|| {
            napi::Error::from_reason("CreateTexture2D returned a null staging texture")
        })?;
        let output_texture = output_texture.ok_or_else(|| {
            napi::Error::from_reason("CreateTexture2D returned a null output texture")
        })?;

        let staging_resource: ID3D11Resource = staging_texture.cast().map_err(|e| {
            napi::Error::from_reason(format!(
                "Staging texture cast to ID3D11Resource failed: {:?}",
                e
            ))
        })?;
        let output_resource: ID3D11Resource = output_texture.cast().map_err(|e| {
            napi::Error::from_reason(format!(
                "Output texture cast to ID3D11Resource failed: {:?}",
                e
            ))
        })?;

        let mut bgra_srv: Option<ID3D11ShaderResourceView> = None;
        let mut rgba_rtv: Option<ID3D11RenderTargetView> = None;
        unsafe {
            self.device
                .CreateShaderResourceView(&staging_resource, None, Some(&mut bgra_srv))
                .map_err(|e| {
                    napi::Error::from_reason(format!("CreateShaderResourceView failed: {:?}", e))
                })?;
            self.device
                .CreateRenderTargetView(&output_resource, None, Some(&mut rgba_rtv))
                .map_err(|e| {
                    napi::Error::from_reason(format!("CreateRenderTargetView failed: {:?}", e))
                })?;
        }

        self.staging_bgra_texture = Some(staging_texture);
        self.output_rgba_texture = Some(output_texture);
        self.bgra_srv = bgra_srv;
        self.rgba_rtv = rgba_rtv;
        self.texture_width = width;
        self.texture_height = height;

        Ok(())
    }

    pub fn output_texture(&self) -> Option<&ID3D11Texture2D> {
        self.output_rgba_texture.as_ref()
    }

    pub fn upload_bgra_buffer(
        &self,
        src: *const u8,
        src_row_pitch: usize,
        width: u32,
        height: u32,
    ) -> napi::Result<()> {
        let texture = self.staging_bgra_texture.as_ref().ok_or_else(|| {
            napi::Error::from_reason("Staging BGRA texture is not initialized")
        })?;
        let resource: ID3D11Resource = texture.cast().map_err(|e| {
            napi::Error::from_reason(format!(
                "Staging texture cast to ID3D11Resource failed: {:?}",
                e
            ))
        })?;

        unsafe {
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            self.context
                .Map(&resource, 0, D3D11_MAP_WRITE_DISCARD, 0, Some(&mut mapped))
                .map_err(|e| napi::Error::from_reason(format!("Map failed: {:?}", e)))?;

            let dst = mapped.pData as *mut u8;
            if dst.is_null() {
                self.context.Unmap(&resource, 0);
                return Err(napi::Error::from_reason("Mapped texture pointer is null"));
            }
            let dst_pitch = mapped.RowPitch as usize;
            if dst_pitch < src_row_pitch {
                self.context.Unmap(&resource, 0);
                return Err(napi::Error::from_reason(
                    "Mapped row pitch is smaller than source row size",
                ));
            }

            let copy_row_bytes = (width as usize)
                .checked_mul(4)
                .ok_or_else(|| napi::Error::from_reason("Row byte size overflow"))?;

            for y in 0..height {
                let src_row = src.add((y as usize) * src_row_pitch);
                let dst_row = dst.add((y as usize) * dst_pitch);
                std::ptr::copy_nonoverlapping(src_row, dst_row, copy_row_bytes);
            }

            self.context.Unmap(&resource, 0);
        }

        Ok(())
    }

    pub fn convert_bgra_to_rgba(&self, width: u32, height: u32) -> napi::Result<()> {
        let rtv = self
            .rgba_rtv
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Output RTV is not initialized"))?
            .clone();
        let srv = self
            .bgra_srv
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Input SRV is not initialized"))?
            .clone();
        let vs = self
            .vertex_shader
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Vertex shader is not initialized"))?
            .clone();
        let ps = if self.swap_rb_required {
            self.pixel_shader_swizzle
                .as_ref()
                .ok_or_else(|| napi::Error::from_reason("Swizzle pixel shader is not initialized"))?
                .clone()
        } else {
            self.pixel_shader_passthrough
                .as_ref()
                .ok_or_else(|| napi::Error::from_reason("Passthrough pixel shader is not initialized"))?
                .clone()
        };
        let sampler = self
            .sampler_state
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Sampler state is not initialized"))?
            .clone();

        let viewport = D3D11_VIEWPORT {
            TopLeftX: 0.0,
            TopLeftY: 0.0,
            Width: width as f32,
            Height: height as f32,
            MinDepth: 0.0,
            MaxDepth: 1.0,
        };

        unsafe {
            self.context
                .OMSetRenderTargets(Some(&[Some(rtv)]), None);
            self.context.RSSetViewports(Some(&[viewport]));
            self.context
                .IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            self.context.VSSetShader(&vs, None);
            self.context.PSSetShader(&ps, None);
            self.context
                .PSSetShaderResources(0, Some(&[Some(srv)]));
            self.context
                .PSSetSamplers(0, Some(&[Some(sampler)]));
            self.context.Draw(3, 0);

            // Unbind SRV to avoid binding hazards on subsequent frames.
            self.context.PSSetShaderResources(0, Some(&[None]));
        }

        Ok(())
    }

    fn ensure_shaders(&mut self) -> napi::Result<()> {
        if self.vertex_shader.is_some()
            && self.pixel_shader_passthrough.is_some()
            && self.pixel_shader_swizzle.is_some()
            && self.sampler_state.is_some()
            && self.channel_probe_done
        {
            return Ok(());
        }

        let vertex_shader_source = br#"
struct VSOut {
    float4 pos : SV_POSITION;
    float2 uv : TEXCOORD0;
};

VSOut main(uint vid : SV_VertexID) {
    VSOut o;
    float2 pos;
    if (vid == 0) pos = float2(-1.0, -1.0);
    else if (vid == 1) pos = float2(-1.0, 3.0);
    else pos = float2(3.0, -1.0);
    o.pos = float4(pos, 0.0, 1.0);
    o.uv = float2((pos.x + 1.0) * 0.5, 1.0 - ((pos.y + 1.0) * 0.5));
    return o;
}
"#;
        let pixel_shader_source = br#"
Texture2D inputTex : register(t0);
SamplerState samp0 : register(s0);

float4 main(float4 pos : SV_POSITION, float2 uv : TEXCOORD0) : SV_TARGET {
    float4 c = inputTex.Sample(samp0, uv);
    return c;
}
"#;
        let pixel_shader_swizzle_source = br#"
Texture2D inputTex : register(t0);
SamplerState samp0 : register(s0);

float4 main(float4 pos : SV_POSITION, float2 uv : TEXCOORD0) : SV_TARGET {
    float4 c = inputTex.Sample(samp0, uv);
    return c.bgra;
}
"#;

        let vs_blob = compile_shader(vertex_shader_source, b"main\0", b"vs_5_0\0")?;
        let ps_passthrough_blob = compile_shader(pixel_shader_source, b"main\0", b"ps_5_0\0")?;
        let ps_swizzle_blob = compile_shader(pixel_shader_swizzle_source, b"main\0", b"ps_5_0\0")?;

        let mut vertex_shader: Option<ID3D11VertexShader> = None;
        let mut pixel_shader_passthrough: Option<ID3D11PixelShader> = None;
        let mut pixel_shader_swizzle: Option<ID3D11PixelShader> = None;
        let mut sampler_state: Option<ID3D11SamplerState> = None;

        let sampler_desc = D3D11_SAMPLER_DESC {
            Filter: D3D11_FILTER_MIN_MAG_MIP_POINT,
            AddressU: D3D11_TEXTURE_ADDRESS_CLAMP,
            AddressV: D3D11_TEXTURE_ADDRESS_CLAMP,
            AddressW: D3D11_TEXTURE_ADDRESS_CLAMP,
            MipLODBias: 0.0,
            MaxAnisotropy: 1,
            ComparisonFunc: Default::default(),
            BorderColor: [0.0, 0.0, 0.0, 0.0],
            MinLOD: 0.0,
            MaxLOD: f32::MAX,
        };

        unsafe {
            self.device
                .CreateVertexShader(
                    &vs_blob,
                    None,
                    Some(&mut vertex_shader),
                )
                .map_err(|e| napi::Error::from_reason(format!("CreateVertexShader failed: {:?}", e)))?;
            self.device
                .CreatePixelShader(
                    &ps_passthrough_blob,
                    None,
                    Some(&mut pixel_shader_passthrough),
                )
                .map_err(|e| napi::Error::from_reason(format!("CreatePixelShader failed: {:?}", e)))?;
            self.device
                .CreatePixelShader(
                    &ps_swizzle_blob,
                    None,
                    Some(&mut pixel_shader_swizzle),
                )
                .map_err(|e| napi::Error::from_reason(format!("CreatePixelShader failed: {:?}", e)))?;
            self.device
                .CreateSamplerState(&sampler_desc, Some(&mut sampler_state))
                .map_err(|e| napi::Error::from_reason(format!("CreateSamplerState failed: {:?}", e)))?;
        }

        self.vertex_shader = vertex_shader;
        self.pixel_shader_passthrough = pixel_shader_passthrough;
        self.pixel_shader_swizzle = pixel_shader_swizzle;
        self.sampler_state = sampler_state;
        self.swap_rb_required = self.probe_channel_swizzle()?;
        self.channel_probe_done = true;

        Ok(())
    }

    fn probe_channel_swizzle(&self) -> napi::Result<bool> {
        let vs = self
            .vertex_shader
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Vertex shader is not initialized"))?
            .clone();
        let ps_passthrough = self
            .pixel_shader_passthrough
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Passthrough pixel shader is not initialized"))?
            .clone();
        let sampler = self
            .sampler_state
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Sampler state is not initialized"))?
            .clone();

        let input_desc = D3D11_TEXTURE2D_DESC {
            Width: 1,
            Height: 1,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_DYNAMIC,
            BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
            CPUAccessFlags: D3D11_CPU_ACCESS_WRITE.0 as u32,
            MiscFlags: 0,
        };
        let output_desc = D3D11_TEXTURE2D_DESC {
            Width: 1,
            Height: 1,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_R8G8B8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: D3D11_BIND_RENDER_TARGET.0 as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        let readback_desc = D3D11_TEXTURE2D_DESC {
            Width: 1,
            Height: 1,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_R8G8B8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: 0,
        };

        let mut input_tex: Option<ID3D11Texture2D> = None;
        let mut output_tex: Option<ID3D11Texture2D> = None;
        let mut readback_tex: Option<ID3D11Texture2D> = None;
        unsafe {
            self.device
                .CreateTexture2D(&input_desc, None, Some(&mut input_tex))
                .map_err(|e| napi::Error::from_reason(format!("Probe input texture creation failed: {:?}", e)))?;
            self.device
                .CreateTexture2D(&output_desc, None, Some(&mut output_tex))
                .map_err(|e| napi::Error::from_reason(format!("Probe output texture creation failed: {:?}", e)))?;
            self.device
                .CreateTexture2D(&readback_desc, None, Some(&mut readback_tex))
                .map_err(|e| napi::Error::from_reason(format!("Probe readback texture creation failed: {:?}", e)))?;
        }

        let input_tex = input_tex
            .ok_or_else(|| napi::Error::from_reason("Probe input texture is null"))?;
        let output_tex = output_tex
            .ok_or_else(|| napi::Error::from_reason("Probe output texture is null"))?;
        let readback_tex = readback_tex
            .ok_or_else(|| napi::Error::from_reason("Probe readback texture is null"))?;

        let input_resource: ID3D11Resource = input_tex.cast().map_err(|e| {
            napi::Error::from_reason(format!("Probe input cast failed: {:?}", e))
        })?;
        let output_resource: ID3D11Resource = output_tex.cast().map_err(|e| {
            napi::Error::from_reason(format!("Probe output cast failed: {:?}", e))
        })?;
        let readback_resource: ID3D11Resource = readback_tex.cast().map_err(|e| {
            napi::Error::from_reason(format!("Probe readback cast failed: {:?}", e))
        })?;

        let mut probe_srv: Option<ID3D11ShaderResourceView> = None;
        let mut probe_rtv: Option<ID3D11RenderTargetView> = None;
        unsafe {
            self.device
                .CreateShaderResourceView(&input_resource, None, Some(&mut probe_srv))
                .map_err(|e| napi::Error::from_reason(format!("Probe SRV creation failed: {:?}", e)))?;
            self.device
                .CreateRenderTargetView(&output_resource, None, Some(&mut probe_rtv))
                .map_err(|e| napi::Error::from_reason(format!("Probe RTV creation failed: {:?}", e)))?;
        }
        let probe_srv = probe_srv.ok_or_else(|| napi::Error::from_reason("Probe SRV is null"))?;
        let probe_rtv = probe_rtv.ok_or_else(|| napi::Error::from_reason("Probe RTV is null"))?;

        unsafe {
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            self.context
                .Map(&input_resource, 0, D3D11_MAP_WRITE_DISCARD, 0, Some(&mut mapped))
                .map_err(|e| napi::Error::from_reason(format!("Probe input map failed: {:?}", e)))?;
            let dst = mapped.pData as *mut u8;
            if dst.is_null() {
                self.context.Unmap(&input_resource, 0);
                return Err(napi::Error::from_reason("Probe input mapped pointer is null"));
            }
            // BGRA bytes for pure red.
            *dst.add(0) = 0;
            *dst.add(1) = 0;
            *dst.add(2) = 255;
            *dst.add(3) = 255;
            self.context.Unmap(&input_resource, 0);

            let viewport = D3D11_VIEWPORT {
                TopLeftX: 0.0,
                TopLeftY: 0.0,
                Width: 1.0,
                Height: 1.0,
                MinDepth: 0.0,
                MaxDepth: 1.0,
            };
            self.context
                .OMSetRenderTargets(Some(&[Some(probe_rtv)]), None);
            self.context.RSSetViewports(Some(&[viewport]));
            self.context
                .IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            self.context.VSSetShader(&vs, None);
            self.context.PSSetShader(&ps_passthrough, None);
            self.context
                .PSSetShaderResources(0, Some(&[Some(probe_srv)]));
            self.context
                .PSSetSamplers(0, Some(&[Some(sampler)]));
            self.context.Draw(3, 0);
            self.context.PSSetShaderResources(0, Some(&[None]));

            self.context.CopyResource(&readback_resource, &output_resource);

            let mut mapped_read = D3D11_MAPPED_SUBRESOURCE::default();
            self.context
                .Map(&readback_resource, 0, D3D11_MAP_READ, 0, Some(&mut mapped_read))
                .map_err(|e| napi::Error::from_reason(format!("Probe readback map failed: {:?}", e)))?;
            let src = mapped_read.pData as *const u8;
            if src.is_null() {
                self.context.Unmap(&readback_resource, 0);
                return Err(napi::Error::from_reason("Probe readback pointer is null"));
            }
            let r = *src.add(0);
            let b = *src.add(2);
            self.context.Unmap(&readback_resource, 0);

            Ok(b > r)
        }
    }
}

fn compile_shader(source: &[u8], entry: &[u8], target: &[u8]) -> napi::Result<Vec<u8>> {
    let mut shader_blob: Option<ID3DBlob> = None;
    let mut error_blob: Option<ID3DBlob> = None;

    unsafe {
        D3DCompile(
            source.as_ptr() as *const c_void,
            source.len(),
            PCSTR::null(),
            None,
            None,
            PCSTR(entry.as_ptr()),
            PCSTR(target.as_ptr()),
            0,
            0,
            &mut shader_blob,
            Some(&mut error_blob),
        )
        .map_err(|e| {
            let message = if let Some(blob) = error_blob {
                let ptr = blob.GetBufferPointer() as *const u8;
                let len = blob.GetBufferSize();
                let bytes = std::slice::from_raw_parts(ptr, len);
                String::from_utf8_lossy(bytes).trim().to_string()
            } else {
                format!("{:?}", e)
            };
            napi::Error::from_reason(format!("D3DCompile failed: {}", message))
        })?;
    }

    let blob = shader_blob.ok_or_else(|| napi::Error::from_reason("D3DCompile returned null blob"))?;
    unsafe {
        let ptr = blob.GetBufferPointer() as *const u8;
        let len = blob.GetBufferSize();
        Ok(std::slice::from_raw_parts(ptr, len).to_vec())
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
            staging_bgra_texture: None,
            output_rgba_texture: None,
            bgra_srv: None,
            rgba_rtv: None,
            vertex_shader: None,
            pixel_shader_passthrough: None,
            pixel_shader_swizzle: None,
            swap_rb_required: false,
            channel_probe_done: false,
            sampler_state: None,
            texture_width: 0,
            texture_height: 0,
        })
    }
}
