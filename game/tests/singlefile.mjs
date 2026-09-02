// Valida o bundle single-file no mesmo formato em que o Artifact o serve:
// wrapper injetando doctype/head/body, arquivo carregado via file://
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const src = process.argv[2];
const wrapped = `<!doctype html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}</style></head><body>${readFileSync(src, 'utf-8')}</body>`;
const tmp = src.replace('.html', '-wrapped.html');
writeFileSync(tmp, wrapped);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`file://${tmp}`, { waitUntil: 'load' });
await page.waitForTimeout(900);
const menuVisible = await page.isVisible('#menu');
await page.click('#btn-play');
await page.waitForTimeout(300);
if (await page.isVisible('#tutorial')) await page.click('#btn-tut-start');
await page.waitForTimeout(500);
const playing = await page.isVisible('#hud');
// Um tap real precisa produzir uma embaixadinha.
const c = page.locator('#stage');
for (let i = 0; i < 40; i++) {
  await c.dispatchEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 620, pointerType: 'touch', isPrimary: true });
  await c.dispatchEvent('pointerup', { pointerId: 1, clientX: 200, clientY: 620, pointerType: 'touch', isPrimary: true });
  await page.waitForTimeout(60);
}
const scored = Number((await page.locator('#hud-score').textContent()).replace(/\D/g, ''));
await page.screenshot({ path: src.replace('.html', '-preview.png') });
await browser.close();
console.log(JSON.stringify({ menuVisible, playing, scored, errors }, null, 1));
process.exit(menuVisible && playing && scored > 0 && errors.length === 0 ? 0 : 1);
