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
    return audioContext;
  }
  return null;
};

// New function to be called on user gesture to resume the AudioContext.
export const resumeAudioContext = () => {
    const context = getAudioContext();
    if (context && context.state === 'suspended') {
        context.resume().catch(e => console.error("Could not resume AudioContext:", e));
    }
};

const playTone = (frequency: number, duration: number, volume: number, type: OscillatorType = 'sine') => {
  const context = getAudioContext();
  if (!context || volume <= 0) return;
  
  // Ensure the context is running
  if (context.state === 'suspended') {
    // Attempt to resume, might fail if not triggered by user gesture, but worth a try.
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
 * A short, clear tone to indicate the start of a countdown.
 */
export const playStartSound = (volume: number) => {
    playTone(659.25, 100, volume, 'sine'); // E5 note
};

/**
 * A short, higher-pitched beep for general notifications like halfway point or restart.
 */
export const playNotificationSound = (volume: number) => {
    playTone(880, 100, volume, 'triangle'); // A5 note
};

/**
 * A very short, high-pitched tick for countdowns.
 */
export const playTickSound = (volume: number) => {
    playTone(1200, 80, volume, 'sine');
};

/**
 * A distinct, two-tone sound for final events like countdown end.
 */
export const playEndSound = (volume: number) => {
    const context = getAudioContext();
    if (!context) return;
    
    // Play the first tone
    playTone(523.25, 150, volume, 'sine'); // C5 note
    
    // Play the second, lower tone shortly after
    setTimeout(() => {
        playTone(392.00, 150, volume, 'sine'); // G4 note
    }, 160);
};