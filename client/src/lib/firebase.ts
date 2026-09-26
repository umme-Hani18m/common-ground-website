import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBNyJbIBauYKsRBf1KZeJ_dfiKAU3g2njs",
  authDomain: "common-ground-auth.firebaseapp.com",
  projectId: "common-ground-auth",
  storageBucket: "common-ground-auth.firebasestorage.app",
  messagingSenderId: "1052566412293",
  appId: "1:1052566412293:web:ab844b55b27e39bf55d06c",
  measurementId: "G-MB2MXB7PXV",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
