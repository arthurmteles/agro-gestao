import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, runTransaction, onSnapshot } from "firebase/firestore";

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

// ── Dados ───────────────────────────────────────────────────────
const dataRef = () => doc(db, "agro", "dados");
const toPayload = (data) => ({
  properties:    JSON.stringify(data.properties    || []),
  products:      JSON.stringify(data.products      || []),
  schedules:     JSON.stringify(data.schedules     || []),
  applications:  JSON.stringify(data.applications  || []),
  purchases:     JSON.stringify(data.purchases     || []),
  notifications: JSON.stringify(data.notifications || []),
});
const fromRaw = (raw) => ({
  properties:    parseField(raw.properties),
  products:      parseField(raw.products),
  schedules:     parseField(raw.schedules),
  applications:  parseField(raw.applications),
  purchases:     parseField(raw.purchases),
  notifications: parseField(raw.notifications),
});

// Grava tudo de uma vez (mantido por compatibilidade; o app usa updateData)
export const saveData = async (data) => {
  await setDoc(dataRef(), toPayload(data));
};

// Grava com segurança: lê a versão ATUAL no Firebase, aplica só as mudanças deste aparelho
// e grava, tudo numa transação. Sem internet, falha e não grava nada.
// "change" recebe os dados atuais do Firebase e devolve os dados novos.
export const updateData = async (change) => {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(dataRef());
    const current = snap.exists() ? fromRaw(snap.data()) : fromRaw({});
    const next = change(current);
    tx.set(dataRef(), toPayload(next));
    return next;
  });
};

// Recebe as alterações feitas em outros aparelhos em tempo real
export const subscribeData = (onData, onError) =>
  onSnapshot(dataRef(), (snap) => { if (snap.exists()) onData(fromRaw(snap.data())); }, onError);

// Retorna null SÓ quando o documento não existe (banco novo).
// Se a leitura falhar (sem internet, etc.), LANÇA o erro — o app então não grava nada por cima.
export const loadData = async () => {
  const snap = await getDoc(dataRef());
  if (!snap.exists()) return null;
  return fromRaw(snap.data());
};

// ── Usuários ────────────────────────────────────────────────────
const usersRef = () => doc(db, "agro", "usuarios");
const parseUsers = (raw) => {
  if (Array.isArray(raw.list)) return raw.list;
  const list = JSON.parse(raw.list || "[]"); // se o conteúdo estiver corrompido, lança erro (não sobrescreve)
  if (!Array.isArray(list)) throw new Error("Lista de usuários inválida");
  return list;
};

// Retorna null SÓ quando o documento não existe; em falha de leitura, LANÇA o erro.
export const loadUsers = async () => {
  const snap = await getDoc(usersRef());
  if (!snap.exists()) return null;
  return parseUsers(snap.data());
};

// Grava a lista inteira — usado só na primeira instalação (documento ainda não existe).
export const saveUsers = async (users) => {
  await setDoc(usersRef(), { list: JSON.stringify(users) });
};

// Altera a lista de usuários de forma segura: lê a versão ATUAL no Firebase,
// aplica a mudança e grava, tudo numa transação. Sem internet, falha e não grava nada.
// "change" recebe a lista atual e devolve a nova lista. Retorna a lista gravada.
export const updateUsers = async (change) => {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(usersRef());
    const current = snap.exists() ? parseUsers(snap.data()) : [];
    const next = change(current);
    if (!Array.isArray(next) || next.length === 0) throw new Error("Lista de usuários vazia — gravação cancelada");
    tx.set(usersRef(), { list: JSON.stringify(next) });
    return next;
  });
};
