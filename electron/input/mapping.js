import { state } from './state.js';

export function updateWindowSize(
  width,
  height,
  _devicePixelRatio = null,
  zoomFactor = null,
) {
  state.windowSize = { width, height };
  if (Number.isFinite(zoomFactor) && zoomFactor > 0) {
    state.windowScale.zoomFactor = zoomFactor;
  }
  console.log(
    `Updated window size for input: ${width}x${height} (zoom=${state.windowScale.zoomFactor})`,
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getInputSurfaceSize() {
  if (!state.targetWebContents || state.targetWebContents.isDestroyed()) {
    return null;
  }
  if (state.windowSize.width > 0 && state.windowSize.height > 0) {
    const zoom =
      Number.isFinite(state.windowScale.zoomFactor) &&
      state.windowScale.zoomFactor > 0
        ? state.windowScale.zoomFactor
        : 1;
    return {
      width: Math.max(1, Math.round(state.windowSize.width * zoom)),
      height: Math.max(1, Math.round(state.windowSize.height * zoom)),
    };
  }

  try {
    const owner = state.targetWebContents.getOwnerBrowserWindow();
    if (!owner) return null;
    const bounds = owner.getContentBounds();
    return {
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
    };
  } catch (e) {
    console.error('Failed to resolve input surface size:', e);
    return null;
  }
}

export function mapUvToClient(u, v) {
  const size = getInputSurfaceSize();
  if (!size) return null;

  const clampedU = clamp(u, 0, 1);
  const clampedV = clamp(v, 0, 1);
  const width = size.width;
  const height = size.height;
  const x = Math.round(clampedU * (width - 1));
  const y = Math.round((1.0 - clampedV) * (height - 1));
  return { x, y };
}
