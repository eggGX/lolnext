const lanes = ["top", "jg", "mid", "adc", "sup"];
let selectedLane = null;
let altModeLane = null;
let team = {};
let champions = [];
let activeTagFilter = "";
let bannedChampionIds = [];
let isBanMode = false;
let altPicks = {};
let exportPreviewBlob = null;
let exportPreviewFileName = "チーム構成.png";

const pageMode = document.body.dataset.mode || "create";

function handleAltButtonClick(event, lane) {
  event.preventDefault();
  event.stopPropagation();
  altModeLane = altModeLane === lane ? null : lane;
  refreshAltButtons();
}

function refreshAltButtons() {
  document.querySelectorAll(".alt-btn").forEach(btn => {
    btn.style.outline = altModeLane === btn.dataset.lane ? "2px solid #ffffff" : "none";
  });
}

function clearAltMode() {
  altModeLane = null;
  refreshAltButtons();
}

function bindLaneEvents() {
  document.querySelectorAll(".lane").forEach(el => {
    el.onclick = event => {
      if (event.target.closest(".alt-btn")) return;
      clearAltMode();
      document.querySelectorAll(".lane").forEach(l => l.classList.remove("selected"));
      el.classList.add("selected");
      selectedLane = el.dataset.lane;
    };

    el.ondragover = event => event.preventDefault();
    el.ondrop = event => {
      event.preventDefault();
      const id = event.dataTransfer.getData("id");
      if (!id) return;
      team[el.dataset.lane] = id;
      renderTeam();
      renderAlt();
      refreshAltButtons();
    };
  });
}

function toggleBanMode() {
  clearAltMode();
  isBanMode = !isBanMode;
  document.getElementById("capture").classList.toggle("hidden", isBanMode);
  document.getElementById("banPanel").classList.toggle("hidden", !isBanMode);
  renderBanSlots();
}

function renderBanSlots() {
  const wrap = document.getElementById("banSlotList");
  if (!wrap) return;
  wrap.innerHTML = "";

  const ids = bannedChampionIds.slice(0, 10);
  if (ids.length === 0) {
    for (let i = 0; i < 4; i++) {
      const empty = document.createElement("div");
      empty.className = "ban-slot empty-slot";
      empty.textContent = "BAN未設定";
      wrap.appendChild(empty);
    }
    return;
  }

  ids.forEach((id, index) => {
    const champ = champions.find(c => c.id === id);
    const slot = document.createElement("div");
    slot.className = "ban-slot";

    if (!champ) {
      slot.classList.add("empty-slot");
      slot.textContent = "不明";
      wrap.appendChild(slot);
      return;
    }

    const img = document.createElement("img");
    img.src = champ.image;
    img.alt = "";
    img.title = champ.name;
    img.onclick = event => {
      event.stopPropagation();
      bannedChampionIds = bannedChampionIds.filter((_, i) => i !== index);
      renderBanSlots();
    };
    slot.appendChild(img);
    wrap.appendChild(slot);
  });
}

function resetTeamBuilderState() {
  team = {};
  bannedChampionIds = [];
  altPicks = {};
  selectedLane = null;
  altModeLane = null;
  isBanMode = false;

  document.querySelectorAll(".lane").forEach(l => l.classList.remove("selected"));
  document.getElementById("capture").classList.remove("hidden");
  document.getElementById("banPanel").classList.add("hidden");

  document.getElementById("teamName").value = "";
  document.getElementById("memo").value = "";
  document.getElementById("teamNamePreview").textContent = "未設定";
  document.getElementById("memoPreview").textContent = "未設定";
  document.getElementById("searchInput").value = "";

  activeTagFilter = "";
  document.querySelectorAll(".tag-filter").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tag === "");
  });

  document.getElementById("metaModal").classList.remove("open");
  renderAll();
}

function openMetaModal() {
  clearAltMode();
  document.getElementById("metaModal").classList.add("open");
}

function closeMetaModal() {
  document.getElementById("metaModal").classList.remove("open");
}

function applyMeta() {
  const name = document.getElementById("teamName").value.trim();
  const memo = document.getElementById("memo").value.trim();
  document.getElementById("teamNamePreview").textContent = name || "未設定";
  document.getElementById("memoPreview").textContent = memo || "未設定";
  closeMetaModal();
}

function setTagFilter(tag) {
  activeTagFilter = tag;
  document.querySelectorAll(".tag-filter").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tag === tag);
  });
  renderChampionList();
}

async function ensureInitialChampionSeed() {
  try {
    const existing = await getChampionList();
    if (existing.length > 0) return;

    const response = await fetch("champions.json", { cache: "no-store" });
    if (!response.ok) return;

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.champions)) return;

    const seed = payload.champions.map(ch => ({
      ...ch,
      tags: Array.isArray(ch.tags) ? ch.tags : []
    }));

    if (seed.length > 0) await saveManyChampions(seed);
  } catch (error) {
    console.error(error);
  }
}

async function loadChampions() {
  champions = await getChampionList();
  renderChampionList();
}

