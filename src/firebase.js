import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBUmwDkKpznF0SPENS3x5Rw3z37tMib86o",
  authDomain: "agro-gestao-cafes.firebaseapp.com",
  projectId: "agro-gestao-cafes",
  storageBucket: "agro-gestao-cafes.firebasestorage.app",
  messagingSenderId: "302550113689",
  appId: "1:302550113689:web:ca1d86b569966a89440708"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const saveData = async (data) => {
  try {
    await setDoc(doc(db, "agro", "dados"), data);
  } catch (e) {
    console.error("Erro ao salvar:", e);
  }
};

export const loadData = async () => {
  try {
    const snap = await getDoc(doc(db, "agro", "dados"));
    if (snap.exists()) return snap.data();
    return null;
  } catch (e) {
    console.error("Erro ao carregar:", e);
    return null;
  }
};