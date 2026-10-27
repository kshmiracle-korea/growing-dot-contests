const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../growing-dot-upload');
const code = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const snapshotCode = fs.readFileSync(path.join(__dirname, 'fixtures/snapshot.js'), 'utf8');

class Element {
  constructor(tag) {this.tag = tag; this.children = []; this.hidden = false; this.attributes = {}; this.style = {}; this.events = {}; this.className = ''; this.classList = {toggle() {}};}
  set textContent(value) {this.text = String(value); this.children = [];}
  get textContent() {return (this.text || '') + this.children.map(x => x.textContent).join('');}
  get childNodes() {return this.children;}
  append(...nodes) {for (const node of nodes) {if (node.tag === '#fragment') this.append(...node.children); else {node.parent = this; this.children.push(node);}}}
  replaceChildren(...nodes) {this.children = []; this.append(...nodes);}
  setAttribute(name, value) {this.attributes[name] = value;}
  addEventListener(name, fn) {this.events[name] = fn;}
  remove() {this.parent.children = this.parent.children.filter(x => x !== this);}
}
function setup(time = '2026-10-11T03:00:00Z', data) {
  let now = new Date(time).getTime();
  const nodes = Object.fromEntries(['contests','closed-contests','archive-panel','archive-toggle','notice','sync-label','refresh','count','empty','archive-empty'].map(id => [id, new Element('div')]));
  nodes['archive-panel'].hidden = true;
  const document = {querySelector: key => nodes[key.slice(1)], createElement: tag => new Element(tag), createDocumentFragment: () => new Element('#fragment'), createTextNode: text => {const e = new Element('#text'); e.textContent = text; return e;}, addEventListener() {}, hidden: false};
  const timers = [];
  const window = {CONTEST_CONFIG: {apiUrl: ''}};
  class Clock extends Date {constructor(...args) {super(...(args.length ? args : [now]));} static now() {return now;}}
  const context = vm.createContext({window, document, Date: Clock, Intl, URL, location: {href: 'https://example.org/index.html'}, setInterval: (fn, ms) => timers.push({fn, ms}), setTimeout, clearTimeout});
  vm.runInContext(snapshotCode, context);
  if (data) window.CONTEST_SNAPSHOT = data;
  vm.runInContext(fs.readFileSync(path.join(root, 'poster-map.js'), 'utf8'), context);
  vm.runInContext(code, context);
  return {nodes, window, nextDay(time) {now = new Date(time).getTime(); timers.find(t => t.ms === 30000).fn();}};
}
function all(el) {return [el, ...el.children.flatMap(all)];}
function titles(el) {return el.children.map(card => card.children.find(x => x.tag === 'h3').textContent);}
test('37 rows retained; 34 current, 3 archived, and D-DAY today', () => {
  const {nodes, window} = setup();
  assert.equal(window.CONTEST_SNAPSHOT.items.length, 37);
  assert.equal(nodes.contests.children.length, 34);
  assert.equal(nodes['closed-contests'].children.length, 3);
  assert.equal(nodes['archive-panel'].hidden, true);
  assert.equal(nodes.count.textContent, '34');
  assert.match(titles(nodes.contests)[0], /4.16/);
  assert.match(nodes.contests.children[0].textContent, /D-DAY/);
  for (const field of ['상태','마감일','분야/주제','참가 대상','주최/주관','접수 시작일','상세보기']) assert.ok(nodes.contests.children[0].textContent.includes(field));
  assert.match(nodes['sync-label'].textContent, /2026. 10. 12/);
  nodes['archive-toggle'].events.click();
  assert.equal(nodes['archive-panel'].hidden, false);
  assert.equal(nodes['archive-toggle'].attributes['aria-expanded'], 'true');
  nodes['archive-toggle'].events.click();
  assert.equal(nodes['archive-panel'].hidden, true);
});
test('Korean midnight moves D-DAY to archive in an already open page', () => {
  const page = setup('2026-10-11T14:59:59Z');
  assert.equal(page.nodes.contests.children.length, 34);
  page.nextDay('2026-10-11T15:00:00Z');
  assert.equal(page.nodes.contests.children.length, 33);
  assert.equal(page.nodes['closed-contests'].children.length, 4);
  assert.match(titles(page.nodes['closed-contests'])[0], /4.16/);
  assert.ok(!titles(page.nodes.contests).some(x => x.includes('4.16')));
});
test('open before upcoming, deadline order, stale status and missing dates', () => {
  const data = {ok: true, updatedAt: '2026-10-10', items: [
    {title: 'Upcoming', startDate: '2026-10-12', deadline: '2026-10-13'},
    {title: 'Open later', deadline: '2026-10-30', status: '마감'},
    {title: 'Open sooner', deadline: '2026-10-12'},
    {title: 'Unknown', deadline: '2026-02-30'},
    {title: 'Archived', status: '마감'}
  ]};
  const page = setup(undefined, data);
  assert.deepEqual(titles(page.nodes.contests), ['Open sooner', 'Open later', 'Upcoming', 'Unknown']);
  assert.match(page.nodes.contests.children[2].textContent, /접수 예정/);
  assert.match(page.nodes.contests.children[3].textContent, /일정 확인/);
  assert.deepEqual(titles(page.nodes['closed-contests']), ['Archived']);
  assert.match(page.nodes['sync-label'].textContent, /2026. 10. 10/);
});
test('actual posters retained; missing/broken images never become generated thumbnails', () => {
  const {nodes} = setup();
  const images = all(nodes.contests).filter(x => x.className === 'official-poster');
  assert.equal(images.length, 34);
  const img = images[0], placeholder = img.parent.children[0];
  img.onload(); assert.equal(placeholder.hidden, true);
  img.onerror(); assert.equal(placeholder.hidden, false);
  assert.ok(!img.parent.children.includes(img));
  assert.match(placeholder.textContent, /공식 포스터 확인 중/);
  assert.equal(all(nodes.contests).filter(x => x.tag === 'img' && String(x.src).startsWith('data:')).length, 0);
  const page = setup(undefined, {ok: true, items: [{title: '<script>literal</script>', url: 'javascript:alert(1)', image: 'javascript:alert(1)'}]});
  assert.equal(all(page.nodes.contests).filter(x => x.tag === 'a').length, 0);
  assert.equal(all(page.nodes.contests).filter(x => x.className === 'official-poster').length, 0);
  assert.equal(all(page.nodes.contests).filter(x => x.tag === 'img').length, 0);
  assert.match(page.nodes.contests.textContent, /공식 포스터 확인 중/);
});
test('empty feed and all-closed feed have accurate empty states', () => {
  const empty = setup(undefined, {ok: true, items: []});
  assert.equal(empty.nodes.empty.hidden, false);
  assert.equal(empty.nodes['archive-empty'].hidden, false);
  const closed = setup(undefined, {ok: true, items: [{title: 'Old', deadline: '2026-10-10'}]});
  assert.equal(closed.nodes.empty.hidden, false);
  assert.equal(closed.nodes['archive-empty'].hidden, true);
});
