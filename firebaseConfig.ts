
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCyqor8oUgIv50LK3tSKQBD9XaIFuri0qw",
  authDomain: "geosick-ai-spec.firebaseapp.com",
  projectId: "geosick-ai-spec",
  storageBucket: "geosick-ai-spec.firebasestorage.app",
  messagingSenderId: "766340034600",
  appId: "1:766340034600:web:499993f5f3ba23732ac51d",
  measurementId: "G-TH3NL3NYJ8"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
