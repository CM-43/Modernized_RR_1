/* ==========================================================================
   layout-check.js — DOES EVERYTHING SIT WHERE IT IS SUPPOSED TO?

   Run from a terminal, not by a candidate. Never served.

       node reference/layout-check.js http://localhost:8000

   It plays the simulation through in a headless browser at several window
   sizes and, on every screen, measures the things Rule Zero fixes:

     · the phase tabs are the leftmost column, and Restart is at the bottom
       of that column;
     · the Research Journal (or the calculator, or the empty track) is the
       rightmost column, and it fits inside the playing area;
     · the primary button is in the bottom-right of the middle column;
     · on the Analysis screen the calculator is to the RIGHT of the question
       and inside the middle column;
     · nothing overflows sideways.

   Two rules this file follows, both learned the hard way on the previous
   project:

   1. A CHECK THAT MEASURES NOTHING FAILS. Every screen must produce at least
      one measurement, and the run must cover every screen. A pass reported
      over zero items is a failure.

   2. ASK WHAT THE MEASUREMENT WOULD SAY IF THE FAULT WERE PRESENT. Widths
      are compared against the PLAYING AREA, not against the element's own
      column — comparing a thing to itself always agrees and can never reveal
      anything. The journal being cut off at 900px was invisible to every
      check until it was measured against the box it sits in.
   ========================================================================== */
'use strict';

const { chromium } = require('playwright');

const BASE = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');
const SIZES = [
  { w: 1920, h: 1080 }, { w: 1440, h: 900 }, { w: 1402, h: 789 },
  { w: 1180, h: 700 }, { w: 1024, h: 640 }, { w: 900, h: 540 }
];

const USER = 'CaseMentor9187';
const PASS = 'change-me-before-launch';

let checks = 0;
const failures = [];

function ok(condition, description, detail) {
  checks++;
  if (!condition) failures.push(description + (detail ? '  — ' + detail : ''));
}

