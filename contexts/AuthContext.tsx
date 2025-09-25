import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import { auth } from '../services/firebase';

interface AuthContextType {
  user: User | null;
  authStatus: 'loading' | 'authenticated' | 'unauthenticated';
  isTransitioning: boolean;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [isTransitioning, setIsTransitioning] = useState(true); // Start as true on initial load

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setAuthStatus('authenticated');
      } else {
        setUser(null);
        setAuthStatus('unauthenticated');
      }
      // The transition is complete once the initial auth state is resolved.
      setIsTransitioning(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async () => {
    setIsTransitioning(true);
    setAuthStatus('loading');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will handle setting the user, authStatus, and isTransitioning to false
    } catch (error) {
      console.error("Authentication Error:", error);
      setAuthStatus('unauthenticated');
      setIsTransitioning(false); // Revert status on error
    }
  }, []);

  const signOut = useCallback(async () => {
    // Start the transition BEFORE signing out to prevent race conditions.
    setIsTransitioning(true);
    try {
      await firebaseSignOut(auth);
      // onAuthStateChanged will handle setting user to null and isTransitioning to false.
    } catch (error) {
      console.error("Sign Out Error:", error);
      // Ensure transition state is reset even on error.
      setIsTransitioning(false);
    }
  }, []);

  const value = { user, authStatus, isTransitioning, signIn, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
