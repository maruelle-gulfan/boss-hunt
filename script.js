// Boss Hunt - Respawn Tracker (Firebase Firestore - shared real-time)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, onSnapshot, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAfph7DAPKKBAed2oP9cPk785V3uQgNcBE",
  authDomain: "boss-hunt-29943.firebaseapp.com",
  projectId: "boss-hunt-29943",
  storageBucket: "boss-hunt-29943.firebasestorage.app",
  messagingSenderId: "681709857273",
  appId: "1:681709857273:web:b56d294595c15f94bf7528",
  measurementId: "G-G1C9J53C26"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const BOSSES_DOC = doc(db, 'bossHunt', 'state');

// ---------- admin gate (client-side, casual protection only) ----------
const ADMIN_CODE = ['Tyla777', 'Vanta666', 'Bully888'];        // <-- valid team codes
const ADMIN_KEY  = 'bossHuntAdmin_v1';

function isAdmin() {
  return localStorage.getItem(ADMIN_KEY) === '1';
}
function setAdmin(on) {
  if (on) localStorage.setItem(ADMIN_KEY, '1');
  else localStorage.removeItem(ADMIN_KEY);
  applyAdminUI();
}
function applyAdminUI() {
  document.body.classList.toggle('admin', isAdmin());
  const btn = document.getElementById('unlockBtn');
  if (btn) btn.textContent = isAdmin() ? '🔓 Lock' : '🔒 Unlock';
}

// Default boss list based on the user's format
const DEFAULT_BOSSES = [
  { id: 'cj',  name: 'CJ', location: 'PY',     hours: 12, killedAt: null, unkillable: false, image: 'images/CJ.png' },
  { id: 'cb',  name: 'CB', location: 'MH',     hours: 10, killedAt: null, unkillable: false, image: 'images/CB.png' },
  { id: 'sb',  name: 'SB', location: 'MH',     hours: 10, killedAt: null, unkillable: false, image: 'images/SB.png' },
  { id: 'gm1', name: 'GM', location: 'PRISON', hours: 10, killedAt: null, unkillable: false, image: 'images/GM.png' },
  { id: 'dm',  name: 'DM', location: 'B3',     hours: 6,  killedAt: null, unkillable: false, image: 'images/DAM.png' },
  { id: 'gm2', name: 'GM', location: 'RH',     hours: 6,  killedAt: null, unkillable: false, image: 'images/GM.png' },
  { id: 'da',  name: 'DA', location: 'RH',     hours: 8,  killedAt: null, unkillable: false, image: null },
  { id: 'bg',  name: 'BG', location: 'RH',     hours: 8,  killedAt: null, unkillable: true,  image: 'images/BG.png' },
  { id: 'as',  name: 'AS', location: 'RH',     hours: 16, killedAt: null, unkillable: false, image: 'images/AS.png' },
  { id: 'cs',  name: 'CS', location: 'RH',     hours: 16, killedAt: null, unkillable: false, image: 'images/CS.png' },
];

let bosses = [...DEFAULT_BOSSES];
let editingId = null;
let pendingImage = null; // data URL for image being added/edited
let suppressNextSnapshot = false; // avoid re-render loop after our own write

// ---------- storage (Firestore) ----------
async function initFirestore() {
  // Seed defaults if doc doesn't exist yet
  try {
    const snap = await getDoc(BOSSES_DOC);
    if (!snap.exists()) {
      await setDoc(BOSSES_DOC, { bosses: DEFAULT_BOSSES, updatedAt: Date.now() });
    }
  } catch (e) {
    console.error('Firestore init failed:', e);
    alert('Could not connect to Firebase. Check your internet/Firestore rules.');
  }

  // Real-time listener
  onSnapshot(BOSSES_DOC, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    if (Array.isArray(data.bosses)) {
      bosses = data.bosses;
      render();
    }
  }, (err) => {
    console.error('Firestore listener error:', err);
  });
}

async function saveBosses() {
  try {
    await setDoc(BOSSES_DOC, { bosses, updatedAt: Date.now() });
  } catch (e) {
    console.error(e);
    alert('Could not save to Firebase. Check your connection / Firestore rules.');
  }
}

