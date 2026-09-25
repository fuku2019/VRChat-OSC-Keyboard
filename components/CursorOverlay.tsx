/**
 * CursorOverlay - Draws the VR pointer cursors and mirrors hover/press state
 * onto the elements underneath them.
 * VRポインタのカーソルを描画し、その下にある要素へホバー/押下状態を反映する。
 *
 * This component renders exactly once. Everything after mount is imperative:
 * the cursor nodes are created on demand and moved by writing
 * `style.transform`. That is deliberate and it is the whole point of the file.
 * このコンポーネントのレンダーは一度だけである。マウント後はすべて命令的に行い、
 * カーソル要素は必要になった時点で生成して `style.transform` の書き込みだけで
 * 動かす。これは意図的であり、このファイルの存在理由そのものである。
 *
 * The window is captured by offscreen rendering, where a frame is produced only
 * when the page changes - so how *expensively* the page changes decides the cost
 * of every overlay frame. The previous implementation called setCursors() on
 * every cursor event (up to 120/s while the hand is moving), which re-rendered
 * this subtree, and positioned the cursor with top/left percentages, which
 * invalidates layout. On top of that document.elementFromPoint() ran on every
 * event, forcing a synchronous layout of the whole page - including the sixty
 * odd buttons of the virtual keyboard - from inside the IPC handler.
 * このウィンドウはオフスクリーンレンダリングでキャプチャされ、フレームはページに
 * 変化があったときだけ生成される。つまりページの変化が「どれだけ高価か」が
 * オーバーレイ1フレームのコストを決める。旧実装はカーソルイベントごと(手を
 * 動かしている間は毎秒120回まで)に setCursors() を呼んでこのサブツリーを再レンダー
 * し、さらに top/left の%指定で位置を与えていた - これはレイアウトを無効化する。
 * 加えて document.elementFromPoint() が毎イベント走り、IPCハンドラの内側から
 * 仮想キーボードの60個以上のボタンを含むページ全体の同期レイアウトを強制していた。
 *
 * Now a cursor event writes one transform on a composited layer: no React work,
 * no layout, no repaint of anything else. Because layout is never invalidated
 * any more, the hit test that remains runs against a clean layout tree, which is
 * most of why it became cheap - the epsilon gate and the rAF coalescing below
 * are the smaller half of that win.
 * 現在はカーソルイベント1回につき合成レイヤ上の transform を1つ書くだけである。
 * Reactの仕事もレイアウトも、他要素の再描画も発生しない。レイアウトが無効化され
 * なくなったため、残ったヒットテストはきれいなレイアウトツリーに対して走る - これが
 * ヒットテストが安くなった理由の大半であり、下のしきい値とrAFでのまとめ上げは
 * その残り半分にすぎない。
 */

import { useEffect, useRef } from 'react';

// Hit testing only has to run once the cursor has moved far enough that it could
// have entered a different button. In CSS pixels.
// ヒットテストは、カーソルが別のボタンへ入りえる距離まで動いてから走れば足りる。
// 単位はCSSピクセル。
const HOVER_PROBE_EPSILON_PX = 4;

type VrClickMode = 'press' | 'hold' | null;

// Applied one property at a time rather than through cssText, because jsdom's
// CSS parser rejects an entire cssText that contains rgb(var(--x)) and would
// leave the node with no style at all under test. The colours stay as CSS
// variables so the theme keeps applying to nodes created before it changed.
// cssTextではなく1プロパティずつ適用する。jsdomのCSSパーサは rgb(var(--x)) を含む
// cssText を丸ごと拒否するため、テスト下では要素のstyleが空になってしまうからである。
// 色はCSS変数のままなので、テーマ変更前に作られた要素にもテーマが効き続ける。
const CURSOR_STYLE: [string, string][] = [
  ['position', 'absolute'],
  ['left', '0px'],
  ['top', '0px'],
  ['width', '18px'],
  ['height', '18px'],
  ['border-radius', '50%'],
  ['background-color', 'rgb(var(--rgb-primary-500))'],
  ['border', '2px solid rgb(var(--rgb-primary-500))'],
  ['box-shadow', '0 0 10px rgb(var(--rgb-primary-500) / 0.5)'],
  ['pointer-events', 'none'],
  ['will-change', 'transform'],
  ['visibility', 'hidden'],
];

