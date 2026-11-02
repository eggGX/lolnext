const DB_NAME = "lolTeamBuilderDB";
const DB_VERSION = 1;
const CHAMPION_STORE = "champions";
const TEAM_STORE = "teams";
const CHAMPION_MASTER_IDS_KEY = "lolnextChampionMasterIdsV1";

const CHAMPION_NAME_MIGRATIONS = new Map([
  ["ジンスク", "ジンクス"]
]);

let championMasterSyncPromise = null;

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

function normalizeChampion(champion) {
  if (!champion) return champion;
  const migratedName = CHAMPION_NAME_MIGRATIONS.get(champion.name);
  return migratedName ? { ...champion, name: migratedName } : champion;
}

async function migrateChampionData(champions) {
  const migrated = champions
    .map(normalizeChampion)
    .filter((champion, index) => champion !== champions[index]);

  if (migrated.length > 0) {
    await saveManyToStore(CHAMPION_STORE, migrated);
  }

  return champions.map(normalizeChampion);
}

function readKnownMasterChampionIds() {
  try {
    const raw = localStorage.getItem(CHAMPION_MASTER_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? new Set(parsed) : null;
  } catch (error) {
    console.warn("チャンピオン同期情報の読み込みに失敗しました", error);
    return null;
  }
}

function writeKnownMasterChampionIds(ids) {
  try {
    localStorage.setItem(CHAMPION_MASTER_IDS_KEY, JSON.stringify(Array.from(ids)));
  } catch (error) {
    console.warn("チャンピオン同期情報の保存に失敗しました", error);
  }
}

async function syncMasterChampions() {
  if (championMasterSyncPromise) return championMasterSyncPromise;

  championMasterSyncPromise = (async () => {
    try {
      const response = await fetch("champions.json", { cache: "no-store" });
      if (!response.ok) return;

      const payload = await response.json();
      if (!payload || !Array.isArray(payload.champions)) return;

      const master = payload.champions
        .filter(champion => champion && champion.id)
        .map(champion => normalizeChampion({
          ...champion,
          tags: Array.isArray(champion.tags) ? champion.tags : []
        }));

      const local = await getAllFromStore(CHAMPION_STORE);
      const localIds = new Set(local.map(champion => champion.id).filter(Boolean));
      const knownMasterIds = readKnownMasterChampionIds();

      let additions;
      if (knownMasterIds === null) {
        additions = master.filter(champion => !localIds.has(champion.id));
      } else {
        additions = master.filter(champion =>
          !knownMasterIds.has(champion.id) && !localIds.has(champion.id)
        );
      }

      if (additions.length > 0) {
        await saveManyToStore(CHAMPION_STORE, additions);
        console.log(`${additions.length}件の新規チャンピオンを初期データから追加しました`);
      }

      writeKnownMasterChampionIds(new Set(master.map(champion => champion.id)));
    } catch (error) {
      console.error("初期チャンピオンデータの同期に失敗しました", error);
    }
  })();

  return championMasterSyncPromise;
}

async function saveChampionData(champion) {
  return saveToStore(CHAMPION_STORE, normalizeChampion(champion));
}

async function getChampionList() {
  await syncMasterChampions();
  const champions = await getAllFromStore(CHAMPION_STORE);
  return migrateChampionData(champions);
}

async function getChampionById(id) {
  await syncMasterChampions();
  const champion = await getById(CHAMPION_STORE, id);
  if (!champion) return null;

  const normalized = normalizeChampion(champion);
  if (normalized !== champion) {
    await saveToStore(CHAMPION_STORE, normalized);
  }
  return normalized;
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
  const normalizedItems = items.map(normalizeChampion);
  return saveManyToStore(CHAMPION_STORE, normalizedItems);
}

async function saveManyTeams(items) {
  return saveManyToStore(TEAM_STORE, items);
}