// ---------- date helpers ----------
function formatDateHeader(d) {
  const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  return `${months[d.getMonth()]} ~ ${d.getDate()} ~ ${d.getFullYear()}`;
}

function periodOfDay(hour) {
  if (hour >= 1 && hour < 5) return 'Early Morning';
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 23) return 'Evening';
  return 'Midnight';
}

function formatSpawnTime(date) {
  let h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const period = periodOfDay(h);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m} ~ ${period}`;
}

function formatCountdown(ms) {
  if (ms <= 0) return 'READY';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

// datetime-local helpers
function toLocalInputValue(date) {
  const pad = n => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ---------- rendering ----------
function render() {
  document.getElementById('currentDate').textContent = formatDateHeader(new Date());
  const tbody = document.getElementById('bossTableBody');
  tbody.innerHTML = '';
  const now = Date.now();

  bosses.forEach(b => {
    const tr = document.createElement('tr');
    let lastKilled = '—';
    let nextSpawn = '—';
    let countdownText = '—';
    let statusClass = 'wait';

    if (b.unkillable) {
      lastKilled = '—';
      nextSpawn = '—';
      countdownText = 'UNKILLABLE';
      statusClass = 'unkillable';
    } else if (b.killedAt) {
      const killed = new Date(b.killedAt);
      const respawn = new Date(killed.getTime() + b.hours * 3600 * 1000);
      lastKilled = formatSpawnTime(killed);
      nextSpawn = formatSpawnTime(respawn);
      const remaining = respawn.getTime() - now;
      countdownText = formatCountdown(remaining);
      if (remaining <= 0) statusClass = 'ready';
      else if (remaining < 3600 * 1000) statusClass = 'soon';
      else statusClass = 'wait';
    } else {
      countdownText = 'NOT SET';
      statusClass = 'wait';
    }

    const imgCell = b.image
      ? `<img class="boss-img" src="${b.image}" alt="${escapeHtml(b.name)}" />`
      : `<div class="boss-img placeholder">?</div>`;

    tr.innerHTML = `
      <td class="img-cell">${imgCell}</td>
      <td class="boss-name">${escapeHtml(b.name)}</td>
      <td>${lastKilled}</td>
      <td>${escapeHtml(b.location)} / ${b.hours}hrs.</td>
      <td class="countdown ${statusClass}">${countdownText}</td>
      <td>${nextSpawn}</td>
      <td class="actions">
        <button class="btn btn-sm btn-primary" data-act="kill" data-id="${b.id}">Killed Now</button>
        <button class="btn btn-sm" data-act="edit" data-id="${b.id}">Edit</button>
        <button class="btn btn-sm btn-danger" data-act="delete" data-id="${b.id}">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ---------- actions ----------
function killNow(id) {
  const b = bosses.find(x => x.id === id);
  if (!b) return;
  b.killedAt = new Date().toISOString();
  b.unkillable = false;
  saveBosses();
  render();
}

function deleteBoss(id) {
  if (!confirm('Delete this boss?')) return;
  bosses = bosses.filter(x => x.id !== id);
  saveBosses();
  render();
}

function openModal(boss) {
  editingId = boss ? boss.id : null;
  document.getElementById('modalTitle').textContent = boss ? 'Edit Boss' : 'Add Boss';
  document.getElementById('bossName').value = boss?.name || '';
  document.getElementById('bossLocation').value = boss?.location || '';
  document.getElementById('bossHours').value = boss?.hours ?? '';
  document.getElementById('bossUnkillable').checked = boss?.unkillable || false;
  document.getElementById('bossKilledAt').value =
    boss?.killedAt ? toLocalInputValue(new Date(boss.killedAt)) : '';
  document.getElementById('bossImage').value = '';
  pendingImage = boss?.image || null;
  updateImagePreview();
  document.getElementById('modal').classList.remove('hidden');
}

