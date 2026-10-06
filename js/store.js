import { firebaseConfig } from './config.js?v=5';
import { normalizeTask } from './utils.js?v=5';

const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/12.19.0';

export const isFirebaseConfigured = () => !!(firebaseConfig?.apiKey && firebaseConfig?.projectId);

export async function createStore() {
  if (!isFirebaseConfigured()) return new LocalStore();
  const store = new FirebaseStore();
  await store.init();
  return store;
}

// ส่วนที่ใช้ร่วมกัน: ทั้งสองแบบมี interface เดียวกัน
// subscribe(cb) · get(id) · add(data) · update(id, patch) · put(task) · remove(id) · importMany(list)
class BaseStore {
  tasks = [];
  ready = false;
  user = null;
  listeners = new Set();
  authListeners = new Set();
  onError = (err) => console.error(err);

  subscribe(cb) {
    this.listeners.add(cb);
    cb(this.tasks);
    return () => this.listeners.delete(cb);
  }
  onAuth(cb) {
    this.authListeners.add(cb);
    return () => this.authListeners.delete(cb);
  }
  _emit() {
    for (const cb of this.listeners) cb(this.tasks);
  }
  get(id) {
    return this.tasks.find((t) => t.id === id);
  }
  add(data) {
    const now = Date.now();
    return this.put({ ...data, id: null, createdAt: now, updatedAt: now });
  }
  update(id, patch) {
    const cur = this.get(id);
    if (!cur) return;
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    if ('done' in patch && patch.done !== cur.done) next.completedAt = patch.done ? Date.now() : null;
    return this.put(next);
  }
}

// ---------- โหมดเครื่องนี้ (localStorage) ----------
class LocalStore extends BaseStore {
  mode = 'local';
  key = 'mytodo.tasks.v1';

  constructor() {
    super();
    this.tasks = this._load();
    this.ready = true;
    // ซิงก์ระหว่างแท็บ
    window.addEventListener('storage', (e) => {
      if (e.key === this.key) {
        this.tasks = this._load();
        this._emit();
      }
    });
  }
  _load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key));
      return Array.isArray(raw) ? raw.map(normalizeTask) : [];
    } catch {
      return [];
    }
  }
  _commit(tasks) {
    this.tasks = tasks;
    try {
      localStorage.setItem(this.key, JSON.stringify(tasks));
    } catch (err) {
      this.onError(err);
    }
    this._emit();
  }
  put(task) {
    const t = normalizeTask(task);
    const i = this.tasks.findIndex((x) => x.id === t.id);
    this._commit(i === -1 ? [...this.tasks, t] : this.tasks.map((x, j) => (j === i ? t : x)));
    return t.id;
  }
  remove(id) {
    this._commit(this.tasks.filter((t) => t.id !== id));
  }
  async importMany(list) {
    const byId = new Map(this.tasks.map((t) => [t.id, t]));
    for (const t of list.map(normalizeTask)) byId.set(t.id, t);
    this._commit([...byId.values()]);
  }
}

// ---------- Firebase (Firestore + Google Sign-in) ----------
// ข้อมูลอยู่ที่ users/{uid}/tasks/{taskId}
class FirebaseStore extends BaseStore {
  mode = 'firebase';

  async init() {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${FIREBASE_SDK}/firebase-app.js`),
      import(`${FIREBASE_SDK}/firebase-auth.js`),
      import(`${FIREBASE_SDK}/firebase-firestore.js`),
    ]);
    this.m = { ...authMod, ...fsMod };
    const app = appMod.initializeApp(firebaseConfig);
    this.auth = authMod.getAuth(app);
    try {
      // cache ในเครื่อง: ใช้งานออฟไลน์ได้ แล้วซิงก์เมื่อกลับมาออนไลน์
      this.db = fsMod.initializeFirestore(app, {
        localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
      });
    } catch {
      this.db = fsMod.getFirestore(app);
    }
    await new Promise((resolve) => {
      let first = true;
      authMod.onAuthStateChanged(this.auth, (user) => {
        this.user = user;
        this._watch();
        for (const cb of this.authListeners) cb(user);
        if (first) {
          first = false;
          resolve();
        }
      });
    });
  }
  _col() {
    return this.m.collection(this.db, 'users', this.user.uid, 'tasks');
  }
  _watch() {
    this.unsub?.();
    this.unsub = null;
    this.tasks = [];
    this.ready = false;
    if (!this.user) {
      this._emit();
      return;
    }
    this.unsub = this.m.onSnapshot(
      this._col(),
      (snap) => {
        this.tasks = snap.docs.map((d) => normalizeTask({ ...d.data(), id: d.id }));
        this.ready = true;
        this._emit();
      },
      (err) => {
        this.ready = true;
        this._emit();
        this.onError(err);
      },
    );
  }
  async signIn() {
    const provider = new this.m.GoogleAuthProvider();
    try {
      await this.m.signInWithPopup(this.auth, provider);
    } catch (err) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(err.code)) {
        return this.m.signInWithRedirect(this.auth, provider);
      }
      if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(err.code)) return;
      throw err;
    }
  }
  signOut() {
    return this.m.signOut(this.auth);
  }
  // ไม่ await การเขียน: Firestore อัปเดต UI จาก cache ทันที และจะส่งขึ้นเซิร์ฟเวอร์เองเมื่อออนไลน์
  put(task) {
    const { id, ...data } = normalizeTask(task);
    this.m.setDoc(this.m.doc(this._col(), id), data).catch((e) => this.onError(e));
    return id;
  }
  remove(id) {
    this.m.deleteDoc(this.m.doc(this._col(), id)).catch((e) => this.onError(e));
  }
  async importMany(list) {
    const items = list.map(normalizeTask);
    for (let i = 0; i < items.length; i += 400) {
      const batch = this.m.writeBatch(this.db);
      for (const { id, ...data } of items.slice(i, i + 400)) batch.set(this.m.doc(this._col(), id), data);
      batch.commit().catch((e) => this.onError(e));
    }
  }
}
