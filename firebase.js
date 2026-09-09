import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDpgLS8-u5TbUoTryk4W4Pz3gJssSeBF2g",
    authDomain: "memesnip-12434.firebaseapp.com",
    projectId: "memesnip-12434",
    storageBucket: "memesnip-12434.firebasestorage.app",
    messagingSenderId: "885336993227",
    appId: "1:885336993227:web:89293e47ce26b4d2885a4e"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);