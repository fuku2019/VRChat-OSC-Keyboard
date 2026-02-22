extern crate napi_build;

use std::ffi::c_void;
use std::fs;
use std::path::Path;

use windows::core::PCSTR;
use windows::Win32::Graphics::Direct3D::Fxc::D3DCompile;
use windows::Win32::Graphics::Direct3D::ID3DBlob;

/// Compile HLSL source to CSO bytecode at build time / ビルド時にHLSLソースをCSOバイトコードにコンパイル
fn compile_shader(source: &[u8], entry: &[u8], target: &[u8]) -> Vec<u8> {
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
        .unwrap_or_else(|e| {
            let message = if let Some(blob) = error_blob {
                let ptr = blob.GetBufferPointer() as *const u8;
                let len = blob.GetBufferSize();
                let bytes = std::slice::from_raw_parts(ptr, len);
                String::from_utf8_lossy(bytes).trim().to_string()
            } else {
                format!("{:?}", e)
            };
            panic!("D3DCompile failed: {}", message);
        });
    }

    let blob = shader_blob.expect("D3DCompile returned null blob");
    unsafe {
        let ptr = blob.GetBufferPointer() as *const u8;
        let len = blob.GetBufferSize();
        std::slice::from_raw_parts(ptr, len).to_vec()
    }
}

fn main() {
    napi_build::setup();

    // Only compile shaders on Windows / Windowsの場合のみシェーダをコンパイル
    #[cfg(target_os = "windows")]
    {
        let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR not set");
        let shader_dir = Path::new(&out_dir);

        // Vertex shader source / 頂点シェーダソース
        let vs_source = br#"
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

        // Passthrough pixel shader source / パススルーピクセルシェーダソース
        let ps_passthrough_source = br#"
Texture2D inputTex : register(t0);
SamplerState samp0 : register(s0);

float4 main(float4 pos : SV_POSITION, float2 uv : TEXCOORD0) : SV_TARGET {
    float4 c = inputTex.Sample(samp0, uv);
    return c;
}
"#;

        // Swizzle pixel shader source / スウィズルピクセルシェーダソース
        let ps_swizzle_source = br#"
Texture2D inputTex : register(t0);
SamplerState samp0 : register(s0);

float4 main(float4 pos : SV_POSITION, float2 uv : TEXCOORD0) : SV_TARGET {
    float4 c = inputTex.Sample(samp0, uv);
    return c.bgra;
}
"#;

        let vs_blob = compile_shader(vs_source, b"main\0", b"vs_5_0\0");
        let ps_passthrough_blob =
            compile_shader(ps_passthrough_source, b"main\0", b"ps_5_0\0");
        let ps_swizzle_blob = compile_shader(ps_swizzle_source, b"main\0", b"ps_5_0\0");

        fs::write(shader_dir.join("vs_fullscreen.cso"), &vs_blob)
            .expect("Failed to write vs_fullscreen.cso");
        fs::write(
            shader_dir.join("ps_passthrough.cso"),
            &ps_passthrough_blob,
        )
        .expect("Failed to write ps_passthrough.cso");
        fs::write(shader_dir.join("ps_swizzle.cso"), &ps_swizzle_blob)
            .expect("Failed to write ps_swizzle.cso");

        // Rerun only if build.rs itself changes / build.rs自体が変わった場合のみ再実行
        println!("cargo::rerun-if-changed=build.rs");
    }
}
