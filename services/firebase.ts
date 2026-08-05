import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD9Xyh2sQoZsWg0KOm6zGlIY4pZNGxylX4",
  authDomain: "finance-pro-7005a.firebaseapp.com",
  projectId: "finance-pro-7005a",
  storageBucket: "finance-pro-7005a.firebasestorage.app",
  messagingSenderId: "17189360096",
  appId: "1:17189360096:web:d9feead00d6e6032d29b85"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);