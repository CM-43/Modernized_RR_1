/* ==========================================================================
   play-key.js — PLAY THE ANSWER KEY THROUGH THE REAL INTERFACE

       node reference/play-key.js http://localhost:8000

   This is the check that matters most, and it is deliberately not a test of
   the rules engine. The engine is already proved twice over — by tests.html
   and by the differential test against reference/mark.py. What this proves is
   something different and much easier to get wrong: that a candidate who
   knows every right answer, and gives it using the mouse and the keyboard on
   the actual screens, is actually awarded them.

   Every one of the 29 pieces of information is DRAGGED into the Research
   Journal. Every number is TYPED into its box. Every choice is CLICKED.
   Nothing is written into the page's memory behind the interface's back —
   that would prove the engine again and the screens not at all.

   The pass is 29 / 29, 8 / 8, 13 / 13, 6 / 6 and 56 / 56.

   v1.2: the percentile is READ OFF THE SCREEN too, from the "Where you
   stand" card: the key must show the 99th, the run of mistakes the 62nd
   (weighted 75.5), and the return-visit run the 98th (weighted 98.7).

   It also plays a deliberately wrong run afterwards, because a marker that
   awards everything is not yet known to be a marker.
   ========================================================================== */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');
const ROOT = path.join(__dirname, '..');
const USER = 'CaseMentor9187';
const PASS = 'change-me-before-launch';

const load = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rr6', name + '.json'), 'utf8'));
const investigation = load('investigation');
const analysis = load('analysis');
const report = load('report');
const cases = load('cases');

const failures = [];
let checks = 0;
function ok(condition, what, detail) {
  checks++;
  if (!condition) failures.push(what + (detail ? '  — ' + detail : ''));
}

async function popupGo(page) {
  await page.click('[data-act="popup-go"]');
  await page.waitForTimeout(110);
}

async function dragItem(page, id) {
  const chip = page.locator(`.chip[data-drag*='"${id}"']`).first();
  await chip.scrollIntoViewIfNeeded();
  await chip.dragTo(page.locator('.journal-list'));
  await page.waitForTimeout(90);
}

async function login(page) {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('#login-user', USER);
  await page.fill('#login-pass', PASS);
  await page.click('#login-form button[type=submit]');
  await page.waitForSelector('[data-act="start"]');
  await page.click('[data-act="start"]');
  await page.waitForSelector('.section');
}

async function tiles(page) {
  return page.$$eval('.tile', ts => ts.map(t => {
    const name = t.querySelector('.tile-name').textContent.trim();
    const score = t.querySelector('.tile-score').textContent.trim();
    return [name, score];
  }));
}

/* What the "Where you stand" card says, exactly as drawn. */
async function standing(page) {
  return page.evaluate(() => {
    const txt = sel => { const e = document.querySelector(sel); return e ? e.textContent.trim() : null; };
    const sentence = txt('.standing-sentence') || '';
    const w = /weighted score of ([\d.]+) \/ 100/.exec(sentence);
    return { percentile: (txt('.standing-number') || '') + (txt('.standing-ordinal') || ''),
             weighted: w ? w[1] : null, pill: txt('.standing-pill'), marker: txt('.marker-label') };
  });
}

/* ---------------------------------------------------------------- the key */

