/* ==========================================================================
   layout-check.js — DOES EVERYTHING SIT WHERE IT IS SUPPOSED TO?

   Run from a terminal, not by a candidate. Never served.

       node reference/layout-check.js http://localhost:8000

   It plays the simulation through in a headless browser and, on every
   screen, measures the things Rule Zero fixes:

     · the phase tabs are the leftmost column, and Restart is at the bottom
       of that column;
     · the Research Journal (or the calculator) is the rightmost column, and
       it fits inside the playing area;
     · the primary button is in the bottom-right of the middle column;
     · on the Analysis screen the calculator is to the RIGHT of the question
       and inside the middle column;
     · nothing overflows sideways.

   v1.2 adds (RD-STAGE4-REVIEW-for-Opus.md items 1, 5, 6 and 8):

     · the login and start screens never scroll, at the six window sizes,
       across a grid of 72 more window sizes, and inside the lesson's 16:9
       iframe at 1000 x 562 and 1717 x 966 plus a squeezed 693px-tall box;
       and the start card sits with even space above and below;
     · the WHOLE playthrough is run again inside those three iframe boxes,
       on a host page this script writes with the README's embed tag;
     · on every timed screen no element scrolls except the four that are
       meant to (.work-scroll, .journal-list, .nav-list, .calc-history);
     · Report, Graph: the three cards share one top edge, run left to right
       in content order, picture above name above radio;
     · "Timer paused" leaves the header's height, the clock and the Part
       tabs exactly where they were;
     · the calculator reaches the bottom of its column, or stops at 640px,
       whichever is smaller, and its keys are the size they were in v1.1.

   Two rules this file follows, both learned the hard way on the previous
   project:

   1. A CHECK THAT MEASURES NOTHING FAILS. Every screen must produce at least
      one measurement, and the run must cover every screen. A pass reported
      over zero items is a failure.

   2. ASK WHAT THE MEASUREMENT WOULD SAY IF THE FAULT WERE PRESENT. Widths
      are compared against the PLAYING AREA, not against the element's own
      column — comparing a thing to itself always agrees and can never reveal
      anything. The journal being cut off at 900px was invisible to every
      check until it was measured against the box it sits in. And a
      scrollbar is invisible in a headless browser (it draws overlay bars),
      which is why the start screen's 2px overflow reached WK's lesson: so
      scrolling is measured, never looked for.
   ========================================================================== */
'use strict';

const { chromium } = require('playwright');

const BASE = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');
const SIZES = [
  { w: 1920, h: 1080 }, { w: 1440, h: 900 }, { w: 1402, h: 789 },
  { w: 1180, h: 700 }, { w: 1024, h: 640 }, { w: 900, h: 540 }
];

/* The lesson's embed tag, exactly as README §6 gives it. */
const EMBED_STYLE = 'width:100%;aspect-ratio:16/9;border:0;display:block';
const BOXES = [
  { w: 1000, h: 562, style: EMBED_STYLE, name: '16:9 iframe 1000x562' },
  { w: 1717, h: 966, style: EMBED_STYLE, name: '16:9 iframe 1717x966' },
  /* WK's lesson before the 16:9 tag: a wide column squeezed to 693px tall */
  { w: 1717, h: 693, style: 'width:100%;height:693px;border:0;display:block', name: 'squeezed iframe 1717x693' }
];

/* Every window size from 900 x 540 up must fit the login and start screens.
   Six sizes cannot prove "every", so a grid of widths and heights is swept
   as well, including the short-and-wide shapes a zoomed browser produces. */
const GRID_W = [900, 1000, 1100, 1280, 1366, 1600, 1920, 2560];
const GRID_H = [540, 562, 600, 640, 693, 768, 900, 1080, 1440];

/* The calculator's keys in v1.1, measured on 10 Sep before any v1.2 change
   (first key, width x height, px). Item 8 must not change them. */
const V11_KEYS = {
  '1920x1080': { analysis: [72.25, 40], case1: [102.38, 40] },
  '1440x900':  { analysis: [72.25, 36], case1: [72.38, 36] },
  '1402x789':  { analysis: [72.25, 36], case1: [70, 36] },
  '1180x700':  { analysis: [64.23, 36], case1: [59.19, 36] },
  '1024x640':  { analysis: [53.55, 30], case1: [51.05, 30] },
  '900x540':   { analysis: [44.98, 30], case1: [42.98, 30] }
};
const CALC_CAP = 640;

/* The only boxes on a timed screen that are allowed to scroll. */
const ALLOWED_SCROLLERS = ['work-scroll', 'journal-list', 'nav-list', 'calc-history'];

