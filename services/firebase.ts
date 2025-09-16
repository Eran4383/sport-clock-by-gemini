// FIX: Switched to Firebase v9 compat imports to resolve module errors.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

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

// Initialize Firebase only if it hasn't been initialized yet
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// FIX: Export compat instances of auth and firestore
export const auth = firebase.auth();
export const db = firebase.firestore();
