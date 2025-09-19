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

const playTone = (frequency: number, duration: number, volume: number, type: OscillatorType = 'sine') => {
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
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  
  // Set volume and fade out to prevent clicks
  const clampedVolume = Math.max(0, Math.min(1, volume)); // ensure volume is between 0 and 1
  gainNode.gain.setValueAtTime(clampedVolume, context.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration / 1000);

  oscillator.start(context.currentTime);
  oscillator.stop(context.currentTime + duration / 1000);
};

/**
 * A short, higher-pitched beep for general notifications like halfway point or restart.
 */
export const playNotificationSound = (volume: number) => {
    playTone(880, 100, volume, 'triangle'); // A5 note
};

/**
 * A slightly longer, lower-pitched beep for final events like countdown end.
 */
export const playEndSound = (volume: number) => {
    playTone(523.25, 200, volume, 'sine'); // C5 note
};
