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
    const payload = {
      properties:    JSON.stringify(data.properties    || []),
      products:      JSON.stringify(data.products      || []),
      schedules:     JSON.stringify(data.schedules     || []),
      applications:  JSON.stringify(data.applications  || []),
      purchases:     JSON.stringify(data.purchases     || []),
      notifications: JSON.stringify(data.notifications || []),
    };
    await setDoc(doc(db, "agro", "dados"), payload);
    console.log("Dados salvos com sucesso");
  } catch (e) {
    console.error("Erro ao salvar:", e);
  }
};

export const loadData = async () => {
  try {
    const snap = await getDoc(doc(db, "agro", "dados"));
    if (!snap.exists()) {
      console.log("Nenhum dado encontrado no Firebase");
      return null;
    }
    const raw = snap.data();
    return {
      properties:    JSON.parse(raw.properties    || "[]"),
      products:      JSON.parse(raw.products      || "[]"),
      schedules:     JSON.parse(raw.schedules     || "[]"),
      applications:  JSON.parse(raw.applications  || "[]"),
      purchases:     JSON.parse(raw.purchases     || "[]"),
      notifications: JSON.parse(raw.notifications || "[]"),
    };
  } catch (e) {
    console.error("Erro ao carregar:", e);
    return null;
  }
};