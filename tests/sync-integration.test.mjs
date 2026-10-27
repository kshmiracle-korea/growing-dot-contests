import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, cp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {previousItems} from '../scripts/sync-sheet.mjs';

test('sheet to snapshot pipeline retains every record when a new poster is unavailable; repeat is stable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'contest-sync-test-'));
  const root = fileURLToPath(new URL('../', import.meta.url));
  try {
    await cp(join(root, 'scripts'), join(directory, 'scripts'), {recursive: true});
    await cp(join(root, 'growing-dot-upload'), join(directory, 'growing-dot-upload'), {recursive: true});
    await cp(join(root, 'tests/fixtures/snapshot.js'), join(directory, 'growing-dot-upload/snapshot.js'));
    await writeFile(join(directory, 'poster-sources.json'), '{}');
    await mkdir(join(directory, 'reports'));
    const original = previousItems(await readFile(join(directory, 'growing-dot-upload/snapshot.js'), 'utf8'));
    const runner = `
      import {generateKeyPairSync} from 'node:crypto';
      import {readFileSync} from 'node:fs';
      import {main, previousItems} from './scripts/sync-sheet.mjs';
      const items = previousItems(readFileSync('growing-dot-upload/snapshot.js', 'utf8'));
      if (!items.some(x => x.url === 'https://example.org/new-contest')) items.push({title:'New poster pending', url:'https://example.org/new-contest', deadline:'2026-12-31'});
      const fields = ['title','deadline','topic','eligibility','url','status','organizer','startDate'];
      const headers = ['공모전명','마감일','분야/주제','참가 대상','공모전 URL','상태','주최/주관','접수 시작일'];
      const sheet = {valueRanges:[{values:[headers, ...items.map(item => fields.map(field => item[field] || ''))]}, {values:[['이미지 URL']]}]};
      const {privateKey} = generateKeyPairSync('rsa', {modulusLength:2048});
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({type:'service_account', client_email:'test@example.iam.gserviceaccount.com', private_key:privateKey.export({type:'pkcs8',format:'pem'})});
      globalThis.fetch = async url => ({ok:true,status:200,json:async () => String(url).includes('oauth2') ? {access_token:'test-only'} : sheet});
      await main();
    `;
    await writeFile(join(directory, 'run.mjs'), runner);
    const env = {...process.env, POSTER_REPORT: join(directory, 'reports/posters.json'), GITHUB_OUTPUT: join(directory, 'outputs'), GITHUB_STEP_SUMMARY: join(directory, 'summary')};
    const first = spawnSync(process.execPath, ['run.mjs'], {cwd: directory, env, encoding: 'utf8'});
    assert.equal(first.status, 0, first.stderr);
    const snapshot = await readFile(join(directory, 'growing-dot-upload/snapshot.js'), 'utf8');
    const items = previousItems(snapshot);
    assert.equal(items.length, original.length + 1);
    assert.deepEqual(items.slice(0, original.length), original);
    assert.equal(items.at(-1).image, '');
    const report = JSON.parse(await readFile(env.POSTER_REPORT, 'utf8'));
    assert.equal(report.pending, 1);
    assert.match(await readFile(env.GITHUB_OUTPUT, 'utf8'), /changed=true/);
    assert.match(await readFile(env.GITHUB_STEP_SUMMARY, 'utf8'), /New poster pending/);
    const html = await readFile(join(directory, 'growing-dot-upload/index.html'), 'utf8');
    assert.match(html, /snapshot\.js\?v=[a-f0-9]{12}/);
    const second = spawnSync(process.execPath, ['run.mjs'], {cwd: directory, env, encoding: 'utf8'});
    assert.equal(second.status, 0, second.stderr);
    assert.equal(await readFile(join(directory, 'growing-dot-upload/snapshot.js'), 'utf8'), snapshot);
    assert.equal(await readFile(join(directory, 'growing-dot-upload/index.html'), 'utf8'), html);
    assert.match(await readFile(env.GITHUB_OUTPUT, 'utf8'), /changed=false/);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
