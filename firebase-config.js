import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAS0SggX0DjDtZAQyKnyJQ0Ntv7vP7YqPQ",
  authDomain: "mindwell---it390.firebaseapp.com",
  projectId: "mindwell---it390",
  storageBucket: "mindwell---it390.firebasestorage.app",
  messagingSenderId: "572655404552",
  appId: "1:572655404552:web:defa6360cf18c2dbd733bd"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
