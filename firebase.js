const firebaseConfig = {
  apiKey: "AIzaSyAfACnd4UlvMI9-Av6EV7ifu6VFZBQ0bWs",
  authDomain: "lolnext-5ca7b.firebaseapp.com",
  projectId: "lolnext-5ca7b",
  storageBucket: "lolnext-5ca7b.firebasestorage.app",
  messagingSenderId: "777465890108",
  appId: "1:777465890108:web:f4924d7e70c56b63ba0a39",
  measurementId: "G-F1H8P2RXMS"
};

const localTeamApi = {
  getTeamList: typeof getTeamList === "function" ? getTeamList : null,
  getTeamById: typeof getTeamById === "function" ? getTeamById : null,
  saveTeamData: typeof saveTeamData === "function" ? saveTeamData : null,
  deleteTeamData: typeof deleteTeamData === "function" ? deleteTeamData : null,
  saveManyTeams: typeof saveManyTeams === "function" ? saveManyTeams : null
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

const lolnextAuth = firebase.auth();
const lolnextDb = firebase.firestore();

lolnextAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(console.error);

let authReadyResolve;
const authReadyPromise = new Promise(resolve => { authReadyResolve = resolve; });
let authReadyResolved = false;

lolnextAuth.onAuthStateChanged(user => {
  if (!authReadyResolved) {
    authReadyResolved = true;
    authReadyResolve(user);
  }
  updateAuthUI(user);
  guardNonIndexPage(user);
  window.dispatchEvent(new CustomEvent("lolnext-auth-change", { detail: { user } }));
});

function waitForAuthReady() {
  return authReadyPromise;
}

function getCurrentUser() {
  return lolnextAuth.currentUser;
}

async function getAuthenticatedUser() {
  return getCurrentUser() || await waitForAuthReady();
}

function normalizeAccountName(name) {
  return (name || "").trim().toLowerCase();
}

function accountNameToEmail(name) {
  const normalized = normalizeAccountName(name);
  const bytes = new TextEncoder().encode(normalized);
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `u${hex}@lolnext.local`;
}

function validateCredentials(accountName, password) {
  const name = (accountName || "").trim();
  if (!name) throw new Error("アカウント名を入力してください");
  if (name.length > 32) throw new Error("アカウント名は32文字以内にしてください");
  if (!password || password.length < 6) throw new Error("パスワードは6文字以上にしてください");
  return name;
}

async function registerAccount(accountName, password) {
  const name = validateCredentials(accountName, password);
  const credential = await lolnextAuth.createUserWithEmailAndPassword(accountNameToEmail(name), password);
  await credential.user.updateProfile({ displayName: name });
  await credential.user.reload();
  updateAuthUI(lolnextAuth.currentUser);
  return lolnextAuth.currentUser;
}

async function loginAccount(accountName, password) {
  const name = validateCredentials(accountName, password);
  return lolnextAuth.signInWithEmailAndPassword(accountNameToEmail(name), password);
}

async function logoutAccount() {
  await lolnextAuth.signOut();
  sessionStorage.removeItem("editingTeamId");
  location.href = "index.html?v=56";
}

function friendlyAuthError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/email-already-in-use": "そのアカウント名はすでに使われています。",
    "auth/invalid-credential": "アカウント名またはパスワードが違います。",
    "auth/user-not-found": "アカウント名またはパスワードが違います。",
    "auth/wrong-password": "アカウント名またはパスワードが違います。",
    "auth/weak-password": "パスワードは6文字以上にしてください。",
    "auth/too-many-requests": "ログイン試行が多すぎます。少し時間を置いてください。",
    "auth/network-request-failed": "通信に失敗しました。ネットワークを確認してください。"
  };
  return messages[code] || error?.message || "処理に失敗しました。";
}

async function handleLogin() {
  const name = document.getElementById("authAccountName")?.value || "";
  const password = document.getElementById("authPassword")?.value || "";
  setAuthMessage("ログイン中...", false);
  try {
    await loginAccount(name, password);
    setAuthMessage("", false);
  } catch (error) {
    console.error(error);
    setAuthMessage(friendlyAuthError(error), true);
  }
}

