const DB_NAME = "lolTeamBuilderDB";
const DB_VERSION = 1;
const CHAMPION_STORE = "champions";
const TEAM_STORE = "teams";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = function (event) {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(CHAMPION_STORE)) {
        db.createObjectStore(CHAMPION_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(TEAM_STORE)) {
        db.createObjectStore(TEAM_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = function () {
      resolve(request.result);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

async function getAllFromStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function getById(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function saveToStore(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.put(data);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function deleteFromStore(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function saveChampionData(champion) {
  return saveToStore(CHAMPION_STORE, champion);
}

async function getChampionList() {
  return getAllFromStore(CHAMPION_STORE);
}

async function getChampionById(id) {
  return getById(CHAMPION_STORE, id);
}

async function deleteChampionData(id) {
  return deleteFromStore(CHAMPION_STORE, id);
}

async function saveTeamData(team) {
  return saveToStore(TEAM_STORE, team);
}

async function getTeamList() {
  return getAllFromStore(TEAM_STORE);
}

async function getTeamById(id) {
  return getById(TEAM_STORE, id);
}

async function deleteTeamData(id) {
  return deleteFromStore(TEAM_STORE, id);
}


async function saveManyToStore(storeName, items) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    for (const item of items) {
      store.put(item);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function saveManyChampions(items) {
  return saveManyToStore(CHAMPION_STORE, items);
}

async function saveManyTeams(items) {
  return saveManyToStore(TEAM_STORE, items);
}