async function measure(page) {
  return page.evaluate(() => {
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

async function checkFrame(page, size, screen) {
  const m = await measure(page);

  ok(m.doc.scrollW <= m.doc.clientW + 1,
     `[${size.w}x${size.h}] ${screen}: the page must not scroll sideways`,
     `page is ${m.doc.scrollW}px wide in a ${m.doc.clientW}px window`);

  ok(m.mainBox && m.columns && m.columns.w <= m.mainBox.w + 1,
     `[${size.w}x${size.h}] ${screen}: the three columns must fit inside the playing area`,
     m.columns && m.mainBox ? `columns ${Math.round(m.columns.w)}px inside a ${Math.round(m.mainBox.w)}px box` : 'missing');

  ok(m.nav && m.work && m.nav.right <= m.work.x + 1,
     `[${size.w}x${size.h}] ${screen}: the phase tabs are the leftmost column`);

  /* A case with neither a calculator nor a journal has NO right column and
     the middle takes its width (rule 2.5 v1.1). Every other screen has one. */
  if (m.side) {
    ok(m.work && m.work.right <= m.side.x + 1,
       `[${size.w}x${size.h}] ${screen}: the right-hand panel is to the right of the working area`);
    ok(m.mainBox && m.side.right <= m.mainBox.right + 1,
       `[${size.w}x${size.h}] ${screen}: the right-hand panel is not cut off by the edge of the playing area`,
       `panel ends at ${Math.round(m.side.right)}, box ends at ${Math.round(m.mainBox.right)}`);
  } else {
    ok(m.work && m.columns && m.work.right >= m.columns.right - 20,
       `[${size.w}x${size.h}] ${screen}: with no right-hand panel the middle column takes its width`,
       `middle ends at ${Math.round(m.work.right)}, the row ends at ${Math.round(m.columns.right)}`);
  }

  ok(m.restart && m.nav && m.restart.bottom <= m.nav.bottom + 1 &&
     m.restart.y > m.nav.y + m.nav.h / 2,
     `[${size.w}x${size.h}] ${screen}: Restart is at the bottom of the tab column`);

  ok(m.timeText && m.header &&
     Math.abs((m.timeText.x + m.timeText.w / 2) - (m.header.x + m.header.w / 2)) < m.header.w * 0.18,
     `[${size.w}x${size.h}] ${screen}: the clock is in the middle of the header bar`);

  if (m.primary) {
    ok(Math.abs(m.primary.right - m.work.right) < 6,
       `[${size.w}x${size.h}] ${screen}: the primary button is at the RIGHT of the middle column`,
       `button right ${Math.round(m.primary.right)}, column right ${Math.round(m.work.right)}`);
    ok(m.primary.bottom <= m.work.bottom + 1 && m.primary.y > m.work.y + m.work.h * 0.5,
       `[${size.w}x${size.h}] ${screen}: the primary button is at the BOTTOM of the middle column`);
    ok(m.primary.w >= 90 && m.primary.h >= 28,
       `[${size.w}x${size.h}] ${screen}: the primary button is big enough to hit`,
       `${Math.round(m.primary.w)}x${Math.round(m.primary.h)}`);
  }
  return m;
}

async function popupGo(page) {
  await page.click('[data-act="popup-go"]');
  await page.waitForTimeout(120);
}

async function run(size) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('#login-user', USER);
  await page.fill('#login-pass', PASS);
  await page.click('#login-form button[type=submit]');
  await page.waitForSelector('[data-act="start"]');
  await page.click('[data-act="start"]');
  await page.waitForSelector('.section');

  const seen = [];

  let m = await checkFrame(page, size, 'Investigation');
  seen.push('Investigation');
  ok(m.chips >= 40, `[${size.w}x${size.h}] Investigation: the draggable pieces of information are on screen`,
     `found ${m.chips}, expected at least 40`);
  ok(m.journal !== null, `[${size.w}x${size.h}] Investigation: the Research Journal panel is present`);

  await page.click('[data-act="primary"]');
  /* WAIT FOR THE ENTRANCE ANIMATION TO FINISH BEFORE MEASURING.

     The popup rises into place over 160ms starting at scale(0.985), so a
     measurement taken too early reports 591 x 213 for a popup that is
     actually 600 x 216 — and 591 is not a wrong number, it is the right
     number at the wrong moment. The previous project lost time to exactly
     this, and the dangerous version of it is the one where the animated
     figure happens to match and hides a real difference. */
  await page.waitForTimeout(400);
  const modal = await page.evaluate(() => {
    const el = document.querySelector('.modal');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  ok(modal && modal.h === 216, `[${size.w}x${size.h}] every popup is the same fixed height`,
     modal ? modal.w + 'x' + modal.h : 'no popup');
  await popupGo(page);
  await popupGo(page);                      // the Analysis tutorial

  m = await checkFrame(page, size, 'Analysis');
  seen.push('Analysis');
  ok(m.calc && m.question && m.calc.x >= m.question.right - 2,
     `[${size.w}x${size.h}] Analysis: the calculator is to the RIGHT of the question`,
     m.calc && m.question ? `calculator at ${Math.round(m.calc.x)}, question ends at ${Math.round(m.question.right)}` : 'missing');
  ok(m.calc && m.work && m.calc.right <= m.work.right + 1,
     `[${size.w}x${size.h}] Analysis: the calculator is inside the middle column, not the right-hand panel`);
  ok(m.calc && m.side && m.calc.right <= m.side.x + 1,
     `[${size.w}x${size.h}] Analysis: the calculator does not stray into the Research Journal`);
  const keys = await page.$$eval('.calc-key', k => k.length);
  ok(keys === 20, `[${size.w}x${size.h}] Analysis: the calculator has all twenty keys`, `found ${keys}`);
  const keysVisible = await page.evaluate(() => {
    const col = document.querySelector('.calc-col');
    const last = document.querySelectorAll('.calc-key')[19];
    if (!col || !last) return false;
    return last.getBoundingClientRect().bottom <= col.getBoundingClientRect().bottom + 1;
  });
  ok(keysVisible, `[${size.w}x${size.h}] Analysis: every calculator key is reachable without scrolling`);

  const answers = [['0.4', '0.3'], ['876', '1205'], ['9', '10'], ['76', '77']];
  for (let q = 0; q < 4; q++) {
    const boxes = await page.$$('.answer-field input');
    for (let b = 0; b < boxes.length; b++) await boxes[b].fill(answers[q][b]);
    await page.click('[data-act="primary"]');
    await popupGo(page);
  }
  await checkFrame(page, size, 'Review');
  seen.push('Review');

  await page.click('[data-act="primary"]');
  await popupGo(page);
  await checkFrame(page, size, 'Report — Written');
  seen.push('Report — Written');
  const blanks = await page.$$eval('.report-prose .answer-field, .report-prose select', e => e.length);
  ok(blanks >= 8, `[${size.w}x${size.h}] Report — Written: every blank is on screen`, `found ${blanks}`);

  await page.selectOption('[data-blank="a"]', 'will');
  await page.selectOption('[data-blank="e"]', 'wont');
  const numbers = { b: '876', c: '281', d: '76', f: '1205', g: '361', h: '77' };
  for (const id of Object.keys(numbers)) await page.fill(`[data-focus-key="blank:${id}"]`, numbers[id]);

  await page.click('[data-act="primary"]');
  await popupGo(page);
  await checkFrame(page, size, 'Report — Graph');
  seen.push('Report — Graph');
  const choices = await page.$$eval('.choice', c => c.length);
  ok(choices === 3, `[${size.w}x${size.h}] Report — Graph: three chart choices`, `found ${choices}`);
  await page.click('input[value="pie"]');

  await page.click('[data-act="primary"]');
  await popupGo(page);
  const grid = { g_mist_coy: '876', g_blue_coy: '1205', g_mist_ill: '281', g_blue_ill: '361' };
  for (const id of Object.keys(grid)) await page.fill(`[data-focus-key="grid:${id}"]`, grid[id]);
  await page.waitForTimeout(200);
  await checkFrame(page, size, 'Report — Visual');
  seen.push('Report — Visual');
  const slices = await page.$$eval('#chart-slot svg path, #chart-slot svg circle', p => p.length);
  ok(slices >= 4, `[${size.w}x${size.h}] Report — Visual: the chart is drawn from the figures typed in`,
     `found ${slices} drawn shapes`);

  await page.click('[data-act="primary"]');
  await popupGo(page);
  await popupGo(page);                      // the Cases tutorial

  /* Cases 1, 2, 3 and 6 have a right-hand panel; 4 and 5 have none and must
     stretch to exactly where that panel's right edge was. Measured against
     Case 3, not against themselves — comparing a column to its own width
     would agree whatever happened. */
  const withPanel = [1, 2, 3, 6], stretched = [4, 5];
  let panelRightEdge = null;
  for (let n = 1; n <= 6; n++) {
    const m2 = await checkFrame(page, size, 'Case ' + n);
    seen.push('Case ' + n);
    if (withPanel.indexOf(n) !== -1) {
      ok(m2.side && m2.side.w > 60,
         `[${size.w}x${size.h}] Case ${n}: has its right-hand panel`,
         m2.side ? Math.round(m2.side.w) + 'px' : 'missing');
      if (n === 3 && m2.side) panelRightEdge = m2.side.right;
    } else {
      ok(m2.side === null,
         `[${size.w}x${size.h}] Case ${n}: has no right-hand column at all`,
         m2.side ? 'one was drawn, ' + Math.round(m2.side.w) + 'px wide' : '');
      ok(panelRightEdge !== null && Math.abs(m2.work.right - panelRightEdge) < 3,
         `[${size.w}x${size.h}] Case ${n}: the middle column reaches where the right column's edge is on Case 3`,
         `middle ends at ${Math.round(m2.work.right)}, Case 3's panel ended at ${Math.round(panelRightEdge)}`);
      ok(m2.primary && Math.abs(m2.primary.right - m2.work.right) < 6,
         `[${size.w}x${size.h}] Case ${n}: the button is still bottom-right of the wider middle column`);
    }
    if (n < 6) { await page.click('[data-act="primary"]'); await popupGo(page); }
  }

  await page.click('[data-act="primary"]');
  await popupGo(page);
  await page.waitForSelector('.results');
  seen.push('Results');
  const results = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('.tile'));
    const phase = tiles.filter(t => !t.classList.contains('tile-total'));
    const total = tiles.find(t => t.classList.contains('tile-total'));
    const rowLeft = phase.length ? phase[0].getBoundingClientRect().left : 0;
    const rowRight = phase.length ? phase[phase.length - 1].getBoundingClientRect().right : 0;
    const t = total ? total.getBoundingClientRect() : null;
    /* "one line" is measured by comparing the score's own height against the
       height of one line of its own text — a wrapped score is twice as tall. */
    const scoreLines = tiles.map(x => {
      const el = x.querySelector('.tile-score');
      const lh = parseFloat(getComputedStyle(el).lineHeight) ||
                 parseFloat(getComputedStyle(el).fontSize) * 1.2;
      return Math.round(el.getBoundingClientRect().height / lh);
    });
    return {
      tiles: tiles.length,
      phaseCount: phase.length,
      sameRow: phase.every(x => Math.abs(x.getBoundingClientRect().top -
                                         phase[0].getBoundingClientRect().top) < 2),
      rowLeft, rowRight,
      totalLeft: t ? t.left : 0, totalRight: t ? t.right : 0,
      scoreLines,
      overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      openBlocks: Array.from(document.querySelectorAll('.block-body')).map(b => !b.hidden)
    };
  });
  ok(results.phaseCount === 4 && results.sameRow,
     `[${size.w}x${size.h}] Results: the four phase tiles sit in one row`,
     `${results.phaseCount} tiles, same row: ${results.sameRow}`);
  ok(Math.abs(results.rowLeft - results.totalLeft) < 2 &&
     Math.abs(results.rowRight - results.totalRight) < 2,
     `[${size.w}x${size.h}] Results: that row is exactly as wide as the Total tile beneath it`,
     `row ${Math.round(results.rowLeft)}–${Math.round(results.rowRight)}, ` +
     `total ${Math.round(results.totalLeft)}–${Math.round(results.totalRight)}`);
  ok(results.scoreLines.every(n => n === 1),
     `[${size.w}x${size.h}] Results: every score is on one line, none wrapped`,
     'lines per score: ' + results.scoreLines.join(', '));
  ok(results.tiles === 5, `[${size.w}x${size.h}] Results: four phase tiles and a total`, `found ${results.tiles}`);
  ok(results.overflow, `[${size.w}x${size.h}] Results: the page does not scroll sideways`);
  ok(results.openBlocks[0] === true && results.openBlocks.slice(1).every(o => o === false),
     `[${size.w}x${size.h}] Results: Investigation is open on arrival and the rest are folded away`,
     JSON.stringify(results.openBlocks));

  ok(pageErrors.length === 0, `[${size.w}x${size.h}] no JavaScript errors anywhere in the run`,
     pageErrors.join(' | '));

  await browser.close();
  return seen;
}

(async () => {
  const EXPECTED_SCREENS = 13;   // Investigation, Analysis, Review, 3 Report, 6 Cases, Results
  let screensSeen = 0;

  for (const size of SIZES) {
    const seen = await run(size);
    screensSeen += seen.length;
    if (seen.length !== EXPECTED_SCREENS) {
      failures.push(`[${size.w}x${size.h}] only ${seen.length} of ${EXPECTED_SCREENS} screens were reached`);
    }
    process.stdout.write(`  ${size.w}x${size.h}: ${seen.length} screens\n`);
  }

  console.log('');
  console.log('window sizes      : ' + SIZES.length);
  console.log('screens measured  : ' + screensSeen);
  console.log('measurements made : ' + checks);

  /* A run that measured nothing is a failure, not a pass. */
  if (checks < SIZES.length * 40 || screensSeen < SIZES.length * EXPECTED_SCREENS) {
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
