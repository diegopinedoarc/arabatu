// =========================================================
// Única capa que habla con Firebase en la sala de estudio.
// Usa el MISMO proyecto, login y usuarios que el resto de la web de Arabatu.
// =========================================================
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, collection,
  serverTimestamp, query, where, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";

const firebaseConfig = {
  apiKey: "AIzaSyBEn3XcZ8y1M-HPVTUFOjjZMWGY66OplqU",
  authDomain: "arabatuweb-1ee65.firebaseapp.com",
  projectId: "arabatuweb-1ee65",
  storageBucket: "arabatuweb-1ee65.firebasestorage.app",
  messagingSenderId: "676384856570",
  appId: "1:676384856570:web:967cab2e35a39986836c43",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// App Check — igual que en el resto del sitio
try {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider("6Ldrp7osAAAAANOjaeXUEOiiZAx7XaXqZLlg6rou"),
    isTokenAutoRefreshEnabled: true,
  });
} catch (e) { /* ya estaba inicializado en esta página */ }

const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Sesión ----------
export const onUser = (cb) => onAuthStateChanged(auth, cb);
export const logout = () => signOut(auth);

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ---------- Lecturas ----------
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
export const listGuiones = async () => rows(await getDocs(collection(db, "guiones"))).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
export const listMateriales = async () => rows(await getDocs(collection(db, "materiales"))).sort((a, b) => (b.orden ?? 0) - (a.orden ?? 0));

// ---------- Escrituras (solo admin, lo exigen las reglas) ----------
export async function saveMaterial(id, data) {
  if (id) { await updateDoc(doc(db, "materiales", id), data); return id; }
  const ref = await addDoc(collection(db, "materiales"), { ...data, orden: Date.now(), creadoEn: serverTimestamp() });
  return ref.id;
}
export const patchMaterial = (id, patch) => updateDoc(doc(db, "materiales", id), patch);
export const deleteMaterial = (id) => deleteDoc(doc(db, "materiales", id));

export async function saveGuion(id, data) {
  if (id) { await updateDoc(doc(db, "guiones", id), data); return id; }
  const ref = await addDoc(collection(db, "guiones"), { orden: Date.now(), ...data });
  return ref.id;
}
export const patchGuion = (id, patch) => updateDoc(doc(db, "guiones", id), patch);
export const deleteGuion = (id) => deleteDoc(doc(db, "guiones", id));
export const countMaterialesDeGuion = async (guionId) =>
  (await getDocs(query(collection(db, "materiales"), where("guionId", "==", guionId)))).size;

// Importación inicial del contenido que tenía la sala anterior (una sola vez)
export async function importSeed({ guiones, materiales }, uid) {
  const batch = writeBatch(db);
  guiones.forEach((g) => batch.set(doc(db, "guiones", g.id), { nombre: g.nombre, orden: g.orden }));
  materiales.forEach((m) => batch.set(doc(collection(db, "materiales")), { ...m, creadoEn: serverTimestamp(), creadoPor: uid }));
  await batch.commit();
}