const CursorOverlay = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // All state lives in this closure rather than in refs. The effect never
    // re-runs, and keeping it local means StrictMode's double mount in dev gets
    // a clean second set instead of inheriting the first one's hover counts.
    // 状態はrefではなくこのクロージャに置く。エフェクトは再実行されないうえ、
    // ローカルに持つことで開発時のStrictModeの二重マウントが1回目のホバー
    // カウントを引き継がず、きれいな2セット目から始められる。
    const cursorNodes = new Map<number, HTMLDivElement>();
    const cursorPositions = new Map<number, { u: number; v: number }>(); // v is flipped to screen space / vは画面座標へ反転済み
    const shownCursors = new Set<number>();
    const hoveredByController = new Map<number, HTMLElement>();
    const hoverCounts = new Map<HTMLElement, number>();
    const pressedByController = new Map<number, HTMLElement>();
    const pressedCounts = new Map<HTMLElement, number>();
    const pressedControllers = new Set<number>();
    const clickModeByController = new Map<number, VrClickMode>();
    const pendingHover = new Map<number, { u: number; v: number }>(); // raw OpenVR v / OpenVRの生のv
    const lastProbedPoint = new Map<number, { x: number; y: number }>();
    let hoverRaf: number | null = null;
    let dprQuery: MediaQueryList | null = null;

    const addHover = (element: HTMLElement) => {
      const hoverCount = hoverCounts.get(element) ?? 0;
      if (hoverCount === 0) {
        element.classList.add('vr-hover');
      }
      hoverCounts.set(element, hoverCount + 1);
    };

    const removeHover = (element: HTMLElement) => {
      const hoverCount = hoverCounts.get(element);
      if (!hoverCount) return;
      if (hoverCount <= 1) {
        hoverCounts.delete(element);
        element.classList.remove('vr-hover');
      } else {
        hoverCounts.set(element, hoverCount - 1);
      }
    };

    const addPressed = (element: HTMLElement) => {
      const pressedCount = pressedCounts.get(element) ?? 0;
      if (pressedCount === 0) {
        element.classList.add('vr-pressed');
      }
      pressedCounts.set(element, pressedCount + 1);
    };

    const removePressed = (element: HTMLElement) => {
      const pressedCount = pressedCounts.get(element);
      if (!pressedCount) return;
      if (pressedCount <= 1) {
        pressedCounts.delete(element);
        element.classList.remove('vr-pressed');
      } else {
        pressedCounts.set(element, pressedCount - 1);
      }
    };

    // The main process sends the click, so it has to know at the moment of a
    // trigger press how the element under the controller wants to be clicked
    // (data-vr-click). Only changes are sent, never per cursor event.
    // クリックを送るのはメインプロセスなので、トリガーを押した瞬間に、
    // コントローラーの下の要素がどうクリックされたいか(data-vr-click)を知っている
    // 必要がある。送るのは変化したときだけで、カーソルイベントごとには送らない。
    const reportClickMode = (controllerId: number, target: HTMLElement | null) => {
      const attribute = target?.dataset.vrClick;
      const mode: VrClickMode = attribute === 'press' || attribute === 'hold' ? attribute : null;
      if ((clickModeByController.get(controllerId) ?? null) === mode) return;
      if (mode) {
        clickModeByController.set(controllerId, mode);
      } else {
        clickModeByController.delete(controllerId);
      }
      window.electronAPI?.sendVrClickMode?.({ controllerId, mode });
    };

    const clearHoverForController = (controllerId: number) => {
      const previous = hoveredByController.get(controllerId);
      if (previous) {
        removeHover(previous);
        hoveredByController.delete(controllerId);
      }
      reportClickMode(controllerId, null);
    };

    const clearPressedForController = (controllerId: number) => {
      const previous = pressedByController.get(controllerId);
      if (previous) {
        removePressed(previous);
        pressedByController.delete(controllerId);
      }
      pressedControllers.delete(controllerId);
    };

    // --- Cursor nodes / カーソル要素 ---

    const ensureCursorNode = (controllerId: number) => {
      const existing = cursorNodes.get(controllerId);
      if (existing) return existing;
      const element = document.createElement('div');
      CURSOR_STYLE.forEach(([property, value]) => element.style.setProperty(property, value));
      element.dataset.vrCursor = String(controllerId);
      container.appendChild(element);
      cursorNodes.set(controllerId, element);
      return element;
    };

    // The only write that a cursor event performs. translate3d keeps the node on
    // its own composited layer, and the trailing translate(-50%, -50%) centres it
    // without having to know its size here.
    // カーソルイベントが行う唯一の書き込み。translate3dで要素を専用の合成レイヤに
    // 載せ、末尾のtranslate(-50%, -50%)がここでサイズを知らずに中心合わせを行う。
    const applyCursorTransform = (controllerId: number) => {
      const element = cursorNodes.get(controllerId);
      const position = cursorPositions.get(controllerId);
      if (!element || !position) return;
      const x = position.u * window.innerWidth;
      const y = position.v * window.innerHeight;
      element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    };

    // --- Hover / ホバー ---

    const getHoverTarget = (u: number, v: number) => {
      if (typeof document === 'undefined') return null;
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (width <= 0 || height <= 0) return null;
      const x = Math.min(width - 1, Math.max(0, Math.round(u * (width - 1))));
      const y = Math.min(height - 1, Math.max(0, Math.round((1.0 - v) * (height - 1))));
      const element = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!element) return null;
      return element.closest('button, [role="button"]') as HTMLElement | null;
    };

    const updateHoverForController = (controllerId: number, u: number, v: number) => {
      const target = getHoverTarget(u, v);
      const previous = hoveredByController.get(controllerId) ?? null;
      if (previous === target) return;
      if (previous) removeHover(previous);
      reportClickMode(controllerId, target);
      if (target) {
        addHover(target);
        hoveredByController.set(controllerId, target);
        if (pressedControllers.has(controllerId) && !pressedByController.has(controllerId)) {
          addPressed(target);
          pressedByController.set(controllerId, target);
        }
      } else {
        hoveredByController.delete(controllerId);
      }
    };

    const probeHover = (controllerId: number, u: number, v: number) => {
      lastProbedPoint.set(controllerId, {
        x: u * window.innerWidth,
        y: (1.0 - v) * window.innerHeight,
      });
      updateHoverForController(controllerId, u, v);
    };

    const movedEnoughToProbe = (controllerId: number, u: number, v: number) => {
      const previous = lastProbedPoint.get(controllerId);
      if (!previous) return true;
      const dx = u * window.innerWidth - previous.x;
      const dy = (1.0 - v) * window.innerHeight - previous.y;
      return Math.abs(dx) >= HOVER_PROBE_EPSILON_PX || Math.abs(dy) >= HOVER_PROBE_EPSILON_PX;
    };

    const runHoverProbes = () => {
      hoverRaf = null;
      if (pendingHover.size === 0) return;
      const entries = Array.from(pendingHover);
      pendingHover.clear();
      entries.forEach(([controllerId, { u, v }]) => {
        if (!movedEnoughToProbe(controllerId, u, v)) return;
        probeHover(controllerId, u, v);
      });
    };

    // Dropping a sub-epsilon move instead of holding it for later can leave the
    // highlight a few pixels stale if the hand stops right after a tiny step.
    // That is invisible, and it cannot make a click land on the wrong element
    // because a press flushes unconditionally below.
    // しきい値未満の移動を保留せず捨てるため、わずかに動いた直後に手が止まると
    // ハイライトが数ピクセル古いまま残りうる。これは目に見えないうえ、下のとおり
    // 押下時に無条件でフラッシュするのでクリックが別の要素へ入ることはない。
    const scheduleHoverProbe = (controllerId: number, u: number, v: number) => {
      pendingHover.set(controllerId, { u, v });
      if (hoverRaf !== null) return;
      hoverRaf = requestAnimationFrame(runHoverProbes);
    };

    // A click has to land on whatever is under the cursor *now*, so settle every
    // hit test the rAF coalescing is still holding, epsilon or not.
    // クリックは「今」カーソルの下にあるものへ入らなければならないため、rAFのまとめ
    // 上げが保留しているヒットテストはしきい値に関わらずすべて確定させる。
    const flushHoverProbes = () => {
      if (hoverRaf !== null) {
        cancelAnimationFrame(hoverRaf);
        hoverRaf = null;
      }
      if (pendingHover.size === 0) return;
      const entries = Array.from(pendingHover);
      pendingHover.clear();
      entries.forEach(([controllerId, { u, v }]) => probeHover(controllerId, u, v));
    };

    // --- IPC handlers / IPCハンドラ ---

    const handleCursorMove = ({
      u,
      v,
      controllerId,
    }: {
      u: number;
      v: number;
      controllerId?: number;
    }) => {
      const id = Number.isFinite(controllerId) ? Number(controllerId) : 0;
      const element = ensureCursorNode(id);
      // OpenVR UV has its origin at the bottom left, the screen at the top left.
      // OpenVRのUVは原点が左下、画面は左上。
      cursorPositions.set(id, { u, v: 1.0 - v });
      applyCursorTransform(id);
      if (!shownCursors.has(id)) {
        shownCursors.add(id);
        element.style.visibility = 'visible';
      }
      scheduleHoverProbe(id, u, v);
    };

    // There is deliberately no inactivity timeout here. The main process is
    // authoritative about whether a controller is pointing at the overlay and
    // sends input-cursor-hide the moment the ray stops hitting it. A timeout
    // was a second, weaker answer to the same question, and once the main
    // process started dropping sub-pixel movements it began firing while the
    // controller was simply being held still - the cursor blinked out every
    // couple of seconds, and each blink repainted the page.
    // ここに無操作タイムアウトを置かないのは意図的である。コントローラーが
    // オーバーレイを指しているかどうかの判断はメインプロセスが持ち、レイが外れた
    // 瞬間に input-cursor-hide を送る。タイムアウトは同じ問いに対する二つ目の、
    // しかも弱い答えでしかなかった。メインプロセスがサブピクセルの移動を捨てる
    // ようになると、単に静止させているだけで発火し、カーソルが数秒おきに消えて
    // そのたびにページが描き直されていた。
    const handleCursorHide = ({ controllerId }: { controllerId?: number }) => {
      const id = Number.isFinite(controllerId) ? Number(controllerId) : 0;
      pendingHover.delete(id);
      lastProbedPoint.delete(id);
      clearHoverForController(id);
      clearPressedForController(id);
      if (!shownCursors.delete(id)) return;
      const element = cursorNodes.get(id);
      if (element) element.style.visibility = 'hidden';
    };

    const handleTriggerState = ({
      controllerId,
      pressed,
    }: {
      controllerId?: number;
      pressed?: boolean;
    }) => {
      const id = Number.isFinite(controllerId) ? Number(controllerId) : 0;
      if (pressed) {
        flushHoverProbes();
        pressedControllers.add(id);
        if (!pressedByController.has(id)) {
          const target = hoveredByController.get(id);
          if (target) {
            addPressed(target);
            pressedByController.set(id, target);
          }
        }
      } else {
        clearPressedForController(id);
      }
    };

    if (window.electronAPI?.onCursorMove) {
      window.electronAPI.onCursorMove(handleCursorMove);
    }
    if (window.electronAPI?.onCursorHide) {
      window.electronAPI.onCursorHide(handleCursorHide);
    }
    if (window.electronAPI?.onTriggerState) {
      window.electronAPI.onTriggerState(handleTriggerState);
    }

    // --- Renderer metrics / レンダラーのメトリクス ---

    const sendMetrics = () => {
      const metrics = {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      };
      if (window.electronAPI?.sendRendererMetrics) {
        window.electronAPI.sendRendererMetrics(metrics);
      } else if (window.electronAPI?.sendWindowSize) {
        window.electronAPI.sendWindowSize(metrics.width, metrics.height);
      }
    };

    const setupDprListener = () => {
      if (dprQuery) {
        dprQuery.removeEventListener('change', handleDprChange);
      }
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener('change', handleDprChange);
    };

    const handleDprChange = () => {
      sendMetrics();
      setupDprListener();
    };

    sendMetrics();
    setupDprListener();

    // The transforms are in pixels, so they have to be recomputed when the
    // viewport changes. The stored positions stay in UV for exactly this reason.
    // transformはピクセル単位なので、ビューポートが変わったら再計算が必要である。
    // 保持する位置をUVのままにしているのはまさにこのためである。
    const handleResize = () => {
      sendMetrics();
      cursorNodes.forEach((_element, controllerId) => applyCursorTransform(controllerId));
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (dprQuery) {
        dprQuery.removeEventListener('change', handleDprChange);
      }
      if (window.electronAPI?.removeCursorMoveListener) {
        window.electronAPI.removeCursorMoveListener(handleCursorMove);
      }
      if (window.electronAPI?.removeCursorHideListener) {
        window.electronAPI.removeCursorHideListener(handleCursorHide);
      }
      if (window.electronAPI?.removeTriggerStateListener) {
        window.electronAPI.removeTriggerStateListener(handleTriggerState);
      }
      if (hoverRaf !== null) {
        cancelAnimationFrame(hoverRaf);
        hoverRaf = null;
      }
      Array.from(hoveredByController.keys()).forEach(clearHoverForController);
      Array.from(pressedByController.keys()).forEach(clearPressedForController);
      cursorNodes.forEach((element) => element.remove());
      cursorNodes.clear();
    };
  }, []);

  // A fixed, zero-sized anchor at the viewport origin. The cursor nodes are
  // absolutely positioned inside it, so it must not carry a transform, filter or
  // will-change of its own.
  // ビューポート原点に置かれた、固定でサイズゼロのアンカー。カーソル要素はこの中で
  // absolute配置されるため、この要素自身がtransform・filter・will-changeを持っては
  // ならない。
  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  );
};

export default CursorOverlay;
