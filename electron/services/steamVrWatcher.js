/**
 * SteamVR watcher / SteamVR の監視
 *
 * The app is VR-only, so starting before SteamVR is not an error - it is the
 * normal way people launch it from the desktop. The keyboard window already
 * exists (offscreen); what waits is the overlay. This polls for SteamVR and,
 * once it is up, runs the overlay start-up, retrying for a while because the
 * vrserver process appears some seconds before VR_Init will succeed.
 * このアプリはVR専用なので、SteamVRより先に起動することはエラーではなく、
 * デスクトップから起動する普通の手順である。キーボードウィンドウ(オフスクリーン)は
 * 既に存在しており、待つのはオーバーレイのほうである。ここでは SteamVR を
 * ポーリングし、起動したらオーバーレイの立ち上げを実行する。vrserver のプロセスは
 * VR_Init が成功するようになる数秒前に現れるため、しばらく再試行する。
 *
 * Dependencies are injected so the loop can be tested on fake timers without
 * OpenVR. / OpenVR なしで偽タイマー上でテストできるよう、依存は注入する。
 */

/** @typedef {'waiting'|'starting'|'running'|'failed'} VrStatus */

export const VR_STATUS = Object.freeze({
  WAITING: 'waiting',
  STARTING: 'starting',
  RUNNING: 'running',
  FAILED: 'failed',
});

/**
 * @param {Object} options
 * @param {() => boolean | Promise<boolean>} options.isRunning - Whether SteamVR is running / SteamVR が動いているか
 * @param {() => unknown | Promise<unknown>} options.start - Bring the overlay up; falsy means it failed / オーバーレイを立ち上げる。偽値は失敗
 * @param {(status: VrStatus) => void} [options.onStatus] - Called on every status change / 状態が変わるたびに呼ばれる
 * @param {number} [options.intervalMs] - Poll interval / ポーリング間隔
 * @param {number} [options.maxStartAttempts] - Start attempts before giving up / 諦めるまでの立ち上げ試行回数
 * @returns {() => void} Stops watching / 監視を止める
 */
export function watchForSteamVr({
  isRunning,
  start,
  onStatus = () => {},
  intervalMs = 3000,
  maxStartAttempts = 10,
}) {
  let stopped = false;
  let timer = null;
  let attempts = 0;
  let status = null;

  const setStatus = (next) => {
    if (next === status) return;
    status = next;
    onStatus(next);
  };

  const scheduleNext = () => {
    if (stopped) return;
    timer = setTimeout(tick, intervalMs);
  };

  async function tick() {
    timer = null;
    if (stopped) return;

    let running = false;
    try {
      running = Boolean(await isRunning());
    } catch {
      running = false;
    }
    if (stopped) return;

    if (!running) {
      // A new SteamVR session gets a fresh budget. / 新しい SteamVR セッションには
      // 改めて満額の回数を与える。
      attempts = 0;
      setStatus(VR_STATUS.WAITING);
      scheduleNext();
      return;
    }

    setStatus(VR_STATUS.STARTING);
    attempts += 1;
    let started = null;
    try {
      started = await start();
    } catch (error) {
      console.warn('[vr] overlay start failed:', error);
      started = null;
    }
    if (stopped) return;

    if (started) {
      setStatus(VR_STATUS.RUNNING);
      return;
    }
    if (attempts >= maxStartAttempts) {
      setStatus(VR_STATUS.FAILED);
      return;
    }
    scheduleNext();
  }

  void tick();

  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