async function playTheKey(page) {
  const required = Object.keys(investigation.items).filter(id => investigation.items[id].required);

  for (const id of required) await dragItem(page, id);

  const collected = await page.$$eval('.journal-item', a => a.length);
  ok(collected === required.length,
     'every required piece of information was actually dragged into the journal',
     `${collected} entries for ${required.length} required items`);

  await page.click('[data-act="primary"]');
  await popupGo(page);            // move to Analysis
  await popupGo(page);            // the tutorial

  for (const q of analysis.questions) {
    const boxes = await page.$$('.answer-field input');
    ok(boxes.length === q.boxes.length,
       `Question ${q.number} shows all ${q.boxes.length} of its answer boxes`,
       `found ${boxes.length}`);
    for (let b = 0; b < q.boxes.length; b++) await boxes[b].fill(String(q.boxes[b].answer));
    await page.click('[data-act="primary"]');
    await popupGo(page);
  }

  await page.click('[data-act="primary"]');   // Conclude
  await popupGo(page);

  for (const id of Object.keys(report.written.blanks)) {
    const blank = report.written.blanks[id];
    if (blank.kind === 'dropdown') await page.selectOption(`[data-blank="${id}"]`, blank.answer);
    else await page.fill(`[data-focus-key="blank:${id}"]`, String(blank.answer));
  }
  await page.click('[data-act="primary"]');
  await popupGo(page);

  await page.click(`input[value="${report.chart.answer}"]`);
  await page.click('[data-act="primary"]');
  await popupGo(page);

  for (const row of report.grid.cells) {
    for (const cell of row) {
      if (cell.id) await page.fill(`[data-focus-key="grid:${cell.id}"]`, String(cell.answer));
    }
  }
  await page.click('[data-act="primary"]');
  await popupGo(page);
  await popupGo(page);            // the cases tutorial

  for (const c of cases.cases) {
    if (c.mechanism === 'choose_one') {
      await page.click(`.choice input[value="${c.answer}"]`);
    } else if (c.mechanism === 'choose_many') {
      for (const id of c.answer) await page.click(`.choice input[value="${id}"]`);
    } else if (c.mechanism === 'dropdowns') {
      for (const d of c.dropdowns) await page.selectOption(`[data-case-drop="${d.id}"]`, d.answer);
    } else if (c.mechanism === 'number' || c.mechanism === 'numbers') {
      const boxes = await page.$$('.answer-field input');
      ok(boxes.length === c.boxes.length,
         `Case ${c.number} shows all ${c.boxes.length} of its answer boxes`,
         `found ${boxes.length}`);
      for (let b = 0; b < c.boxes.length; b++) await boxes[b].fill(String(c.boxes[b].answer));
    } else if (c.mechanism === 'collect') {
      const wanted = Object.keys(c.items).filter(id => c.items[id].required);
      for (const id of wanted) await dragItem(page, id);
      const n = await page.$$eval('.journal-item', a => a.length);
      ok(n === wanted.length, `Case ${c.number}: all ${wanted.length} pieces were dragged in`,
         `found ${n}`);
    }
    await page.click('[data-act="primary"]');
    await popupGo(page);
  }

  await page.waitForSelector('.results');
  return { marks: await tiles(page), standing: await standing(page) };
}

/* ------------------------------------------------------- a run of mistakes */

async function playWrong(page) {
  const required = Object.keys(investigation.items).filter(id => investigation.items[id].required);
  const optional = Object.keys(investigation.items).filter(id => !investigation.items[id].required);

  /* one required item left behind, and two collected that were not needed */
  for (const id of required.slice(1)) await dragItem(page, id);
  await dragItem(page, optional[0]);
  await dragItem(page, optional[1]);

  await page.click('[data-act="primary"]');
  await popupGo(page);
  await popupGo(page);

  /* Question 1 Mistveil: 0.45 rounds to 0.5, so it is wrong. Everything else
     on this question is right. */
  let first = true;
  for (const q of analysis.questions) {
    const boxes = await page.$$('.answer-field input');
    for (let b = 0; b < q.boxes.length; b++) {
      const value = (first && b === 0) ? '0.45' : String(q.boxes[b].answer);
      await boxes[b].fill(value);
    }
    first = false;
    await page.click('[data-act="primary"]');
    await popupGo(page);
  }

  await page.click('[data-act="primary"]');
  await popupGo(page);

  /* blank c left empty; blank g given the other accepted figure (375) */
  for (const id of Object.keys(report.written.blanks)) {
    const blank = report.written.blanks[id];
    if (blank.kind === 'dropdown') await page.selectOption(`[data-blank="${id}"]`, blank.answer);
    else if (id === 'c') { /* left empty on purpose */ }
    else if (id === 'g') await page.fill(`[data-focus-key="blank:${id}"]`, '375');
    else await page.fill(`[data-focus-key="blank:${id}"]`, String(blank.answer));
  }
  await page.click('[data-act="primary"]');
  await popupGo(page);

  /* the chart choice is left at its default, which is not the answer */
  await page.click('[data-act="primary"]');
  await popupGo(page);

  for (const row of report.grid.cells) {
    for (const cell of row) {
      if (cell.id) await page.fill(`[data-focus-key="grid:${cell.id}"]`, String(cell.answer));
    }
  }
  await page.click('[data-act="primary"]');
  await popupGo(page);
  await popupGo(page);

  for (const c of cases.cases) {
    if (c.mechanism === 'choose_one') {
      const wrong = Object.keys(c.options).filter(o => o !== c.answer)[0];
      await page.click(`.choice input[value="${wrong}"]`);
    } else if (c.mechanism === 'choose_many') {
      /* the right one plus one more: all-or-nothing, so this scores zero */
      const extra = Object.keys(c.options).filter(o => c.answer.indexOf(o) === -1)[0];
      for (const id of c.answer) await page.click(`.choice input[value="${id}"]`);
      await page.click(`.choice input[value="${extra}"]`);
    } else if (c.mechanism === 'dropdowns') {
      for (const d of c.dropdowns) await page.selectOption(`[data-case-drop="${d.id}"]`, d.answer);
    } else if (c.mechanism === 'number' || c.mechanism === 'numbers') {
      const boxes = await page.$$('.answer-field input');
      for (let b = 0; b < c.boxes.length; b++) {
        /* the last box of the last case is wrong; a case is one mark, so the
           whole case must go */
        await boxes[b].fill(b === c.boxes.length - 1 && c.number === 6
                            ? '99' : String(c.boxes[b].answer));
      }
    } else if (c.mechanism === 'collect') {
      const wanted = Object.keys(c.items).filter(id => c.items[id].required);
      for (const id of wanted.slice(1)) await dragItem(page, id);   // one short
    }
    await page.click('[data-act="primary"]');
    await popupGo(page);
  }

  await page.waitForSelector('.results');
  const marks = await tiles(page);
  const wrongRows = await page.$$eval('.mark-row.is-wrong', r => r.length);
  const reasons = await page.$$eval('.mark-row.is-wrong .mark-reason', r => r.length);
  return { marks, wrongRows, reasons, standing: await standing(page) };
}

