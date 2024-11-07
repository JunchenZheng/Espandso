/* ============================================================
   State
   ============================================================ */
const state = {
  files: [],          // [{path, snippets}]
  view: 'tree',       // 'tree' | 'global'
  selectedPath: null, // currently selected file path (tree mode)
  query: '',          // search query (global mode)
  expanded: new Set(),// expanded dir paths
};

/* ============================================================
   API
   ============================================================ */
async function fetchSnippets() {
  const res = await fetch('/api/snippets');
  const data = await res.json();
  state.files = data.files;
}

async function fetchRaw(resourcePath) {
  const res = await fetch(`/api/raw/${resourcePath}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return await res.json();
}

/* ============================================================
   Tree builder
   ============================================================ */
function buildTree(files) {
  const root = { type: 'dir', name: '', path: '', children: [] };

  for (const file of files) {
    const parts = file.path.split('/');
    let node = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      const dirPath = parts.slice(0, i + 1).join('/');
      let child = node.children.find(c => c.type === 'dir' && c.name === dirName);
      if (!child) {
        child = { type: 'dir', name: dirName, path: dirPath, children: [] };
        node.children.push(child);
        state.expanded.add(dirPath); // expand all by default
      }
      node = child;
    }

    node.children.push({
      type: 'file',
      name: parts[parts.length - 1],
      path: file.path,
      snippets: file.snippets,
    });
  }

  return root;
}

/* ============================================================
   Render — sidebar
   ============================================================ */
function renderTreeNode(node, depth) {
  if (node.type === 'file') {
    const active = state.selectedPath === node.path;
    const label = node.name.replace(/\.json$/, '');
    return `<div class="tree-item tree-file${active ? ' active' : ''}"
                 data-path="${node.path}"
                 style="padding-left:${depth * 14 + 10}px">
      <span class="tree-icon">◈</span>
      <span class="tree-label">${escHtml(label)}</span>
      <span class="tree-badge">${node.snippets.length}</span>
    </div>`;
  }

  // directory
  const isOpen = state.expanded.has(node.path);
  const chevron = isOpen ? '▾' : '▸';
  const children = node.children.map(c => renderTreeNode(c, depth + 1)).join('');
  return `<div class="tree-dir-wrap">
    <div class="tree-item tree-dir-header"
         data-dir="${node.path}"
         style="padding-left:${depth * 14 + 10}px">
      <span class="tree-icon" style="font-size:9px">${chevron}</span>
      <span class="tree-label">${escHtml(node.name)}</span>
    </div>
    <div class="tree-children${isOpen ? '' : ' collapsed'}">${children}</div>
  </div>`;
}

function renderSidebar() {
  const nav = document.getElementById('tree-nav');
  const searchWrap = document.getElementById('search-wrap');
  const stats = document.getElementById('sidebar-stats');

  const total = state.files.reduce((s, f) => s + f.snippets.length, 0);
  stats.textContent = `${state.files.length} files · ${total} snippets`;

  if (state.view === 'global') {
    searchWrap.classList.remove('hidden');
    nav.innerHTML = '';
    return;
  }

  searchWrap.classList.add('hidden');
  document.getElementById('search-input').value = '';

  const tree = buildTree(state.files);
  nav.innerHTML = tree.children.map(c => renderTreeNode(c, 0)).join('');
}

/* ============================================================
   Render — main content
   ============================================================ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCard(snippet, configDir) {
  const desc = snippet.description && !snippet.description.startsWith('[source:')
    ? `<div class="card-desc">${escHtml(snippet.description)}</div>`
    : '';

  let body = '';
  if (snippet.include_file) {
    const rp = snippet.resource_path || (configDir ? `${configDir}/${snippet.include_file}` : snippet.include_file);
    body = `<div class="card-file">
      <span class="file-icon">📎</span>
      <span class="file-name">${escHtml(snippet.include_file)}</span>
      <button class="file-view-btn" onclick="openModal('${escHtml(rp)}', '${escHtml(snippet.include_file)}')">View</button>
    </div>`;
  } else if (snippet.replace !== undefined) {
    const preview = escHtml(String(snippet.replace));
    body = `<div class="card-replace">${preview}</div>`;
  }

  return `<div class="snippet-card">
    <div class="card-trigger"><span class="trigger-badge">${escHtml(snippet.trigger)}</span></div>
    ${body}
    ${desc}
  </div>`;
}

function renderContent() {
  const header = document.getElementById('content-header');
  const body = document.getElementById('content-body');

  if (state.view === 'global') {
    renderGlobal(header, body);
  } else {
    renderTree(header, body);
  }
}

function renderTree(header, body) {
  if (!state.selectedPath) {
    header.innerHTML = '';
    body.innerHTML = `<div class="state-message">
      <div class="emoji">👈</div>
      <p>Select a file from the sidebar</p>
    </div>`;
    return;
  }

  const file = state.files.find(f => f.path === state.selectedPath);
  if (!file) { body.innerHTML = ''; return; }

  const configDir = file.path.includes('/') ? file.path.split('/').slice(0, -1).join('/') : '';
  const name = file.path.split('/').pop().replace(/\.json$/, '');

  header.innerHTML = `<div class="content-title">
    <span>${escHtml(name)}</span>
    <span class="content-path">${escHtml(file.path)}</span>
  </div>
  <div class="content-subtitle">${file.snippets.length} snippet${file.snippets.length !== 1 ? 's' : ''}</div>`;

  body.innerHTML = `<div class="snippet-grid">
    ${file.snippets.map(s => renderCard(s, configDir)).join('')}
  </div>`;
}

function renderGlobal(header, body) {
  const q = state.query.toLowerCase().trim();
  let all = state.files.flatMap(f => {
    const configDir = f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : '';
    return f.snippets.map(s => ({ snippet: s, configDir, filePath: f.path }));
  });

  if (q) {
    all = all.filter(({ snippet: s }) =>
      s.trigger.toLowerCase().includes(q) ||
      (s.replace && String(s.replace).toLowerCase().includes(q)) ||
      (s.include_file && s.include_file.toLowerCase().includes(q)) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  }

  header.innerHTML = `<div class="content-title">All Snippets</div>
    <div class="content-subtitle">${state.files.length} files · ${state.files.reduce((n, f) => n + f.snippets.length, 0)} total</div>`;

  if (q) {
    header.innerHTML += `<div class="search-count">${all.length} result${all.length !== 1 ? 's' : ''} for "${escHtml(q)}"</div>`;
  }

  if (!all.length) {
    body.innerHTML = `<div class="state-message">
      <div class="emoji">🔍</div>
      <p>No snippets match "<strong>${escHtml(q)}</strong>"</p>
    </div>`;
    return;
  }

  body.innerHTML = `<div class="snippet-grid">
    ${all.map(({ snippet, configDir }) => renderCard(snippet, configDir)).join('')}
  </div>`;
}

/* ============================================================
   Events
   ============================================================ */
function setView(v) {
  state.view = v;
  state.query = '';

  document.getElementById('btn-tree').classList.toggle('active', v === 'tree');
  document.getElementById('btn-global').classList.toggle('active', v === 'global');

  renderSidebar();
  renderContent();
}

function selectFile(path) {
  state.selectedPath = path;
  // re-render sidebar to update active state
  renderSidebar();
  renderContent();
  // re-attach sidebar click listener (sidebar was re-rendered)
  attachSidebarListeners();
}

function toggleDir(dirPath) {
  if (state.expanded.has(dirPath)) {
    state.expanded.delete(dirPath);
  } else {
    state.expanded.add(dirPath);
  }
  renderSidebar();
  attachSidebarListeners();
}

function handleSearch(q) {
  state.query = q;
  renderContent();
}

async function openModal(resourcePath, filename) {
  const modal = document.getElementById('modal');
  const title = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');

  title.textContent = filename;
  bodyEl.innerHTML = '<div class="state-message"><p>Loading…</p></div>';
  modal.classList.remove('hidden');

  try {
    const { content, type } = await fetchRaw(resourcePath);
    if (type === 'md') {
      bodyEl.innerHTML = `<div class="markdown-body">${marked.parse(content)}</div>`;
    } else if (type === 'json') {
      let pretty = content;
      try { pretty = JSON.stringify(JSON.parse(content), null, 2); } catch {}
      bodyEl.innerHTML = `<pre class="code-block">${escHtml(pretty)}</pre>`;
    } else {
      bodyEl.innerHTML = `<pre class="code-block">${escHtml(content)}</pre>`;
    }
  } catch (err) {
    bodyEl.innerHTML = `<div class="state-message"><p>Failed to load file: ${escHtml(String(err))}</p></div>`;
  }
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('modal-body').innerHTML = '';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

/* ============================================================
   Sidebar event delegation (re-attached after each re-render)
   ============================================================ */
function attachSidebarListeners() {
  const nav = document.getElementById('tree-nav');
  nav.onclick = e => {
    const file = e.target.closest('.tree-file');
    const dir = e.target.closest('.tree-dir-header');
    if (file) selectFile(file.dataset.path);
    else if (dir) toggleDir(dir.dataset.dir);
  };
}

/* ============================================================
   Init
   ============================================================ */
async function init() {
  document.getElementById('content-body').innerHTML =
    '<div class="state-message"><div class="emoji">⏳</div><p>Loading snippets…</p></div>';

  try {
    await fetchSnippets();
  } catch (err) {
    document.getElementById('content-body').innerHTML =
      `<div class="state-message"><div class="emoji">⚠️</div><p>Failed to load: ${escHtml(String(err))}</p></div>`;
    return;
  }

  // Auto-select first file in tree view
  if (state.files.length > 0) {
    state.selectedPath = state.files[0].path;
  }

  renderSidebar();
  renderContent();
  attachSidebarListeners();
}

init();
