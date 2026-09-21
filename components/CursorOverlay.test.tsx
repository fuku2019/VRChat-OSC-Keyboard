/**
 * CursorOverlay tests - the point of this component is what it does *not* do per
 * cursor event: no React state update, no layout-invalidating position, and no
 * hit test unless the cursor really moved. These tests pin that down.
 * CursorOverlay のテスト - このコンポーネントの要点は、カーソルイベントごとに
 * 「やらないこと」にある: Reactのstate更新なし、レイアウトを無効化する位置指定なし、
 * 実際に動いていなければヒットテストもなし。それをここで固定する。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import CursorOverlay from './CursorOverlay';

type CursorMove = { u: number; v: number; controllerId?: number };
type CursorHide = { controllerId?: number };
type TriggerState = { controllerId?: number; pressed?: boolean };

const listeners = {
  move: [] as ((data: CursorMove) => void)[],
  hide: [] as ((data: CursorHide) => void)[],
  trigger: [] as ((data: TriggerState) => void)[],
};

const emitMove = (data: CursorMove) => listeners.move.forEach((fn) => fn(data));
const emitHide = (data: CursorHide) => listeners.hide.forEach((fn) => fn(data));
const emitTrigger = (data: TriggerState) => listeners.trigger.forEach((fn) => fn(data));

// The hit test is coalesced into a requestAnimationFrame, so a test that wants to
// observe it has to let one frame go by.
// ヒットテストはrequestAnimationFrameへまとめ上げられるため、観測したいテストは
// 1フレーム進める必要がある。
const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

const cursorNode = (controllerId: number) =>
  document.querySelector<HTMLElement>(`[data-vr-cursor="${controllerId}"]`);

// jsdom implements neither of these, and the component uses both on mount, so
// they have to exist before anything can be spied on.
// jsdomはこの2つをどちらも実装していないが、コンポーネントはマウント時に両方を
// 使うため、スパイを張る前に存在させておく必要がある。
const stubJsdomGaps = () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
  Object.defineProperty(document, 'elementFromPoint', {
    value: () => null,
    writable: true,
    configurable: true,
  });
};

beforeEach(() => {
  stubJsdomGaps();
  listeners.move = [];
  listeners.hide = [];
  listeners.trigger = [];
  window.electronAPI = {
    onCursorMove: (fn) => listeners.move.push(fn),
    removeCursorMoveListener: (fn) => {
      listeners.move = listeners.move.filter((registered) => registered !== fn);
    },
    onCursorHide: (fn) => listeners.hide.push(fn),
    removeCursorHideListener: (fn) => {
      listeners.hide = listeners.hide.filter((registered) => registered !== fn);
    },
    onTriggerState: (fn) => listeners.trigger.push(fn),
    removeTriggerStateListener: (fn) => {
      listeners.trigger = listeners.trigger.filter((registered) => registered !== fn);
    },
    sendRendererMetrics: vi.fn(),
  } as unknown as Window['electronAPI'];
});

afterEach(() => {
  cleanup();
  window.electronAPI = undefined;
  vi.restoreAllMocks();
});

describe('cursor positioning', () => {
  it('moves the cursor with a transform instead of top/left', () => {
    render(<CursorOverlay />);

    emitMove({ u: 0.5, v: 0.5, controllerId: 1 });

    const node = cursorNode(1);
    expect(node).toBeTruthy();
    expect(node!.style.transform).toContain('translate3d');
    // top/left stay at 0 - the position is carried entirely by the transform.
    // top/left は0のまま - 位置はすべてtransformが担う。
    expect(node!.style.top).toBe('0px');
    expect(node!.style.left).toBe('0px');
  });

  it('flips the OpenVR v axis into screen space', () => {
    render(<CursorOverlay />);

    // v=1 is the top of the overlay, which is y=0 on screen.
    // v=1 はオーバーレイの上端で、画面ではy=0になる。
    emitMove({ u: 0, v: 1, controllerId: 1 });
    expect(cursorNode(1)!.style.transform).toContain('translate3d(0px, 0px, 0)');

    emitMove({ u: 0, v: 0, controllerId: 1 });
    expect(cursorNode(1)!.style.transform).toContain(`translate3d(0px, ${window.innerHeight}px, 0)`);
  });

  it('reuses the same node across moves rather than remounting it', () => {
    render(<CursorOverlay />);

    emitMove({ u: 0.1, v: 0.1, controllerId: 1 });
    const first = cursorNode(1);
    emitMove({ u: 0.9, v: 0.9, controllerId: 1 });

    expect(cursorNode(1)).toBe(first);
  });

  it('keeps one node per controller', () => {
    render(<CursorOverlay />);

    emitMove({ u: 0.2, v: 0.2, controllerId: 1 });
    emitMove({ u: 0.8, v: 0.8, controllerId: 2 });

    expect(document.querySelectorAll('[data-vr-cursor]').length).toBe(2);
    expect(cursorNode(1)!.style.transform).not.toBe(cursorNode(2)!.style.transform);
  });

  it('hides with visibility and keeps the node for the next appearance', () => {
    render(<CursorOverlay />);

    emitMove({ u: 0.5, v: 0.5, controllerId: 1 });
    expect(cursorNode(1)!.style.visibility).toBe('visible');

    emitHide({ controllerId: 1 });
    expect(cursorNode(1)).toBeTruthy();
    expect(cursorNode(1)!.style.visibility).toBe('hidden');

    emitMove({ u: 0.5, v: 0.5, controllerId: 1 });
    expect(cursorNode(1)!.style.visibility).toBe('visible');
  });

  it('removes its nodes on unmount', () => {
    const { unmount } = render(<CursorOverlay />);
    emitMove({ u: 0.5, v: 0.5, controllerId: 1 });

    unmount();

    expect(document.querySelectorAll('[data-vr-cursor]').length).toBe(0);
  });
});

describe('hover hit testing', () => {
  // jsdom has no layout, so elementFromPoint always returns null. Only the number
  // of calls is meaningful here.
  // jsdomにはレイアウトが無いためelementFromPointは常にnullを返す。ここで意味を
  // 持つのは呼び出し回数だけである。
  const spyOnHitTest = () => vi.spyOn(document, 'elementFromPoint').mockReturnValue(null);

  it('does not hit test synchronously inside the cursor event', () => {
    const hitTest = spyOnHitTest();
    render(<CursorOverlay />);

    emitMove({ u: 0.5, v: 0.5, controllerId: 1 });

    expect(hitTest).not.toHaveBeenCalled();
  });

  it('hit tests once per frame however many events arrive', async () => {
    const hitTest = spyOnHitTest();
    render(<CursorOverlay />);

    emitMove({ u: 0.1, v: 0.5, controllerId: 1 });
    emitMove({ u: 0.3, v: 0.5, controllerId: 1 });
    emitMove({ u: 0.5, v: 0.5, controllerId: 1 });
    await nextFrame();

    expect(hitTest).toHaveBeenCalledTimes(1);
  });

  it('skips the hit test when the cursor barely moved', async () => {
    const hitTest = spyOnHitTest();
    render(<CursorOverlay />);

    emitMove({ u: 0.5, v: 0.5, controllerId: 1 });
    await nextFrame();
    expect(hitTest).toHaveBeenCalledTimes(1);

    // One CSS pixel of movement, well under the 4px gate.
    // CSSピクセル1つ分の移動で、4pxのしきい値を大きく下回る。
    emitMove({ u: 0.5 + 1 / window.innerWidth, v: 0.5, controllerId: 1 });
    await nextFrame();

    expect(hitTest).toHaveBeenCalledTimes(1);
  });

  it('hit tests again once the cursor has moved past the gate', async () => {
    const hitTest = spyOnHitTest();
    render(<CursorOverlay />);

    emitMove({ u: 0.5, v: 0.5, controllerId: 1 });
    await nextFrame();

    emitMove({ u: 0.5 + 20 / window.innerWidth, v: 0.5, controllerId: 1 });
    await nextFrame();

    expect(hitTest).toHaveBeenCalledTimes(2);
  });

  it('hit tests each controller independently', async () => {
    const hitTest = spyOnHitTest();
    render(<CursorOverlay />);

    emitMove({ u: 0.2, v: 0.5, controllerId: 1 });
    emitMove({ u: 0.8, v: 0.5, controllerId: 2 });
    await nextFrame();

    expect(hitTest).toHaveBeenCalledTimes(2);
  });

  it('settles the pending hit test synchronously when the trigger is pressed', () => {
    const hitTest = spyOnHitTest();
    render(<CursorOverlay />);

    emitMove({ u: 0.5, v: 0.5, controllerId: 1 });
    expect(hitTest).not.toHaveBeenCalled();

    // A click must land on what is under the cursor now, not one frame ago.
    // クリックは1フレーム前ではなく今カーソルの下にあるものへ入らねばならない。
    emitTrigger({ controllerId: 1, pressed: true });

    expect(hitTest).toHaveBeenCalledTimes(1);
  });

  it('settles the trigger flush even below the movement gate', async () => {
    const hitTest = spyOnHitTest();
    render(<CursorOverlay />);

    emitMove({ u: 0.5, v: 0.5, controllerId: 1 });
    await nextFrame();
    expect(hitTest).toHaveBeenCalledTimes(1);

    emitMove({ u: 0.5 + 1 / window.innerWidth, v: 0.5, controllerId: 1 });
    emitTrigger({ controllerId: 1, pressed: true });

    expect(hitTest).toHaveBeenCalledTimes(2);
  });

  it('drops a pending hit test when the cursor is hidden', async () => {
    const hitTest = spyOnHitTest();
    render(<CursorOverlay />);

    emitMove({ u: 0.5, v: 0.5, controllerId: 1 });
    emitHide({ controllerId: 1 });
    await nextFrame();

    expect(hitTest).not.toHaveBeenCalled();
  });
});

describe('hover and press classes', () => {
  const renderWithButton = () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(button);
    render(<CursorOverlay />);
    return button;
  };

  it('marks the element under the cursor as hovered', async () => {
    const button = renderWithButton();

    emitMove({ u: 0.5, v: 0.5, controllerId: 1 });
    await nextFrame();

    expect(button.classList.contains('vr-hover')).toBe(true);
  });

  it('clears hover and press when the cursor is hidden', async () => {
    const button = renderWithButton();

    emitMove({ u: 0.5, v: 0.5, controllerId: 1 });
    await nextFrame();
    emitTrigger({ controllerId: 1, pressed: true });
    expect(button.classList.contains('vr-pressed')).toBe(true);

    emitHide({ controllerId: 1 });

    expect(button.classList.contains('vr-hover')).toBe(false);
    expect(button.classList.contains('vr-pressed')).toBe(false);
  });

  it('keeps the hover class while a second controller still points at it', async () => {
    const button = renderWithButton();

    emitMove({ u: 0.4, v: 0.5, controllerId: 1 });
    emitMove({ u: 0.6, v: 0.5, controllerId: 2 });
    await nextFrame();
    expect(button.classList.contains('vr-hover')).toBe(true);

    emitHide({ controllerId: 1 });

    expect(button.classList.contains('vr-hover')).toBe(true);
  });
});
