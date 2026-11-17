// 想去的地方：搜尋定位、縣市分組、地圖、自動分類、一鍵 Google 導航
const Places = (() => {
  const COUNTIES = [
    '基隆市', '臺北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣',
    '臺中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣',
    '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣',
    '澎湖縣', '金門縣', '連江縣',
  ];
  const UNKNOWN = '未分類';
  const CAT = {
    food: { label: '美食', icon: '🍜', color: '#ff6fae' },
    spot: { label: '景點', icon: '🏞️', color: '#b58cff' },
  };

  // ---------- 自動分類 ----------
  const OSM_FOOD = new Set([
    'restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream', 'biergarten',
    'bakery', 'confectionery', 'beverages', 'tea', 'coffee', 'deli', 'pastry', 'butcher', 'seafood',
  ]);
  const OSM_SPOT_CLASS = new Set(['tourism', 'leisure', 'historic', 'natural', 'waterway', 'mountain_pass']);
  const SPOT_STRONG = /(老街|公園|步道|古道|博物館|美術館|紀念館|樂園|遊樂園|動物園|水族館|寺|廟|宮|教堂|瀑布|溫泉|森林|燈塔|吊橋|濕地|國家公園|風景區|遊憩區|觀光工廠|牧場|農場|海灘|沙灘|海水浴場|觀景台|天空步道|秘境|古蹟|城堡|車站|碼頭|漁港|水庫|湖|山|島|部落|園區|文創|故居)/i;
  const FOOD_KW = /(餐廳|餐館|小吃|美食|麵|飯|粥|鍋|燒肉|燒烤|烤肉|串燒|居酒屋|酒吧|酒館|餐酒|咖啡|cafe|café|coffee|甜點|蛋糕|甜品|冰|豆花|早餐|早午餐|brunch|便當|牛排|壽司|拉麵|丼|料理|食堂|廚房|kitchen|bistro|茶|飲|奶|手搖|肉圓|蚵|滷|鹹酥雞|雞排|包子|餃|吐司|漢堡|披薩|pizza|pasta|麵包|烘焙|bakery|鬆餅|冰淇淋|熱炒|海產|牛肉|羊肉|鴨|鵝|雞|魷魚|蝦|臭豆腐|吃到飽|buffet|bbq|餅|粿|粽|湯|甜湯|夜市|食|鼎泰豐|春水堂|星巴克|starbucks|麥當勞|摩斯|肯德基|路易莎|50嵐|迷客夏|清心|五十嵐|鬍鬚張|八方雲集|爭鮮|藏壽司|壽司郎|海底撈|築間|瓦城|饗|胖老爹|丹丹|三商)/i;

  function classify(name, osm) {
    const n = name || '';
    const osmType = osm ? osm.type : null;
    const osmClass = osm ? (osm.category || osm.class) : null;
    const osmIsFood = OSM_FOOD.has(osmType) && osmClass !== 'tourism';
    const osmIsSpot = OSM_SPOT_CLASS.has(osmClass) ||
      ['attraction', 'viewpoint', 'museum', 'park', 'theme_park', 'zoo', 'place_of_worship'].includes(osmType);
    if (osmIsFood) return 'food';
    if (SPOT_STRONG.test(n) && !/(夜市)/.test(n)) {
      // 名稱裡同時有明顯的吃的字樣（例如「XX山 咖啡」），以吃的優先
      if (/(咖啡|餐廳|小吃|麵|火鍋|燒肉|食堂|cafe|coffee)/i.test(n)) return 'food';
      return 'spot';
    }
    if (FOOD_KW.test(n)) return 'food';
    if (osmIsSpot) return 'spot';
    return 'spot';
  }

  // ---------- 縣市判斷 ----------
  function norm(s) { return String(s || '').replace(/台/g, '臺'); }

  function countyFromText(text) {
    const t = norm(text);
    for (const c of COUNTIES) if (t.includes(c)) return c;
    // 簡稱：台中、高雄、新竹（優先判成市）…
    const short = [
      ['臺北', '臺北市'], ['新北', '新北市'], ['桃園', '桃園市'], ['臺中', '臺中市'], ['臺南', '臺南市'],
      ['高雄', '高雄市'], ['基隆', '基隆市'], ['新竹', '新竹市'], ['嘉義', '嘉義市'], ['苗栗', '苗栗縣'],
      ['彰化', '彰化縣'], ['南投', '南投縣'], ['雲林', '雲林縣'], ['屏東', '屏東縣'], ['宜蘭', '宜蘭縣'],
      ['花蓮', '花蓮縣'], ['臺東', '臺東縣'], ['澎湖', '澎湖縣'], ['金門', '金門縣'], ['馬祖', '連江縣'],
      ['連江', '連江縣'], ['九份', '新北市'], ['淡水', '新北市'], ['墾丁', '屏東縣'], ['日月潭', '南投縣'],
      ['阿里山', '嘉義縣'], ['太魯閣', '花蓮縣'], ['羅東', '宜蘭縣'], ['礁溪', '宜蘭縣'], ['西門', '臺北市'],
    ];
    for (const [k, v] of short) if (t.includes(k)) return v;
    return null;
  }

  function countyFromAddress(addr, displayName) {
    if (addr) {
      for (const f of ['city', 'county', 'state', 'state_district']) {
        const c = countyFromText(addr[f]);
        if (c && COUNTIES.includes(norm(addr[f]))) return c;
      }
      for (const v of Object.values(addr)) {
        const t = norm(v);
        const hit = COUNTIES.find((c) => t === c);
        if (hit) return hit;
      }
    }
    const t = norm(displayName);
    return COUNTIES.find((c) => t.includes(c)) || null;
  }

  function shortAddress(addr) {
    if (!addr) return '';
    const parts = [addr.city_district || addr.suburb || addr.town || addr.village || '', addr.road || ''];
    return norm(parts.filter(Boolean).join(' '));
  }

  // ---------- 資料 ----------
  const all = () => Store.state.places;
  let catFilter = 'all';
  let countyFilter = 'all';
  let showVisited = false;
  let map, layer;
  const markers = new Map();
  let editingId = null;

  const $ = (id) => document.getElementById(id);
  const put = (place) => Store.apply({ t: 'place.put', place: { ...place, updatedAt: Date.now() } });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function navUrl(p) {
    if (p.exact && p.lat != null) {
      return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
    }
    const dest = [p.name, p.county && p.county !== UNKNOWN ? p.county : '', p.address || '']
      .filter(Boolean).join(' ');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
  }

  // ---------- 搜尋 ----------
  async function nominatimSearch(q) {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1' +
      '&accept-language=zh-TW&countrycodes=tw&limit=6&q=' + encodeURIComponent(q);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('search failed');
    return res.json();
  }

  async function nominatimReverse(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=zh-TW&zoom=16&lat=${lat}&lon=${lng}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('reverse failed');
    return res.json();
  }

  function parseGoogleUrl(text) {
    if (!/google\.[^/]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/.test(text)) return null;
    if (/maps\.app\.goo\.gl|goo\.gl\/maps/.test(text)) return { short: true };
    let lat, lng, name;
    const precise = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    const at = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const q = text.match(/[?&](?:q|query|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    const m = precise || q || at;
    if (m) { lat = parseFloat(m[1]); lng = parseFloat(m[2]); }
    const pm = text.match(/\/place\/([^/@?]+)/);
    if (pm) name = decodeURIComponent(pm[1].replace(/\+/g, ' '));
    return { lat, lng, name };
  }

  let lastCandidates = [];

  async function onSearch(e) {
    e.preventDefault();
    const query = $('placeQuery').value.trim();
    const hint = $('placeHint').value.trim();
    if (!query) return;
    const box = $('searchResults');
    box.classList.remove('hidden');

    const g = parseGoogleUrl(query);
    if (g) {
      if (g.short) {
        box.innerHTML = '<p class="muted">Google 的短網址（maps.app.goo.gl）沒辦法直接讀取，請在 Google 地圖打開後複製瀏覽器上的完整網址，或直接輸入店名搜尋。</p>';
        return;
      }
      if (g.lat == null) {
        if (g.name) { $('placeQuery').value = g.name; return onSearch(e); }
        box.innerHTML = '<p class="muted">這個網址讀不到位置，請改輸入店名。</p>';
        return;
      }
      box.innerHTML = '<p class="muted">讀取位置中…</p>';
      let rev = null;
      try { rev = await nominatimReverse(g.lat, g.lng); } catch (_) { /* 沒關係 */ }
      const name = g.name || (rev && (rev.name || rev.display_name.split(',')[0])) || '未命名地點';
      lastCandidates = [{
        name, lat: g.lat, lng: g.lng, exact: true,
        county: (rev && countyFromAddress(rev.address, rev.display_name)) || countyFromText(name) || UNKNOWN,
        address: rev ? shortAddress(rev.address) : '',
        category: classify(name, rev && { type: rev.type, category: rev.category }),
        sub: rev ? norm(rev.display_name) : `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`,
      }];
      renderCandidates(query);
      return;
    }

    box.innerHTML = '<p class="muted">搜尋中…</p>';
    let results = [];
    try {
      results = await nominatimSearch(hint ? `${query} ${hint}` : query);
      if (!results.length && hint) results = await nominatimSearch(query);
    } catch (err) {
      console.warn(err);
    }
    lastCandidates = results.map((r) => {
      const name = r.name || r.display_name.split(',')[0];
      return {
        name: norm(name) === norm(query) ? query : name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        exact: false,
        county: countyFromAddress(r.address, r.display_name) || countyFromText(`${query} ${hint}`) || UNKNOWN,
        address: shortAddress(r.address),
        category: classify(`${name} ${query}`, { type: r.type, category: r.category }),
        sub: norm(r.display_name),
      };
    });
    renderCandidates(query, hint);
  }

  function renderCandidates(query, hint = '') {
    const box = $('searchResults');
    const manualCounty = countyFromText(`${query} ${hint}`) || UNKNOWN;
    const manualCat = classify(query);
    let html = '';
    if (lastCandidates.length) {
      html += '<p class="muted">選一個正確的位置加入：</p>';
      html += lastCandidates.map((c, i) => `
        <button class="cand" data-i="${i}">
          <span class="cand-name">${CAT[c.category].icon} ${escapeHtml(c.name)}</span>
          <span class="cand-meta">${escapeHtml(c.county)}・${CAT[c.category].label}</span>
          <span class="cand-sub">${escapeHtml(c.sub)}</span>
        </button>`).join('');
    } else {
      html += '<p class="muted">地圖資料庫找不到這個地點（小店常常查不到），沒關係，可以直接加入，導航時會交給 Google 地圖找。</p>';
    }
    html += `
      <button class="cand manual" data-i="manual">
        <span class="cand-name">➕ 直接加入「${escapeHtml(query)}」</span>
        <span class="cand-meta">${escapeHtml(manualCounty)}・${CAT[manualCat].label}（之後可以修改）</span>
      </button>
      <button class="link-btn" id="closeResults">取消</button>`;
    box.innerHTML = html;
    box.dataset.query = query;
    box.dataset.hint = hint;
  }

  function onCandidateClick(e) {
    if (e.target.id === 'closeResults') { closeResults(); return; }
    const btn = e.target.closest('.cand');
    if (!btn) return;
    const box = $('searchResults');
    let p;
    if (btn.dataset.i === 'manual') {
      const q = box.dataset.query;
      const hint = box.dataset.hint || '';
      p = {
        name: q, lat: null, lng: null, exact: false,
        county: countyFromText(`${q} ${hint}`) || UNKNOWN,
        address: hint, category: classify(q),
      };
    } else {
      p = { ...lastCandidates[+btn.dataset.i] };
      delete p.sub;
    }
    const dup = all().find((x) => x.name === p.name && !x.visited);
    if (dup && !confirm(`「${p.name}」已經在清單裡了，還要再加一次嗎？`)) return;
    const place = { id: uid(), ...p, note: '', visited: false, createdAt: Date.now() };
    put(place);
    closeResults();
    $('placeQuery').value = '';
    $('placeHint').value = '';
    // 讓新加入的地點一定看得到
    if (catFilter !== 'all' && catFilter !== place.category) catFilter = 'all';
    if (countyFilter !== 'all' && countyFilter !== place.county) countyFilter = 'all';
    render();
    focusPlace(place.id);
    toast(`已加入 ${CAT[place.category].icon} ${place.name}（${place.county}）`);
  }

  function closeResults() {
    $('searchResults').classList.add('hidden');
    $('searchResults').innerHTML = '';
  }

  // ---------- 地圖 ----------
  function initMap() {
    if (map || typeof L === 'undefined') return;
    map = L.map('map', { zoomControl: true, attributionControl: true }).setView([23.7, 120.95], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }

  function popupHtml(p) {
    return `<div class="pop">
      <strong>${CAT[p.category].icon} ${escapeHtml(p.name)}</strong>
      <div class="pop-meta">${escapeHtml(p.county)}${p.address ? '・' + escapeHtml(p.address) : ''}</div>
      ${p.note ? `<div class="pop-note">${escapeHtml(p.note)}</div>` : ''}
      <a class="nav-btn" href="${navUrl(p)}" target="_blank" rel="noopener">🧭 Google 導航</a>
    </div>`;
  }

  function renderMap(list) {
    if (!map) return;
    layer.clearLayers();
    markers.clear();
    const pts = [];
    list.forEach((p) => {
      if (p.lat == null) return;
      const mk = L.circleMarker([p.lat, p.lng], {
        radius: 9, weight: 2, color: '#fff', fillColor: CAT[p.category].color,
        fillOpacity: p.visited ? 0.45 : 0.95,
      }).bindPopup(popupHtml(p));
      mk.addTo(layer);
      markers.set(p.id, mk);
      pts.push([p.lat, p.lng]);
    });
    if (pts.length === 1) map.setView(pts[0], 14);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
    else map.setView([23.7, 120.95], 7);
  }

  function focusPlace(id) {
    const p = all().find((x) => x.id === id);
    const mk = markers.get(id);
    if (!p || !mk || !map) return;
    map.setView([p.lat, p.lng], Math.max(map.getZoom(), 14));
    mk.openPopup();
    $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------- 清單 ----------
  function filtered() {
    return all().filter((p) =>
      (showVisited || !p.visited) &&
      (catFilter === 'all' || p.category === catFilter) &&
      (countyFilter === 'all' || p.county === countyFilter));
  }

  function renderCountyOptions() {
    const base = all().filter((p) => (showVisited || !p.visited) && (catFilter === 'all' || p.category === catFilter));
    const counts = {};
    base.forEach((p) => { counts[p.county] = (counts[p.county] || 0) + 1; });
    const order = [...COUNTIES, UNKNOWN].filter((c) => counts[c]);
    if (countyFilter !== 'all' && !counts[countyFilter]) countyFilter = 'all';
    $('countyFilter').innerHTML = `<option value="all">全部縣市（${base.length}）</option>` +
      order.map((c) => `<option value="${c}"${c === countyFilter ? ' selected' : ''}>${c}（${counts[c]}）</option>`).join('');
  }

  function render() {
    renderCountyOptions();
    document.querySelectorAll('#catFilter button').forEach((b) => b.classList.toggle('active', b.dataset.cat === catFilter));
    $('showVisited').checked = showVisited;

    const list = filtered();
    renderMap(list);

    if (!all().length) {
      $('placeList').innerHTML = '<div class="empty-state">還沒有想去的地方 🌱<br>在上面輸入店名或景點，按「搜尋」就能加入！</div>';
      return;
    }
    if (!list.length) {
      $('placeList').innerHTML = '<div class="empty-state">這個條件下沒有地點喔</div>';
      return;
    }
    const groups = {};
    list.forEach((p) => { (groups[p.county] = groups[p.county] || []).push(p); });
    const order = [...COUNTIES, UNKNOWN].filter((c) => groups[c]);
    $('placeList').innerHTML = order.map((c) => {
      const items = groups[c];
      const food = items.filter((p) => p.category === 'food').length;
      const spot = items.length - food;
      return `<div class="county-group">
        <h3>${c}<small>🍜 ${food}・🏞️ ${spot}</small></h3>
        ${items.map(itemHtml).join('')}
      </div>`;
    }).join('');
  }

  function itemHtml(p) {
    return `<div class="place${p.visited ? ' visited' : ''}" data-id="${p.id}">
      <button class="cat-chip ${p.category}" data-act="toggleCat" title="點一下切換分類">${CAT[p.category].icon} ${CAT[p.category].label}</button>
      <div class="place-main" data-act="focus">
        <div class="place-name">${escapeHtml(p.name)}${p.lat == null ? ' <span class="nopin" title="沒有地圖座標">📍?</span>' : ''}</div>
        ${p.note || p.address ? `<div class="place-sub">${escapeHtml(p.note || p.address)}</div>` : ''}
      </div>
      <div class="place-actions">
        <a class="nav-btn small" href="${navUrl(p)}" target="_blank" rel="noopener" aria-label="Google 導航">🧭 導航</a>
        <button class="icon-btn" data-act="visited" title="${p.visited ? '改回想去' : '標記去過了'}">${p.visited ? '↩️' : '✅'}</button>
        <button class="icon-btn" data-act="edit" title="編輯">✏️</button>
      </div>
    </div>`;
  }

  function onListClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const id = el.closest('.place').dataset.id;
    const found = all().find((x) => x.id === id);
    if (!found) return;
    const p = { ...found };
    switch (el.dataset.act) {
      case 'focus':
        if (p.lat == null) toast('這個地點沒有座標，按「導航」交給 Google 找');
        else focusPlace(id);
        break;
      case 'toggleCat':
        p.category = p.category === 'food' ? 'spot' : 'food';
        put(p); render();
        break;
      case 'visited':
        p.visited = !p.visited;
        p.visitedAt = p.visited ? Date.now() : null;
        put(p); render();
        toast(p.visited ? `🎉 ${p.name} 打卡完成！` : `${p.name} 改回想去`);
        break;
      case 'edit':
        openEdit(p);
        break;
    }
  }

  // ---------- 編輯 ----------
  function openEdit(p) {
    editingId = p.id;
    $('editName').value = p.name;
    $('editCat').value = p.category;
    $('editCounty').innerHTML = [...COUNTIES, UNKNOWN]
      .map((c) => `<option${c === p.county ? ' selected' : ''}>${c}</option>`).join('');
    $('editNote').value = p.note || '';
    $('placeDialog').showModal();
  }

  function onEditClose() {
    const action = $('placeDialog').returnValue;
    const found = all().find((x) => x.id === editingId);
    if (!found) return;
    const p = { ...found };
    if (action === 'save') {
      p.name = $('editName').value.trim() || p.name;
      p.category = $('editCat').value;
      p.county = $('editCounty').value;
      p.note = $('editNote').value.trim();
      put(p); render();
    } else if (action === 'delete') {
      if (confirm(`確定刪除「${p.name}」？`)) {
        Store.apply({ t: 'place.del', id: p.id });
        render();
      }
    }
    editingId = null;
  }

  function init() {
    $('addPlaceForm').addEventListener('submit', onSearch);
    $('searchResults').addEventListener('click', onCandidateClick);
    $('placeList').addEventListener('click', onListClick);
    $('catFilter').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      catFilter = b.dataset.cat;
      render();
    });
    $('countyFilter').addEventListener('change', (e) => { countyFilter = e.target.value; render(); });
    $('showVisited').addEventListener('change', (e) => { showVisited = e.target.checked; render(); });
    $('placeDialog').addEventListener('close', onEditClose);
  }

  function onShow() {
    initMap();
    render();
    setTimeout(() => map && map.invalidateSize(), 50);
  }

  function reload() {
    if (document.getElementById('view-places').classList.contains('active')) render();
  }

  return { init, onShow, reload, classify, countyFromText, countyFromAddress, parseGoogleUrl };
})();
