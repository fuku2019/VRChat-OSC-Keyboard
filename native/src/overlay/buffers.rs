use super::constants::BYTES_PER_PIXEL;

pub(super) fn expected_rgba_size(width: u32, height: u32) -> napi::Result<usize> {
    let width = usize::try_from(width)
        .map_err(|_| napi::Error::from_reason("width is too large"))?;
    let height = usize::try_from(height)
        .map_err(|_| napi::Error::from_reason("height is too large"))?;
    width
        .checked_mul(height)
        .and_then(|v| v.checked_mul(BYTES_PER_PIXEL as usize))
        .ok_or_else(|| napi::Error::from_reason("width/height too large"))
}

pub(super) fn row_pitch_bytes(width: u32) -> napi::Result<usize> {
    usize::try_from(width)
        .ok()
        .and_then(|v| v.checked_mul(BYTES_PER_PIXEL as usize))
        .ok_or_else(|| napi::Error::from_reason("Row pitch is too large"))
}