const USER = 'CaseMentor9187';
const PASS = 'change-me-before-launch';

let checks = 0;
const failures = [];

function ok(condition, description, detail) {
  checks++;
  if (!condition) failures.push(description + (detail ? '  — ' + detail : ''));
}

async function measure(ctx) {
  return ctx.evaluate(() => {
    const box = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom,
               scrollW: el.scrollWidth, clientW: el.clientWidth };
    };
    const all = sel => Array.from(document.querySelectorAll(sel)).map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom,
               text: (el.innerText || '').trim().slice(0, 30) };
    });
    return {
      doc: { scrollW: document.documentElement.scrollWidth,
             clientW: document.documentElement.clientWidth },
      mainBox: box('.main-box'),
      columns: box('.columns'),
      nav: box('.nav-col'),
      work: box('.work-col'),
      side: box('.side-col'),
      restart: box('.btn-restart'),
      primary: box('.work-actions .btn'),
      actions: box('.work-actions'),
      calc: box('.calc'),
      question: box('.work-split .question-col'),
      journal: box('.journal'),
      header: box('.header-bar'),
      timeText: box('#time-text'),
      liveTabs: all('.tab:not(:disabled)').length,
      chips: all('.chip').length,
      tabs: all('.tab').length
    };
  });
}

/* Every element that can scroll and has something to scroll, on either
   axis. Returns what is scrolling that should not be, and how many boxes were
   looked at, so a sweep over nothing can be caught. */
async function scrollers(ctx) {
  return ctx.evaluate((allowed) => {
    const bad = [];
    let looked = 0;
    const els = [document.documentElement, document.body].concat(
      Array.from(document.querySelectorAll('#app *')));
    for (const el of els) {
      looked++;
      const cs = getComputedStyle(el);
      const canY = /(auto|scroll)/.test(cs.overflowY) || el === document.documentElement;
      const canX = /(auto|scroll)/.test(cs.overflowX) || el === document.documentElement;
      const overY = el.scrollHeight - el.clientHeight;
      const overX = el.scrollWidth - el.clientWidth;
      const scrollsY = canY && overY > 1;
      const scrollsX = canX && overX > 1;
      if (!scrollsY && !scrollsX) continue;
      const cls = typeof el.className === 'string' ? el.className : '';
      if (scrollsY && !scrollsX && allowed.some(a => el.classList && el.classList.contains(a))) continue;
      bad.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + (cls ? '.' + cls.trim().split(/\s+/).join('.') : '')) +
               (scrollsY ? ' scrolls ' + overY + 'px down' : '') +
               (scrollsX ? ' scrolls ' + overX + 'px sideways' : ''));
    }
    return { bad, looked };
  }, ALLOWED_SCROLLERS);
}

async function checkNoStrayScroll(ctx, label, screen) {
  const s = await scrollers(ctx);
  ok(s.looked > 20, `${label} ${screen}: the scroll sweep looked at the screen's elements`, `${s.looked} looked at`);
  ok(s.bad.length === 0, `${label} ${screen}: nothing scrolls except the boxes meant to`, s.bad.join('; '));
}

async function checkFrame(ctx, label, screen) {
  const m = await measure(ctx);

  ok(m.doc.scrollW <= m.doc.clientW + 1,
     `${label} ${screen}: the page must not scroll sideways`,
     `page is ${m.doc.scrollW}px wide in a ${m.doc.clientW}px window`);

  ok(m.mainBox && m.columns && m.columns.w <= m.mainBox.w + 1,
     `${label} ${screen}: the three columns must fit inside the playing area`,
     m.columns && m.mainBox ? `columns ${Math.round(m.columns.w)}px inside a ${Math.round(m.mainBox.w)}px box` : 'missing');

  ok(m.nav && m.work && m.nav.right <= m.work.x + 1,
     `${label} ${screen}: the phase tabs are the leftmost column`);

  /* A case with neither a calculator nor a journal has NO right column and
     the middle takes its width (rule 2.5 v1.1). Every other screen has one. */
  if (m.side) {
    ok(m.work && m.work.right <= m.side.x + 1,
       `${label} ${screen}: the right-hand panel is to the right of the working area`);
    ok(m.mainBox && m.side.right <= m.mainBox.right + 1,
       `${label} ${screen}: the right-hand panel is not cut off by the edge of the playing area`,
       `panel ends at ${Math.round(m.side.right)}, box ends at ${Math.round(m.mainBox.right)}`);
  } else {
    ok(m.work && m.columns && m.work.right >= m.columns.right - 20,
       `${label} ${screen}: with no right-hand panel the middle column takes its width`,
       `middle ends at ${Math.round(m.work.right)}, the row ends at ${Math.round(m.columns.right)}`);
  }

  ok(m.restart && m.nav && m.restart.bottom <= m.nav.bottom + 1 &&
     m.restart.y > m.nav.y + m.nav.h / 2,
     `${label} ${screen}: Restart is at the bottom of the tab column`);

  ok(m.timeText && m.header &&
     Math.abs((m.timeText.x + m.timeText.w / 2) - (m.header.x + m.header.w / 2)) < m.header.w * 0.18,
     `${label} ${screen}: the clock is in the middle of the header bar`);

  if (m.primary) {
    ok(Math.abs(m.primary.right - m.work.right) < 6,
       `${label} ${screen}: the primary button is at the RIGHT of the middle column`,
       `button right ${Math.round(m.primary.right)}, column right ${Math.round(m.work.right)}`);
    ok(m.primary.bottom <= m.work.bottom + 1 && m.primary.y > m.work.y + m.work.h * 0.5,
       `${label} ${screen}: the primary button is at the BOTTOM of the middle column`);
    ok(m.primary.w >= 90 && m.primary.h >= 28,
       `${label} ${screen}: the primary button is big enough to hit`,
       `${Math.round(m.primary.w)}x${Math.round(m.primary.h)}`);
  }

  await checkNoStrayScroll(ctx, label, screen);
  return m;
}

