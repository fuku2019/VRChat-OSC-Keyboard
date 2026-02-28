import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_SOUND_SRC = '/sounds/key-soft.mp3';
const AUDIO_POOL_SIZE = 6;
const DEFAULT_VOLUME = 0.22;

const clampVolume = (value: number) => Math.min(1, Math.max(0, value));

interface UseKeyPressSoundOptions {
  enabled?: boolean;
  volume?: number;
  src?: string;
}

export const useKeyPressSound = ({
  enabled = true,
  volume = DEFAULT_VOLUME,
  src = DEFAULT_SOUND_SRC,
}: UseKeyPressSoundOptions = {}) => {
  const audioPoolRef = useRef<HTMLAudioElement[]>([]);
  const audioIndexRef = useRef(0);
  const audioFileErroredRef = useRef(false);
  const audioLoadErrorCountRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const normalizedVolume = clampVolume(volume);

  useEffect(() => {
    if (!enabled) {
      audioPoolRef.current = [];
      return;
    }

    audioFileErroredRef.current = false;
    audioLoadErrorCountRef.current = 0;
    const poolWithHandlers = Array.from({ length: AUDIO_POOL_SIZE }, () => {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.volume = normalizedVolume;
      const handleError = () => {
        audioLoadErrorCountRef.current += 1;
        if (audioLoadErrorCountRef.current >= AUDIO_POOL_SIZE) {
          audioFileErroredRef.current = true;
        }
      };
      audio.addEventListener(
        'error',
        handleError,
        { once: true },
      );
      return { audio, handleError };
    });
    const pool = poolWithHandlers.map((entry) => entry.audio);

    audioPoolRef.current = pool;
    return () => {
      poolWithHandlers.forEach(({ audio, handleError }) => {
        audio.removeEventListener('error', handleError);
        audio.pause();
      });
      audioPoolRef.current = [];
    };
  }, [enabled, src, normalizedVolume]);

  useEffect(() => {
    audioPoolRef.current.forEach((audio) => {
      audio.volume = normalizedVolume;
    });
  }, [normalizedVolume]);

  const playFallbackClick = useCallback(() => {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    const context = audioContextRef.current;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(1800, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(now);
    oscillator.stop(now + 0.05);
  }, []);

  const play = useCallback(() => {
    if (!enabled) return;

    if (audioFileErroredRef.current || audioPoolRef.current.length === 0) {
      playFallbackClick();
      return;
    }

    const pool = audioPoolRef.current;
    for (let i = 0; i < pool.length; i += 1) {
      const index = audioIndexRef.current;
      const audio = pool[index];
      audioIndexRef.current = (audioIndexRef.current + 1) % pool.length;

      if (audio.error) {
        continue;
      }

      audio.currentTime = 0;
      void audio.play().catch(() => {
        playFallbackClick();
      });
      return;
    }

    playFallbackClick();
  }, [enabled, playFallbackClick]);

  return play;
};
