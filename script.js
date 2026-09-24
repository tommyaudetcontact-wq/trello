const API_URL = "https://script.google.com/macros/s/AKfycbxF_bnX7Kq4QNDrhNACTfpvhjGpVPt-gJ6CMy6GkO0qdWH2YfgNkXMdtp6z_ZSkgS0MQA/exec";

// Palette de badges Xbox 360
const BADGE_COLORS = [
  { name: "Vert Live", hex: "#8fe838" },
  { name: "Orange Jeux", hex: "#ffa726" },
  { name: "Bleu Média", hex: "#38bdf8" },
  { name: "Mauve Système", hex: "#c084fc" },
  { name: "Jaune Marché", hex: "#fde047" },
  { name: "Chrome Satiné", hex: "#e2e8f0" },
  { name: "Rouge", hex: "#ef4444" },
  { name: "Rose", hex: "#ec4899" }
];

let selectedBadgeColor = "#8fe838";

let columns = JSON.parse(localStorage.getItem("trello_cols")) || [];
let tasks = JSON.parse(localStorage.getItem("trello_tasks")) || [];

let activeTimerTaskId = null;
let timerInterval = null;
let currentModalTaskId = null;
let syncTimeout = null;
let boardSortableInstance = null;

// Modales Natives
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function closeModalOnOverlay(e, id) {
  if (e.target.id === id) {
    closeModal(id);
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

document.addEventListener("DOMContentLoaded", () => {
  if (columns.length > 0) {
    renderBoard();
  }
  loadCloudData();
});

function setStatus(msg, type = "success") {
  const el = document.getElementById('sync-status');
  if (el) {
    el.className = `badge bg-${type}`;
    el.innerText = msg;
  }
}

function commitLocalAndTriggerCloud() {
  localStorage.setItem("trello_cols", JSON.stringify(columns));
  localStorage.setItem("trello_tasks", JSON.stringify(tasks));
  renderBoard();

  setStatus("Synchro...", "warning");
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      await fetch(API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "sync_all",
          columns: columns,
          tasks: tasks
        })
      });
      setStatus("Connecté", "success");
    } catch (err) {
      console.error("Erreur sync:", err);
      setStatus("Mode Local", "secondary");
    }
  }, 1000);
}

async function loadCloudData() {
  setStatus("Chargement...", "info");
  try {
    const res = await fetch(API_URL, { method: "GET", mode: "cors", redirect: "follow" });
    const json = await res.json();
    if (json.status === "success") {
      if (json.columns && json.columns.length > 0) {
        columns = json.columns.sort((a, b) => (parseInt(a.Ordre, 10) || 0) - (parseInt(b.Ordre, 10) || 0));
      }
      if (json.tasks) {
        tasks = json.tasks.map(t => {
          let comments = [];
          try { comments = JSON.parse(t.Commentaires); } catch (e) { comments = []; }
          return { ...t, Commentaires: Array.isArray(comments) ? comments : [] };
        });
      }
      localStorage.setItem("trello_cols", JSON.stringify(columns));
      localStorage.setItem("trello_tasks", JSON.stringify(tasks));
      renderBoard();
      setStatus("Connecté", "success");
    }
  } catch (err) {
    console.warn("Utilisation du cache local.", err);
    setStatus("Cache local", "warning");
    renderBoard();
  }
}

function formatTime(seconds) {
  const s = parseInt(seconds, 10) || 0;
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
}

