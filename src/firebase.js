import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "lumina-ai-9b809.firebaseapp.com",
  projectId: "lumina-ai-9b809",
  storageBucket: "lumina-ai-9b809.firebasestorage.app",
  messagingSenderId: "565335817404",
  appId: "1:565335817404:web:3e849e839a88abacdda4b9"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);