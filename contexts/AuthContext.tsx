import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
// FIX: Switched to Firebase v9 compat imports to resolve module errors.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { auth } from '../services/firebase';

interface AuthContextType {
  // FIX: Use namespaced User type from firebase compat.
  user: firebase.User | null;
  authStatus: 'loading' | 'authenticated' | 'unauthenticated';
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<firebase.User | null>(null);
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    // FIX: Use auth.onAuthStateChanged from the compat auth instance.
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setAuthStatus('authenticated');
      } else {
        setUser(null);
        setAuthStatus('unauthenticated');
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async () => {
    setAuthStatus('loading');
    // FIX: Use namespaced GoogleAuthProvider from firebase compat.
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      // FIX: Use auth.signInWithPopup from the compat auth instance.
      await auth.signInWithPopup(provider);
      // onAuthStateChanged will handle setting the user and authStatus
    } catch (error) {
      console.error("Authentication Error:", error);
      setAuthStatus('unauthenticated'); // Revert status on error
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      // FIX: Use auth.signOut from the compat auth instance.
      await auth.signOut();
      // onAuthStateChanged will handle setting user to null
    } catch (error) {
      console.error("Sign Out Error:", error);
    }
  }, []);

  const value = { user, authStatus, signIn, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};