function renderBoard() {
  const board = document.getElementById('board-container');
  if (!board) return;
  board.innerHTML = '';

  if (columns.length === 0) {
    board.innerHTML = '<div class="text-white-50 p-4">Aucune colonne. Cliquez sur "+ Ajouter Blade" pour commencer.</div>';
    return;
  }

  columns.forEach((col, idx) => {
    const colTasks = tasks.filter(t => String(t.Statut || '').trim() === String(col.Titre || '').trim());
    const themeClass = `blade-theme-${idx % 5}`;

    const colEl = document.createElement('div');
    colEl.className = 'kanban-col';
    colEl.dataset.colId = String(col.ID);
    colEl.dataset.colTitle = col.Titre;

    colEl.innerHTML = `
      <div class="col-header ${themeClass}">
        <div class="col-drag-handle">
          <span style="font-size: 1.1rem; opacity: 0.8;">⠿</span>
          <span>${escapeHtml(col.Titre)}</span>
        </div>
        <div class="d-flex align-items-center gap-2">
          <span class="badge bg-dark border border-secondary">${colTasks.length}</span>
          <button class="btn btn-link text-white p-0 text-decoration-none btn-del-col" data-col-id="${escapeHtml(col.ID)}">✕</button>
        </div>
      </div>
      
      <div class="task-list" id="list-${escapeHtml(col.ID)}" data-col-title="${escapeHtml(col.Titre)}"></div>

      <div class="p-2 pt-0">
        <div class="inline-add-box" id="inline-box-${escapeHtml(col.ID)}">
          <input type="text" class="x360-input form-control-sm mb-2 inline-input-field" id="inline-input-${escapeHtml(col.ID)}" placeholder="Titre de la tâche...">
          <div class="d-flex justify-content-end gap-1">
            <button class="btn btn-sm btn-outline-secondary py-0 btn-cancel-inline" data-col-id="${escapeHtml(col.ID)}">Annuler</button>
            <button class="xbox-btn-action btn-a py-0 px-2 btn-save-inline" data-col-id="${escapeHtml(col.ID)}" data-col-title="${escapeHtml(col.Titre)}">Ajouter</button>
          </div>
        </div>
        <button class="btn-quick-add btn-toggle-inline" data-col-id="${escapeHtml(col.ID)}">+ Ajouter une tâche</button>
      </div>
    `;

    // Événements pour la colonne
    colEl.querySelector('.btn-del-col').onclick = () => triggerDeleteColumn(col.ID);
    colEl.querySelector('.btn-cancel-inline').onclick = () => toggleInlineAdd(col.ID, false);
    colEl.querySelector('.btn-toggle-inline').onclick = () => toggleInlineAdd(col.ID, true);

    const saveBtn = colEl.querySelector('.btn-save-inline');
    saveBtn.onclick = (e) => {
      e.stopPropagation();
      saveInlineTask(col.ID, col.Titre);
    };

    const inputField = colEl.querySelector('.inline-input-field');
    inputField.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveInlineTask(col.ID, col.Titre);
      }
    };

    const taskList = colEl.querySelector(`#list-${col.ID}`);

    colTasks.forEach(task => {
      const isRunning = activeTimerTaskId === String(task.ID);
      const spentSec = parseInt(task.TempsPassé_Sec, 10) || 0;
      const estMin = parseInt(task.TempsEstimé_Min, 10) || 0;
      const estSec = estMin * 60;
      const pct = estSec > 0 ? Math.min(100, Math.round((spentSec / estSec) * 100)) : 0;
      const isOvertime = estSec > 0 && spentSec > estSec;

      const card = document.createElement('div');
      card.className = `task-card ${isRunning ? 'active-timer' : ''}`;
      card.dataset.id = String(task.ID);

      card.onclick = (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        openTaskModal(task.ID);
      };

      card.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div class="color-pill" style="background: ${task.Couleur || '#8fe838'}"></div>
          <button class="btn-card-del" title="Supprimer immédiatement">✕</button>
        </div>
        <div class="fw-semibold text-light mb-1">${escapeHtml(task.Titre)}</div>
        ${task.DateEcheance ? `<div class="small text-secondary mb-2">📅 ${escapeHtml(task.DateEcheance)}</div>` : ''}
        
        <div class="d-flex justify-content-between align-items-center mt-2">
          <span class="time-tracker text-info">
            ⏱️ <span id="timer-${escapeHtml(task.ID)}">${formatTime(spentSec)}</span> / ${estMin}m
          </span>
          <button class="btn btn-sm py-0 px-2 btn-timer-toggle ${isRunning ? 'btn-danger' : 'btn-outline-success'}">
            ${isRunning ? 'Pause' : 'Punch'}
          </button>
        </div>

        <div class="time-progress-bar">
          <div class="time-progress-fill ${isOvertime ? 'overtime' : ''}" style="width: ${pct}%"></div>
        </div>
      `;

      card.querySelector('.btn-card-del').onclick = (e) => {
        e.stopPropagation();
        triggerDirectDeleteTask(task.ID);
      };

      card.querySelector('.btn-timer-toggle').onclick = (e) => {
        e.stopPropagation();
        toggleTimer(task.ID);
      };

      taskList.appendChild(card);
    });

    board.appendChild(colEl);

    // Drag & Drop des tâches
    new Sortable(taskList, {
      group: 'x360-tasks',
      animation: 180,
      ghostClass: 'sortable-ghost',
      delay: 40,
      delayOnTouchOnly: true,
      touchStartThreshold: 4,
      onEnd: function (evt) {
        const taskId = evt.item.dataset.id;
        const newColTitle = evt.to.dataset.colTitle;
        const task = tasks.find(t => String(t.ID) === String(taskId));
        
        if (task && task.Statut !== newColTitle) {
          task.Statut = newColTitle;
          commitLocalAndTriggerCloud();
        }
      }
    });
  });

  // Drag & Drop des colonnes
  if (boardSortableInstance) boardSortableInstance.destroy();
  
  boardSortableInstance = new Sortable(board, {
    handle: '.col-drag-handle',
    animation: 200,
    ghostClass: 'col-ghost',
    delay: 50,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    onEnd: function () {
      const newOrderedCols = [];
      board.querySelectorAll('.kanban-col').forEach((el, index) => {
        const colId = el.dataset.colId;
        const cObj = columns.find(c => String(c.ID) === String(colId));
        if (cObj) {
          cObj.Ordre = index + 1;
          newOrderedCols.push(cObj);
        }
      });
      columns = newOrderedCols;
      commitLocalAndTriggerCloud();
    }
  });
}

function toggleInlineAdd(colId, show) {
  const box = document.getElementById(`inline-box-${colId}`);
  const btn = document.querySelector(`.btn-toggle-inline[data-col-id="${colId}"]`);
  if (box) box.style.display = show ? 'block' : 'none';
  if (btn) btn.style.display = show ? 'none' : 'block';
  if (show) {
    const input = document.getElementById(`inline-input-${colId}`);
    if (input) input.focus();
  }
}

function saveInlineTask(colId, colTitle) {
  const input = document.getElementById(`inline-input-${colId}`);
  if (!input) return;

  const title = input.value.trim();
  if (!title) return;

  const newTask = {
    ID: "TASK_" + Date.now(),
    Titre: title,
    Description: "",
    Statut: colTitle,
    TempsEstimé_Min: 30,
    TempsPassé_Sec: 0,
    DateEcheance: "",
    Couleur: "#8fe838",
    Commentaires: []
  };

  tasks.push(newTask);
  input.value = '';
  toggleInlineAdd(colId, false);
  commitLocalAndTriggerCloud();
}

function openNewColModal() {
  document.getElementById('new-col-name').value = '';
  openModal('colModalOverlay');
  setTimeout(() => document.getElementById('new-col-name').focus(), 150);
}

function submitNewColumn() {
  const name = document.getElementById('new-col-name').value.trim();
  if (!name) return;
  columns.push({
    ID: "col_" + Date.now(),
    Titre: name,
    Ordre: columns.length + 1
  });
  closeModal('colModalOverlay');
  commitLocalAndTriggerCloud();
}

function triggerDeleteColumn(colId) {
  const col = columns.find(c => String(c.ID) === String(colId));
  if (!col) return;

  document.getElementById('confirm-modal-text').innerText = `Supprimer la Blade "${col.Titre}" et toutes ses tâches ?`;
  document.getElementById('confirm-modal-btn').onclick = () => {
    columns = columns.filter(c => String(c.ID) !== String(colId));
    tasks = tasks.filter(t => t.Statut !== col.Titre);
    closeModal('confirmModalOverlay');
    commitLocalAndTriggerCloud();
  };
  openModal('confirmModalOverlay');
}

function toggleTimer(taskId) {
  const sid = String(taskId);
  const task = tasks.find(t => String(t.ID) === sid);
  if (!task) return;

  if (activeTimerTaskId === sid) {
    clearInterval(timerInterval);
    activeTimerTaskId = null;
    commitLocalAndTriggerCloud();
  } else {
    if (activeTimerTaskId) clearInterval(timerInterval);
    activeTimerTaskId = sid;
    timerInterval = setInterval(() => {
      task.TempsPassé_Sec = (parseInt(task.TempsPassé_Sec, 10) || 0) + 1;
      const el = document.getElementById(`timer-${sid}`);
      if (el) el.innerText = formatTime(task.TempsPassé_Sec);
    }, 1000);
  }
  renderBoard();
}

function renderColorPalette(currentColor) {
  const palette = document.getElementById('m-color-palette');
  palette.innerHTML = '';
  selectedBadgeColor = currentColor || BADGE_COLORS[0].hex;

  BADGE_COLORS.forEach(c => {
    const dot = document.createElement('div');
    dot.className = `color-dot ${selectedBadgeColor === c.hex ? 'selected' : ''}`;
    dot.style.background = c.hex;
    dot.title = c.name;
    dot.onclick = () => {
      selectedBadgeColor = c.hex;
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
    };
    palette.appendChild(dot);
  });
}

function openTaskModal(taskId) {
  currentModalTaskId = String(taskId);
  const task = tasks.find(t => String(t.ID) === currentModalTaskId);
  if (!task) return;

  document.getElementById('m-title').value = task.Titre;
  document.getElementById('m-desc').value = task.Description || '';
  document.getElementById('m-due-date').value = task.DateEcheance || '';
  document.getElementById('m-est').value = task.TempsEstimé_Min || 0;
  document.getElementById('m-spent').value = task.TempsPassé_Sec || 0;

  renderColorPalette(task.Couleur || "#8fe838");

  const colSelect = document.getElementById('m-column');
  colSelect.innerHTML = '';
  columns.forEach(col => {
    const opt = document.createElement('option');
    opt.value = col.Titre;
    opt.innerText = col.Titre;
    opt.selected = String(col.Titre).trim() === String(task.Statut).trim();
    colSelect.appendChild(opt);
  });

  renderCommentsList(task.Commentaires || []);
  openModal('detailModalOverlay');
}

function renderCommentsList(comments) {
  const box = document.getElementById('m-comments-list');
  box.innerHTML = '';
  if (!comments || comments.length === 0) {
    box.innerHTML = '<div class="small text-secondary">Aucun historique pour le moment.</div>';
    return;
  }
  comments.forEach(c => {
    const b = document.createElement('div');
    b.className = 'comment-bubble';
    b.innerHTML = `<div class="d-flex justify-content-between text-secondary"><span class="fw-bold">${escapeHtml(c.date)}</span></div><div class="mt-1">${escapeHtml(c.text)}</div>`;
    box.appendChild(b);
  });
}

function addComment() {
  const input = document.getElementById('m-new-comment');
  const text = input.value.trim();
  if (!text || !currentModalTaskId) return;

  const task = tasks.find(t => String(t.ID) === currentModalTaskId);
  if (!task) return;

  if (!task.Commentaires) task.Commentaires = [];
  const now = new Date();
  task.Commentaires.push({
    date: `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    text: text
  });

  input.value = '';
  renderCommentsList(task.Commentaires);
}

