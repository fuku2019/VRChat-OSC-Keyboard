import type { ImeEngineStatus as EngineStatus } from '../types/ime';
import { useImeEngineStatus } from '../hooks/useImeEngineStatus';

export const describeImeEngine = (status: EngineStatus, language: 'ja' | 'en') => {
  const ja = language === 'ja';
  if (status.state === 'starting' || status.state === 'idle')
    return { label: ja ? '日本語変換を準備中…' : 'Preparing Japanese conversion…', detail: '' };
  const label = status.engine === 'zenzai' ? 'Zenzai'
    : status.engine === 'azookey' ? (ja ? '通常変換' : 'Dictionary conversion')
    : (ja ? 'かな変換' : 'Kana conversion');
  let detail = '';
  if (status.reason === 'model-unavailable') detail = ja
    ? 'Zenzaiモデルが未導入です。現在は通常変換を使用しています。モデルは手動での導入が必要です。'
    : 'The Zenzai model is not installed. Dictionary conversion is active. The model requires manual installation.';
  else if (status.reason === 'model-inference-unavailable' || status.reason === 'inference-failed') detail = ja
    ? 'Zenzaiを利用できないため、通常変換を使用しています。'
    : 'Zenzai is unavailable. Dictionary conversion is active.';
  else if (status.reason === 'browser-preview') detail = ja
    ? 'ブラウザーではかな変換を使用します。' : 'Browser preview uses kana conversion.';
  else if (status.engine !== 'zenzai' && status.engine !== 'azookey') detail = ja
    ? '変換エンジンを利用できないため、かな変換を使用しています。'
    : 'The conversion engine is unavailable. Kana conversion is active.';
  return { label, detail };
};

const ImeEngineStatus = ({ language }: { language: 'ja' | 'en' }) => {
  const status = useImeEngineStatus();
  const { label, detail } = describeImeEngine(status, language);
  return (
    <div role='status' aria-live='polite' className='mb-2 px-2 text-sm dark:text-slate-300 text-slate-600'>
      <span className='font-semibold'>{language === 'ja' ? '日本語変換：' : 'Japanese IME: '}{label}</span>
      {detail && <p className='mt-1'>{detail}</p>}
    </div>
  );
};
export default ImeEngineStatus;