/* Item 1: the login and start screens fit without scrolling. */
async function centreScreen(ctx) {
  return ctx.evaluate(() => {
    const s = document.querySelector('.centre-screen');
    const card = document.querySelector('.centre-screen .card');
    if (!s || !card) return null;
    const sr = s.getBoundingClientRect(), cr = card.getBoundingClientRect();
    const cs = getComputedStyle(s);
    const padT = parseFloat(cs.paddingTop), padB = parseFloat(cs.paddingBottom);
    return {
      scrollH: s.scrollHeight, clientH: s.clientHeight,
      scrollW: s.scrollWidth, clientW: s.clientWidth,
      above: cr.top - sr.top, below: sr.bottom - cr.bottom,
      cardH: cr.height, boxH: sr.height, padT, padB,
      docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight
    };
  });
}

async function checkCentre(ctx, label, screen, evenSpace) {
  const c = await centreScreen(ctx);
  ok(c !== null, `${label} ${screen}: the centred card is on screen`);
  if (!c) return;
  ok(c.scrollH <= c.clientH, `${label} ${screen}: .centre-screen does not scroll (fits without a scrollbar)`,
     `scrollHeight ${c.scrollH} against clientHeight ${c.clientH}`);
  ok(c.scrollW <= c.clientW, `${label} ${screen}: and does not scroll sideways`,
     `scrollWidth ${c.scrollW} against clientWidth ${c.clientW}`);
  ok(c.docScroll <= 0, `${label} ${screen}: nor does the page around it`, `${c.docScroll}px`);
  if (evenSpace) {
    ok(Math.abs(c.above - c.below) <= 2, `${label} ${screen}: the card sits centred, even space above and below`,
       `${Math.round(c.above)}px above, ${Math.round(c.below)}px below`);
  }
}

async function popupGo(ctx, page) {
  await ctx.click('[data-act="popup-go"]');
  await page.waitForTimeout(120);
}

async function calcFits(ctx, label, screen, keyKey) {
  const c = await ctx.evaluate(() => {
    const calc = document.querySelector('.calc');
    if (!calc) return null;
    const col = calc.closest('.calc-col') || calc.closest('.side-col');
    const key = document.querySelector('.calc-key').getBoundingClientRect();
    const r = calc.getBoundingClientRect(), cr = col.getBoundingClientRect();
    const hist = document.querySelector('.calc-history').getBoundingClientRect();
    const keys = document.querySelector('.calc-keys').getBoundingClientRect();
    const colPadB = parseFloat(getComputedStyle(col).paddingBottom) || 0;
    return { top: r.top, bottom: r.bottom, h: r.height, colBottom: cr.bottom - colPadB,
             keyW: key.width, keyH: key.height, histH: hist.height,
             keysBottom: keys.bottom, colName: col.className };
  });
  ok(c !== null, `${label} ${screen}: the calculator is there`);
  if (!c) return;
  const room = c.colBottom - c.top;
  const expected = Math.min(room, CALC_CAP);
  ok(Math.abs(c.h - expected) <= 3,
     `${label} ${screen}: the calculator reaches the bottom of its column, or stops at ${CALC_CAP}px, whichever is smaller`,
     `calculator ${Math.round(c.h)}px tall with ${Math.round(room)}px of column below its top (expected ${Math.round(expected)})`);
  ok(c.histH >= 40, `${label} ${screen}: the history takes the space above the keypad`, `${Math.round(c.histH)}px`);
  ok(c.keysBottom <= c.colBottom + 1, `${label} ${screen}: every key is inside the column`);
  const v11 = keyKey && V11_KEYS[keyKey.size] && V11_KEYS[keyKey.size][keyKey.which];
  if (v11) {
    ok(Math.abs(c.keyW - v11[0]) < 0.6 && Math.abs(c.keyH - v11[1]) < 0.6,
       `${label} ${screen}: the keys are the size they were in v1.1`,
       `now ${c.keyW.toFixed(2)} x ${c.keyH.toFixed(2)}, v1.1 ${v11[0]} x ${v11[1]}`);
  }
}

