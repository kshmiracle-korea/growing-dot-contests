import {createHash, sign} from 'node:crypto';
import {readFile, writeFile, appendFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const SHEET_ID = '1avQQiH13UvHJ2pbxTvbjbSTQmUOHuc-YHx_01DUu3iw';
const FIELDS = ['title', 'deadline', 'topic', 'eligibility', 'url', 'status', 'organizer', 'startDate', 'image'];
const HEADERS = ['공모전명', '마감일', '분야/주제', '참가 대상', '공모전 URL', '상태', '주최/주관', '접수 시작일', '이미지 URL'];
const prefix = 'window.CONTEST_SNAPSHOT = ';
const base64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');
export const koreanDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);

function date(value) {
  if (!value) return '';
  const match = value.match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})\.?$/);
  if (!match) throw new Error('Invalid date in public source');
  const normalized = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const parsed = new Date(normalized + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) throw new Error('Invalid calendar date');
  return normalized;
}

export function publicItems(core, images) {
  if (!Array.isArray(core) || !Array.isArray(images) || core.length > 10000 || images.length > 10000) throw new Error('Invalid source size');
  if (core[0]?.length !== 8 || !HEADERS.slice(0, 8).every((h, i) => core[0][i]?.trim() === h) || images[0]?.[0]?.trim() !== HEADERS[8]) throw new Error('Source columns changed; review required');
  const items = core.slice(1).map((row, index) => {
    if (!Array.isArray(row) || row.length > 8 || (images[index + 1]?.length || 0) > 1) throw new Error('Invalid row shape');
    return Object.fromEntries(FIELDS.map((field, i) => [field, String(i < 8 ? row[i] ?? '' : images[index + 1]?.[0] ?? '').trim()]));
  }).filter(item => item.title);
  if (!items.length) throw new Error('Empty source; preserve published site');
  for (const item of items) {
    item.deadline = date(item.deadline); item.startDate = date(item.startDate);
    if (Object.values(item).some(value => /^#(REF!|VALUE!|ERROR!|N\/A|DIV\/0!)/.test(value))) throw new Error('Source formula error');
    if (item.url && !/^https?:\/\//i.test(item.url)) throw new Error('Invalid public URL');
    // Image URL validation belongs to the per-contest poster stage. A broken
    // image field must not block otherwise valid public records.
  }
  return items;
}

export function snapshotText(items, today) {
  return prefix + JSON.stringify({ok: true, updatedAt: today, source: {spreadsheetId: SHEET_ID, sheet: '공모전 관리'}, items}, null, 2).replace(/</g, '\\u003c') + ';\n';
}

export function previousItems(text) {
  const start = text.indexOf(prefix);
  if (start < 0) throw new Error('Unrecognized previous snapshot');
  const parsed = JSON.parse(text.slice(start + prefix.length).trim().replace(/;$/, ''));
  if (!Array.isArray(parsed.items)) throw new Error('Invalid previous snapshot');
  return parsed.items;
}

export function assertNoRecordLoss(items, previous) {
  // A missing source row must not silently erase archived records.
  if (items.length < previous.length) throw new Error('Source lost records; preserve published site for review');
}

export async function requestJson(url, options = {}, fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let retryable = true;
    try {
      const response = await fetcher(url, {...options, signal: AbortSignal.timeout(30000)});
      retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!response.ok) throw new Error(`Google request failed (${response.status})`);
      return await response.json();
    } catch (error) {
      if (!retryable || attempt === 3) throw error;
      console.error(`Google temporary request failure; attempt ${attempt + 1}/3`);
      await sleep(attempt * 1000);
    }
  }
}

async function accessToken() {
  let credential;
  try {credential = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '');} catch {throw new Error('Missing Google read-only credential');}
  if (credential.type !== 'service_account' || !credential.client_email?.endsWith('.iam.gserviceaccount.com') || !credential.private_key) throw new Error('Invalid Google credential');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = base64url({alg: 'RS256', typ: 'JWT'}) + '.' + base64url({iss: credential.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600});
  const assertion = unsigned + '.' + sign('RSA-SHA256', Buffer.from(unsigned), credential.private_key).toString('base64url');
  const result = await requestJson('https://oauth2.googleapis.com/token', {method: 'POST', body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion})});
  if (!result.access_token) throw new Error('Google authentication failed');
  return result.access_token;
}

async function readPublicColumns(token) {
  // Never request A, J:Q, or S onward: internal notes and keys are not read.
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet`);
  for (const range of ["'공모전 관리'!B1:I10000", "'공모전 관리'!R1:R10000"]) url.searchParams.append('ranges', range);
  url.searchParams.set('valueRenderOption', 'FORMATTED_VALUE');
  const result = await requestJson(url, {headers: {Authorization: `Bearer ${token}`}});
  if (result.valueRanges?.length !== 2) throw new Error('Incomplete source response');
  return publicItems(result.valueRanges[0].values, result.valueRanges[1].values);
}

export async function main() {
  const target = 'growing-dot-upload/snapshot.js';
  const existing = previousItems(await readFile(target, 'utf8'));
  const token = await accessToken();
  let items = await readPublicColumns(token);
  // Two consecutive reads guard against catching a row edit in progress.
  // This is not a collection-complete signal; that must come from the collector.
  const confirmation = await readPublicColumns(token);
  if (JSON.stringify(items) !== JSON.stringify(confirmation)) throw new Error('Source changing during read; preserve published site');
  assertNoRecordLoss(items, existing);
  const posters = spawnSync('python', ['scripts/cache-posters.py'], {input: JSON.stringify({items, previous: existing}), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, env: {...process.env, PYTHONIOENCODING: 'utf-8'}});
  if (posters.stderr) process.stderr.write(posters.stderr);
  if (posters.status !== 0) throw new Error('Poster verification failed; published website preserved');
  items = JSON.parse(posters.stdout);
  const changed = JSON.stringify(items) !== JSON.stringify(existing);
  if (changed) {
    const data = snapshotText(items, koreanDay());
    const version = createHash('sha256').update(data).digest('hex').slice(0, 12);
    const htmlPath = 'growing-dot-upload/index.html';
    const html = await readFile(htmlPath, 'utf8');
    const updated = html.replace(/src="\.\/snapshot\.js(?:\?[^"\s]*)?"/, `src="./snapshot.js?v=${version}"`);
    if (html === updated) throw new Error('Snapshot script reference missing');
    await writeFile(target, data);
    await writeFile(htmlPath, updated);
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n## 시트 동기화 · ${koreanDay()}\n공개 항목 ${items.length}건 · ${changed ? '변경 반영' : '변경 없음'}\n원본 시트는 읽기 전용이며 기존 필드·행을 유지합니다.\n`);
  console.log(changed ? `Prepared ${items.length} public records.` : 'No public data changes; existing publication preserved.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {console.error(error.message); process.exitCode = 1;});
}