function updateImagePreview() {
  const preview = document.getElementById('bossImagePreview');
  const removeBtn = document.getElementById('removeImageBtn');
  if (pendingImage) {
    preview.innerHTML = `<img src="${pendingImage}" alt="preview" />`;
    removeBtn.classList.remove('hidden');
  } else {
    preview.innerHTML = '';
    removeBtn.classList.add('hidden');
  }
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  editingId = null;
  pendingImage = null;
}

function handleSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('bossName').value.trim();
  const location = document.getElementById('bossLocation').value.trim();
  const hours = parseFloat(document.getElementById('bossHours').value);
  const unkillable = document.getElementById('bossUnkillable').checked;
  const killedRaw = document.getElementById('bossKilledAt').value;
  const killedAt = killedRaw ? new Date(killedRaw).toISOString() : null;

  if (editingId) {
    const b = bosses.find(x => x.id === editingId);
    if (b) Object.assign(b, { name, location, hours, unkillable, killedAt, image: pendingImage });
  } else {
    bosses.push({
      id: 'b_' + Date.now(),
      name, location, hours, unkillable, killedAt, image: pendingImage
    });
  }
  pendingImage = null;
  saveBosses();
  closeModal();
  render();
}

// ---------- init ----------
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  if (act === 'kill') killNow(id);
  else if (act === 'delete') deleteBoss(id);
  else if (act === 'edit') {
    const b = bosses.find(x => x.id === id);
    if (b) openModal(b);
  }
});

document.getElementById('addBossBtn').addEventListener('click', () => openModal(null));
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('bossForm').addEventListener('submit', handleSubmit);

document.getElementById('bossImage').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    alert('Image too large. Please use an image under 2MB.');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingImage = ev.target.result;
    updateImagePreview();
  };
  reader.readAsDataURL(file);
});

document.getElementById('removeImageBtn').addEventListener('click', () => {
  pendingImage = null;
  document.getElementById('bossImage').value = '';
  updateImagePreview();
});

document.getElementById('resetAllBtn').addEventListener('click', () => {
  if (confirm('Reset all bosses to defaults? This will erase your saved data.')) {
    bosses = [...DEFAULT_BOSSES];
    saveBosses();
    render();
  }
});

// ---------- server up ----------
function openServerUpModal() {
  document.getElementById('serverUpTime').value = toLocalInputValue(new Date());
  document.getElementById('serverUpModal').classList.remove('hidden');
}

function closeServerUpModal() {
  document.getElementById('serverUpModal').classList.add('hidden');
}

function applyServerUp(date) {
  const iso = date.toISOString();
  let count = 0;
  bosses.forEach(b => {
    if (!b.unkillable) {
      b.killedAt = iso;
      count++;
    }
  });
  saveBosses();
  render();
  return count;
}

document.getElementById('serverUpBtn').addEventListener('click', openServerUpModal);
document.getElementById('serverUpCancelBtn').addEventListener('click', closeServerUpModal);
document.getElementById('serverUpNowBtn').addEventListener('click', () => {
  document.getElementById('serverUpTime').value = toLocalInputValue(new Date());
});
document.getElementById('serverUpForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = document.getElementById('serverUpTime').value;
  if (!raw) return;
  const date = new Date(raw);
  if (isNaN(date.getTime())) {
    alert('Invalid date/time.');
    return;
  }
  if (!confirm('Restart respawn timers for all killable bosses from ' + formatSpawnTime(date) + '?')) return;
  const count = applyServerUp(date);
  closeServerUpModal();
  alert(`Server up time applied to ${count} boss(es).`);
});
document.getElementById('serverUpModal').addEventListener('click', (e) => {
  if (e.target.id === 'serverUpModal') closeServerUpModal();
});

document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});

render();
setInterval(render, 1000);
applyAdminUI();
document.getElementById('unlockBtn').addEventListener('click', () => {
  if (isAdmin()) {
    setAdmin(false);
    return;
  }
  const code = prompt('Enter admin code to enable editing:');
  if (code === null) return;
  if (ADMIN_CODE.includes(code)) {
    setAdmin(true);
    alert('Editing unlocked on this device.');
  } else {
    alert('Wrong code.');
  }
});
initFirestore();
