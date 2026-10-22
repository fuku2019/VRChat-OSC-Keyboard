import { FC } from 'react';
import { TRANSLATIONS } from '../constants';
import { Language } from '../types';
import { useModalAnimation } from '../hooks/useModalAnimation';

interface TutorialOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

// Tutorial overlay component / チュートリアルオーバーレイコンポーネント
const TutorialOverlay: FC<TutorialOverlayProps> = ({
  isOpen,
  onClose,
  language,
}) => {
  const { shouldRender, animationClass, modalAnimationClass } =
    useModalAnimation(isOpen);

  if (!shouldRender) return null;

  const t = TRANSLATIONS[language].tutorial;

  // The steps really are a sequence, so they are numbered.
  // 手順は実際に順番があるので番号を振る。
  const steps = [
    { title: t.step1Title, desc: t.step1Desc },
    { title: t.step2Title, desc: t.step2Desc },
    { title: t.step3Title, desc: t.step3Desc },
  ];

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-canvas p-4 ${animationClass}`}
    >
      <div
        className={`w-full max-w-xl bg-key text-ink rounded-[28px] p-10 overflow-y-auto max-h-full ${modalAnimationClass}`}
      >
        <h2 className='text-3xl mb-3'>{t.title}</h2>
        <p className='text-ink-muted mb-8 leading-relaxed [word-break:auto-phrase]'>{t.subtitle}</p>

        <ol className='space-y-6 mb-10'>
          {steps.map((step, i) => (
            <li key={i} className='flex gap-4'>
              <span className='shrink-0 w-9 h-9 rounded-full bg-tonal text-on-tonal flex items-center justify-center text-base font-medium tabular-nums'>
                {i + 1}
              </span>
              <div className='pt-1'>
                <h3 className='text-[17px] mb-1'>{step.title}</h3>
                <p className='text-sm text-ink-muted leading-relaxed [word-break:auto-phrase]'>{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className='flex justify-end'>
          <button
            onClick={onClose}
            className='px-8 py-3 rounded-full bg-accent text-on-accent text-base font-medium'
          >
            {t.startButton}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TutorialOverlay;