async function handleRegister() {
  const name = document.getElementById("authAccountName")?.value || "";
  const password = document.getElementById("authPassword")?.value || "";
  setAuthMessage("登録中...", false);
  try {
    await registerAccount(name, password);
    setAuthMessage("", false);
  } catch (error) {
    console.error(error);
    setAuthMessage(friendlyAuthError(error), true);
  }
}

function setAuthMessage(message, isError) {
  const el = document.getElementById("authMessage");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", Boolean(isError));
}

function updateAuthUI(user) {
  const gate = document.getElementById("authGate");
  const accountName = document.getElementById("currentAccountName");
  const logoutButton = document.getElementById("logoutButton");
  if (gate) gate.classList.toggle("hidden", Boolean(user));
  if (accountName) accountName.textContent = user?.displayName || (user ? "ログイン中" : "未ログイン");
  if (logoutButton) logoutButton.style.display = user ? "inline-block" : "none";
}

function isIndexPage() {
  const file = location.pathname.split("/").pop();
  return !file || file === "index.html";
}

function guardNonIndexPage(user) {
  if (user || isIndexPage()) return;
  const current = location.pathname.split("/").pop() + location.search;
  location.href = `index.html?v=56&next=${encodeURIComponent(current)}`;
}

async function requireLogin() {
  const user = await getAuthenticatedUser();
  if (user) return user;
  guardNonIndexPage(null);
  return null;
}

function teamCollection(user) {
  if (!user) throw new Error("ログインが必要です");
  return lolnextDb.collection("users").doc(user.uid).collection("teams");
}

async function getCloudTeamList() {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("ログインが必要です");
  const snapshot = await teamCollection(user).get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

async function getCloudTeamById(id) {
  if (!id) return null;
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("ログインが必要です");
  const doc = await teamCollection(user).doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function saveCloudTeam(team) {
  if (!team?.id) throw new Error("構成IDがありません");
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("ログインが必要です");
  await teamCollection(user).doc(team.id).set({
    name: team.name || "",
    memo: team.memo || "",
    lanes: team.lanes || {},
    bans: Array.isArray(team.bans) ? team.bans : [],
    altPicks: team.altPicks || {},
    updatedAt: Date.now()
  });
}

async function deleteCloudTeam(id) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("ログインが必要です");
  await teamCollection(user).doc(id).delete();
}

async function saveManyCloudTeams(teams) {
  if (!Array.isArray(teams) || teams.length === 0) return;
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("ログインが必要です");
  const batch = lolnextDb.batch();
  const collection = teamCollection(user);
  const now = Date.now();
  teams.forEach((team, index) => {
    batch.set(collection.doc(team.id), {
      name: team.name || "",
      memo: team.memo || "",
      lanes: team.lanes || {},
      bans: Array.isArray(team.bans) ? team.bans : [],
      altPicks: team.altPicks || {},
      updatedAt: now + index
    });
  });
  await batch.commit();
}

async function migrateLocalTeamsIfCloudEmpty() {
  const user = await getAuthenticatedUser();
  if (!user || !localTeamApi.getTeamList) return 0;
  const cloudTeams = await getCloudTeamList();
  if (cloudTeams.length > 0) return 0;
  const localTeams = await localTeamApi.getTeamList();
  if (!localTeams.length) return 0;
  await saveManyCloudTeams(localTeams);
  return localTeams.length;
}

async function continueAfterLogin() {
  const params = new URLSearchParams(location.search);
  const next = params.get("next");
  if (next && getCurrentUser()) location.href = next;
}

window.addEventListener("lolnext-auth-change", event => {
  if (event.detail.user) continueAfterLogin();
});

window.getTeamList = getCloudTeamList;
window.getTeamById = getCloudTeamById;
window.saveTeamData = saveCloudTeam;
window.deleteTeamData = deleteCloudTeam;
window.saveManyTeams = saveManyCloudTeams;
