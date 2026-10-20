import { useState, useMemo, useEffect, useRef } from 'react';
import { useConfigStore } from '../stores/configStore';
import { sendOscMessage } from '../services/oscService';
import { throttle } from '../utils/throttle';
import { TRANSLATIONS, TIMEOUTS, THROTTLE } from '../constants';
import type { ImeTextSnapshot } from '../types/ime';

/** Manual sends consume an immutable committed snapshot; previews remain throttled. */
export const useOscSender = (
  clearSentText: (snapshot: ImeTextSnapshot) => boolean,
  sendTypingStatus: (isTyping: boolean) => void,
  cancelTypingTimeout: () => void,
  onSendSuccess?: (text: string) => void,
) => {
  const config = useConfigStore((state) => state.config);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const lastSentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = TRANSLATIONS[config.language];

  const throttledAutoSend = useMemo(() => throttle((text: string, url: string) => {
    const current = useConfigStore.getState().config;
    if (!current.autoSend || current.copyMode || inFlight.current || !text) return;
    // Preview errors do not erase input or count as a completed manual send.
    void sendOscMessage(text, url, true, false).catch(() => {});
  }, THROTTLE.AUTO_SEND), []);

  useEffect(() => {
    if (!config.autoSend || config.copyMode) throttledAutoSend.cancel();
  }, [config.autoSend, config.copyMode, throttledAutoSend]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      throttledAutoSend.cancel();
      if (lastSentTimerRef.current) clearTimeout(lastSentTimerRef.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [throttledAutoSend]);

  const handleSend = async (snapshot: ImeTextSnapshot) => {
    throttledAutoSend.cancel();
    if (inFlight.current || !snapshot.text.trim()) return;
    // Set synchronously: two presses before React renders must still send once.
    inFlight.current = true;
    const sent = { ...snapshot };
    setIsSending(true);
    setError(null);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    try {
      const result = await sendOscMessage(sent.text, config.bridgeUrl);
      if (!mounted.current) return;
      if (!result.success) throw new Error(result.error || t.status.error);
      onSendSuccess?.(sent.text);
      setLastSent(sent.text);
      if (clearSentText(sent)) {
        sendTypingStatus(false);
        cancelTypingTimeout();
      }
      if (lastSentTimerRef.current) clearTimeout(lastSentTimerRef.current);
      lastSentTimerRef.current = setTimeout(() => setLastSent(null), TIMEOUTS.SENT_NOTIFICATION);
    } catch (cause: unknown) {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : t.status.error);
      errorTimerRef.current = setTimeout(() => setError(null), TIMEOUTS.ERROR_NOTIFICATION);
    } finally {
      inFlight.current = false;
      // Input changes while sending can have queued another preview.
      throttledAutoSend.cancel();
      if (mounted.current) setIsSending(false);
    }
  };

  return { isSending, lastSent, error, throttledAutoSend, handleSend };
};
