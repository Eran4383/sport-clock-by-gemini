

import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { playNotificationSound } from '../utils/sound';

const Toggle: React.FC<{
  id: string;
  label: string;
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}> = ({ id, label, checked, onChange, disabled = false }) => (
  <div className={`flex items-center justify-between ${disabled ? 'opacity-50' : ''}`}>
    <span className="text-white">{label}</span>
    <label htmlFor={id} className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <input 
        type="checkbox" 
        id={id} 
        className="sr-only peer" 
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <div className={`w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500`}></div>
    </label>
  </div>
);

const RangeSlider: React.FC<{
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ id, label, value, min = 50, max = 200, step = 1, onChange }) => (
    <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-white">{label}</label>
        <div className="flex items-center gap-3 w-1/2">
            <input
                type="range"
                id={id}
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={onChange}
                className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-sm font-mono text-gray-400 w-10 text-right">{value}%</span>
        </div>
    </div>
);

export const SettingsMenu: React.FC<{ isOpen: boolean; setIsOpen: (open: boolean) => void; }> = ({ isOpen, setIsOpen }) => {
  const { settings, updateSettings } = useSettings();
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationInputRef = useRef<HTMLInputElement>(null);
  const restInputRef = useRef<HTMLInputElement>(null);
  const preWorkoutInputRef = useRef<HTMLInputElement>(null);
  
  const [localCountdownDurationStr, setLocalCountdownDurationStr] = useState(settings.countdownDuration.toString());
  const [localRestDurationStr, setLocalRestDurationStr] = useState(settings.countdownRestDuration.toString());
  const [localPreWorkoutCountdownStr, setLocalPreWorkoutCountdownStr] = useState(settings.preWorkoutCountdownDuration.toString());


  useEffect(() => {
    if (document.activeElement !== durationInputRef.current) {
      setLocalCountdownDurationStr(settings.countdownDuration.toString());
    }
  }, [settings.countdownDuration]);
  
  useEffect(() => {
    if (document.activeElement !== restInputRef.current) {
      setLocalRestDurationStr(settings.countdownRestDuration.toString());
    }
  }, [settings.countdownRestDuration]);

  useEffect(() => {
    if (document.activeElement !== preWorkoutInputRef.current) {
      setLocalPreWorkoutCountdownStr(settings.preWorkoutCountdownDuration.toString());
    }
  }, [settings.preWorkoutCountdownDuration]);

  // Auto-close logic
  useEffect(() => {
    // Clear timer if menu is closed manually
    if (!isOpen && closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    // Cleanup on unmount
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, [isOpen]);

  // Effect to handle wheel events on number inputs without scrolling the parent
  useEffect(() => {
    const handleWheel = (
      e: WheelEvent,
      stateUpdater: React.Dispatch<React.SetStateAction<string>>,
      min: number
    ) => {
      // Prevent parent from scrolling
      e.preventDefault();
      
      const input = e.currentTarget as HTMLInputElement;
      if (document.activeElement === input) {
        input.blur();
      }
      
      const delta = e.deltaY > 0 ? -1 : 1; // Invert for natural scrolling
      stateUpdater(prev => {
          const currentVal = parseInt(prev, 10) || 0;
          const nextVal = currentVal + delta;
          if (nextVal < min) return min.toString();
          return nextVal.toString();
      });
    };

    const durationEl = durationInputRef.current;
    const restEl = restInputRef.current;
    const preWorkoutEl = preWorkoutInputRef.current;


    // We need to create these wrapper functions because addEventListener and removeEventListener need the exact same function reference.
    const durationWheelHandler = (e: WheelEvent) => handleWheel(e, setLocalCountdownDurationStr, 1);
    const restWheelHandler = (e: WheelEvent) => handleWheel(e, setLocalRestDurationStr, 0);
    const preWorkoutWheelHandler = (e: WheelEvent) => handleWheel(e, setLocalPreWorkoutCountdownStr, 1);
    
    if (durationEl) {
      durationEl.addEventListener('wheel', durationWheelHandler, { passive: false });
    }
    if (restEl) {
      restEl.addEventListener('wheel', restWheelHandler, { passive: false });
    }
    if (preWorkoutEl) {
        preWorkoutEl.addEventListener('wheel', preWorkoutWheelHandler, { passive: false });
    }

    return () => {
      if (durationEl) {
        durationEl.removeEventListener('wheel', durationWheelHandler);
      }
      if (restEl) {
        restEl.removeEventListener('wheel', restWheelHandler);
      }
      if (preWorkoutEl) {
        preWorkoutEl.removeEventListener('wheel', preWorkoutWheelHandler);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  
  const handleDurationBlur = () => {
     const num = parseInt(localCountdownDurationStr, 10);
     const finalValue = !isNaN(num) && num >= 1 ? num : 1;
     setLocalCountdownDurationStr(finalValue.toString());
     updateSettings({ countdownDuration: finalValue });
  };
  
  const handleRestBlur = () => {
     const num = parseInt(localRestDurationStr, 10);
     const finalValue = !isNaN(num) && num >= 0 ? num : 0;
     setLocalRestDurationStr(finalValue.toString());
     updateSettings({ countdownRestDuration: finalValue });
  };
  
  const handlePreWorkoutBlur = () => {
     const num = parseInt(localPreWorkoutCountdownStr, 10);
     const finalValue = !isNaN(num) && num >= 1 ? num : 1;
     setLocalPreWorkoutCountdownStr(finalValue.toString());
     updateSettings({ preWorkoutCountdownDuration: finalValue });
  };


  const handleClose = () => {
    // Save any pending changes before closing
    handleDurationBlur();
    handleRestBlur();
    handlePreWorkoutBlur();
    setIsOpen(false);
  };

  const handleMouseLeave = () => {
    if (isOpen) {
      closeTimerRef.current = setTimeout(() => {
        handleClose();
      }, 10000); // 10 seconds
    }
  };
  
    // Touch handlers for swipe-to-close gesture
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const minSwipeDistance = 50;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null; // reset end coordinate
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchEndX.current - touchStartX.current;
    // Swipe right to close
    if (distance > minSwipeDistance) {
        handleClose();
    }
    // Reset
    touchStartX.current = null;
    touchEndX.current = null;
  };


  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    updateSettings({ volume: newVolume, isMuted: newVolume === 0 });
  };

  const toggleMute = () => {
    if (settings.isMuted) {
      updateSettings({
        isMuted: false,
        volume: settings.volume === 0 ? 0.5 : settings.volume,
      });
    } else {
      updateSettings({ isMuted: true });
    }
  };

  const playVolumeFeedback = () => {
    if (settings.allSoundsEnabled && !settings.isMuted && !settings.stealthModeEnabled) {
      playNotificationSound(settings.volume);
    }
  };

  return (
    <>
      <div className="absolute top-4 right-4 menu-container group">
        <button 
          onClick={() => isOpen ? handleClose() : setIsOpen(true)} 
          aria-label="Open settings menu"
          className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-opacity duration-1000 focus:outline-none opacity-0 group-hover:opacity-100"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        </button>
      </div>

      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40"
          onClick={handleClose}
        ></div>
      )}

      <div 
        className={`fixed top-0 right-0 h-full w-full max-w-sm bg-gray-800/80 backdrop-blur-md shadow-2xl z-50 transform transition-all ease-in-out ${isOpen ? 'duration-500' : 'duration-[1500ms]'} ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        >
          <div className="p-6 overflow-y-auto h-full">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-white">Settings</h2>
              <button onClick={handleClose} aria-label="Close settings menu" className="p-2 rounded-full hover:bg-gray-500/30">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="space-y-8">

              <div>
                <h3 className="text-lg font-semibold text-gray-300 mb-3">Countdown</h3>
                <div className="bg-gray-700/50 p-3 rounded-lg space-y-4">
                  <Toggle id="showCountdownToggle" label="Show Countdown" checked={settings.showCountdown} onChange={(e) => updateSettings({ showCountdown: e.target.checked })} />
                  <Toggle id="showCountdownControlsToggle" label="Show Controls" checked={settings.showCountdownControls} onChange={(e) => updateSettings({ showCountdownControls: e.target.checked })} />
                  <Toggle id="showRestTitleToggle" label="Show 'Rest' Title" checked={settings.showRestTitleOnDefaultCountdown} onChange={(e) => updateSettings({ showRestTitleOnDefaultCountdown: e.target.checked })} />
                  
                  <hr className="border-gray-600" />
                  
                  <div className="flex items-center justify-between">
                     <label htmlFor="preWorkoutDuration" className="text-white">Pre-Workout Time (s)</label>
                     <input
                        ref={preWorkoutInputRef}
                        type="number"
                        id="preWorkoutDuration"
                        min="1"
                        className="w-20 bg-gray-600 text-white text-center rounded-md p-1 focus:ring-2 focus:outline-none ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={localPreWorkoutCountdownStr}
                        onChange={(e) => setLocalPreWorkoutCountdownStr(e.target.value)}
                        onBlur={handlePreWorkoutBlur}
                     />
                  </div>

                  <div className="flex items-center justify-between">
                     <label htmlFor="countdownDuration" className="text-white">Duration (s)</label>
                     <input
                        ref={durationInputRef}
                        type="number"
                        id="countdownDuration"
                        min="1"
                        className="w-20 bg-gray-600 text-white text-center rounded-md p-1 focus:ring-2 focus:outline-none ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={localCountdownDurationStr}
                        onChange={(e) => setLocalCountdownDurationStr(e.target.value)}
                        onBlur={handleDurationBlur}
                     />
                  </div>
                   <div className="flex items-center justify-between">
                     <label htmlFor="countdownRestDuration" className="text-white">Rest Duration (s)</label>
                     <input
                        ref={restInputRef}
                        type="number"
                        id="countdownRestDuration"
                        min="0"
                        className="w-20 bg-gray-600 text-white text-center rounded-md p-1 focus:ring-2 focus:outline-none ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={localRestDurationStr}
                        onChange={(e) => setLocalRestDurationStr(e.target.value)}
                        onBlur={handleRestBlur}
                     />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-300 mb-3">Stopwatch</h3>
                <div className="bg-gray-700/50 p-3 rounded-lg space-y-4">
                  <Toggle id="showTimerToggle" label="Show Stopwatch" checked={settings.showTimer} onChange={(e) => updateSettings({ showTimer: e.target.checked })} />
                  <Toggle id="showStopwatchControlsToggle" label="Show Controls" checked={settings.showStopwatchControls} onChange={(e) => updateSettings({ showStopwatchControls: e.target.checked })} />
                   <Toggle id="showCycleCounterToggle" label="Show Cycle Counter" checked={settings.showCycleCounter} onChange={(e) => updateSettings({ showCycleCounter: e.target.checked })} />
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-300 mb-3">Workout Display</h3>
                <div className="bg-gray-700/50 p-3 rounded-lg space-y-4">
                  <Toggle id="showNextExercise" label="Show Next Exercise" checked={settings.showNextExercise} onChange={(e) => updateSettings({ showNextExercise: e.target.checked })} />
                </div>
              </div>

               <div>
                <h3 className="text-lg font-semibold text-gray-300 mb-3">Sounds</h3>
                <div className="bg-gray-700/50 p-3 rounded-lg space-y-4">
                  <Toggle id="allSoundsEnabled" label="Enable All Sounds" checked={settings.allSoundsEnabled} onChange={(e) => updateSettings({ allSoundsEnabled: e.target.checked })} />
                  <hr className="border-gray-600" />
                  <Toggle id="playSoundAtHalfway" label="Play at halfway" checked={settings.playSoundAtHalfway} onChange={(e) => updateSettings({ playSoundAtHalfway: e.target.checked })} disabled={!settings.allSoundsEnabled} />
                  <Toggle id="playSoundAtEnd" label="Play at end" checked={settings.playSoundAtEnd} onChange={(e) => updateSettings({ playSoundAtEnd: e.target.checked })} disabled={!settings.allSoundsEnabled} />
                  <Toggle id="playSoundOnRestart" label="Play on restart" checked={settings.playSoundOnRestart} onChange={(e) => updateSettings({ playSoundOnRestart: e.target.checked })} disabled={!settings.allSoundsEnabled} />
                  
                  <div className={`pt-2 ${!settings.allSoundsEnabled ? 'opacity-50' : ''}`}>
                    <label htmlFor="volumeControl" className="text-white mb-2 block">Volume</label>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={toggleMute} 
                        aria-label={settings.isMuted ? 'Unmute' : 'Mute'}
                        className="text-white p-1 focus:outline-none rounded-full"
                        disabled={!settings.allSoundsEnabled}
                      >
                         {settings.isMuted || settings.volume === 0 ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l-4-4m0 4l4-4" /></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                          )}
                      </button>
                       <input
                          type="range"
                          id="volumeControl"
                          min="0"
                          max="1"
                          step="0.01"
                          value={settings.isMuted ? 0 : settings.volume}
                          onChange={handleVolumeChange}
                          onMouseUp={playVolumeFeedback}
                          onKeyUp={playVolumeFeedback}
                          className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                          disabled={!settings.allSoundsEnabled}
                       />
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-300 mb-3">Display Sizes</h3>
                <div className="bg-gray-700/50 p-3 rounded-lg space-y-4">
                    <RangeSlider id="countdownSize" label="Countdown" value={settings.countdownSize} onChange={e => updateSettings({ countdownSize: parseInt(e.target.value, 10) })} />
                    <RangeSlider id="stopwatchSize" label="Stopwatch" value={settings.stopwatchSize} onChange={e => updateSettings({ stopwatchSize: parseInt(e.target.value, 10) })} />
                    <RangeSlider id="countdownControlsSize" label="Countdown Controls" value={settings.countdownControlsSize} onChange={e => updateSettings({ countdownControlsSize: parseInt(e.target.value, 10) })} />
                    <RangeSlider id="stopwatchControlsSize" label="Stopwatch Controls" value={settings.stopwatchControlsSize} onChange={e => updateSettings({ stopwatchControlsSize: parseInt(e.target.value, 10) })} />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-300 mb-3">Display Colors</h3>
                <div className="bg-gray-700/50 p-3 rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <label htmlFor="backgroundColor" className="text-white">Background</label>
                    <input
                      type="color"
                      id="backgroundColor"
                      value={settings.backgroundColor}
                      onChange={(e) => updateSettings({ backgroundColor: e.target.value })}
                      className="w-10 h-10 p-0 bg-transparent border-none rounded-md cursor-pointer"
                      title="Set the main background color"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="halfwayColor" className="text-white">Halfway Background</label>
                    <input
                      type="color"
                      id="halfwayColor"
                      value={settings.halfwayColor}
                      onChange={(e) => updateSettings({ halfwayColor: e.target.value })}
                      className="w-10 h-10 p-0 bg-transparent border-none rounded-md cursor-pointer"
                      title="Set background color for second half of countdown"
                    />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
    </>
  );
};
