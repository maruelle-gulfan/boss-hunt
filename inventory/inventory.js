// Asylum - Inventory (Firebase Firestore - shared real-time)
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
const INV_DOC = doc(db, 'inventory', 'state');

// ---------- admin gate ----------
// SHA-256 hashes of valid admin codes
const ADMIN_HASHES = [
  'b92eaa754ebc7404b90f6599aeffc312dadede1875049b633b17eb5ec774a33c',
  'f87501b0614bdfde91d044e0f38f9441a8d64a44814485efe590497fa28c679c',
  '03d407cc6760400a33fd9f0f8705a7c750194f301282e9847ee8ff1661e9b4a7',
];
const ADMIN_KEY  = 'bossHuntAdmin_v1'; // shared with boss hunt page

async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,'0')).join('');
}

function isAdmin() { return localStorage.getItem(ADMIN_KEY) === '1'; }
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

// ---------- state ----------
let items = [];
let editingId = null;
let pendingImage = null;
let pendingMembers = []; // members for the item being edited
let filterStatus = 'all';
let searchText = '';

// ---------- storage ----------
async function initFirestore() {
  try {
    const snap = await getDoc(INV_DOC);
    if (!snap.exists()) {
      await setDoc(INV_DOC, { items: [], updatedAt: Date.now() });
    }
  } catch (e) {
    console.error('Firestore init failed:', e);
    alert('Could not connect to Firebase.');
  }

  onSnapshot(INV_DOC, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    items = Array.isArray(data.items) ? data.items : [];
    render();
  }, (err) => console.error(err));
}

async function saveItems() {
  try {
    await setDoc(INV_DOC, { items, updatedAt: Date.now() });
  } catch (e) {
    console.error(e);
    alert('Could not save to Firebase.');
  }
}

// ---------- helpers ----------
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function formatNumber(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  return num.toLocaleString();
}

