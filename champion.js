let pastedImage = null;
let allChampions = [];
let activeTagFilter = "";
let editingChampionId = null;
let editImage = null;

async function ensureInitialChampionSeed() {
  const status = document.getElementById("seedStatus");

  try {
    const existing = await getChampionList();
    if (existing.length > 0) {
      if (status) status.style.display = "none";
      return;
    }

    if (status) {
      status.style.display = "block";
      status.textContent = "初期チャンピオンデータを読み込み中...";
    }

    const response = await fetch("champions.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("champions.json の読み込みに失敗しました");
    }

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.champions)) {
      throw new Error("champions.json の形式が不正です");
    }

    const champions = payload.champions.map(ch => ({
      ...ch,
      tags: Array.isArray(ch.tags) ? ch.tags : []
    }));

    if (champions.length > 0) {
      await saveManyChampions(champions);
    }

    if (status) {
      status.textContent = `初期チャンピオンを ${champions.length} 件読み込みました。`;
      setTimeout(() => { status.style.display = "none"; }, 1800);
    }
  } catch (error) {
    console.error(error);
    if (status) {
      status.style.display = "block";
      status.textContent = "初期チャンピオンデータの読み込みに失敗しました。必要ならチャンピオンインポートを使ってください。";
    }
  }
}

async function initChampionPage() {
  await ensureInitialChampionSeed();
  await loadChampions();
}

document.addEventListener("paste", function (event) {
  for (const item of event.clipboardData.items) {
    if (!item.type.startsWith("image")) continue;

    const file = item.getAsFile();
    const isEdit = document.getElementById("editModal").classList.contains("open");
    handleImageFile(file, isEdit);
    return;
  }
});

function handleImageFile(file, isEdit) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (event) {
    compressImage(event.target.result, 220, 0.72).then(compressed => {
      if (isEdit) {
        editImage = compressed;
        document.getElementById("editPreview").src = compressed;
      } else {
        pastedImage = compressed;
        document.getElementById("preview").src = compressed;
      }
    });
  };
  reader.readAsDataURL(file);
}

function compressImage(src, maxSize, quality) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = function () {
      let width = img.width;
      let height = img.height;

      if (width > height && width > maxSize) {
        height = Math.round(height * (maxSize / width));
        width = maxSize;
      } else if (height >= width && height > maxSize) {
        width = Math.round(width * (maxSize / height));
        height = maxSize;
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = src;
  });
}

async function saveChampion() {
  const name = document.getElementById("name").value.trim();

  if (!name || !pastedImage) {
    alert("名前と画像を入力してください");
    return;
  }

  try {
    await saveChampionData({
      id: crypto.randomUUID(),
      name,
      image: pastedImage,
      tags: []
    });

    document.getElementById("name").value = "";
    document.getElementById("preview").src = "";
    pastedImage = null;
    await initChampionPage();
  } catch (error) {
    console.error(error);
    alert("保存に失敗しました。ブラウザの保存容量を確認してください。");
  }
}

async function loadChampions() {
  allChampions = await getChampionList();
  renderList();
}

function setTagFilter(tag) {
  activeTagFilter = tag;
  document.querySelectorAll(".tag-filter").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tag === tag);
  });
  renderList();
}

function renderList() {
  const list = document.getElementById("championList");
  const keyword = document.getElementById("searchInput").value.trim().toLowerCase();
  list.innerHTML = "";

  const filtered = allChampions
    .filter(c => c.name.toLowerCase().includes(keyword))
    .filter(c => !activeTagFilter || (Array.isArray(c.tags) && c.tags.includes(activeTagFilter)))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty">該当するチャンピオンがありません。</div>';
    return;
  }

  filtered.forEach(champion => {
    const div = document.createElement("div");
    div.className = "champion-card";
    div.innerHTML = `
      <img src="${champion.image}" alt="">
      <div class="name">${champion.name}</div>
      <div class="card-actions">
        <button class="edit-btn" onclick="openEditModal('${champion.id}')">編集</button>
        <button class="delete-btn" onclick="deleteChampion('${champion.id}')">削除</button>
      </div>
    `;
    list.appendChild(div);
  });
}

async function deleteChampion(id) {
  if (!confirm("削除しますか？")) return;
  await deleteChampionData(id);
  await initChampionPage();
}

async function openEditModal(id) {
  const champion = await getChampionById(id);
  if (!champion) return;

  editingChampionId = id;
  editImage = champion.image;

  document.getElementById("editName").value = champion.name || "";
  document.getElementById("editPreview").src = champion.image || "";

  const tagSet = new Set(Array.isArray(champion.tags) ? champion.tags : []);
  document.querySelectorAll(".tag-checkbox").forEach(box => {
    box.checked = tagSet.has(box.value);
  });

  document.getElementById("editModal").classList.add("open");
}

function closeEditModal() {
  document.getElementById("editModal").classList.remove("open");
  editingChampionId = null;
  editImage = null;
}

async function saveEditChampion() {
  if (!editingChampionId) return;

  const current = await getChampionById(editingChampionId);
  if (!current) return;

  const name = document.getElementById("editName").value.trim();
  if (!name) {
    alert("チャンピオン名を入力してください");
    return;
  }

  const tags = Array.from(document.querySelectorAll(".tag-checkbox:checked"))
    .map(el => el.value);

  await saveChampionData({
    ...current,
    name,
    image: editImage || current.image,
    tags
  });

  closeEditModal();
  await initChampionPage();
}

async function exportChampions() {
  const list = await getChampionList();
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    champions: list
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.download = "champions.json";
  link.href = URL.createObjectURL(blob);
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function triggerChampionImport() {
  const input = document.getElementById("championImportInput");
  input.value = "";
  input.click();
}

async function handleChampionImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data || !Array.isArray(data.champions)) {
      alert("不正なファイルです");
      return;
    }

    const existing = await getChampionList();
    const toAdd = data.champions.filter(ch =>
      !existing.some(e => e.name === ch.name && e.image === ch.image)
    );

    await saveManyChampions(toAdd);
    alert(`${toAdd.length}件のチャンピオンを追加しました`);
    await initChampionPage();
  } catch (error) {
    console.error(error);
    alert("インポート失敗");
  }
}

initChampionPage();
