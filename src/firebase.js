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

const parseField = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
};

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
    if (!snap.exists()) return null;
    const raw = snap.data();
    return {
      properties:    parseField(raw.properties),
      products:      parseField(raw.products),
      schedules:     parseField(raw.schedules),
      applications:  parseField(raw.applications),
      purchases:     parseField(raw.purchases),
      notifications: parseField(raw.notifications),
    };
  } catch (e) {
    console.error("Erro ao carregar:", e);
    return null;
  }
};

export const saveUsers = async (users) => {
  try {
    await setDoc(doc(db, "agro", "usuarios"), { list: JSON.stringify(users) });
  } catch (e) {
    console.error("Erro ao salvar usuários:", e);
  }
};

export const loadUsers = async () => {
  try {
    const snap = await getDoc(doc(db, "agro", "usuarios"));
    if (!snap.exists()) return null;
    const raw = snap.data();
    if (Array.isArray(raw.list)) return raw.list;
    try { return JSON.parse(raw.list || "[]"); } catch { return null; }
  } catch (e) {
    console.error("Erro ao carregar usuários:", e);
    return null;
  }
};