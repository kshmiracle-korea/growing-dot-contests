(() => {
  'use strict';
  const config = window.CONTEST_CONFIG || {};
  const grid = document.querySelector('#contests');
  const notice = document.querySelector('#notice');
  const label = document.querySelector('#sync-label');
  const refreshButton = document.querySelector('#refresh');
  let items = [], hasData = false, busy = false, sequence = 0, live = false;
  const DAY = 86400000;
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function dateNumber(value) {
    const m = String(value || '').trim().match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})\.?$/);
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2]-1 && d.getUTCDate() === +m[3] ? d.getTime() : null;
  }
  function safeUrl(value, image = false) {
    try {
      if (image && /^\.\/contest-\d+\.(png|jpg|webp)$/.test(String(value))) return new URL(value, location.href).href;
      const u = new URL(String(value || ''));
      return (u.protocol === 'https:' || (!image && u.protocol === 'http:')) && !u.username && !u.password ? u.href : '';
    } catch { return ''; }
  }
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function link(href, cls, text) {
    const el = make('a', cls, text);
    el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer';
    return el;
  }
  function fallback(item, index) {
    const palettes = [['#075c47','#ffffff','#a8db72'],['#def0e5','#153b2e','#087251'],['#202526','#ffffff','#acd97e'],['#e9efce','#253b26','#477835']];
    const [bg,ink,accent] = palettes[index % palettes.length];
    const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
    const title = item.title.replace(/^2026(?:년)?\s*/, '');
    const lines = []; let line = '', width = 0;
    for (const char of title) {
      const size = /[\u0000-\u007f]/.test(char) ? .55 : 1;
      if (width + size > 12 && line) {lines.push(line.trim()); line = ''; width = 0;}
      line += char; width += size;
    }
    if (line.trim()) lines.push(line.trim());
    const visible = lines.slice(0,5);
    if (lines.length > 5) visible[4] = visible[4].slice(0,-1) + '…';
    const text = visible.map((part,i) => `<tspan x="40" y="${162+i*46}">${escape(part)}</tspan>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="${bg}"/><g fill="${accent}"><circle cx="44" cy="42" r="5"/><circle cx="62" cy="42" r="7"/><circle cx="44" cy="60" r="7"/><circle cx="64" cy="62" r="9"/></g><text x="40" y="104" fill="${accent}" font-family="Arial,sans-serif" font-size="16" letter-spacing="2">2026 / AI CONTEST</text><text fill="${ink}" font-family="Malgun Gothic,Apple SD Gothic Neo,sans-serif" font-size="34" font-weight="700">${text}</text><path d="M40 410H472" stroke="${ink}" opacity=".25"/><text x="40" y="445" fill="${ink}" font-family="Arial,sans-serif" font-size="17" letter-spacing="2">GROWING DOT</text><text x="40" y="477" fill="${ink}" font-family="Malgun Gothic,sans-serif" font-size="17" opacity=".8">그로잉 닷 요약 · 공식 포스터 아님</text><circle cx="459" cy="449" r="12" fill="${accent}"/></svg>`;
    const el = make('div', 'fallback editorial-cover');
    const img = make('img');
    img.alt = `${item.title} — 그로잉 닷 제작 요약 썸네일`;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    el.append(img);
    return el;
  }
  function render() {
    const now = dateNumber(today());
    const ordered = items.map((item, index) => ({item, index, day:dateNumber(item.deadline)})).sort((a,b) => {
      const rank = x => x.day === null ? 1 : x.day < now ? 2 : 0;
      return rank(a)-rank(b) || (a.day ?? Infinity)-(b.day ?? Infinity) || a.index-b.index;
    });
    const fragment = document.createDocumentFragment();
    for (const [coverIndex, {item, day}] of ordered.entries()) {
      const url = safeUrl(item.url), image = safeUrl(item.image || (window.CONTEST_POSTERS || {})[item.url], true);
      const left = day === null ? null : Math.round((day-now)/DAY);
      const badge = left === null ? '일정 확인' : left < 0 ? '마감' : left === 0 ? 'D-DAY' : `D-${left}`;
      const badgeClass = left === null ? 'unknown' : left < 0 ? 'closed' : left <= 7 ? 'urgent' : '';
      const card = make('article','card');
      const poster = make('div','poster');
      const placeholder = fallback(item, coverIndex);
      poster.append(placeholder);
      if (image) {
        const img = make('img', 'official-poster'); img.alt = `${item.title} 공고 이미지`; img.loading = coverIndex < 4 ? 'eager' : 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
        img.style.opacity = '0';
        img.onload = () => { placeholder.hidden = true; img.style.opacity = '1'; };
        img.onerror = () => { img.remove(); placeholder.hidden = false; };
        img.src = image; poster.append(img);
      }
      poster.append(make('span',`badge ${badgeClass}`,badge));
      const posterWrap = url ? link(url,'poster-link') : make('div');
      if (url) posterWrap.setAttribute('aria-label', `${item.title} 공식 공고 (새 탭)`);
      posterWrap.append(poster); card.append(posterWrap);
      const heading = make('h3');
      heading.append(url ? link(url,'title-link', item.title) : document.createTextNode(item.title)); card.append(heading);
      const meta = make('div','card-meta');
      const organizer = make('dl','organizer'); organizer.append(make('dt','','주최'),make('dd','',item.organizer || '공고에서 확인'));
      meta.append(organizer, make('p','deadline',day === null ? '마감일은 공식 공고에서 확인하세요.' : `마감 ${new Date(day).toISOString().slice(0,10).replaceAll('-','. ')}`));
      const official = url ? link(url,'official','공식 공고 보기') : make('span','unavailable','링크 준비 중');
      if (url) official.setAttribute('aria-label',`${item.title} 공식 공고 보기 (새 탭)`);
      meta.append(official); card.append(meta); fragment.append(card);
    }
    grid.replaceChildren(fragment);
    document.querySelector('#count').textContent = String(items.length);
    document.querySelector('#empty').hidden = items.length !== 0;
    grid.setAttribute('aria-busy','false');
  }
  function showNotice(message, error = false) {
    notice.textContent = message; notice.hidden = !message; notice.classList.toggle('error',error);
  }
  function accept(data) {
    if (!data || data.ok !== true || !Array.isArray(data.items)) throw new Error('Invalid feed');
    items = data.items.filter(x => x && typeof x.title === 'string' && x.title.trim()).map(x => ({
      title:x.title.trim(), deadline:String(x.deadline || ''), organizer:String(x.organizer || ''), image:String(x.image || ''), url:String(x.url || '')
    }));
    hasData = true; render();
  }
  function loadFeed() {
    const u = new URL(config.apiUrl);
    if (u.protocol !== 'https:' || u.hostname !== 'script.google.com' || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)) {
      return Promise.reject(new Error('Invalid Apps Script URL'));
    }
    return new Promise((resolve,reject) => {
      const name = `__aiContestFeed_${Date.now()}_${++sequence}`;
      const script = document.createElement('script');
      const cleanup = () => { clearTimeout(timer); script.remove(); delete window[name]; };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Timeout')); }, 20000);
      window[name] = data => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('Network failure')); };
      u.search = ''; u.searchParams.set('callback',name); u.searchParams.set('_',String(Date.now()));
      script.src = u.href; document.head.append(script);
    });
  }
  async function refresh() {
    if (busy) return;
    if (!config.apiUrl) {
      if (window.CONTEST_SNAPSHOT) accept(window.CONTEST_SNAPSHOT);
      else { items = []; render(); }
      label.textContent = '저장된 목록 · 2026. 10. 06.';
      showNotice('미리보기입니다. 2026년 10월 6일에 확인한 목록이며, 자동 업데이트 연결 전입니다.');
      return;
    }
    busy = true; refreshButton.disabled = true; label.textContent = '업데이트 확인 중…';
    try {
      accept(await loadFeed()); live = true;
      label.textContent = `최근 확인 ${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())} · 5분마다 갱신`;
      showNotice('');
    } catch {
      if (!hasData && window.CONTEST_SNAPSHOT) accept(window.CONTEST_SNAPSHOT);
      if (!hasData) render();
      label.textContent = live ? '업데이트 지연 · 이전 목록 표시' : '실시간 연결 안 됨';
      showNotice(live ? '최신 목록을 불러오지 못했습니다. 마지막으로 확인한 목록을 표시합니다. 잠시 후 다시 시도해 주세요.' : '실시간 목록을 불러오지 못했습니다. 저장된 미리보기 목록이 있으면 대신 표시합니다. 연결 주소와 웹 앱 공개 설정을 확인해 주세요.',true);
    } finally { busy = false; refreshButton.disabled = false; grid.setAttribute('aria-busy','false'); }
  }
  refreshButton.addEventListener('click',refresh);
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, Math.max(60000, Number(config.refreshMs) || 300000));
  let previousDay = today();
  setInterval(() => { const day = today(); if (day !== previousDay) {previousDay = day; render();} },30000);
  document.addEventListener('visibilitychange',() => {if (!document.hidden) refresh();});
})();