function renderChampionList() {
  const list = document.getElementById("championList");
  const keyword = document.getElementById("searchInput").value.trim().toLowerCase();
  list.innerHTML = "";

  const filtered = champions
    .filter(c => c.name.toLowerCase().includes(keyword))
    .filter(c => !activeTagFilter || (Array.isArray(c.tags) && c.tags.includes(activeTagFilter)))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty">該当するチャンピオンがありません。</div>';
    return;
  }

  filtered.forEach(c => {
    const div = document.createElement("div");
    div.className = "champion";
    div.draggable = true;

    const img = document.createElement("img");
    img.src = c.image;
    img.alt = "";
    const name = document.createElement("div");
    name.textContent = c.name;
    div.append(img, name);

    div.onclick = () => selectChampion(c.id);
    div.ondragstart = event => event.dataTransfer.setData("id", c.id);
    list.appendChild(div);
  });
}

function selectChampion(id) {
  if (isBanMode) {
    if (bannedChampionIds.includes(id)) {
      bannedChampionIds = bannedChampionIds.filter(x => x !== id);
    } else if (bannedChampionIds.length < 10) {
      bannedChampionIds.push(id);
    }
    renderBanSlots();
    return;
  }

  if (altModeLane) {
    altPicks[altModeLane] = altPicks[altModeLane] || [];
    if (altPicks[altModeLane].includes(id)) {
      altPicks[altModeLane] = altPicks[altModeLane].filter(x => x !== id);
    } else if (altPicks[altModeLane].length < 3) {
      altPicks[altModeLane].push(id);
    }
    renderAlt();
    refreshAltButtons();
    return;
  }

  if (!selectedLane) return;
  team[selectedLane] = id;
  renderTeam();
  renderAlt();
  refreshAltButtons();
}

function renderAlt() {
  document.querySelectorAll(".alt-area").forEach(el => {
    const lane = el.dataset.alt;
    el.innerHTML = "";
    const list = (altPicks[lane] || []).slice(0, 3);

    list.forEach(id => {
      const champ = champions.find(c => c.id === id);
      if (!champ) return;
      const img = document.createElement("img");
      img.src = champ.image;
      img.alt = "";
      img.title = champ.name;
      img.onclick = event => {
        event.stopPropagation();
        altPicks[lane] = (altPicks[lane] || []).filter(x => x !== id);
        renderAlt();
      };
      el.appendChild(img);
    });

    for (let i = list.length; i < 3; i++) {
      const empty = document.createElement("div");
      empty.className = "alt-slot-empty";
      el.appendChild(empty);
    }
  });
}

function renderTeam() {
  lanes.forEach(lane => {
    const laneEl = document.querySelector(`[data-lane="${lane}"]`);
    const main = laneEl.querySelector(".lane-main");
    const champ = champions.find(c => c.id === team[lane]);
    main.innerHTML = "";

    if (champ) {
      const img = document.createElement("img");
      img.src = champ.image;
      img.alt = "";
      main.appendChild(img);
    } else {
      const label = document.createElement("span");
      label.style.margin = "auto";
      label.textContent = lane.toUpperCase();
      main.appendChild(label);
    }
  });
}

function renderAll() {
  renderTeam();
  renderAlt();
  renderBanSlots();
  refreshAltButtons();
  renderChampionList();
}

async function saveTeam() {
  const editingId = pageMode === "edit" ? sessionStorage.getItem("editingTeamId") : null;
  const payload = {
    id: editingId || crypto.randomUUID(),
    name: document.getElementById("teamName").value.trim(),
    memo: document.getElementById("memo").value.trim(),
    lanes: team,
    bans: bannedChampionIds,
    altPicks
  };

  await saveTeamData(payload);
  alert("保存しました");
}

async function loadEditingTeam() {
  const editingId = sessionStorage.getItem("editingTeamId");
  if (!editingId) return;

  const saved = await getTeamById(editingId);
  if (!saved) return;

  team = saved.lanes || {};
  bannedChampionIds = saved.bans || [];
  altPicks = saved.altPicks || {};
  document.getElementById("teamName").value = saved.name || "";
  document.getElementById("memo").value = saved.memo || "";
  applyMeta();
}

function readSharePayloadFromUrl() {
  const encoded = new URLSearchParams(window.location.search).get("share");
  if (!encoded) return null;
  try {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(encoded))));
    return JSON.parse(json);
  } catch (error) {
    console.error(error);
    return null;
  }
}

function findChampionIdByName(name) {
  if (!name) return "";
  return champions.find(c => c.name === name)?.id || "";
}

async function loadSharedTeamFromUrl() {
  const payload = readSharePayloadFromUrl();
  if (!payload?.team) return false;

  const shared = payload.team;
  document.getElementById("teamName").value = shared.name || "";
  document.getElementById("memo").value = shared.memo || "";
  applyMeta();

  team = {};
  Object.entries(shared.lanes || {}).forEach(([lane, name]) => {
    team[lane] = findChampionIdByName(name);
  });
  bannedChampionIds = (shared.bans || []).map(findChampionIdByName).filter(Boolean);
  altPicks = {};
  Object.entries(shared.altPicks || {}).forEach(([lane, list]) => {
    altPicks[lane] = (list || []).map(findChampionIdByName).filter(Boolean).slice(0, 3);
  });

  renderAll();
  const notice = document.getElementById("shareNotice");
  if (notice) notice.style.display = "block";
  return true;
}

