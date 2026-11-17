// 頁籤切換、雲端同步設定、備份匯出入
(() => {
  const views = { calendar: 'view-calendar', places: 'view-places' };
  const $ = (id) => document.getElementById(id);

  function show(view) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    Object.entries(views).forEach(([k, id]) => $(id).classList.toggle('active', k === view));
    if (view === 'places') Places.onShow();
    Store.setPrefs({ view });
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
  }

  document.querySelector('.tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (t) show(t.dataset.view);
  });

  // ---------- 雲端同步 ----------
  const STATUS_TEXT = { off: '未同步', syncing: '同步中', ok: '已同步', error: '同步失敗' };
  Store.onStatus((status, msg) => {
    const btn = $('syncBtn');
    btn.className = 'sync-btn ' + status;
    $('syncText').textContent = STATUS_TEXT[status];
    $('syncStatusLabel').textContent = msg || STATUS_TEXT[status];
  });

  function openSync() {
    const cfg = Store.syncConfig;
    $('syncSetup').classList.toggle('hidden', !!cfg);
    $('syncConnected').classList.toggle('hidden', !cfg);
    if (cfg) $('syncRepoLabel').textContent = cfg.repo;
    else { $('syncRepo').value = Store.DEFAULT_REPO; $('syncToken').value = ''; }
    $('syncDialog').showModal();
  }
  $('syncBtn').addEventListener('click', openSync);
  $('syncDialog').addEventListener('click', (e) => {
    if (e.target.matches('[data-close]') || e.target === $('syncDialog')) $('syncDialog').close();
  });
  $('syncConnect').addEventListener('click', async () => {
    const token = $('syncToken').value.trim();
    if (!token) { toast('請先貼上權杖'); return; }
    const btn = $('syncConnect');
    btn.disabled = true; btn.textContent = '連線中…';
    try {
      await Store.connect(token, $('syncRepo').value);
      toast('☁️ 已連上雲端，之後的修改都會自動同步');
      openSync();
    } catch (err) {
      toast('⚠️ ' + err.message);
    } finally {
      btn.disabled = false; btn.textContent = '連線';
    }
  });
  $('syncNow').addEventListener('click', () => Store.sync());
  $('syncShare').addEventListener('click', async () => {
    const link = Store.shareLink();
    try {
      await navigator.clipboard.writeText(link);
      toast('🔗 已複製，傳到另一台裝置打開即可');
    } catch (_) {
      prompt('複製這個連結到另一台裝置打開：', link);
    }
  });
  $('syncOff').addEventListener('click', () => {
    if (!confirm('中斷後，這台裝置的修改不會再同步到雲端（雲端資料不會被刪除）。確定嗎？')) return;
    Store.disconnect();
    $('syncDialog').close();
    toast('已中斷同步');
  });

  // 別台裝置改了資料 → 重新畫面
  Store.onChange(() => { Calendar.reload(); Places.reload(); });

  // ---------- 備份 ----------
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(Store.exportAll(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `ning-備份-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('備份檔已下載');
  });

  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm('匯入會用備份檔取代目前的資料，確定嗎？')) return;
      Store.importAll(data);
      toast('✅ 匯入完成');
    } catch (err) {
      toast('⚠️ 匯入失敗：' + err.message);
    } finally {
      e.target.value = '';
    }
  });

  Calendar.init();
  Places.init();
  const hashView = (location.hash || '').slice(1);
  Store.consumeShareLink().then((used) => {
    if (!used) Store.start();
  });
  const start = views[hashView] ? hashView : Store.prefs().view || 'calendar';
  show(views[start] ? start : 'calendar');
})();