/* A host page with the lesson's iframe tag, served from the same address as
   the simulation so the login's scrambling function is available in it. */
async function openInBox(page, box) {
  const host = BASE + '/__lesson-host-' + box.w + 'x' + box.h + '.html';
  await page.route(host, r => r.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><meta charset="utf-8"></head>' +
          '<body style="margin:0;background:#fff">' +
          `<iframe src="${BASE}/index.html" allowfullscreen allow="fullscreen" style="${box.style}"></iframe>` +
          '</body></html>'
  }));
  await page.goto(host, { waitUntil: 'networkidle' });
  const frame = page.frames().find(f => f.url().indexOf('/index.html') !== -1);
  const size = await page.evaluate(() => {
    const r = document.querySelector('iframe').getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  return { frame, size };
}

async function run(size, box) {
  const browser = await chromium.launch();
  const viewport = box ? { width: box.w, height: box.h + 60 } : { width: size.w, height: size.h };
  const page = await browser.newPage({ viewport });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  let ctx = page;
  let label = `[${size.w}x${size.h}]`;
  if (box) {
    const opened = await openInBox(page, box);
    ctx = opened.frame;
    label = `[${box.name}]`;
    ok(ctx && Math.abs(opened.size.w - box.w) < 1 && Math.abs(opened.size.h - box.h) < 1,
       `${label} the host page's iframe is the size it should be`,
       `${opened.size.w.toFixed(1)} x ${opened.size.h.toFixed(1)}`);
  } else {
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  }

  await ctx.waitForSelector('#login-form');
  await checkCentre(ctx, label, 'Login', false);
  await ctx.fill('#login-user', USER);
  await ctx.fill('#login-pass', PASS);
  await ctx.click('#login-form button[type=submit]');
  await ctx.waitForSelector('[data-act="start"]');
  await page.waitForTimeout(120);
  await checkCentre(ctx, label, 'Start', true);
  const startShape = await ctx.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.start-phase')).map(e => e.getBoundingClientRect());
    const facts = Array.from(document.querySelectorAll('.start-fact')).map(e => e.getBoundingClientRect());
    const btn = document.querySelector('[data-act="start"]').getBoundingClientRect();
    return {
      cards: cards.map(r => [Math.round(r.left), Math.round(r.top)]),
      factTops: facts.map(r => r.top), factBottoms: facts.map(r => r.bottom),
      btnMid: (btn.top + btn.bottom) / 2, btnLeft: btn.left,
      lastFactRight: facts.length ? facts[facts.length - 1].right : 0
    };
  });
  const c = startShape.cards;
  ok(c.length === 4 && c[0][1] === c[1][1] && c[2][1] === c[3][1] && c[0][0] === c[2][0] &&
     c[1][0] === c[3][0] && c[2][1] > c[0][1] && c[1][0] > c[0][0],
     `${label} Start: the four phase cards are a 2 x 2 grid`, JSON.stringify(c));
  ok(startShape.factTops.length === 3 && startShape.factTops.every(t => Math.abs(t - startShape.factTops[0]) < 1) &&
     startShape.btnMid > startShape.factTops[0] && startShape.btnMid < startShape.factBottoms[0] &&
     startShape.btnLeft > startShape.lastFactRight,
     `${label} Start: the three facts and the Start button share one row, button on the right`,
     JSON.stringify(startShape));

  await ctx.click('[data-act="start"]');
  await ctx.waitForSelector('.section');

  const seen = [];

  let m = await checkFrame(ctx, label, 'Investigation');
  seen.push('Investigation');
  ok(m.chips >= 40, `${label} Investigation: the draggable pieces of information are on screen`,
     `found ${m.chips}, expected at least 40`);
  ok(m.journal !== null, `${label} Investigation: the Research Journal panel is present`);

  /* Item 6: header geometry with the clock running, to compare with paused. */
  const headerShape = () => ctx.evaluate(() => {
    const r = sel => { const e = document.querySelector(sel); if (!e) return null;
                       const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
    const paused = document.querySelector('#timer-paused');
    return { header: r('.header-bar'), time: r('#time-text'), bar: r('.time-bar'),
             tabs: Array.from(document.querySelectorAll('.part-tab')).map(e => {
               const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; }),
             pausedShown: !!paused && !paused.hidden,
             pausedBox: paused && !paused.hidden ? r('#timer-paused') : null };
  });
  const running = await headerShape();

  await ctx.click('[data-act="primary"]');
  /* WAIT FOR THE ENTRANCE ANIMATION TO FINISH BEFORE MEASURING.

     The popup rises into place over 160ms starting at scale(0.985), so a
     measurement taken too early reports 591 x 213 for a popup that is
     actually 600 x 216 — and 591 is not a wrong number, it is the right
     number at the wrong moment. */
  await page.waitForTimeout(400);
  const modal = await ctx.evaluate(() => {
    const el = document.querySelector('.modal');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  ok(modal && modal.h === 216, `${label} every popup is the same fixed height`,
     modal ? modal.w + 'x' + modal.h : 'no popup');
  await popupGo(ctx, page);
  await page.waitForTimeout(300);

  /* the Analysis tutorial is up: the clock is paused */
  const paused = await headerShape();
  ok(running.pausedShown === false && paused.pausedShown === true,
     `${label} Timer paused: shown while the tutorial pauses the clock, not before`,
     `before ${running.pausedShown}, during ${paused.pausedShown}`);
  ok(JSON.stringify(running.header) === JSON.stringify(paused.header),
     `${label} Timer paused: the header's size is unchanged`,
     `${JSON.stringify(running.header)} became ${JSON.stringify(paused.header)}`);
  ok(JSON.stringify(running.time) === JSON.stringify(paused.time) &&
     JSON.stringify(running.tabs) === JSON.stringify(paused.tabs) &&
     JSON.stringify(running.bar) === JSON.stringify(paused.bar),
     `${label} Timer paused: the clock, its bar and the Part tabs do not move`,
     JSON.stringify({ running, paused }));
  ok(paused.pausedBox && paused.pausedBox[1] >= paused.time[1] + paused.time[3] - 1 &&
     paused.pausedBox[1] + paused.pausedBox[3] <= paused.header[1] + paused.header[3] + 1,
     `${label} Timer paused: the words sit beneath the time text, inside the header bar`,
     JSON.stringify(paused.pausedBox));
  await popupGo(ctx, page);

  m = await checkFrame(ctx, label, 'Analysis');
  seen.push('Analysis');
  ok(m.calc && m.question && m.calc.x >= m.question.right - 2,
     `${label} Analysis: the calculator is to the RIGHT of the question`,
     m.calc && m.question ? `calculator at ${Math.round(m.calc.x)}, question ends at ${Math.round(m.question.right)}` : 'missing');
  ok(m.calc && m.work && m.calc.right <= m.work.right + 1,
     `${label} Analysis: the calculator is inside the middle column, not the right-hand panel`);
  ok(m.calc && m.side && m.calc.right <= m.side.x + 1,
     `${label} Analysis: the calculator does not stray into the Research Journal`);
  ok(m.calc && m.question && Math.abs(m.calc.y - m.question.y) < 2,
     `${label} Analysis: the calculator is top-aligned with the question`,
     m.calc && m.question ? `${Math.round(m.calc.y)} against ${Math.round(m.question.y)}` : '');
  const keys = await ctx.$$eval('.calc-key', k => k.length);
  ok(keys === 20, `${label} Analysis: the calculator has all twenty keys`, `found ${keys}`);
  const keysVisible = await ctx.evaluate(() => {
    const col = document.querySelector('.calc-col');
    const last = document.querySelectorAll('.calc-key')[19];
    if (!col || !last) return false;
    return last.getBoundingClientRect().bottom <= col.getBoundingClientRect().bottom + 1;
  });
  ok(keysVisible, `${label} Analysis: every calculator key is reachable without scrolling`);
  await calcFits(ctx, label, 'Analysis', box ? null : { size: size.w + 'x' + size.h, which: 'analysis' });

  const answers = [['0.4', '0.3'], ['876', '1205'], ['9', '10'], ['76', '77']];
  for (let q = 0; q < 4; q++) {
    const boxes = await ctx.$$('.answer-field input');
    for (let b = 0; b < boxes.length; b++) await boxes[b].fill(answers[q][b]);
    if (q === 3) {
      /* a full journal: every screen after this has eight more entries */
      await checkNoStrayScroll(ctx, label, 'Analysis, Question 4');
    }
    await ctx.click('[data-act="primary"]');
    await popupGo(ctx, page);
  }
  await checkFrame(ctx, label, 'Review');
  seen.push('Review');
  await calcFits(ctx, label, 'Review', null);

  await ctx.click('[data-act="primary"]');
  await popupGo(ctx, page);
  await checkFrame(ctx, label, 'Report, Written');
  seen.push('Report, Written');
  const blanks = await ctx.$$eval('.report-prose .answer-field, .report-prose select', e => e.length);
  ok(blanks >= 8, `${label} Report, Written: every blank is on screen`, `found ${blanks}`);

  await ctx.selectOption('[data-blank="a"]', 'will');
  await ctx.selectOption('[data-blank="e"]', 'wont');
  const numbers = { b: '876', c: '281', d: '76', f: '1205', g: '361', h: '77' };
  for (const id of Object.keys(numbers)) await ctx.fill(`[data-focus-key="blank:${id}"]`, numbers[id]);

  await ctx.click('[data-act="primary"]');
  await popupGo(ctx, page);
  await checkFrame(ctx, label, 'Report, Graph');
  seen.push('Report, Graph');
  const choices = await ctx.$$eval('.choice', c2 => c2.length);
  ok(choices === 3, `${label} Report, Graph: three chart choices`, `found ${choices}`);

  /* Item 5: three cards in one row, in content order, picture / name / radio */
  const cards = await ctx.evaluate(() => Array.from(document.querySelectorAll('.choice')).map(card => {
    const r = card.getBoundingClientRect();
    const pic = card.querySelector('svg, img');
    const name = card.querySelector('.label');
    const radio = card.querySelector('input[type=radio]');
    const b = e => e ? e.getBoundingClientRect() : null;
    return { top: r.top, left: r.left, right: r.right, value: radio ? radio.value : null,
             pic: b(pic), name: b(name), radio: b(radio), parentRight: card.parentElement.getBoundingClientRect().right,
             colRight: card.closest('.work-col').getBoundingClientRect().right };
  }));
  ok(cards.length === 3 && cards.every(k => Math.abs(k.top - cards[0].top) < 1),
     `${label} Report, Graph: the three cards share one top edge (one row, never wrapping)`,
     cards.map(k => Math.round(k.top)).join(', '));
  ok(cards.length === 3 && cards[0].right <= cards[1].left && cards[1].right <= cards[2].left,
     `${label} Report, Graph: the cards run left to right`,
     cards.map(k => Math.round(k.left) + '-' + Math.round(k.right)).join(', '));
  ok(cards.map(k => k.value).join(',') === 'bar,line,pie',
     `${label} Report, Graph: in content order`, cards.map(k => k.value).join(','));
  ok(cards.every(k => k.pic && k.name && k.radio && k.pic.bottom <= k.name.top + 1 &&
                      k.name.bottom <= k.radio.top + 1),
     `${label} Report, Graph: in each card the picture is above the name and the radio below it`,
     JSON.stringify(cards.map(k => [k.pic && Math.round(k.pic.bottom), k.name && Math.round(k.name.top),
                                    k.name && Math.round(k.name.bottom), k.radio && Math.round(k.radio.top)])));
  ok(cards.every(k => k.right <= k.colRight + 1),
     `${label} Report, Graph: the row fits inside the middle column`);
  const chosenBefore = await ctx.$eval('input[value="bar"]', e => e.checked);
  ok(chosenBefore, `${label} Report, Graph: bar is still pre-selected`);

  /* the whole card is the click target: click the name, not the radio */
  await ctx.click('.choice:nth-child(3) .label');
  const pieChosen = await ctx.$eval('input[value="pie"]', e => e.checked);
  ok(pieChosen, `${label} Report, Graph: clicking anywhere on a card chooses it`);

  await ctx.click('[data-act="primary"]');
  await popupGo(ctx, page);
  const grid = { g_mist_coy: '876', g_blue_coy: '1205', g_mist_ill: '281', g_blue_ill: '361' };
  for (const id of Object.keys(grid)) await ctx.fill(`[data-focus-key="grid:${id}"]`, grid[id]);
  await page.waitForTimeout(200);
  await checkFrame(ctx, label, 'Report, Visual');
  seen.push('Report, Visual');
  const slices = await ctx.$$eval('#chart-slot svg path, #chart-slot svg circle', p => p.length);
  ok(slices >= 4, `${label} Report, Visual: the chart is drawn from the figures typed in`,
     `found ${slices} drawn shapes`);

  await ctx.click('[data-act="primary"]');
  await popupGo(ctx, page);
  await page.waitForTimeout(250);
  const casesPaused = await headerShape();
  ok(casesPaused.pausedShown && JSON.stringify(casesPaused.header) === JSON.stringify(running.header),
     `${label} Timer paused: shown under the Cases tutorial too, header unchanged`,
     JSON.stringify(casesPaused));
  await popupGo(ctx, page);                      // the Cases tutorial

  /* Cases 1, 2, 3 and 6 have a right-hand panel; 4 and 5 have none and must
     stretch to exactly where that panel's right edge was. Measured against
     Case 3, not against themselves — comparing a column to its own width
     would agree whatever happened. */
  const withPanel = [1, 2, 3, 6];
  const withCalc = [1, 3, 6];
  let panelRightEdge = null;
  for (let n = 1; n <= 6; n++) {
    const m2 = await checkFrame(ctx, label, 'Case ' + n);
    seen.push('Case ' + n);
    if (withPanel.indexOf(n) !== -1) {
      ok(m2.side && m2.side.w > 60,
         `${label} Case ${n}: has its right-hand panel`,
         m2.side ? Math.round(m2.side.w) + 'px' : 'missing');
      if (n === 3 && m2.side) panelRightEdge = m2.side.right;
    } else {
      ok(m2.side === null,
         `${label} Case ${n}: has no right-hand column at all`,
         m2.side ? 'one was drawn, ' + Math.round(m2.side.w) + 'px wide' : '');
      ok(panelRightEdge !== null && Math.abs(m2.work.right - panelRightEdge) < 3,
         `${label} Case ${n}: the middle column reaches where the right column's edge is on Case 3`,
         `middle ends at ${Math.round(m2.work.right)}, Case 3's panel ended at ${Math.round(panelRightEdge)}`);
      ok(m2.primary && Math.abs(m2.primary.right - m2.work.right) < 6,
         `${label} Case ${n}: the button is still bottom-right of the wider middle column`);
    }
    if (withCalc.indexOf(n) !== -1) {
      await calcFits(ctx, label, 'Case ' + n,
                     (!box && n === 1) ? { size: size.w + 'x' + size.h, which: 'case1' } : null);
    }
    if (n < 6) { await ctx.click('[data-act="primary"]'); await popupGo(ctx, page); }
  }

  await ctx.click('[data-act="primary"]');
  await popupGo(ctx, page);
  await ctx.waitForSelector('.results');
  seen.push('Results');
  const results = await ctx.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('.tile'));
    const phase = tiles.filter(t => !t.classList.contains('tile-total'));
    const total = tiles.find(t => t.classList.contains('tile-total'));
    const rowLeft = phase.length ? phase[0].getBoundingClientRect().left : 0;
    const rowRight = phase.length ? phase[phase.length - 1].getBoundingClientRect().right : 0;
    const t = total ? total.getBoundingClientRect() : null;
    const card = document.querySelector('.standing');
    const cr = card ? card.getBoundingClientRect() : null;
    /* "one line" is measured by comparing the score's own height against the
       height of one line of its own text — a wrapped score is twice as tall. */
    const scoreLines = tiles.map(x => {
      const el = x.querySelector('.tile-score');
      const lh = parseFloat(getComputedStyle(el).lineHeight) ||
                 parseFloat(getComputedStyle(el).fontSize) * 1.2;
      return Math.round(el.getBoundingClientRect().height / lh);
    });
    const band = document.querySelector('.band-cells');
    const marker = document.querySelector('.band-marker');
    return {
      tiles: tiles.length,
      phaseCount: phase.length,
      sameRow: phase.every(x => Math.abs(x.getBoundingClientRect().top -
                                         phase[0].getBoundingClientRect().top) < 2),
      rowLeft, rowRight,
      totalLeft: t ? t.left : 0, totalRight: t ? t.right : 0,
      scoreLines,
      card: cr ? { left: cr.left, right: cr.right, bottom: cr.bottom } : null,
      firstTileTop: phase.length ? phase[0].getBoundingClientRect().top : 0,
      bandInside: band && cr ? band.getBoundingClientRect().right <= cr.right + 1 : false,
      markerInside: marker && band ? (marker.getBoundingClientRect().left >= band.getBoundingClientRect().left - 1 &&
                                      marker.getBoundingClientRect().left <= band.getBoundingClientRect().right + 1) : false,
      overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      openBlocks: Array.from(document.querySelectorAll('.block-body')).map(b => !b.hidden)
    };
  });
  ok(results.phaseCount === 4 && results.sameRow,
     `${label} Results: the four phase tiles sit in one row`,
     `${results.phaseCount} tiles, same row: ${results.sameRow}`);
  ok(Math.abs(results.rowLeft - results.totalLeft) < 2 &&
     Math.abs(results.rowRight - results.totalRight) < 2,
     `${label} Results: that row is exactly as wide as the Total tile beneath it`,
     `row ${Math.round(results.rowLeft)}–${Math.round(results.rowRight)}, ` +
     `total ${Math.round(results.totalLeft)}–${Math.round(results.totalRight)}`);
  ok(results.scoreLines.every(n => n === 1),
     `${label} Results: every score is on one line, none wrapped`,
     'lines per score: ' + results.scoreLines.join(', '));
  ok(results.tiles === 5, `${label} Results: four phase tiles and a total`, `found ${results.tiles}`);
  ok(results.card && results.card.bottom <= results.firstTileTop &&
     Math.abs(results.card.left - results.totalLeft) < 2 && Math.abs(results.card.right - results.totalRight) < 2,
     `${label} Results: the "Where you stand" card sits above the tiles, as wide as them`,
     JSON.stringify(results.card));
  ok(results.bandInside && results.markerInside,
     `${label} Results: the decile band and its marker fit inside the card`);
  ok(results.overflow, `${label} Results: the page does not scroll sideways`);
  ok(results.openBlocks[0] === true && results.openBlocks.slice(1).every(o => o === false),
     `${label} Results: Investigation is open on arrival and the rest are folded away`,
     JSON.stringify(results.openBlocks));

  ok(pageErrors.length === 0, `${label} no JavaScript errors anywhere in the run`,
     pageErrors.join(' | '));

  await browser.close();
  return seen;
}

