
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

const MAX_LOG_SIZE = 200;
const LOGS_STORAGE_KEY = 'app_activity_logs';
const ERRORS_STORAGE_KEY = 'app_error_logs';

export interface LogEntry {
  timestamp: string;
  type: string;
  payload?: any;
}

// Helper to safely get items from localStorage
const getStoredItem = <T,>(key: string, defaultValue: T): T => {
    try {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error(`Failed to read from localStorage key "${key}":`, error);
        return defaultValue;
    }
};

interface LoggingContextType {
  logAction: (type: string, payload?: any) => void;
  getLogs: () => LogEntry[];
  clearLogs: () => void;
  logError: (error: Error, componentStack: string) => void;
  getErrors: () => LogEntry[];
  getDebugReportAsString: (appState: any) => string;
}

const LoggingContext = createContext<LoggingContextType | undefined>(undefined);

export const LoggingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<LogEntry[]>(() => getStoredItem(LOGS_STORAGE_KEY, []));
  const [errors, setErrors] = useState<LogEntry[]>(() => getStoredItem(ERRORS_STORAGE_KEY, []));
  
  // Persist logs to localStorage whenever they change
  useEffect(() => {
    try {
        window.localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs));
    } catch (error) {
        console.error("Failed to save logs to localStorage:", error);
    }
  }, [logs]);

  // Persist errors to localStorage whenever they change
  useEffect(() => {
    try {
        window.localStorage.setItem(ERRORS_STORAGE_KEY, JSON.stringify(errors));
    } catch (error) {
        console.error("Failed to save errors to localStorage:", error);
    }
  }, [errors]);


  const logAction = useCallback((type: string, payload?: any) => {
    setLogs(prevLogs => {
      const newLog: LogEntry = {
        timestamp: new Date().toISOString(),
        type,
        // Deep copy serializable payload to avoid mutation issues
        payload: payload ? JSON.parse(JSON.stringify(payload, (key, value) => 
            typeof value === 'bigint' ? value.toString() : value // BigInt is not serializable
        )) : undefined,
      };
      const updatedLogs = [newLog, ...prevLogs];
      if (updatedLogs.length > MAX_LOG_SIZE) {
        return updatedLogs.slice(0, MAX_LOG_SIZE);
      }
      return updatedLogs;
    });
  }, []);
  
  const logError = useCallback((error: Error, componentStack: string) => {
    setErrors(prevErrors => {
        const newErrorLog: LogEntry = {
            timestamp: new Date().toISOString(),
            type: 'REACT_ERROR_BOUNDARY',
            payload: {
                message: error.message,
                stack: error.stack,
                componentStack: componentStack,
            },
        };
        // Keep all errors, don't cap them like regular logs
        return [newErrorLog, ...prevErrors];
    });
  }, []);

  // Return logs in chronological order (oldest first) for the report
  const getLogs = useCallback(() => logs.slice().reverse(), [logs]);
  const getErrors = useCallback(() => errors.slice().reverse(), [errors]);
  
  const getDebugReportAsString = useCallback((appState: any): string => {
    const { settings, user, workoutContext } = appState;
    const report = {
      timestamp: new Date().toISOString(),
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screen: {
          width: window.screen.width,
          height: window.screen.height,
          availWidth: window.screen.availWidth,
          availHeight: window.screen.availHeight,
        },
      },
      appState: {
        settings,
        user: user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null,
        activeWorkout: workoutContext.activeWorkout ? {
            planName: workoutContext.activeWorkout.plan.name,
            currentStepIndex: workoutContext.activeWorkout.currentStepIndex,
            sourcePlanIds: workoutContext.activeWorkout.sourcePlanIds,
            isWorkoutPaused: workoutContext.isWorkoutPaused,
            isCountdownPaused: workoutContext.isCountdownPaused,
        } : null,
        planCount: workoutContext.plans.length,
        historyCount: workoutContext.workoutHistory.length,
      },
      errors: getErrors(),
      activityLog: getLogs(),
    };
    return JSON.stringify(report, null, 2);
  }, [getErrors, getLogs]);


  const clearLogs = useCallback(() => {
    setLogs([]);
    setErrors([]);
    try {
        window.localStorage.removeItem(LOGS_STORAGE_KEY);
        window.localStorage.removeItem(ERRORS_STORAGE_KEY);
    } catch (error) {
        console.error("Failed to clear logs from localStorage:", error);
    }
  }, []);

  const value = { logAction, getLogs, clearLogs, logError, getErrors, getDebugReportAsString };

  return <LoggingContext.Provider value={value}>{children}</LoggingContext.Provider>;
};

export const useLogger = (): LoggingContextType => {
  const context = useContext(LoggingContext);
  if (context === undefined) {
    throw new Error('useLogger must be used within a LoggingProvider');
  }
  return context;
};
