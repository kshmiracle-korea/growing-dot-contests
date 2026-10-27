(() => {
  'use strict';
  const config = window.CONTEST_CONFIG || {};
  const grid = document.querySelector('#contests');
  const archiveGrid = document.querySelector('#closed-contests');
  const archivePanel = document.querySelector('#archive-panel');
  const archiveButton = document.querySelector('#archive-toggle');
  let closedCount = 0;
  const notice = document.querySelector('#notice');
  const label = document.querySelector('#sync-label');
  const refreshButton = document.querySelector('#refresh');
  let items = [], hasData = false, busy = false, sequence = 0, live = false;
  const DAY = 86400000;
  // These official DAKER hero images contain only a background. Their official
  // title and subtitle are separate DOM text and must accompany the thumbnail.
  // Match the verified background as well as the contest, so a new full poster
  // supplied in the sheet will not receive duplicate text.
  const bannerCopy = {
    'https://daker.ai/public/hackathons/ai-platform-build-challenge-prelims': ['cf0d3304597317f423a6ea99', '여러분만의 AI 기반 서비스 ·플랫폼 구현에 도전해 보세요 !'],
    'https://daker.ai/public/hackathons/synthetic-microstructure-property-prediction-ai': ['b35bfff33ac276c2819815af', '2D 합성 미세구조 이미지로부터 재료 경도(대용값)를 예측하는 AI 모델 개발'],
    'https://daker.ai/public/hackathons/kic-ai-agent-competition': ['5adec4b128ed5defd59c4a07', '투자 및 금융 업무의 혁신을 이끌 AI Agent를 기획하고, 실제 작동하는 MVP로 구현해보세요.']
  };
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function dateNumber(value) {
    const m = String(value || '').trim().match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})\.?$/);
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2]-1 && d.getUTCDate() === +m[3] ? d.getTime() : null;
  }
  function safeUrl(value, image = false) {
    try {
      if (image && /^\.\/(?:contest-\d+\.(png|jpg|webp)|posters\/[a-f0-9]{24}\.jpg)$/.test(String(value))) return new URL(value, location.href).href;
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
  function pendingPoster() {
    return make('div', 'fallback', '공식 포스터 확인 중');
  }
  function contestState(item, now) {
    const day = dateNumber(item.deadline), start = dateNumber(item.startDate);
    const left = day === null ? null : Math.round((day - now) / DAY);
    // Calendar dates in Korea take precedence over stale status/D-day cells.
    const closed = day !== null ? day < now : /마감|종료/.test(item.status);
    const upcoming = !closed && (start !== null ? start > now : /예정/.test(item.status));
    const status = closed ? '마감' : upcoming ? '접수 예정' : day !== null || /접수\s*중/.test(item.status) ? '접수 중' : '일정 확인';
    return {day, left, closed, status, rank: closed ? 3 : upcoming ? 1 : status === '접수 중' ? 0 : 2};
  }
  function updateArchiveButton() {
    archiveButton.textContent = `마감 공모전 ${archivePanel.hidden ? '보기' : '숨기기'} (${closedCount})`;
    archiveButton.setAttribute('aria-expanded', String(!archivePanel.hidden));
  }
  function render() {
    const now = dateNumber(today());
    const ordered = items.map((item, index) => ({item, index, ...contestState(item, now)})).sort((a,b) =>
      a.rank - b.rank || (a.closed ? (b.day ?? -Infinity) - (a.day ?? -Infinity) : (a.day ?? Infinity) - (b.day ?? Infinity)) || a.index - b.index
    );
    const fragment = document.createDocumentFragment();
    const closedFragment = document.createDocumentFragment();
    closedCount = 0;
    for (const {item, index, day, left, closed, status} of ordered) {
      const url = safeUrl(item.url), image = safeUrl(item.image, true);
      const badge = closed ? '마감' : left === null ? '일정 확인' : left === 0 ? 'D-DAY' : `D-${left}`;
      const badgeClass = closed ? 'closed' : left === null ? 'unknown' : left <= 7 ? 'urgent' : '';
      const card = make('article','card');
      const poster = make('div','poster');
      const placeholder = pendingPoster();
      poster.append(placeholder);
      if (image) {
        const banner = bannerCopy[item.url];
        const knownBackground = banner && (new URL(image).pathname.endsWith(`/posters/${banner[0]}.jpg`) || image === safeUrl((window.CONTEST_POSTERS || {})[item.url], true));
        let copy;
        if (knownBackground) {
          poster.className += ' poster-banner';
          copy = make('div', 'banner-copy');
          copy.append(make('strong', 'banner-title', item.title), make('span', 'banner-subtitle', banner[1]));
          copy.hidden = true;
          poster.append(copy);
        }
        const img = make('img', 'official-poster'); img.alt = `${item.title} 공고 이미지`; img.loading = !closed && fragment.childNodes.length < 4 ? 'eager' : 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
        img.style.opacity = '0';
        img.onload = () => { placeholder.hidden = true; img.style.opacity = '1'; if (copy) copy.hidden = false; };
        img.onerror = () => { img.remove(); placeholder.hidden = false; if (copy) copy.hidden = true; };
        img.src = image; poster.append(img);
      }
      poster.append(make('span',`badge ${badgeClass}`,badge));
      const posterWrap = url ? link(url,'poster-link') : make('div');
      if (url) posterWrap.setAttribute('aria-label', `${item.title} 공식 공고 (새 탭)`);
      posterWrap.append(poster); card.append(posterWrap);
      const heading = make('h3');
      heading.append(url ? link(url,'title-link', item.title) : document.createTextNode(item.title)); card.append(heading);
      const meta = make('div','card-meta');
      const details = make('dl', 'contest-details');
      const fields = [
        ['상태', status], ['마감일', item.deadline || '공고에서 확인'],
        ['분야/주제', item.topic || '공고에서 확인'], ['참가 대상', item.eligibility || '공고에서 확인'],
        ['주최/주관', item.organizer || '공고에서 확인'], ['접수 시작일', item.startDate || '공고에서 확인']
      ];
      for (const [name, value] of fields) {
        const row = make('div', 'detail-row');
        row.append(make('dt', '', name), make('dd', name === '상태' ? 'contest-status' : '', value));
        details.append(row);
      }
      const official = url ? link(url,'official','상세보기 ↗') : make('span','unavailable','링크 준비 중');
      if (url) official.setAttribute('aria-label',`${item.title} 상세보기 · 공식 공고 (새 탭)`);
      meta.append(details, official); card.append(meta);
      if (closed) { closedFragment.append(card); closedCount++; }
      else fragment.append(card);
    }
    grid.replaceChildren(fragment);
    archiveGrid.replaceChildren(closedFragment);
    document.querySelector('#count').textContent = String(items.length - closedCount);
    document.querySelector('#empty').hidden = items.length !== closedCount;
    document.querySelector('#archive-empty').hidden = closedCount !== 0;
    updateArchiveButton();
    grid.setAttribute('aria-busy','false');
  }
  function showNotice(message, error = false) {
    notice.textContent = message; notice.hidden = !message; notice.classList.toggle('error',error);
  }
  function accept(data) {
    if (!data || data.ok !== true || !Array.isArray(data.items)) throw new Error('Invalid feed');
    items = data.items.filter(x => x && typeof x.title === 'string' && x.title.trim()).map(x => ({
      title:x.title.trim(), deadline:String(x.deadline || ''), organizer:String(x.organizer || ''), topic:String(x.topic || ''), eligibility:String(x.eligibility || ''), status:String(x.status || ''), startDate:String(x.startDate || ''), image:String(x.image || ''), url:String(x.url || '')
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
  function snapshotDate() {
    const day = dateNumber(window.CONTEST_SNAPSHOT?.updatedAt);
    return day === null ? '확인일 미상' : new Date(day).toISOString().slice(0,10).replaceAll('-', '. ');
  }
  async function refresh() {
    if (busy) return;
    if (!config.apiUrl) {
      if (window.CONTEST_SNAPSHOT) accept(window.CONTEST_SNAPSHOT);
      else { items = []; render(); }
      label.textContent = `최신 스냅샷 · ${snapshotDate()}`;
      showNotice(`${snapshotDate()}에 원본 시트에서 확인한 목록입니다. 마감 상태와 D-day는 한국 시간 기준으로 자동 갱신됩니다. 새 공모전과 내용 변경은 다음 데이터 갱신 때 반영됩니다.`);
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
      label.textContent = live ? '업데이트 지연 · 이전 목록 표시' : `저장된 스냅샷 · ${snapshotDate()}`;
      showNotice(live ? '최신 목록을 불러오지 못했습니다. 마지막으로 확인한 목록을 표시합니다. 잠시 후 다시 시도해 주세요.' : '실시간 목록을 불러오지 못했습니다. 저장된 스냅샷 목록이 있으면 대신 표시합니다. 연결 주소와 웹 앱 공개 설정을 확인해 주세요.',true);
    } finally { busy = false; refreshButton.disabled = false; grid.setAttribute('aria-busy','false'); }
  }
  archiveButton.addEventListener('click', () => {
    archivePanel.hidden = !archivePanel.hidden;
    updateArchiveButton();
  });
  refreshButton.addEventListener('click',refresh);
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, Math.max(60000, Number(config.refreshMs) || 300000));
  let previousDay = today();
  setInterval(() => { const day = today(); if (day !== previousDay) {previousDay = day; render();} },30000);
  document.addEventListener('visibilitychange',() => {if (!document.hidden) refresh();});
})();
