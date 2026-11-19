import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('manifest.json parses and declares MV3', () => {
  const m = JSON.parse(readFileSync('manifest.json', 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.equal(m.name, 'Snap Web Assistant');
  assert.ok(Array.isArray(m.content_scripts) && m.content_scripts.length === 2);
  const worlds = m.content_scripts.map((c) => c.world);
  assert.deepEqual(worlds, ['MAIN', 'ISOLATED']);
});

test('extension scripts pass syntax check', async () => {
  const { execFileSync } = await import('node:child_process');
  for (const f of ['background.js', 'content.js', 'bridge.js', 'popup.js']) {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  }
});

test('no network APIs in extension scripts', () => {
  const files = ['background.js', 'content.js', 'bridge.js', 'popup.js'];
  const banned = [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bnavigator\.sendBeacon\b/];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const re of banned) {
      assert.doesNotMatch(src, re, `${f} contains banned network API ${re}`);
    }
  }
});