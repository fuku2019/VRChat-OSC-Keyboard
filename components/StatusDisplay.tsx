import { WifiOff } from 'lucide-react';
import { CHATBOX } from '../constants';

interface StatusDisplayProps {
  displayTextLength: number;
  isSending: boolean;
  lastSent: string | null;
  error: string | null;
  sendingText: string;
  sentText: string;
}

// Status Display Component (character counter & send status) / ステータス表示コンポーネント（文字数カウンター＆送信ステータス）
const StatusDisplay = ({
  displayTextLength,
  isSending,
  lastSent,
  error,
  sendingText,
  sentText,
}: StatusDisplayProps) => {
  return (
    <div className='absolute top-2 right-4 flex gap-3 items-center pointer-events-none z-10'>
      {/* Character Counter / 文字数カウンター */}
      <span
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
          displayTextLength >= CHATBOX.MAX_LENGTH
            ? 'text-red-400 border-red-500/50 bg-red-900/20'
            : displayTextLength > CHATBOX.WARNING_THRESHOLD
              ? 'text-amber-400 border-amber-500/50 bg-amber-900/20'
              : 'dark:text-slate-400 text-slate-500 dark:border-slate-600 border-slate-200 dark:bg-slate-800/50 bg-slate-100/50'
        }`}
      >
        {displayTextLength}/{CHATBOX.MAX_LENGTH}
      </span>
      {isSending && (
        <span className='text-[10px] text-primary-400 font-mono animate-pulse'>
          {sendingText}
        </span>
      )}
      {lastSent && (
        <span className='text-[10px] text-green-400 font-mono'>{sentText}</span>
      )}
      {error && (
        <span className='text-[10px] text-red-400 font-mono flex items-center gap-1 bg-red-900/20 px-1 rounded border border-red-900/50'>
          <WifiOff size={10} /> {error}
        </span>
      )}
    </div>
  );
};

export default StatusDisplay;
