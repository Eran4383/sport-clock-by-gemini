// FIX: Changed import paths to use scoped Firebase packages to resolve module export errors.
import { initializeApp, getApp, getApps } from "@firebase/app";
import { getAuth } from "@firebase/auth";
import { getFirestore } from "@firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBKjqOImhiSryfylDv2DkEGtQZeR1QG8oA",
  authDomain: "sport-clock-account-connection.firebaseapp.com",
  projectId: "sport-clock-account-connection",
  storageBucket: "sport-clock-account-connection.firebasestorage.app",
  messagingSenderId: "721205944193",
  appId: "1:721205944193:web:1dc6b014d9c09adb599280",
  measurementId: "G-N7QC8DZPYP"
};

// Initialize Firebase using the v9 modular SDK
// This pattern prevents re-initializing the app on hot reloads
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);