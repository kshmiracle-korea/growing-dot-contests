import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {publicItems, snapshotText, previousItems, assertNoRecordLoss, koreanDay, requestJson} from '../scripts/sync-sheet.mjs';
const header = ['공모전명', '마감일', '분야/주제', '참가 대상', '공모전 URL', '상태', '주최/주관', '접수 시작일'];
const row = ['Example', '2026. 10. 12.', 'AI', 'Everyone', 'https://example.org', '마감', 'Host', '2026-09-01'];
test('public schema retains closed contests and images, never accepts additional fields', () => {
  const items = publicItems([header, row], [['이미지 URL'], ['https://example.org/poster.png']]);
  assert.equal(items[0].status, '마감');
  assert.equal(items[0].deadline, '2026-10-12');
  assert.equal(items[0].image, 'https://example.org/poster.png');
  assert.equal(Object.keys(items[0]).length, 9);
  assert.throws(() => publicItems([header, [...row, 'PRIVATE NOTE']], [['이미지 URL']]));
  const data = snapshotText(items, '2026-10-12');
  assert.deepEqual(previousItems(data), items);
  for (const key of ['메모', '중복키', '상금/혜택', '관심도', '최종 확인일']) assert.ok(!data.includes(key));
});
test('blank image stays blank for existing poster mapping; blank rows skipped', () => {
  const items = publicItems([header, row, []], [['이미지 URL']]);
  assert.equal(items.length, 1);
  assert.equal(items[0].image, '');
});
test('invalid headers, empty source, bad dates and formula errors fail closed', () => {
  assert.throws(() => publicItems([header.slice(1), row], [['이미지 URL']]));
  assert.throws(() => publicItems([header], [['이미지 URL']]));
  for (const deadline of ['2026-02-30', '#REF!']) assert.throws(() => publicItems([header, [row[0], deadline, ...row.slice(2)]], [['이미지 URL']]));
  assert.throws(() => assertNoRecordLoss([], [row]));
});
test('Korean dates and existing production snapshot remain readable', async () => {
  assert.equal(koreanDay(new Date('2026-10-11T15:00:00Z')), '2026-10-12');
  const old = previousItems(await readFile(new URL('../growing-dot-upload/snapshot.js', import.meta.url), 'utf8'));
  assert.ok(old.length >= 37);
});

test('Google transient failures retry at most three times; permanent failures stop immediately', async () => {
  let calls = 0;
  const sleep = async () => {};
  const recovered = await requestJson('https://example.org', {}, async () => {
    calls++;
    if (calls < 3) throw new TypeError('temporary network error');
    return {ok: true, status: 200, json: async () => ({ok: true})};
  }, sleep);
  assert.equal(recovered.ok, true);
  assert.equal(calls, 3);
  for (const [status, expected] of [[503, 3], [429, 3], [403, 1]]) {
    calls = 0;
    await assert.rejects(requestJson('https://example.org', {}, async () => {calls++; return {ok: false, status};}, sleep));
    assert.equal(calls, expected);
  }
});

test('an invalid image address is deferred to per-item validation', () => {
  assert.equal(publicItems([header, row], [['이미지 URL'], ['http://broken.example/poster.jpg']])[0].title, 'Example');
});