// ---------- render ----------
function render() {
  const tbody = document.getElementById('itemTableBody');
  tbody.innerHTML = '';

  const search = searchText.trim().toLowerCase();
  const filtered = items.filter(it => {
    if (filterStatus !== 'all' && it.status !== filterStatus) return false;
    if (search) {
      const memberStr = Array.isArray(it.members) ? it.members.join(' ') : (it.member || '');
      const hay = `${it.name||''} ${memberStr} ${it.notes||''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  filtered.forEach(it => {
    const tr = document.createElement('tr');
    const imgCell = it.image
      ? `<img class="boss-img" src="${it.image}" alt="${escapeHtml(it.name)}" />`
      : `<div class="boss-img placeholder">?</div>`;
    const status = it.status === 'sold' ? 'sold' : 'available';
    const memberList = Array.isArray(it.members) ? it.members : (it.member ? [it.member] : []);
    const membersCell = memberList.length
      ? `<div class="member-tags">${memberList.map(m => `<span class="member-tag">${escapeHtml(m)}</span>`).join('')}</div>`
      : '—';

    const value = Number(it.value) || 0;
    let valueDisplay = formatNumber(it.value);
    if (status === 'sold' && value > 0 && memberList.length > 1) {
      const share = Math.floor(value / memberList.length);
      valueDisplay += `<div class="share">÷ ${memberList.length} = <strong>${formatNumber(share)}</strong> each</div>`;
    }

    tr.innerHTML = `
      <td class="img-cell">${imgCell}</td>
      <td class="boss-name">${escapeHtml(it.name)}</td>
      <td>${membersCell}</td>
      <td class="value-cell">${valueDisplay}</td>
      <td><span class="status-badge ${status}">${status}</span></td>
      <td>${escapeHtml(it.notes || '')}</td>
      <td class="actions">
        <button class="btn btn-sm" data-act="toggle" data-id="${it.id}">
          ${status === 'sold' ? 'Mark Available' : 'Mark Sold'}
        </button>
        <button class="btn btn-sm" data-act="edit" data-id="${it.id}">Edit</button>
        <button class="btn btn-sm btn-danger" data-act="delete" data-id="${it.id}">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Totals
  document.getElementById('totalCount').textContent = items.length;
  document.getElementById('availableCount').textContent =
    items.filter(i => i.status !== 'sold').length;
  const soldValue = items
    .filter(i => i.status === 'sold')
    .reduce((s, i) => s + (Number(i.value) || 0), 0);
  document.getElementById('soldValue').textContent = formatNumber(soldValue);

  // Per-member earnings (sold items only, value split equally per item)
  const earnings = {};
  items.forEach(it => {
    if (it.status !== 'sold') return;
    const v = Number(it.value) || 0;
    if (v <= 0) return;
    const mlist = Array.isArray(it.members) ? it.members : (it.member ? [it.member] : []);
    if (!mlist.length) return;
    const share = Math.floor(v / mlist.length);
    mlist.forEach(m => {
      earnings[m] = (earnings[m] || 0) + share;
    });
  });
  const earningsEl = document.getElementById('memberEarnings');
  if (earningsEl) {
    const entries = Object.entries(earnings).sort((a, b) => b[1] - a[1]);
    earningsEl.innerHTML = entries.length
      ? entries.map(([m, v]) =>
          `<span class="earn-row"><span class="member-tag">${escapeHtml(m)}</span> <strong>${formatNumber(v)}</strong></span>`
        ).join('')
      : '<span style="color:#6e7681;">No sold items yet.</span>';
  }

  // Member suggestions (collect from all items)
  const dl = document.getElementById('memberList');
  const allMembers = new Set();
  items.forEach(i => {
    if (Array.isArray(i.members)) i.members.forEach(m => m && allMembers.add(m));
    else if (i.member) allMembers.add(i.member);
  });
  dl.innerHTML = [...allMembers].sort()
    .map(m => `<option value="${escapeHtml(m)}"></option>`).join('');
}

// ---------- member chips ----------
function renderMemberChips() {
  const wrap = document.getElementById('memberChips');
  wrap.innerHTML = pendingMembers.map((m, i) => `
    <span class="chip">${escapeHtml(m)}
      <button type="button" data-rm-member="${i}" title="Remove">×</button>
    </span>
  `).join('');
}
function addPendingMember(name) {
  const v = (name || '').trim();
  if (!v) return;
  if (pendingMembers.includes(v)) return;
  pendingMembers.push(v);
  renderMemberChips();
}

// ---------- modal ----------
function openModal(item) {
  editingId = item ? item.id : null;
  document.getElementById('itemModalTitle').textContent = item ? 'Edit Item' : 'Add Item';
  document.getElementById('itemName').value = item?.name || '';
  document.getElementById('itemMember').value = '';
  pendingMembers = item
    ? (Array.isArray(item.members) ? [...item.members] : (item.member ? [item.member] : []))
    : [];
  renderMemberChips();
  document.getElementById('itemValue').value = item?.value ?? '';
  document.getElementById('itemStatus').value = item?.status || 'available';
  document.getElementById('itemNotes').value = item?.notes || '';
  document.getElementById('itemImage').value = '';
  pendingImage = item?.image || null;
  updateImagePreview();
  document.getElementById('itemModal').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('itemModal').classList.add('hidden');
  editingId = null;
  pendingImage = null;
  pendingMembers = [];
  renderMemberChips();
}
function updateImagePreview() {
  const preview = document.getElementById('itemImagePreview');
  const removeBtn = document.getElementById('removeItemImageBtn');
  if (pendingImage) {
    preview.innerHTML = `<img src="${pendingImage}" alt="preview" />`;
    removeBtn.classList.remove('hidden');
  } else {
    preview.innerHTML = '';
    removeBtn.classList.add('hidden');
  }
}

function handleSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('itemName').value.trim();
  // Auto-add anything still typed in the member field
  const typed = document.getElementById('itemMember').value.trim();
  if (typed) addPendingMember(typed);
  const members = [...pendingMembers];
  const valueRaw = document.getElementById('itemValue').value;
  const value = valueRaw === '' ? null : Number(valueRaw);
  const status = document.getElementById('itemStatus').value;
  const notes = document.getElementById('itemNotes').value.trim();

  if (!name) return;

  if (editingId) {
    const it = items.find(x => x.id === editingId);
    if (it) {
      Object.assign(it, { name, members, value, status, notes, image: pendingImage });
      delete it.member; // remove legacy field
    }
  } else {
    items.push({
      id: 'i_' + Date.now(),
      name, members, value, status, notes, image: pendingImage,
      createdAt: new Date().toISOString()
    });
  }
  pendingImage = null;
  pendingMembers = [];
  saveItems();
  closeModal();
  render();
}

// ---------- actions ----------
function toggleStatus(id) {
  const it = items.find(x => x.id === id);
  if (!it) return;
  it.status = it.status === 'sold' ? 'available' : 'sold';
  saveItems();
  render();
}
function deleteItem(id) {
  if (!confirm('Delete this item?')) return;
  items = items.filter(x => x.id !== id);
  saveItems();
  render();
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  if (act === 'toggle') toggleStatus(id);
  else if (act === 'delete') deleteItem(id);
  else if (act === 'edit') {
    const it = items.find(x => x.id === id);
    if (it) openModal(it);
  }
});

document.getElementById('addItemBtn').addEventListener('click', () => openModal(null));
document.getElementById('itemCancelBtn').addEventListener('click', closeModal);
document.getElementById('itemForm').addEventListener('submit', handleSubmit);

// member chip add/remove
document.getElementById('addMemberBtn').addEventListener('click', () => {
  const input = document.getElementById('itemMember');
  addPendingMember(input.value);
  input.value = '';
  input.focus();
});
document.getElementById('itemMember').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addPendingMember(e.target.value);
    e.target.value = '';
  }
});
document.getElementById('memberChips').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-rm-member]');
  if (!btn) return;
  const idx = parseInt(btn.dataset.rmMember, 10);
  pendingMembers.splice(idx, 1);
  renderMemberChips();
});

document.getElementById('itemImage').addEventListener('change', (e) => {
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

document.getElementById('removeItemImageBtn').addEventListener('click', () => {
  pendingImage = null;
  document.getElementById('itemImage').value = '';
  updateImagePreview();
});

document.getElementById('statusFilter').addEventListener('change', (e) => {
  filterStatus = e.target.value;
  render();
});
document.getElementById('searchInput').addEventListener('input', (e) => {
  searchText = e.target.value;
  render();
});

document.getElementById('itemModal').addEventListener('click', (e) => {
  if (e.target.id === 'itemModal') closeModal();
});

document.getElementById('unlockBtn').addEventListener('click', async () => {
  if (isAdmin()) { setAdmin(false); return; }
  const code = prompt('Enter admin code to enable editing:');
  if (code === null) return;
  const hash = await sha256Hex(code);
  if (ADMIN_HASHES.includes(hash)) {
    setAdmin(true);
    alert('Editing unlocked on this device.');
  } else {
    alert('Wrong code.');
  }
});

applyAdminUI();
render();
initFirestore();