function saveTaskModal() {
  const task = tasks.find(t => String(t.ID) === currentModalTaskId);
  if (!task) return;

  task.Titre = document.getElementById('m-title').value.trim() || task.Titre;
  task.Description = document.getElementById('m-desc').value.trim();
  task.Couleur = selectedBadgeColor;
  task.Statut = document.getElementById('m-column').value;
  task.DateEcheance = document.getElementById('m-due-date').value;
  task.TempsEstimé_Min = parseInt(document.getElementById('m-est').value, 10) || 0;
  task.TempsPassé_Sec = parseInt(document.getElementById('m-spent').value, 10) || 0;

  closeModal('detailModalOverlay');
  commitLocalAndTriggerCloud();
}

function triggerDirectDeleteTask(taskId) {
  const task = tasks.find(t => String(t.ID) === String(taskId));
  if (!task) return;

  document.getElementById('confirm-modal-text').innerText = `Voulez-vous supprimer définitivement "${task.Titre}" ?`;
  document.getElementById('confirm-modal-btn').onclick = () => {
    tasks = tasks.filter(t => String(t.ID) !== String(taskId));
    closeModal('confirmModalOverlay');
    commitLocalAndTriggerCloud();
  };
  openModal('confirmModalOverlay');
}

function triggerDeleteTaskFromModal() {
  const task = tasks.find(t => String(t.ID) === currentModalTaskId);
  if (!task) return;

  document.getElementById('confirm-modal-text').innerText = `Voulez-vous supprimer définitivement "${task.Titre}" ?`;
  document.getElementById('confirm-modal-btn').onclick = () => {
    tasks = tasks.filter(t => String(t.ID) !== currentModalTaskId);
    closeModal('confirmModalOverlay');
    closeModal('detailModalOverlay');
    commitLocalAndTriggerCloud();
  };
  openModal('confirmModalOverlay');
}

function resetTaskTimer() {
  document.getElementById('m-spent').value = 0;
}