/**
 * NCHUCGC Firebase 設定檔 (firebase-config.js)
 * 請至 Firebase Console (https://console.firebase.google.com/) 建立專案並新增網頁應用程式，
 * 將取得的 firebaseConfig 貼上覆蓋下方內容即可啟用「多對戰廳大廳」、「Google 登入」與「牌組雲端同步」。
 */
window.NCHUCGC_FIREBASE_CONFIG = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAIbiNEA2-sOdm-8XVQEZWDu2gK-wnbcmc",
  authDomain: "nchucgc-ua.firebaseapp.com",
  databaseURL: "https://nchucgc-ua-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nchucgc-ua",
  storageBucket: "nchucgc-ua.firebasestorage.app",
  messagingSenderId: "24176797118",
  appId: "1:24176797118:web:731ed36e24d9c3ea5fc5ef"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);