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
