import React, { createContext, useContext } from 'react';
// FIX: Rename imported `useSettings` to `useSettingsImpl` to avoid name collision with the exported hook.
import { useSettings as useSettingsImpl, Settings } from '../hooks/useSettings';

export type SettingsContextType = {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings, updateSettings } = useSettingsImpl();

  // FIX: Using React.createElement instead of JSX because this is a .ts file, not .tsx.
  // This resolves JSX parsing errors.
  return React.createElement(SettingsContext.Provider, { value: { settings, updateSettings } }, children);
};

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};