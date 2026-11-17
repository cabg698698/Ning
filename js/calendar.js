// 行事曆：瓜甯 / 阿瓜 兩人的上班與值班
const Calendar = (() => {
  const PEOPLE = ['瓜甯', '阿瓜'];
  const TYPES = {
    work: { label: '上班', icon: '💼' },
    duty: { label: '值班', icon: '🌙' },
  };
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  // data = { '瓜甯': { '2026-11-17': 'work' }, '阿瓜': { ... } }
  let data = Store.load('calendar', {});
  PEOPLE.forEach((p) => { if (!data[p]) data[p] = {}; });

  const prefs = Store.load('prefs', {});
  let person = PEOPLE.includes(prefs.person) || prefs.person === 'both' ? prefs.person : PEOPLE[0];
  let tool = ['work', 'duty', 'clear'].includes(prefs.tool) ? prefs.tool : 'work';
  let cursor = new Date();
  cursor.setDate(1);

  const $ = (id) => document.getElementById(id);

  function ymd(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function savePrefs() {
    const p = Store.load('prefs', {});
    p.person = person;
    p.tool = tool;
    Store.save('prefs', p);
  }

  function persist() { Store.save('calendar', data); }

  function setDay(who, key, type) {
    if (type === 'clear' || !type) delete data[who][key];
    else data[who][key] = type;
  }

  function onDayTap(key) {
    if (person === 'both') {
      toast('要編輯請先切到「瓜甯」或「阿瓜」');
      return;
    }
    const current = data[person][key];
    let next;
    if (tool === 'clear') next = 'clear';
    else next = current === tool ? 'clear' : tool; // 再點一次同類型 = 取消
    setDay(person, key, next);
    persist();
    render();
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function badge(type, who) {
    if (!type) return '';
    const t = TYPES[type];
    const whoTag = who ? `<b>${who === '瓜甯' ? '甯' : '瓜'}</b>` : '';
    return `<span class="badge ${type}${who ? ' who-' + PEOPLE.indexOf(who) : ''}">${whoTag}${t.icon}<em>${t.label}</em></span>`;
  }

  function render() {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    $('monthTitle').textContent = `${y} 年 ${m + 1} 月`;

    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayKey = ymd(new Date());

    let html = WEEKDAYS.map((w, i) => `<div class="wd${i === 0 || i === 6 ? ' weekend' : ''}">${w}</div>`).join('');
    for (let i = 0; i < first.getDay(); i++) html += '<div class="day empty"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m, d);
      const key = ymd(date);
      const dow = date.getDay();
      let badges = '';
      let cls = 'day';
      if (person === 'both') {
        badges = PEOPLE.map((p) => badge(data[p][key], p)).join('');
        if (PEOPLE.every((p) => !data[p][key])) cls += ' both-off';
      } else {
        const type = data[person][key];
        badges = badge(type);
        if (type) cls += ` is-${type}`;
      }
      if (key === todayKey) cls += ' today';
      if (dow === 0 || dow === 6) cls += ' weekend';
      html += `<button class="${cls}" data-key="${key}"><span class="num">${d}</span>${badges}</button>`;
    }
    $('calendar').innerHTML = html;
    $('calendar').classList.toggle('both-mode', person === 'both');

    // 本月統計
    const prefix = `${y}-${String(m + 1).padStart(2, '0')}-`;
    const shown = person === 'both' ? PEOPLE : [person];
    $('monthStats').innerHTML = shown.map((p) => {
      const days = Object.entries(data[p]).filter(([k]) => k.startsWith(prefix));
      const work = days.filter(([, t]) => t === 'work').length;
      const duty = days.filter(([, t]) => t === 'duty').length;
      return `<div class="stat"><strong>${p}</strong> 上班 <b>${work}</b> 天 ・ 值班 <b>${duty}</b> 天</div>`;
    }).join('');

    // 介面狀態
    document.querySelectorAll('#personSwitch button').forEach((b) =>
      b.classList.toggle('active', b.dataset.person === person));
    document.querySelectorAll('#toolBar .tool').forEach((b) =>
      b.classList.toggle('active', b.dataset.tool === tool));
    $('toolBar').classList.toggle('disabled', person === 'both');
    $('bulkActions').classList.toggle('hidden', person === 'both');
    $('calHint').textContent = person === 'both'
      ? '「甯」是瓜甯、「瓜」是阿瓜。兩人都沒排班的日子會用綠色標出來，方便約出去玩！'
      : '選好上方的「一般上班 / 值班」，再點日期就能一鍵加上；再點一次同一天可取消。';
  }

  function init() {
    $('calendar').addEventListener('click', (e) => {
      const btn = e.target.closest('.day[data-key]');
      if (btn) onDayTap(btn.dataset.key);
    });
    $('personSwitch').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      person = b.dataset.person;
      savePrefs();
      render();
    });
    $('toolBar').addEventListener('click', (e) => {
      const b = e.target.closest('.tool');
      if (!b) return;
      tool = b.dataset.tool;
      savePrefs();
      render();
    });
    $('prevMonth').onclick = () => { cursor.setMonth(cursor.getMonth() - 1); render(); };
    $('nextMonth').onclick = () => { cursor.setMonth(cursor.getMonth() + 1); render(); };
    $('goToday').onclick = () => { cursor = new Date(); cursor.setDate(1); render(); };

    $('fillWeekdays').onclick = () => {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const n = new Date(y, m + 1, 0).getDate();
      let count = 0;
      for (let d = 1; d <= n; d++) {
        const date = new Date(y, m, d);
        const dow = date.getDay();
        const key = ymd(date);
        if (dow !== 0 && dow !== 6 && !data[person][key]) { data[person][key] = 'work'; count++; }
      }
      persist();
      render();
      toast(`已幫${person}加上 ${count} 天上班（已排值班的日子不會被蓋掉）`);
    };
    $('clearMonth').onclick = () => {
      const prefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-`;
      if (!confirm(`確定要清空${person}這個月的所有班表嗎？`)) return;
      Object.keys(data[person]).forEach((k) => { if (k.startsWith(prefix)) delete data[person][k]; });
      persist();
      render();
    };

    // 左右滑動切換月份
    let startX = null;
    $('calendar').addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    $('calendar').addEventListener('touchend', (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      startX = null;
      if (Math.abs(dx) > 60) {
        cursor.setMonth(cursor.getMonth() + (dx < 0 ? 1 : -1));
        render();
      }
    });

    render();
  }

  function reload() {
    data = Store.load('calendar', {});
    PEOPLE.forEach((p) => { if (!data[p]) data[p] = {}; });
    render();
  }

  return { init, reload };
})();
