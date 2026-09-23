import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

interface PreeditUnderlineProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  text: string;
  range: { start: number; end: number } | null;
  isConverting: boolean;
  className: string; // Must lay text out exactly like the textarea / テキストエリアと同じ組版にすること
}

// A textarea cannot style part of its text, so this mirror sits behind it with
// the same text in transparent ink and draws only the preedit underline.
// テキストエリアは文字列の一部だけを装飾できないため、同じ文字列を透明で描く
// ミラーを背面に置き、未確定部分の下線だけを見せる。
const PreeditUnderline = ({
  textareaRef,
  text,
  range,
  isConverting,
  className,
}: PreeditUnderlineProps) => {
  const mirrorRef = useRef<HTMLDivElement>(null);

  // Match the textarea's content width (a scrollbar narrows it) and scroll.
  // テキストエリアの内容幅（スクロールバーで狭まる）とスクロール位置に合わせる。
  const sync = () => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;
    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.scrollTop = textarea.scrollTop;
  };

  useLayoutEffect(sync);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      textarea.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [textareaRef]);

  return (
    <div
      ref={mirrorRef}
      aria-hidden='true'
      className={`absolute top-0 left-0 h-full overflow-hidden pointer-events-none select-none whitespace-pre-wrap text-transparent ${className}`}
    >
      {range ? (
        <>
          {text.slice(0, range.start)}
          <span
            className={`underline underline-offset-4 decoration-slate-900 dark:decoration-white ${
              isConverting ? 'decoration-[3px]' : 'decoration-1 decoration-dotted'
            }`}
          >
            {text.slice(range.start, range.end)}
          </span>
          {text.slice(range.end)}
        </>
      ) : (
        text
      )}
      {/* Keeps a trailing newline's line box, like the textarea / 末尾の改行の行をテキストエリア同様に残す */}
      {'​'}
    </div>
  );
};

export default PreeditUnderline;