/* ------------------------------------------ going back for three items ---
   R-D37: an item fetched on a RETURN visit to the Investigation is worth
   `return_visit_weight` of a mark instead of a whole one. This plays a run
   that collects 26 of the 29 first time, goes into the Analysis, comes back
   through the Investigation tab for the other three, and then finishes. The
   expected Investigation score is 26 + 3 × 0.5 = 27.5 out of 29. */

async function playWithAReturnVisit(page) {
  const required = Object.keys(investigation.items).filter(id => investigation.items[id].required);
  const fetchedLater = required.slice(0, 3);
  const firstPass = required.slice(3);

  for (const id of firstPass) await dragItem(page, id);

  await page.click('[data-act="primary"]');
  await popupGo(page);            // the first time the Investigation is left
  await popupGo(page);            // the tutorial

  /* Back through the Investigation tab, exactly as a candidate would. */
  await page.click('[data-act="go-investigation"]');
  await page.waitForSelector('.section');
  for (const id of fetchedLater) await dragItem(page, id);
  const total = await page.$$eval('.journal-item', a => a.length);
  ok(total === required.length,
     'all 29 are in the journal after going back for the last three',
     `${total} entries`);

  /* Return to the Analysis and play the rest of the key. */
  await page.click('[data-act="go-analysis"]');
  await page.waitForTimeout(150);

  for (const q of analysis.questions) {
    const boxes = await page.$$('.answer-field input');
    for (let b = 0; b < q.boxes.length; b++) await boxes[b].fill(String(q.boxes[b].answer));
    await page.click('[data-act="primary"]');
    await popupGo(page);
  }
  await page.click('[data-act="primary"]');
  await popupGo(page);

  for (const id of Object.keys(report.written.blanks)) {
    const blank = report.written.blanks[id];
    if (blank.kind === 'dropdown') await page.selectOption(`[data-blank="${id}"]`, blank.answer);
    else await page.fill(`[data-focus-key="blank:${id}"]`, String(blank.answer));
  }
  await page.click('[data-act="primary"]');
  await popupGo(page);
  await page.click(`input[value="${report.chart.answer}"]`);
  await page.click('[data-act="primary"]');
  await popupGo(page);
  for (const row of report.grid.cells) {
    for (const cell of row) {
      if (cell.id) await page.fill(`[data-focus-key="grid:${cell.id}"]`, String(cell.answer));
    }
  }
  await page.click('[data-act="primary"]');
  await popupGo(page);
  await popupGo(page);

  for (const c of cases.cases) {
    if (c.mechanism === 'choose_one') {
      await page.click(`.choice input[value="${c.answer}"]`);
    } else if (c.mechanism === 'choose_many') {
      for (const id of c.answer) await page.click(`.choice input[value="${id}"]`);
    } else if (c.mechanism === 'dropdowns') {
      for (const d of c.dropdowns) await page.selectOption(`[data-case-drop="${d.id}"]`, d.answer);
    } else if (c.mechanism === 'number' || c.mechanism === 'numbers') {
      const boxes = await page.$$('.answer-field input');
      for (let b = 0; b < c.boxes.length; b++) await boxes[b].fill(String(c.boxes[b].answer));
    } else if (c.mechanism === 'collect') {
      for (const id of Object.keys(c.items).filter(i => c.items[i].required)) await dragItem(page, id);
    }
    await page.click('[data-act="primary"]');
    await popupGo(page);
  }

  await page.waitForSelector('.results');
  const marks = await tiles(page);
  /* Scoped to the Investigation block. A collect CASE also draws a
     three-way list, and counting those as well would have made this check
     report seven groups where four were asked for — a selector that matches
     more than the thing being measured is not a measurement. */
  /* v1.2: the first .block, found by class rather than by position among
     <section> elements. The "Where you stand" card is a <section> too, so
     `.block:nth-of-type(1)` stopped meaning the Investigation block and
     matched nothing, which this check correctly reported as a failure. */
  const groups = await page.evaluate(() => Array.from(
    document.querySelectorAll('.block')[0].querySelectorAll('.collect-lists > div h3'))
    .map(h => h.textContent.trim()));
  const tags = await page.evaluate(() => Array.from(
    document.querySelectorAll('.block')[0].querySelectorAll('.col-return .earned-tag'))
    .map(x => x.textContent.trim()));
  const csvColumn = await page.evaluate(() => {
    const head = document.querySelector('.results-actions');
    return !!head;
  });
  return { marks, groups, tags, csvColumn, standing: await standing(page) };
}

