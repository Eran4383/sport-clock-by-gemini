// A simple wrapper for the Web Audio API to play tones.
// This avoids needing to manage and load audio files.

let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window !== 'undefined') {
    if (!audioContext) {
      try {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.error("Web Audio API is not supported in this browser");
        return null;
      }
    }
    // The AudioContext may be in a suspended state initially and needs to be resumed by a user gesture.
    // We attempt to resume it here, which works in many modern browsers if called from an event handler.
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  }
  return audioContext;
};

const playTone = (frequency: number, duration: number, volume: number, type: OscillatorType = 'sine', startTimeOffset: number = 0) => {
  const context = getAudioContext();
  if (!context || volume <= 0) return;
  
  // Ensure the context is running
  if (context.state === 'suspended') {
    context.resume();
  }

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.type = type;
  const startTime = context.currentTime + startTimeOffset;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  
  // Set volume and fade out to prevent clicks
  const clampedVolume = Math.max(0, Math.min(1, volume)); // ensure volume is between 0 and 1
  gainNode.gain.setValueAtTime(clampedVolume, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration / 1000);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration / 1000);
};

/**
 * A clear beep for the start of a countdown cycle.
 */
export const playStartSound = (volume: number) => {
    playTone(659.25, 150, volume, 'sine'); // E5 note
};


/**
 * A short, higher-pitched beep for general notifications like halfway point.
 */
export const playNotificationSound = (volume: number) => {
    playTone(880, 100, volume, 'triangle'); // A5 note
};

/**
 * A longer, two-tone "ding-dong" sound for final events like countdown end.
 */
export const playEndSound = (volume: number) => {
    // A high, short "ding"
    playTone(880, 150, volume, 'sine', 0); // A5 note
    // A lower, longer "dong"
    playTone(659.25, 400, volume, 'sine', 150 / 1000); // E5 note, starts after the first one
};
