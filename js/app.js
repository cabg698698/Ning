// 頁籤切換、備份匯出入
(() => {
  const views = { calendar: 'view-calendar', places: 'view-places' };

  function show(view) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    Object.entries(views).forEach(([k, id]) => document.getElementById(id).classList.toggle('active', k === view));
    if (view === 'places') Places.onShow();
    const prefs = Store.load('prefs', {});
    prefs.view = view;
    Store.save('prefs', prefs);
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
  }

  document.querySelector('.tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (t) show(t.dataset.view);
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(Store.exportAll(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `ning-備份-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('備份檔已下載');
  });

  document.getElementById('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm('匯入會用備份檔取代目前的資料，確定嗎？')) return;
      Store.importAll(data);
      Calendar.reload();
      Places.reload();
      toast('✅ 匯入完成');
    } catch (err) {
      toast('⚠️ 匯入失敗：' + err.message);
    } finally {
      e.target.value = '';
    }
  });

  Calendar.init();
  Places.init();
  const start = (location.hash || '').slice(1) || Store.load('prefs', {}).view || 'calendar';
  show(views[start] ? start : 'calendar');
})();
