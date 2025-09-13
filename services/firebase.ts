import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
