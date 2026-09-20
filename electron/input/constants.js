// Movement below this counts as the pointer being still, for the idle timing
// the drag logic keeps. It is deliberately tiny.
// これ未満の移動はポインタが静止しているとみなす。ドラッグ処理が持つ静止判定の
// タイミング用で、意図的にごく小さくしてある。
export const CURSOR_MOVE_EPSILON = 0.0005;

// Movement below this is not worth sending to the renderer. Kept separate from
// CURSOR_MOVE_EPSILON because the two answer different questions, and because
// this one has to clear real hand tremor: at 1101px wide, 0.0005 is about half
// a pixel, which a held-still controller crosses on every tick - so the page
// kept repainting, and with offscreen rendering every repaint is an overlay
// frame. 0.002 is roughly 2px, still invisible on a cursor.
// これ未満の移動はレンダラーへ送る価値がない。CURSOR_MOVE_EPSILON とは別にするのは、
// 両者が答える問いが違ううえ、こちらは実際の手の震えを超える必要があるためである。
// 幅1101pxでは 0.0005 は約0.5pxで、静止させたコントローラーでも毎ティック超えてしまい、
// ページが描き直され続けていた。オフスクリーン描画では描き直しがそのまま
// オーバーレイのフレームになる。0.002 はおよそ2pxで、カーソルとしては見て分からない。
export const CURSOR_SEND_EPSILON = 0.002;

// 1e pointer filter defaults. minCutoff sets how heavily a slow-moving pointer
// is damped: at the input loop's 8ms tick, the previous 1.5Hz worked out to a
// time constant of about 106ms - an order of magnitude more than a rendered
// frame, and the largest single source of the cursor feeling behind the hand.
// 4Hz brings that to roughly 48ms; beta came down with it because 3.0 was high
// enough that fast movement passed through almost unfiltered.
// These live here rather than at the call site so --pointer-filter can override
// them without a rebuild, since the right values can only be found in a headset.
// 1€ポインタフィルタの既定値。minCutoff は低速時の減衰の強さを決める。入力ループの
// 8msティックでは従来の 1.5Hz が時定数およそ106msに相当し、描画1フレームより一桁
// 大きく、カーソルが手に遅れて感じられる最大の要因だった。4Hz でおよそ48msになる。
// beta も下げたのは、3.0 では高速移動時にほぼ素通しになっていたためである。
// 適切な値はヘッドセットを被らないと決められないため、--pointer-filter でビルドし
// 直さずに上書きできるよう、呼び出し側ではなくここに置く。
export const POINTER_MIN_CUTOFF = 4.0;
export const POINTER_BETA = 1.0;
export const POINTER_D_CUTOFF = 1.0;
export const TRIGGER_DRAG_THRESHOLD = 0.015;
export const TRIGGER_CLICK_CANCEL_THRESHOLD = 0.03;
export const TRIGGER_SCROLL_MULTIPLIER = 0.5;
export const TRIGGER_SCROLL_MAX = 140;
