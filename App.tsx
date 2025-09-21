// FIX: Correctly import React hooks (useEffect, useState, useCallback).
import React, { useEffect, useState, useCallback } from 'react';
import { SettingsMenu } from './components/SettingsMenu';
import { WorkoutMenu } from './components/WorkoutMenu';
import { PreWorkoutCountdown } from './components/PreWorkoutCountdown';
import { GuestDataMergeModal } from './components/GuestDataMergeModal';
import { GuestHistoryMergeModal } from './components/GuestHistoryMergeModal';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { WorkoutProvider, useWorkout } from './contexts/WorkoutContext';
import { ImportNotification } from './components/ImportNotification';
import { AuthProvider } from './contexts/AuthContext';
import { MainDisplay } from './components/MainDisplay';

const AppContent: React.FC = () => {
  const { settings } = useSettings();
  const { 
    isPreparingWorkout,
    commitStartWorkout,
    importNotification,
    clearImportNotification,
    showGuestMergeModal,
    guestPlansToMerge,
    handleMergeGuestData,
    handleDiscardGuestData,
    showGuestHistoryMergeModal,
    guestHistoryToMerge,
    handleMergeGuestHistory,
    handleDiscardGuestHistory,
  } = useWorkout();
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorkoutOpen, setIsWorkoutOpen] = useState(false);
  const [preWorkoutTimeLeft, setPreWorkoutTimeLeft] = useState<number | null>(null);

  // Automatically close the workout menu when the pre-workout countdown starts.
  // This prevents it from re-appearing after the countdown finishes.
  useEffect(() => {
    if (isPreparingWorkout) {
      setIsWorkoutOpen(false);
    }
  }, [isPreparingWorkout]);

  // Handle the pre-workout countdown
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (isPreparingWorkout) {
        let countdown = settings.preWorkoutCountdownDuration;
        setPreWorkoutTimeLeft(countdown);

        timer = setInterval(() => {
            countdown -= 1;
            setPreWorkoutTimeLeft(countdown);
            
            if (countdown <= 0) {
                clearInterval(timer);
                // After displaying 0, wait a full second before starting the workout.
                setTimeout(() => {
                    commitStartWorkout();
                }, 1000);
            }
        }, 1000);

        return () => { if (timer) clearInterval(timer); };
    } else {
        setPreWorkoutTimeLeft(null); // Ensure countdown stops if workout is aborted
    }
  }, [isPreparingWorkout, commitStartWorkout, settings.preWorkoutCountdownDuration]);


  // Effect to update document title ONLY for pre-workout, as MainDisplay handles the rest.
  useEffect(() => {
    const mutePrefix = settings.isMuted ? '🔇 ' : '';
    if (preWorkoutTimeLeft !== null) {
        document.title = `${mutePrefix}מתחילים בעוד ${preWorkoutTimeLeft}s`;
    }
    // No 'else' here, because MainDisplay will set the title for all other states.
  }, [preWorkoutTimeLeft, settings.isMuted]);

  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
  }, []);

  return (
    // This outer div is the new shell that remains constant.
    <div className="h-screen overflow-hidden">
      {/* All modals and popups are rendered first */}
      {showGuestMergeModal && (
        <GuestDataMergeModal 
          guestPlans={guestPlansToMerge} 
          onMerge={handleMergeGuestData} 
          onDiscard={handleDiscardGuestData} 
        />
      )}
      {showGuestHistoryMergeModal && (
        <GuestHistoryMergeModal
          guestHistory={guestHistoryToMerge}
          onMerge={handleMergeGuestHistory}
          onDiscard={handleDiscardGuestHistory}
        />
      )}
      {importNotification && (
          <ImportNotification 
              message={importNotification.message} 
              planName={importNotification.planName} 
              onClose={clearImportNotification} 
              type={importNotification.type}
          />
      )}
      <SettingsMenu isOpen={isSettingsOpen} setIsOpen={setIsSettingsOpen} />
      <WorkoutMenu isOpen={isWorkoutOpen} setIsOpen={setIsWorkoutOpen} />
      
      {/* MainDisplay is now ALWAYS rendered, ensuring its hooks are stable. */}
      <MainDisplay 
        isSettingsOpen={isSettingsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        isWorkoutOpen={isWorkoutOpen}
        setIsWorkoutOpen={setIsWorkoutOpen}
        toggleFullScreen={toggleFullScreen}
      />

      {/* The pre-workout countdown and stealth mode are now rendered as OVERLAYS,
          conditionally appearing on top of MainDisplay without replacing it.
          This is the core fix for the React hook error. */}
      {preWorkoutTimeLeft !== null && (
          <PreWorkoutCountdown timeLeft={preWorkoutTimeLeft} onDoubleClick={toggleFullScreen} />
      )}
      
      {settings.stealthModeEnabled && (
          <div className="fixed inset-0 bg-black z-[200] animate-fadeIn" style={{ animationDuration: '0.3s' }}></div>
      )}
    </div>
  );
};


const App: React.FC = () => {
  return (
    <AuthProvider>
      <SettingsProvider>
        <WorkoutProvider>
          <AppContent />
        </WorkoutProvider>
      </SettingsProvider>
    </AuthProvider>
  );
};

export default App;