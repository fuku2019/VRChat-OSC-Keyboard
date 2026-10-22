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
    <div className='flex gap-3 items-center pointer-events-none text-sm tabular-nums'>
      {error && (
        <span className='text-error bg-error-container flex items-center gap-1.5 px-3 py-1 rounded-full'>
          <WifiOff size={14} /> {error}
        </span>
      )}
      {isSending && <span className='text-ink-muted'>{sendingText}</span>}
      {lastSent && <span className='text-success'>{sentText}</span>}
      {/* Character Counter / 文字数カウンター */}
      <span
        className={
          displayTextLength >= CHATBOX.MAX_LENGTH
            ? 'text-error bg-error-container px-3 py-1 rounded-full'
            : displayTextLength > CHATBOX.WARNING_THRESHOLD
              ? 'text-warning bg-warning-container px-3 py-1 rounded-full'
              : 'text-ink-muted px-3 py-1'
        }
      >
        {displayTextLength} / {CHATBOX.MAX_LENGTH}
      </span>
    </div>
  );
};

export default StatusDisplay;