/* Item 1, swept: login and start at every size in a grid from 900 x 540 up. */
async function sweepGrid() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 540 } });
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-form');
  let measured = 0;
  const sizes = [];
  for (const w of GRID_W) for (const h of GRID_H) sizes.push([w, h]);
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(40);
    await checkCentre(page, `[grid ${w}x${h}]`, 'Login', false);
    measured++;
  }
  await page.fill('#login-user', USER);
  await page.fill('#login-pass', PASS);
  await page.click('#login-form button[type=submit]');
  await page.waitForSelector('[data-act="start"]');
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(40);
    await checkCentre(page, `[grid ${w}x${h}]`, 'Start', true);
    measured++;
  }
  await browser.close();
  return measured;
}

(async () => {
  const EXPECTED_SCREENS = 13;   // Investigation, Analysis, Review, 3 Report, 6 Cases, Results
  let screensSeen = 0;
  const runs = SIZES.map(s => ({ size: s, box: null })).concat(
    BOXES.map(b => ({ size: { w: b.w, h: b.h }, box: b })));

  for (const r of runs) {
    const seen = await run(r.size, r.box);
    screensSeen += seen.length;
    const name = r.box ? r.box.name : `${r.size.w}x${r.size.h}`;
    if (seen.length !== EXPECTED_SCREENS) {
      failures.push(`[${name}] only ${seen.length} of ${EXPECTED_SCREENS} screens were reached`);
    }
    process.stdout.write(`  ${name}: ${seen.length} screens\n`);
  }
  const gridMeasured = await sweepGrid();
  process.stdout.write(`  login and start swept at ${gridMeasured / 2} more window sizes\n`);

  console.log('');
  console.log('window sizes      : ' + SIZES.length + ' plain, ' + BOXES.length + ' lesson iframes, ' +
              (gridMeasured / 2) + ' in the login/start sweep');
  console.log('screens measured  : ' + screensSeen);
  console.log('measurements made : ' + checks);

  /* A run that measured nothing is a failure, not a pass. */
  if (checks < runs.length * 150 || screensSeen < runs.length * EXPECTED_SCREENS ||
      gridMeasured < GRID_W.length * GRID_H.length * 2) {
    console.log('');
    console.log('RESULT: FAILED — this run did not measure enough to mean anything.');
    process.exit(1);
  }

  if (failures.length) {
    console.log('');
    console.log('FAILURES (' + failures.length + '):');
    failures.forEach(f => console.log('  ✗ ' + f));
    console.log('');
    console.log('RESULT: FAILED');
    process.exit(1);
  }
  console.log('');
  console.log('RESULT: PASSED — every position held at every size.');
})();
