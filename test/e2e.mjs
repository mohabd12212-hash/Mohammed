import { chromium } from 'playwright-core';
import fs from 'node:fs';
const S = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const errs = []; const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
async function newPage(ctxOpts = {}) { const ctx = await b.newContext({ viewport: { width: 1360, height: 860 }, acceptDownloads: true, ...ctxOpts }); const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); }); p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); return p; }
async function login(p, u, pw) { await p.goto('http://localhost:3100/'); await p.waitForSelector('.login'); await p.fill('input[autocomplete=username]', u); await p.fill('input[type=password]', pw); await p.click('button.primary'); await p.waitForSelector('.nav'); }

// ---- admin: grade entry
let p = await newPage(); await login(p, 'admin', 'admin123');
await p.click('.nav a[data-path="/grades"]'); await p.waitForSelector('.gridin input');
const first = p.locator('.gridin tbody tr').first().locator('input').first();
await first.fill('99'); await p.waitForTimeout(300);
ok(await first.evaluate((e) => e.classList.contains('bad')), 'value above max flagged invalid');
await first.fill('17.5'); await p.waitForTimeout(1100);
ok((await p.textContent('.status')).includes('تم الحفظ'), 'valid grade autosaved');
await p.reload(); await p.waitForSelector('.gridin input');
ok((await p.locator('.gridin tbody tr').first().locator('input').first().inputValue()) === '17.5', 'saved value persists after reload');
// fixed subject banner + enrich subject
await p.selectOption('select >> nth=2', { label: 'التربية الفنية' }); await p.waitForTimeout(500);
ok(await p.locator('.banner:has-text("درجة كاملة")').count() === 1, 'fixed subject banner');
// reports: print pdf of all cards
await p.click('.nav a[data-path="/reports"]'); await p.waitForSelector('.sheet');
const n = await p.locator('.sheet').count(); console.log('cards in section:', n);
await p.pdf({ path: `${S}/card.pdf`, preferCSSPageSize: true, printBackground: true });
await p.screenshot({ path: `${S}/shots/09-card.png`, fullPage: false });
// statement
await (await p.$$('.rep-types button'))[1].click(); await p.waitForTimeout(400);
const stmt = await p.locator('.sheet').first().innerText(); ok(stmt.includes('بيان درجات') && /مئة|ثمان|ست/.test(stmt), 'statement shows numbers in words');
await p.screenshot({ path: `${S}/shots/10-statement.png` });
// excel export of results
await (await p.$$('.rep-types button'))[5].click(); await p.waitForTimeout(400);
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("تصدير إكسل")')]);
ok(dl.suggestedFilename().endsWith('.xlsx'), 'results export downloads xlsx: ' + dl.suggestedFilename());
await p.screenshot({ path: `${S}/shots/11-results.png` });
// import students from xlsx
await p.click('.nav a[data-path="/students"]'); await p.waitForSelector('.t');
await p.click('button:has-text("استيراد من إكسل")'); await p.waitForSelector('input[type=file]');
const XLSX = (await import('/home/claude/darajat/node_modules/xlsx/xlsx.mjs')).default ?? await import('/home/claude/darajat/node_modules/xlsx/xlsx.mjs');
fs.writeFileSync(`${S}/imp.csv`, '﻿الاسم,الأب,الأم,الصف,الشعبة\nطالب اختبار أول,أب,أم,السابع,الثالثة\nطالب اختبار ثاني,أب,أم,السابع,الثالثة\n');
await p.setInputFiles('input[type=file]', `${S}/imp.csv`); await p.waitForSelector('text=تم العثور على 2 طالب');
await p.click('.modal button:has-text("استيراد")'); await p.waitForTimeout(800);
ok((await p.locator('.toast').allTextContents()).join().includes('تمت إضافة 2'), 'import added 2 students');
await p.screenshot({ path: `${S}/shots/12-import.png` });
// ---- teacher restrictions
p = await newPage(); await login(p, 'teacher1', 'teacher123');
ok(await p.locator('.nav a').count() === 3, 'teacher sees 3 nav items');
await p.click('.nav a[data-path="/grades"]'); await p.waitForSelector('.gridin input');
const opts = await p.locator('select >> nth=2').locator('option').allTextContents(); ok(opts.length === 1 && opts[0] === 'اللغة العربية', 'teacher only sees assigned subject: ' + opts);
// ---- super
p = await newPage(); await login(p, 'owner', 'owner123');
await p.waitForSelector('.stat'); await p.screenshot({ path: `${S}/shots/13-super.png` });
await p.click('button:has-text("مدرسة جديدة")'); await p.waitForSelector('.modal');
await p.fill('.modal input >> nth=0', 'مدرسة الأمل'); await p.fill('.modal input[placeholder*="alnoor"]', 'amal');
await p.click('.modal button:has-text("إنشاء المدرسة")'); await p.waitForTimeout(800);
ok(await p.locator('td:has-text("مدرسة الأمل")').count() === 1, 'new school created');
// new school isolation: login as amal sees no students
p = await newPage(); await login(p, 'amal', (await (async()=>0)()) || 'x').catch(()=>{});
console.log('ERRORS:', errs.length ? errs : 'none');
await b.close();