function buildExportMainCard(src, role) {
  const box = document.createElement("div");
  Object.assign(box.style, {
    width: "210px", height: "236px", borderRadius: "22px", overflow: "hidden",
    position: "relative", background: "linear-gradient(180deg, #334155, #1e293b)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.45)", border: "2px solid rgba(250, 204, 21, 0.7)", flexShrink: "0"
  });
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover" });
    box.appendChild(img);
  }
  const label = document.createElement("div");
  label.textContent = role;
  Object.assign(label.style, {
    position: "absolute", left: "10px", top: "10px", padding: "6px 10px", borderRadius: "999px",
    background: "rgba(15, 23, 42, 0.86)", border: "1px solid rgba(250, 204, 21, 0.65)",
    fontSize: "15px", fontWeight: "700", letterSpacing: "0.5px", color: "#f8fafc"
  });
  box.appendChild(label);
  return box;
}

function buildExportSubCard(src) {
  return buildSimpleExportCard(src, 59, 67, false);
}

function buildExportBanCard(src) {
  return buildSimpleExportCard(src, 76, 86, true);
}

function buildSimpleExportCard(src, width, height, isBan) {
  const box = document.createElement("div");
  Object.assign(box.style, {
    width: `${width}px`, height: `${height}px`, borderRadius: "10px", overflow: "hidden",
    background: "rgba(30, 41, 59, 0.95)", border: "1px solid rgba(148, 163, 184, 0.35)",
    boxShadow: "0 6px 14px rgba(0,0,0,0.28)", flexShrink: "0"
  });
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover" });
    if (isBan) img.style.filter = "grayscale(28%) contrast(1.04)";
    box.appendChild(img);
  }
  return box;
}

function closeExportPreview() {
  document.getElementById("exportPreviewModal").classList.remove("open");
}

function downloadExportPreview() {
  if (!exportPreviewBlob) {
    alert("出力画像がありません");
    return;
  }
  const link = document.createElement("a");
  link.download = exportPreviewFileName;
  link.href = URL.createObjectURL(exportPreviewBlob);
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function generateExportImage() {
  const exportArea = document.getElementById("exportArea");
  const exportMain = document.getElementById("exportMain");
  const exportSub = document.getElementById("exportSub");
  const exportBan = document.getElementById("exportBan");
  const exportNameBar = document.getElementById("exportNameBar");

  exportMain.innerHTML = "";
  exportSub.innerHTML = "";
  exportBan.innerHTML = "";

  const teamName = document.getElementById("teamName").value.trim();
  exportNameBar.textContent = teamName || "構成";
  exportPreviewFileName = teamName ? `${teamName}.png` : "チーム構成.png";

  const labels = { top: "TOP", jg: "JG", mid: "MID", adc: "ADC", sup: "SUP" };
  lanes.forEach(lane => {
    const champ = champions.find(c => c.id === team[lane]);
    exportMain.appendChild(buildExportMainCard(champ?.image || "", labels[lane]));

    const subWrap = document.createElement("div");
    Object.assign(subWrap.style, { width: "210px", display: "flex", gap: "8px", justifyContent: "center" });
    const subs = (altPicks[lane] || []).slice(0, 3);
    for (let i = 0; i < 3; i++) {
      const subChamp = champions.find(c => c.id === subs[i]);
      subWrap.appendChild(buildExportSubCard(subChamp?.image || ""));
    }
    exportSub.appendChild(subWrap);
  });

  const bans = bannedChampionIds.slice(0, 10);
  for (let i = 0; i < 10; i++) {
    const banChamp = champions.find(c => c.id === bans[i]);
    exportBan.appendChild(buildExportBanCard(banChamp?.image || ""));
  }

  html2canvas(exportArea, { backgroundColor: null, useCORS: true, scale: 2 })
    .then(canvas => canvas.toBlob(blob => {
      if (!blob) return alert("画像出力に失敗しました");
      exportPreviewBlob = blob;
      const previewUrl = URL.createObjectURL(blob);
      const img = document.getElementById("exportPreviewImage");
      img.onload = () => URL.revokeObjectURL(previewUrl);
      img.src = previewUrl;
      document.getElementById("exportPreviewModal").classList.add("open");
    }, "image/png"))
    .catch(error => {
      console.error(error);
      alert("画像出力に失敗しました");
    });
}

async function initTeamPage() {
  bindLaneEvents();
  await ensureInitialChampionSeed();
  await loadChampions();

  if (pageMode === "edit") {
    await loadEditingTeam();
    renderAll();
  } else {
    resetTeamBuilderState();
    await loadSharedTeamFromUrl();
  }
}

initTeamPage();