/* ------------------------------------------------------------------------ */

(async () => {
  const browser = await chromium.launch();

  const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await login(page);
  const keyRun = await playTheKey(page);
  const keyMarks = keyRun.marks;
  console.log('The answer key, played through the interface:');
  keyMarks.forEach(([name, score]) => console.log('  ' + name.padEnd(16) + score));
  console.log('  ' + 'Where you stand'.padEnd(16) + keyRun.standing.percentile + ' percentile, weighted ' +
              keyRun.standing.weighted + ' / 100  (' + keyRun.standing.pill + ')');
  ok(keyRun.standing.percentile === '99th', 'the key shows the 99th percentile on the results screen',
     `shows ${keyRun.standing.percentile}`);
  ok(keyRun.standing.weighted === '100', 'with a weighted score of 100', `shows ${keyRun.standing.weighted}`);
  ok(keyRun.standing.marker === 'You · 99th', 'and the band\'s marker says the same', keyRun.standing.marker);

  const expected = { Investigation: '29 / 29', Analysis: '8 / 8', Report: '13 / 13',
                     Cases: '6 / 6', Total: '56 / 56' };
  for (const [name, score] of keyMarks) {
    ok(expected[name] === score, `${name} marks ${expected[name]} when the key is played through`,
       `got ${score}`);
  }
  ok(keyMarks.length === 5, 'all five score tiles are shown', `found ${keyMarks.length}`);

  const wrongPage = await browser.newPage({ viewport: { width: 1402, height: 789 } });
  wrongPage.on('pageerror', e => errors.push(e.message));
  await login(wrongPage);
  const wrong = await playWrong(wrongPage);
  console.log('');
  console.log('A run with deliberate mistakes:');
  wrong.marks.forEach(([name, score]) => console.log('  ' + name.padEnd(16) + score));
  console.log('  ' + 'Where you stand'.padEnd(16) + wrong.standing.percentile + ' percentile, weighted ' +
              wrong.standing.weighted + ' / 100  (' + wrong.standing.pill + ')');
  console.log('  wrong answers shown: ' + wrong.wrongRows +
              ', each with its worked explanation: ' + wrong.reasons);
  /* 25 x (28/29 + 7/8 + 11/13 + 2/6) = 75.5; the table has 74 -> 60 and
     79 -> 68, so 60 + 1.5/5 x 8 = 62.4, rounded to 62. */
  ok(wrong.standing.weighted === '75.5', 'the run of mistakes shows a weighted score of 75.5',
     `shows ${wrong.standing.weighted}`);
  ok(wrong.standing.percentile === '62nd', 'and the 62nd percentile', `shows ${wrong.standing.percentile}`);

  /* Worked out by hand from the mistakes made above, so that this is a
     prediction the product has to meet rather than a note of what it did:

       Investigation  one required item left behind          28 of 29
       Analysis       Question 1 Mistveil given 0.45,
                      which rounds to 0.5                     7 of 8
       Report         blank c left empty, and the chart left
                      at its pre-selected default            11 of 13
       Cases          1 wrong option            ✗
                      2 one piece short         ✗
                      3 right                   ✓
                      4 right                   ✓
                      5 the right one plus one more, and a
                        multi-select is all-or-nothing  ✗
                      6 one box wrong, and a case is one
                        mark however many boxes it has  ✗     2 of 6
       Total          28 + 7 + 11 + 2                        48 of 56          */
  const expectedWrong = { Investigation: '28 / 29', Analysis: '7 / 8', Report: '11 / 13',
                          Cases: '2 / 6', Total: '48 / 56' };
  for (const [name, score] of wrong.marks) {
    ok(expectedWrong[name] === score,
       `${name} marks ${expectedWrong[name]} on the run of deliberate mistakes`, `got ${score}`);
  }
  /* A marker that awards everything is not a marker. */
  ok(wrong.wrongRows >= 6, 'the mistakes are actually shown as wrong on the results screen',
     `${wrong.wrongRows} wrong rows`);
  ok(wrong.reasons >= wrong.wrongRows,
     'every wrong answer carries its worked explanation without being asked',
     `${wrong.reasons} explanations for ${wrong.wrongRows} wrong rows`);

  const backPage = await browser.newPage({ viewport: { width: 1402, height: 789 } });
  backPage.on('pageerror', e => errors.push(e.message));
  await login(backPage);
  const back = await playWithAReturnVisit(backPage);
  console.log('');
  console.log('A run that went back to the Investigation for three items:');
  back.marks.forEach(([name, score]) => console.log('  ' + name.padEnd(16) + score));
  console.log('  ' + 'Where you stand'.padEnd(16) + back.standing.percentile + ' percentile, weighted ' +
              back.standing.weighted + ' / 100  (' + back.standing.pill + ')');
  /* 25 x (27.5/29) + 75 = 98.7; 98 -> 97 and 100 -> 99, so 97.7, rounded to 98 */
  ok(back.standing.weighted === '98.7' && back.standing.percentile === '98th',
     'the return-visit run shows 98.7 / 100 and the 98th percentile',
     `shows ${back.standing.weighted} and ${back.standing.percentile}`);

  const expectedBack = { Investigation: '27.5 / 29', Analysis: '8 / 8', Report: '13 / 13',
                         Cases: '6 / 6', Total: '54.5 / 56' };
  for (const [name, score] of back.marks) {
    ok(expectedBack[name] === score,
       `${name} marks ${expectedBack[name]} when three items were fetched on a return visit`,
       `got ${score}`);
  }
  ok(back.groups.length === 4,
     'the Investigation results are shown as four groups', back.groups.join(' | '));
  ok(back.groups.some(g => /first pass/i.test(g)) && back.groups.some(g => /return visit/i.test(g)),
     'the first-pass and return-visit groups are both named', back.groups.join(' | '));
  ok(back.tags.length === 3 && back.tags.every(t => t === '½ mark'),
     'each return-visit item is tagged with what it earned',
     back.tags.join(', ') || 'no tags');

  ok(errors.length === 0, 'no JavaScript errors during any run', errors.join(' | '));

  await browser.close();

  console.log('');
  console.log('checks made: ' + checks);
  if (checks < 34) {
    console.log('RESULT: FAILED — too few checks were made for this run to mean anything.');
    process.exit(1);
  }
  if (failures.length) {
    console.log('');
    failures.forEach(f => console.log('  ✗ ' + f));
    console.log('');
    console.log('RESULT: FAILED');
    process.exit(1);
  }
  console.log('RESULT: PASSED');
})();
