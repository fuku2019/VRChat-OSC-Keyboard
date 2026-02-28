/**
 * Pointer Stabilizer (Simple 1€ Filter-like implementation)
 * ポインターのブレを軽減するためのスムージングクラス
 */
export class PointerStabilizer {
  constructor(minCutoff = 1.0, beta = 0.0, dcutoff = 1.0) {
    this.minCutoff = minCutoff; // Min cutoff frequency (Hz) / 最小カットオフ周波数 (Hz)
    this.beta = beta; // Speed coefficient / 速度係数
    this.dcutoff = dcutoff; // Derivate cutoff / 微分カットオフ

    this.x = null;
    this.y = null;
    this.dx = 0;
    this.dy = 0;
    this.lastTime = 0;
    this.smoothingFactor = 1.0; // Dynamic alpha for debugging / デバッグ用の動的アルファ値
  }

  /**
   * Update the filter with a new raw position / 新しい生の座標でフィルターを更新する
   * @param {number} x - Raw X coordinate
   * @param {number} y - Raw Y coordinate
   * @param {number} timestamp - Current timestamp in ms
   * @returns {{x: number, y: number}} Smoothed coordinates
   */
  update(x, y, timestamp) {
    if (this.x === null || this.y === null || this.lastTime === 0) {
      this.x = x;
      this.y = y;
      this.dx = 0;
      this.dy = 0;
      this.lastTime = timestamp;
      return { x, y };
    }

    const dt = (timestamp - this.lastTime) / 1000; // Convert to seconds / 秒に変換する
    this.lastTime = timestamp;

    if (dt <= 0) {
      return { x: this.x, y: this.y };
    }

    // Calculate velocity (derivative) / 速度（微分）を計算する
    const dxRaw = (x - this.x) / dt;
    const dyRaw = (y - this.y) / dt;

    // Smooth velocity / 速度を平滑化する
    const lambdaD = this.alpha(this.dcutoff, dt);
    const dx = this.dx + lambdaD * (dxRaw - this.dx);
    const dy = this.dy + lambdaD * (dyRaw - this.dy);

    // Dynamic cutoff based on speed / 速度に基づく動的なカットオフ
    const speed = Math.sqrt(dx * dx + dy * dy);
    const cutoff = this.minCutoff + this.beta * speed;

    // Smooth position / 位置を平滑化する
    const lambda = this.alpha(cutoff, dt);
    this.smoothingFactor = lambda; // Store for debug / デバッグ用に保存

    this.x = this.x + lambda * (x - this.x);
    this.y = this.y + lambda * (y - this.y);
    this.dx = dx;
    this.dy = dy;

    return { x: this.x, y: this.y };
  }

  alpha(cutoff, dt) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  reset() {
    this.x = null;
    this.y = null;
    this.dx = 0;
    this.dy = 0;
    this.lastTime = 0;
  }
}
