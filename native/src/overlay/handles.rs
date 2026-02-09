use napi::Result;

#[derive(Clone, Copy, Debug)]
pub(super) struct OverlayHandle(u64);

impl OverlayHandle {
    pub(super) fn from_i64(value: i64) -> Result<Self> {
        if value < 0 {
            return Err(napi::Error::from_reason(
                "Overlay handle must be a non-negative integer",
            ));
        }
        Ok(Self(value as u64))
    }

    pub(super) fn from_u64(value: u64) -> Self {
        Self(value)
    }

    pub(super) fn as_u64(self) -> u64 {
        self.0
    }

    pub(super) fn to_i64(self) -> Result<i64> {
        i64::try_from(self.0)
            .map_err(|_| napi::Error::from_reason("Overlay handle exceeds i64 range"))
    }
}

pub(super) fn overlay_handle(handle: i64) -> Result<OverlayHandle> {
    OverlayHandle::from_i64(handle)
}
