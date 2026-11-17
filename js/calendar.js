// 行事曆：瓜甯 / 阿瓜 兩人的上班、值班與行程
const Calendar = (() => {
  const PEOPLE = ['瓜甯', '阿瓜'];
  const TYPES = {
    work: { label: '上班', icon: '💼' },
    duty: { label: '值班', icon: '🌙' },
  };
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  // Store.state.calendar = { '瓜甯': { '2026-11-17': 'work' }, '阿瓜': { ... } }
  const cal = (p) => Store.state.calendar[p] || {};
  // Store.state.events = { '瓜甯': { '2026-11-17': [{ id, time, title }] } }
  const evs = (p, key) => (((Store.state.events || {})[p] || {})[key] || [])
    .slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  let openDayKey = null;

  const prefs = Store.prefs();
  let person = PEOPLE.includes(prefs.person) || prefs.person === 'both' ? prefs.person : PEOPLE[0];
  let tool = ['work', 'duty', 'event', 'clear'].includes(prefs.tool) ? prefs.tool : 'work';
  let cursor = new Date();
  cursor.setDate(1);

  const $ = (id) => document.getElementById(id);

  function ymd(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function savePrefs() { Store.setPrefs({ person, tool }); }

  function setDays(who, changes) { Store.apply({ t: 'cal', person: who, changes }); }

  function onDayTap(key) {
    if (person === 'both' || tool === 'event') { openDay(key); return; }
    const current = cal(person)[key];
    let next;
    if (tool === 'clear') next = null;
    else next = current === tool ? null : tool; // 再點一次同類型 = 取消
    if ((current || null) === next) return;
    setDays(person, { [key]: next });
    render();
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function badge(type, who) {
    if (!type) return '';
    const t = TYPES[type];
    const whoTag = who ? `<b>${who === '瓜甯' ? '甯' : '瓜'}</b>` : '';
    return `<span class="badge ${type}${who ? ' who-' + PEOPLE.indexOf(who) : ''}">${whoTag}${t.icon}<em>${t.label}</em></span>`;
  }

  function evHtml(key) {
    const who = person === 'both' ? PEOPLE : [person];
    const list = who.flatMap((p) => evs(p, key).map((e) => ({ ...e, p })));
    if (!list.length) return '';
    const shown = list.slice(0, 2).map((e) =>
      `<span class="ev${person === 'both' ? ' who-' + PEOPLE.indexOf(e.p) : ''}">${e.time ? e.time + ' ' : ''}${escapeHtml(e.title)}</span>`).join('');
    return shown + (list.length > 2 ? `<span class="ev-more">+${list.length - 2}</span>` : '');
  }

  // ---------- 某一天的行程視窗 ----------
  function openDay(key) {
    openDayKey = key;
    renderDay();
    $('dayDialog').showModal();
    if (person !== 'both') setTimeout(() => $('eventTitle').focus(), 50);
  }

  function renderDay() {
    const key = openDayKey;
    if (!key) return;
    const [y, m, d] = key.split('-').map(Number);
    const dow = WEEKDAYS[new Date(y, m - 1, d).getDay()];
    const both = person === 'both';
    $('dayTitle').textContent = `${m}/${d}（${dow}）${both ? '兩人的行程' : person + '的行程'}`;
    const who = both ? PEOPLE : [person];
    $('dayShift').innerHTML = who.map((p) => {
      const t = cal(p)[key];
      return `${both ? p + '：' : ''}${t ? TYPES[t].icon + ' ' + TYPES[t].label : '沒排班'}`;
    }).join('　');
    const list = who.flatMap((p) => evs(p, key).map((e) => ({ ...e, p })));
    $('dayEvents').innerHTML = list.length ? list.map((e) => `
      <div class="day-ev">
        ${both ? `<span class="w who-${PEOPLE.indexOf(e.p)}">${e.p === '瓜甯' ? '甯' : '瓜'}</span>` : ''}
        <span class="t">${e.time || '整天'}</span>
        <span class="n">${escapeHtml(e.title)}</span>
        ${both ? '' : `<button type="button" data-del="${e.id}" aria-label="刪除">✕</button>`}
      </div>`).join('') : '<p class="muted">這天還沒有行程</p>';
    $('eventForm').classList.toggle('hidden', both);
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
        badges = PEOPLE.map((p) => badge(cal(p)[key], p)).join('');
        if (PEOPLE.every((p) => !cal(p)[key])) cls += ' both-off';
      } else {
        const type = cal(person)[key];
        badges = badge(type);
        if (type) cls += ` is-${type}`;
      }
      if (key === todayKey) cls += ' today';
      if (dow === 0 || dow === 6) cls += ' weekend';
      html += `<button class="${cls}" data-key="${key}"><span class="num">${d}</span>${badges}${evHtml(key)}</button>`;
    }
    $('calendar').innerHTML = html;
    $('calendar').classList.toggle('both-mode', person === 'both');

    // 本月統計
    const prefix = `${y}-${String(m + 1).padStart(2, '0')}-`;
    const shown = person === 'both' ? PEOPLE : [person];
    $('monthStats').innerHTML = shown.map((p) => {
      const days = Object.entries(cal(p)).filter(([k]) => k.startsWith(prefix));
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
      ? '「甯」是瓜甯、「瓜」是阿瓜。兩人都沒排班的日子會用綠色標出來，方便約出去玩！點日期可以看當天兩人的行程。'
      : tool === 'event'
        ? '點日期就能新增或查看那天的行程。'
        : '選好上方的「一般上班 / 值班」，再點日期就能一鍵加上；再點一次同一天可取消。要寫行程請選「📝 行程」。';
    if ($('dayDialog').open) renderDay();
  }

  function init() {
    $('calendar').addEventListener('click', (e) => {
      const btn = e.target.closest('.day[data-key]');
      if (btn) onDayTap(btn.dataset.key);
    });
    $('eventForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = $('eventTitle').value.trim();
      if (!title || !openDayKey || person === 'both') return;
      const ev = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), time: $('eventTime').value || '', title };
      Store.apply({ t: 'ev.put', person, date: openDayKey, ev });
      $('eventTitle').value = '';
      $('eventTime').value = '';
      render();
      $('eventTitle').focus();
    });
    $('dayEvents').addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]');
      if (!b || person === 'both') return;
      Store.apply({ t: 'ev.del', person, date: openDayKey, id: b.dataset.del });
      render();
    });
    $('dayClose').addEventListener('click', () => $('dayDialog').close());
    $('dayDialog').addEventListener('close', () => { openDayKey = null; });
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
      const changes = {};
      for (let d = 1; d <= n; d++) {
        const date = new Date(y, m, d);
        const dow = date.getDay();
        const key = ymd(date);
        if (dow !== 0 && dow !== 6 && !cal(person)[key]) changes[key] = 'work';
      }
      const count = Object.keys(changes).length;
      if (count) setDays(person, changes);
      render();
      toast(`已幫${person}加上 ${count} 天上班（已排值班的日子不會被蓋掉）`);
    };
    $('clearMonth').onclick = () => {
      const prefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-`;
      if (!confirm(`確定要清空${person}這個月的所有班表嗎？`)) return;
      const changes = {};
      Object.keys(cal(person)).forEach((k) => { if (k.startsWith(prefix)) changes[k] = null; });
      if (Object.keys(changes).length) setDays(person, changes);
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

  function reload() { render(); }

  return { init, reload };
})();
