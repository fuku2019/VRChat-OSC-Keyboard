pub(super) fn vec3_f32(name: &str, values: &[f64]) -> napi::Result<[f32; 3]> {
    if values.len() != 3 {
        return Err(napi::Error::from_reason(format!(
            "{name} must have length 3"
        )));
    }
    Ok([values[0] as f32, values[1] as f32, values[2] as f32])
}

pub(super) fn validate_matrix(matrix: &[f64], name: &str) -> napi::Result<()> {
    if matrix.len() != 16 {
        return Err(napi::Error::from_reason(format!(
            "{name} must have 16 elements, got {}",
            matrix.len()
        )));
    }
    Ok(())
}

/// Convert OpenVR 3x4 matrix to 4x4 flattened Vec<f64> (row-major)
/// OpenVR の 3x4 行列を 4x4 フラット Vec<f64> に変換 (行優先)
pub(super) fn hmd_matrix34_to_vec(m: &[[f32; 4]; 3]) -> Vec<f64> {
    vec![
        m[0][0] as f64,
        m[0][1] as f64,
        m[0][2] as f64,
        m[0][3] as f64,
        m[1][0] as f64,
        m[1][1] as f64,
        m[1][2] as f64,
        m[1][3] as f64,
        m[2][0] as f64,
        m[2][1] as f64,
        m[2][2] as f64,
        m[2][3] as f64,
        0.0,
        0.0,
        0.0,
        1.0,
    ]
}
