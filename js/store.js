// 資料儲存：全部存在瀏覽器 localStorage，關閉頁面也不會消失
const Store = (() => {
  const KEYS = {
    calendar: 'ning.calendar.v1',
    places: 'ning.places.v1',
    prefs: 'ning.prefs.v1',
  };

  function load(name, fallback) {
    try {
      const raw = localStorage.getItem(KEYS[name]);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('讀取失敗', name, e);
      return fallback;
    }
  }

  function save(name, value) {
    try {
      localStorage.setItem(KEYS[name], JSON.stringify(value));
    } catch (e) {
      console.warn('儲存失敗', name, e);
      toast('⚠️ 儲存失敗，請確認瀏覽器沒有開無痕模式');
    }
  }

  // 請瀏覽器把資料標成「持久保存」，降低被系統自動清掉的機會
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  function exportAll() {
    return {
      app: 'ning',
      version: 1,
      exportedAt: new Date().toISOString(),
      calendar: load('calendar', {}),
      places: load('places', []),
    };
  }

  function importAll(data) {
    if (!data || data.app !== 'ning') throw new Error('不是 Ning 的備份檔');
    if (data.calendar) save('calendar', data.calendar);
    if (Array.isArray(data.places)) save('places', data.places);
  }

  return { load, save, exportAll, importAll };
})();

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
