// 資料儲存 + GitHub 雲端同步
// 本機：localStorage（離線也能用、開啟最快）
// 雲端：私人 GitHub repo 裡的一個 JSON 檔，所有裝置共用
//
// 每次修改都記成一個「操作」(op)。同步時先抓雲端最新版，再把還沒上傳的操作套上去，
// 這樣兩個人同時在改，也不會把對方的修改蓋掉。
const Store = (() => {
  const KEY_STATE = 'ning.state.v2';
  const KEY_PENDING = 'ning.pending.v2';
  const KEY_SYNC = 'ning.sync.v1';
  const KEY_PREFS = 'ning.prefs.v1';
  const DEFAULT_REPO = 'cabg698698/ning-data';
  const FILE_PATH = 'data.json';
  const POLL_MS = 10000;

  const listeners = [];
  let state = loadState();
  let pending = readJSON(KEY_PENDING, []);
  let syncCfg = readJSON(KEY_SYNC, null);
  let syncing = false;
  let syncAgain = false;
  let pushTimer = null;
  let status = 'off'; // off | syncing | ok | error
  let statusMsg = '';

  // ---------- 本機 ----------
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { toast('⚠️ 儲存失敗，請確認瀏覽器沒有開無痕模式'); }
  }

  function emptyState() { return { calendar: { 瓜甯: {}, 阿瓜: {} }, events: { 瓜甯: {}, 阿瓜: {} }, places: [] }; }

  function normalize(s) {
    const out = emptyState();
    if (s && s.calendar) Object.assign(out.calendar, s.calendar);
    if (s && s.events) Object.assign(out.events, s.events);
    if (s && Array.isArray(s.places)) out.places = s.places;
    return out;
  }

  function loadState() {
    const s = readJSON(KEY_STATE, null);
    if (s) return normalize(s);
    // 從第一版的資料搬過來
    return normalize({
      calendar: readJSON('ning.calendar.v1', {}),
      places: readJSON('ning.places.v1', []),
    });
  }

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- 操作 ----------
  function applyOp(s, op) {
    switch (op.t) {
      case 'cal': {
        const cal = s.calendar[op.person] || (s.calendar[op.person] = {});
        Object.entries(op.changes).forEach(([k, v]) => { if (v) cal[k] = v; else delete cal[k]; });
        break;
      }
      case 'ev.put': {
        const byDay = s.events[op.person] || (s.events[op.person] = {});
        const list = byDay[op.date] || (byDay[op.date] = []);
        const i = list.findIndex((e) => e.id === op.ev.id);
        if (i >= 0) list[i] = op.ev; else list.push(op.ev);
        break;
      }
      case 'ev.del': {
        const byDay = s.events[op.person] || {};
        if (byDay[op.date]) {
          byDay[op.date] = byDay[op.date].filter((e) => e.id !== op.id);
          if (!byDay[op.date].length) delete byDay[op.date];
        }
        break;
      }
      case 'place.put': {
        const i = s.places.findIndex((p) => p.id === op.place.id);
        if (i >= 0) s.places[i] = op.place; else s.places.unshift(op.place);
        break;
      }
      case 'place.del':
        s.places = s.places.filter((p) => p.id !== op.id);
        break;
      case 'replace':
        Object.assign(s, normalize(op.state));
        break;
    }
    return s;
  }

  function apply(op) {
    applyOp(state, op);
    writeJSON(KEY_STATE, state);
    if (syncCfg) {
      pending.push(op);
      writeJSON(KEY_PENDING, pending);
      clearTimeout(pushTimer);
      pushTimer = setTimeout(sync, 1200);
      setStatus('syncing', '等待上傳…');
    }
  }

  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

  // ---------- GitHub ----------
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  async function gh(method, body, cfg = syncCfg) {
    const res = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${FILE_PATH}`, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res;
  }

  async function pullRemote(cfg = syncCfg) {
    const res = await gh('GET', null, cfg);
    if (res.status === 404) {
      // 檔案不存在 → 也可能是 repo 名稱錯或沒權限，區分一下
      const repoRes = await fetch(`https://api.github.com/repos/${cfg.repo}`, {
        cache: 'no-store', headers: { Authorization: `Bearer ${cfg.token}` },
      });
      if (!repoRes.ok) throw new Error('找不到資料 repo，請確認名稱和權杖權限');
      return { data: null, sha: null };
    }
    if (res.status === 401) throw new Error('權杖無效或過期');
    if (res.status === 403) throw new Error('權杖沒有這個 repo 的權限');
    if (!res.ok) throw new Error(`GitHub 錯誤 ${res.status}`);
    const json = await res.json();
    return { data: normalize(JSON.parse(b64decode(json.content) || '{}')), sha: json.sha };
  }

  async function pushRemote(data, sha) {
    const body = {
      message: `Ning 更新 ${new Date().toLocaleString('zh-TW', { hour12: false })}`,
      content: b64encode(JSON.stringify({ app: 'ning', version: 2, ...data }, null, 1)),
    };
    if (sha) body.sha = sha;
    const res = await gh('PUT', body);
    if (res.status === 409 || res.status === 422) return false; // 有人剛好也更新了，重來
    if (res.status === 401) throw new Error('權杖無效或過期');
    if (res.status === 403 || res.status === 404) throw new Error('權杖沒有寫入權限（要 Contents: Read and write）');
    if (!res.ok) throw new Error(`GitHub 錯誤 ${res.status}`);
    return true;
  }

  async function sync() {
    if (!syncCfg) return;
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    clearTimeout(pushTimer);
    setStatus('syncing', '同步中…');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data, sha } = await pullRemote();
        const base = data || emptyState();
        const ops = pending.slice();
        if (!ops.length && data) {
          replaceLocal(base);
          break;
        }
        const merged = ops.reduce((s, op) => applyOp(s, op), JSON.parse(JSON.stringify(base)));
        if (await pushRemote(merged, sha)) {
          pending = pending.slice(ops.length); // 同步期間又有新修改的話留著
          writeJSON(KEY_PENDING, pending);
          replaceLocal(pending.reduce((s, op) => applyOp(s, op), JSON.parse(JSON.stringify(merged))));
          break;
        }
        if (attempt === 3) throw new Error('同時有人在改，稍後再試');
      }
      setStatus('ok', '已同步 ' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }));
    } catch (e) {
      console.warn(e);
      setStatus('error', navigator.onLine ? e.message : '離線中，連上網路後會自動上傳');
    } finally {
      syncing = false;
      if (syncAgain) { syncAgain = false; sync(); }
    }
  }

  function replaceLocal(s) {
    const before = JSON.stringify(state);
    state = normalize(s);
    writeJSON(KEY_STATE, state);
    if (JSON.stringify(state) !== before) emit();
  }

  // 第一次連線：把這台裝置原本的資料併進雲端（不會刪掉雲端已有的）
  function mergeOps(local, remote) {
    const ops = [];
    Object.entries(local.calendar).forEach(([person, days]) => {
      const changes = {};
      const r = (remote && remote.calendar[person]) || {};
      Object.entries(days).forEach(([k, v]) => { if (!r[k]) changes[k] = v; });
      if (Object.keys(changes).length) ops.push({ t: 'cal', person, changes });
    });
    Object.entries(local.events || {}).forEach(([person, days]) => {
      Object.entries(days).forEach(([date, list]) => {
        const r = (((remote && remote.events) || {})[person] || {})[date] || [];
        list.forEach((ev) => { if (!r.some((x) => x.id === ev.id)) ops.push({ t: 'ev.put', person, date, ev }); });
      });
    });
    const ids = new Set(((remote && remote.places) || []).map((p) => p.id));
    local.places.slice().reverse().forEach((p) => { if (!ids.has(p.id)) ops.push({ t: 'place.put', place: p }); });
    return ops;
  }

  async function connect(token, repo) {
    const cfg = { token: token.trim(), repo: (repo || DEFAULT_REPO).trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '') };
    setStatus('syncing', '連線中…');
    const { data } = await pullRemote(cfg); // 失敗會丟出錯誤
    syncCfg = cfg;
    writeJSON(KEY_SYNC, cfg);
    pending = mergeOps(state, data);
    writeJSON(KEY_PENDING, pending);
    if (data) replaceLocal(pending.reduce((s, op) => applyOp(s, op), JSON.parse(JSON.stringify(data))));
    await sync();
    startPolling();
  }

  function disconnect() {
    syncCfg = null;
    pending = [];
    localStorage.removeItem(KEY_SYNC);
    localStorage.removeItem(KEY_PENDING);
    setStatus('off', '');
  }

  // 設定連結：把設定放在網址 # 後面（不會傳到任何伺服器），另一台裝置打開就自動連上
  function shareLink() {
    if (!syncCfg) return null;
    const code = btoa(JSON.stringify({ k: syncCfg.token, r: syncCfg.repo }));
    return `${location.origin}${location.pathname}#sync=${encodeURIComponent(code)}`;
  }

  async function consumeShareLink() {
    const m = location.hash.match(/sync=([^&]+)/);
    if (!m) return false;
    history.replaceState(null, '', location.pathname);
    try {
      const { k, r } = JSON.parse(atob(decodeURIComponent(m[1])));
      await connect(k, r);
      toast('☁️ 已連上雲端，資料同步完成');
    } catch (e) {
      toast('⚠️ 設定連結無效：' + e.message);
    }
    return true;
  }

  let pollTimer = null;
  function startPolling() {
    clearInterval(pollTimer);
    if (!syncCfg) return;
    pollTimer = setInterval(() => { if (document.visibilityState === 'visible') sync(); }, POLL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  window.addEventListener('online', sync);

  // ---------- 狀態顯示 ----------
  const statusListeners = [];
  function setStatus(s, msg) {
    status = s; statusMsg = msg;
    statusListeners.forEach((fn) => fn(status, statusMsg));
  }
  function onStatus(fn) { statusListeners.push(fn); fn(status, statusMsg); }

  function start() {
    if (syncCfg) {
      setStatus(pending.length ? 'syncing' : 'ok', '');
      sync();
      startPolling();
    }
  }

  // ---------- 偏好設定（只存本機）----------
  function prefs() { return readJSON(KEY_PREFS, {}); }
  function setPrefs(patch) { writeJSON(KEY_PREFS, { ...prefs(), ...patch }); }

  return {
    get state() { return state; },
    apply, onChange, onStatus, start, sync, connect, disconnect, shareLink, consumeShareLink,
    get syncConfig() { return syncCfg; },
    DEFAULT_REPO, prefs, setPrefs,
  };
})();

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
