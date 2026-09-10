/* ==========================================================================
   behaviour-check.js — THE RULES THAT ARE NOT ABOUT MARKING

       node reference/behaviour-check.js http://localhost:8000

   RD-GAME-RULES.md numbers every behaviour the simulation must have. The
   marking ones are covered by tests.html and the differential test, and the
   positions by layout-check.js. This covers the rest: the clock and its two
   pauses, the minute warnings, what happens at zero, moving backwards and
   forwards between phases, the journal, the calculator, and Restart.

   The clock is driven forward artificially so that thirty-five minutes of
   behaviour can be checked in a few seconds. Nothing else is faked: every
   button is really pressed and every value really typed.
   ========================================================================== */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* The content is read from disk so the checks below compare the screen with
   what the content file says, not with words typed into this script. */
const ROOT = path.join(__dirname, '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rr6/version.json'), 'utf8'));
const INVESTIGATION = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rr6/investigation.json'), 'utf8'));
const CASES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rr6/cases.json'), 'utf8'));
/* The rules engine, run here in Node, to check the percentile card against
   an independent reading of the same table. */
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/marking.js'), 'utf8'));

const BASE = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');
const USER = 'CaseMentor9187';
const PASS = 'change-me-before-launch';

let checks = 0;
const failures = [];
function ok(condition, rule, what, detail) {
  checks++;
  if (!condition) failures.push(`${rule}  ${what}` + (detail ? '  — ' + detail : ''));
}

async function popupGo(page) { await page.click('[data-act="popup-go"]'); await page.waitForTimeout(120); }
async function pausedWords(page) {
  return page.evaluate(() => {
    const el = document.querySelector('#timer-paused');
    return el && !el.hidden ? el.textContent.trim() : null;
  });
}
async function popupTitle(page) {
  const h = await page.$('.modal h2');
  return h ? (await h.textContent()).trim() : null;
}
/* Straight through to the results, pressing the one button each screen
   offers. Starts on the Investigation. */
async function runToResults(page) {
  await page.click('[data-act="primary"]'); await popupGo(page); await popupGo(page);
  for (let i = 0; i < 4; i++) { await page.click('[data-act="primary"]'); await popupGo(page); }
  await page.click('[data-act="primary"]'); await popupGo(page);   // Conclude
  await page.click('[data-act="primary"]'); await popupGo(page);   // Written -> Graph
  await page.click('[data-act="primary"]'); await popupGo(page);   // Graph -> Visual
  await page.click('[data-act="primary"]'); await popupGo(page);   // Visual -> Cases
  await popupGo(page);                                             // cases tutorial
  for (let n = 1; n <= 6; n++) { await page.click('[data-act="primary"]'); await popupGo(page); }
  await page.waitForSelector('.results');
}
async function clock(page) { return (await page.textContent('#time-text')).trim(); }

async function start(page, withClock) {
  if (withClock) await page.clock.install();
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('#login-user', USER);
  await page.fill('#login-pass', PASS);
  await page.click('#login-form button[type=submit]');
  await page.waitForSelector('[data-act="start"]');
  await page.click('[data-act="start"]');
  await page.waitForSelector('.section');
}

(async () => {
  const browser = await chromium.launch();

  /* ==================================================================== *
   * 1. THE CLOCK — rules 3.1 to 3.6
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await start(page, true);

    ok((await clock(page)) === 'Time remaining: 35 min', '3.1',
       'the clock starts at the 35 minutes the content asks for', await clock(page));

    await page.clock.runFor(60000);
    ok((await clock(page)) === 'Time remaining: 34 min', '3.2',
       'the clock counts down in whole minutes', await clock(page));

    /* The tutorial popup pauses it, and only it and the Cases tutorial and
       Restart do (rule 3.3). */
    await page.click('[data-act="primary"]');
    await popupGo(page);                       // "move to Analysis" — does NOT pause
    const beforeTutorial = await clock(page);
    await page.clock.runFor(120000);           // two minutes while the tutorial is up
    const duringTutorial = await clock(page);
    ok(beforeTutorial === duringTutorial, '3.3',
       'the clock stops while the Analysis tutorial popup is showing',
       `${beforeTutorial} became ${duringTutorial}`);

    /* v1.2 item 2: the popup's title is the content's new one */
    const analysisTitle = await popupTitle(page);
    ok(analysisTitle === 'Moving to the Analysis' && analysisTitle === VERSION.popups.analysis_tutorial.title,
       '5.1 v1.2', 'the Analysis tutorial popup is titled "Moving to the Analysis", from the content',
       JSON.stringify(analysisTitle));
    /* v1.2 item 6: "Timer paused" under the clock while it is paused */
    const pausedNow = await pausedWords(page);
    ok(pausedNow === 'Timer paused' && pausedNow === VERSION.labels.timer_paused, '3.3 v1.2',
       'while the Analysis tutorial pauses the clock, "Timer paused" is shown, in the content\'s words',
       JSON.stringify(pausedNow));
    const pausedReadable = await page.evaluate(() => {
      const el = document.querySelector('#timer-paused');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      /* the words themselves ignore the mouse, so ask what is on top at that
         point: it must be the header bar, not the popup's backdrop */
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && !!top.closest('.header-bar') && !top.closest('.modal-backdrop');
    });
    ok(pausedReadable, '3.3 v1.2',
       'and it is on top, not hidden behind the popup\'s dimmed backdrop');

    await popupGo(page);
    ok((await pausedWords(page)) === null, '3.3 v1.2',
       'the words are gone the moment the clock runs again', String(await pausedWords(page)));
    await page.clock.runFor(60000);
    ok((await clock(page)) === 'Time remaining: 33 min', '3.3',
       'and starts again the moment the tutorial is dismissed', await clock(page));

    /* Restart's confirmation pauses it too; cancelling starts it again. */
    await page.click('[data-act="restart"]');
    const beforeRestart = await clock(page);
    await page.clock.runFor(120000);
    ok(beforeRestart === (await clock(page)), '3.3 / 10.1',
       'the clock stops while the Restart confirmation is open');
    ok((await pausedWords(page)) === VERSION.labels.timer_paused, '3.3 v1.2',
       '"Timer paused" is shown while the Restart confirmation is open', String(await pausedWords(page)));
    await page.click('[data-act="popup-back"]');
    await page.waitForTimeout(120);
    ok((await pausedWords(page)) === null, '3.3 v1.2',
       'and gone again after Cancel', String(await pausedWords(page)));

    /* An ordinary confirmation does NOT pause it. */
    const boxes = await page.$$('.answer-field input');
    for (const b of boxes) await b.fill('1');
    await page.click('[data-act="primary"]');
    const beforeOrdinary = await clock(page);
    await page.clock.runFor(120000);
    ok(beforeOrdinary !== (await clock(page)), '3.3',
       'an ordinary confirmation popup does NOT stop the clock',
       `stayed at ${beforeOrdinary}`);
    ok((await pausedWords(page)) === null, '3.3 v1.2',
       'and shows no "Timer paused"', String(await pausedWords(page)));
    await popupGo(page);

    /* Minute warnings at 5, 4, 3, 2 and 1 (rule 3.4).

       Each notice shows for four seconds and then removes itself, so looking
       for it every so often would miss it — and "I did not see it" would then
       be reported as "it did not happen", which is the difference between a
       measurement and a guess. Instead the page is asked to write down every
       notice it ever draws, and the list is read afterwards. */
    await page.evaluate(() => {
      window.__warnings = [];
      new MutationObserver(function () {
        var w = document.querySelector('.time-warning');
        if (!w) return;
        var titleEl = w.querySelector('.warning-title');
        var textEl = w.querySelector('.warning-text');
        var header = document.querySelector('.header-bar');
        var box = w.getBoundingClientRect();
        var record = {
          title: titleEl ? titleEl.textContent.trim() : '',
          text: textEl ? textEl.textContent.trim() : '',
          hasClose: !!w.querySelector('[data-act="dismiss-warning"]'),
          clearOfHeader: header ? box.top >= header.getBoundingClientRect().bottom - 1 : false
        };
        for (var i = 0; i < window.__warnings.length; i++) {
          if (window.__warnings[i].title === record.title) return;
        }
        window.__warnings.push(record);
      }).observe(document.body, { childList: true, subtree: true });
    });
    for (let i = 0; i < 80; i++) {
      await page.clock.runFor(30000);
      if ((await clock(page)) === "Time's up") break;
    }
    const seen = await page.evaluate(() => window.__warnings);
    for (const minutes of [5, 4, 3, 2, 1]) {
      ok(seen.some(w => w.title === minutes + ' Minute Warning'), '3.4',
         `the ${minutes} minute warning appeared`,
         'saw: ' + seen.map(w => w.title).join(', '));
      ok(seen.some(w => w.text === minutes +
           ' minutes remain to finish your work for both the study and the cases'), '3.4',
         `the ${minutes} minute warning carried the wording from the content file`,
         'saw: ' + seen.map(w => w.text).join(' | '));
    }
    ok(seen.every(w => w.hasClose), '3.4',
       'every warning carried a ✕ to dismiss it',
       seen.filter(w => !w.hasClose).length + ' without one');
    ok(seen.every(w => w.clearOfHeader), '3.4',
       'and none of them covered the clock or the Part tabs');

    ok((await clock(page)) === "Time's up", '3.5',
       'at zero the clock reads "Time\'s up"', await clock(page));
    const barWidth = await page.$eval('#time-fill', el => el.style.width);
    ok(barWidth === '0%', '3.5', 'and the bar is empty', barWidth);

    /* The candidate carries on, and later answers are flagged (rule 3.5, R-D22). */
    const stillPlaying = await page.$('[data-act="primary"]');
    ok(stillPlaying !== null, '3.5', 'the candidate can still carry on after time is up');
    const q2 = await page.$$('.answer-field input');
    for (const b of q2) await b.fill('876');
    await page.click('[data-act="primary"]');
    await popupGo(page);

    ok(errors.length === 0, '—', 'no JavaScript errors while the clock ran out',
       errors.join(' | '));
    await page.close();
  }

  /* ==================================================================== *
   * 2. LATE ANSWERS REACH THE RESULTS SCREEN — rule 3.5, R-D22
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
    await page.clock.install();
    await start(page, false);
    await page.clock.runFor(36 * 60 * 1000);        // run the clock out at once
    ok((await clock(page)) === "Time's up", '3.5', 'the clock ran out', await clock(page));

    await page.click('[data-act="primary"]');
    await popupGo(page); await popupGo(page);
    const boxes = await page.$$('.answer-field input');
    await boxes[0].fill('0.4');
    await boxes[1].fill('0.3');
    /* straight to the end, pressing the one button each screen offers */
    for (let i = 0; i < 3; i++) { await page.click('[data-act="primary"]'); await popupGo(page); }
    await page.click('[data-act="primary"]'); await popupGo(page);   // last question -> Review
    await page.click('[data-act="primary"]'); await popupGo(page);   // Conclude -> Written
    await page.click('[data-act="primary"]'); await popupGo(page);   // Written -> Graph
    await page.click('[data-act="primary"]'); await popupGo(page);   // Graph -> Visual
    await page.click('[data-act="primary"]'); await popupGo(page);   // Complete report -> Cases
    await popupGo(page);                                             // cases tutorial
    for (let n = 1; n <= 6; n++) { await page.click('[data-act="primary"]'); await popupGo(page); }
    await page.waitForSelector('.results');

    const summary = await page.textContent('.summary-line');
    ok(/after time/.test(summary), '3.5 / 9.7',
       'the results screen says how many answers were given after time', summary.trim());
    await page.click('[data-act="toggle-block"][data-id="analysis"]');
    await page.waitForTimeout(150);
    const tags = await page.$$eval('.late-tag', t => t.length);
    ok(tags >= 2, '3.5 / 9.7', 'late answers carry an "after time" tag', `${tags} tags`);
    const marks = await page.$eval('.tile .tile-score', el => el.textContent.trim());
    ok(marks !== null, '3.5', 'late answers are still marked normally', marks);

    /* v1.2 item 10: the card's numbers agree with the content's table, read
       independently here from the four tiles on the same screen */
    const shown = await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll('.tile')).map(t =>
        t.querySelector('.tile-score').textContent.trim().split(' / ').map(Number));
      const txt = sel => { const e = document.querySelector(sel); return e ? e.textContent.trim() : null; };
      return { tiles, number: txt('.standing-number'), ordinal: txt('.standing-ordinal'),
               pill: txt('.standing-pill'), sentence: txt('.standing-sentence'),
               marker: txt('.marker-label'), note: txt('.standing-note') };
    });
    const t = shown.tiles;
    const fakeResult = { investigation: { score: t[0][0], of: t[0][1] }, analysis: { score: t[1][0], of: t[1][1] },
                         report: { score: t[2][0], of: t[2][1] }, casesScore: t[3][0], casesOf: t[3][1] };
    const w = MARKING.weightedScore(fakeResult, VERSION.benchmark.phase_weights);
    const p = MARKING.percentile(w, VERSION.benchmark);
    const zone = MARKING.zoneOf(p, VERSION.benchmark.zones);
    ok(shown.number === String(p), '9.8 v1.2',
       'the percentile on the card is the one the content\'s table gives for the tiles\' scores',
       `card ${shown.number}, table ${p} (weighted ${w})`);
    ok(shown.sentence && shown.sentence.indexOf('weighted score of ' + w + ' / 100') !== -1 &&
       shown.sentence.indexOf('about ' + p + ' in 100') !== -1, '9.8 v1.2',
       'the sentence carries the same weighted score and percentile', shown.sentence);
    ok(shown.pill === `Decile ${Math.ceil(p / 10)} · top ${100 - p}% · ${zone.label}`, '9.8 v1.2',
       'the pill gives the decile, the top share and the zone label from the content', shown.pill);
    ok(shown.note === VERSION.benchmark.note, '9.8 v1.2', 'the footnote is the content\'s note');

    /* the CSV gains two rows */
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="csv"]')]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    ok(csv.indexOf('"Total","Weighted score","' + w + '","100"') !== -1, '9.8 v1.2',
       'the CSV carries a Total, Weighted score row', csv.split('\r\n').slice(-3).join(' / '));
    ok(csv.indexOf('"Total","Percentile","' + p + '",""') !== -1, '9.8 v1.2',
       'and a Total, Percentile row', csv.split('\r\n').slice(-3).join(' / '));
    /* v1.2 (Q21): the file name carries the title, never the version id */
    const fileName = download.suggestedFilename();
    ok(fileName === 'redrock-study-simulation-results.csv' && fileName.indexOf(VERSION.id) === -1, 'R-D43 / Q21',
       'the CSV file is named after the title, without the version id', fileName);
    await page.close();
  }

  /* ==================================================================== *
   * 3. MOVING BETWEEN PHASES — rules 4.7, 5.4, 5.5, 5.6, 7.1, 7.3, 8.2
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
    await start(page, false);

    /* collect one thing so there is something to preserve */
    const chip = page.locator(`.chip[data-drag*='"objective_line"']`).first();
    await chip.dragTo(page.locator('.journal-list'));
    await page.waitForTimeout(150);

    /* the collected chip goes dark and cannot be dragged again (rule 4.3) */
    const taken = await page.$$eval('.chip.is-taken', c => c.length);
    ok(taken === 1, '4.3', 'a collected piece of information turns dark', `${taken} dark chips`);
    const takenDraggable = await page.$eval('.chip.is-taken', c => c.getAttribute('draggable'));
    ok(takenDraggable === null, '4.3', 'and it can no longer be dragged', String(takenDraggable));

    /* forward tabs do nothing before their phase is reached */
    const lockedBefore = await page.$$eval('.tab', ts =>
      ts.filter(t => t.disabled).map(t => t.textContent.trim()));
    ok(lockedBefore.indexOf('Analysis') !== -1 && lockedBefore.indexOf('Report') !== -1, '5.5 / 7.1',
       'from the Investigation, Analysis and Report are visible but cannot be pressed',
       lockedBefore.join(', '));

    await page.click('[data-act="primary"]');
    await popupGo(page); await popupGo(page);

    const boxes = await page.$$('.answer-field input');
    await boxes[0].fill('0.4');
    await boxes[1].fill('0.3');

    /* rule 5.6: back to the Investigation, and everything is still there */
    await page.click('[data-act="go-investigation"]');
    await page.waitForSelector('.section');
    const stillTaken = await page.$$eval('.chip.is-taken', c => c.length);
    const stillInJournal = await page.$$eval('.journal-item', a => a.length);
    ok(stillTaken === 1 && stillInJournal === 1, '4.5 / 5.6',
       'going back to the Investigation keeps the journal exactly as it was',
       `${stillTaken} dark chips, ${stillInJournal} journal entries`);

    /* and returning lands on the question that was being answered, as left */
    await page.click('[data-act="go-analysis"]');
    await page.waitForTimeout(150);
    const heading = (await page.textContent('.q-heading')).trim();
    const values = await page.$$eval('.answer-field input', i => i.map(x => x.value));
    ok(heading === 'Question 1', '5.6', 'returning lands on the question left behind', heading);
    ok(values.join(',') === '0.4,0.3', '5.6', 'with the answers still in their boxes',
       values.join(','));

    /* rule 5.4: moving on copies each filled box into the journal */
    await page.click('[data-act="primary"]');
    await popupGo(page);
    const afterMove = await page.$$eval('.journal-item', a => a.length);
    ok(afterMove === 3, '5.4',
       'moving to the next question copies both answers into the Research Journal',
       `${afterMove} entries`);

    /* rule 5.5: the question just left is locked */
    const q1Locked = await page.$$eval('.tab-sub', ts =>
      ts.filter(t => t.textContent.trim() === 'Question 1').every(t => t.disabled));
    ok(q1Locked, '5.5', 'the question just left cannot be gone back to');

    /* to the Report, and check nothing before it is reachable (rule 7.1) */
    for (let i = 0; i < 3; i++) { await page.click('[data-act="primary"]'); await popupGo(page); }
    await page.click('[data-act="primary"]'); await popupGo(page);      // Conclude
    const lockedInReport = await page.$$eval('.tab', ts =>
      ts.filter(t => t.disabled).map(t => t.textContent.trim()));
    ok(lockedInReport.indexOf('Investigation') !== -1 && lockedInReport.indexOf('Analysis') !== -1,
       '7.1', 'from the Report there is no way back to the Investigation or the Analysis',
       lockedInReport.join(', '));

    /* rule 7.3: from the Visual page the Graph sub-tab goes back to the chooser */
    await page.click('[data-act="primary"]'); await popupGo(page);       // to Graph
    await page.click('input[value="pie"]');
    await page.click('[data-act="primary"]'); await popupGo(page);       // to Visual

    /* The chart is drawn from the figures in the grid, so there have to be
       some figures before there is anything to see. Checking for a drawn
       chart over an empty grid would report "no chart" whether the drawing
       worked or not — a measurement that cannot tell the two apart. */
    const emptyChart = await page.$$eval('#chart-slot svg', s2 => s2.length);
    ok(emptyChart === 0, '7.4', 'with the grid empty there is no chart yet, only an invitation',
       `${emptyChart} charts`);
    await page.fill('[data-focus-key="grid:g_mist_coy"]', '876');
    await page.fill('[data-focus-key="grid:g_blue_coy"]', '1205');
    await page.fill('[data-focus-key="grid:g_mist_ill"]', '281');
    await page.fill('[data-focus-key="grid:g_blue_ill"]', '361');
    await page.waitForTimeout(250);
    const pieSlices = await page.$$eval('#chart-slot svg path', p => p.length);
    ok(pieSlices === 4, '7.4', 'the pie is drawn live from the four figures typed in',
       `${pieSlices} slices`);

    const graphTab = await page.$('.tab-sub[data-act="go-graph"]');
    ok(graphTab !== null, '7.3', 'the Graph sub-tab can be pressed from the Visual page');
    await graphTab.click();
    await page.waitForTimeout(150);
    const stillPie = await page.$eval('input[value="pie"]', el => el.checked);
    ok(stillPie, '7.3', 'and the chart choice made earlier is still the one selected');
    await page.click('input[value="line"]');
    await page.click('[data-act="primary"]'); await popupGo(page);
    const lineNow = await page.$$eval('#chart-slot svg polyline', p => p.length);
    ok(lineNow >= 1, '7.3 / 7.4', 'changing the choice changes the chart that is drawn',
       `${lineNow} lines drawn`);
    const gridKept = await page.$eval('[data-focus-key="grid:g_mist_coy"]', i => i.value);
    ok(gridKept === '876', '7.3', 'and the figures already typed in are still there', gridKept);

    /* rule 8.2: cases are forward only and finished ones are struck through */
    await page.click('[data-act="primary"]'); await popupGo(page);
    await page.waitForTimeout(150);
    const casesTitle = await popupTitle(page);
    ok(casesTitle === 'Moving to the Cases' && casesTitle === VERSION.popups.cases_tutorial.title,
       '8.1 v1.2', 'the Cases tutorial popup is titled "Moving to the Cases", from the content',
       JSON.stringify(casesTitle));
    ok((await pausedWords(page)) === VERSION.labels.timer_paused, '3.3 v1.2',
       '"Timer paused" is shown under the Cases tutorial', String(await pausedWords(page)));
    await popupGo(page);                                                  // cases tutorial
    ok((await pausedWords(page)) === null, '3.3 v1.2',
       'and gone once it is dismissed', String(await pausedWords(page)));
    await page.click('[data-act="primary"]'); await popupGo(page);        // case 2
    const caseTabs = await page.$$eval('.tab-sub', ts =>
      ts.map(t => ({ text: t.textContent.trim(), disabled: t.disabled,
                     done: t.className.indexOf('is-done') !== -1 })));
    const case1 = caseTabs.filter(t => t.text === 'Case 1')[0];
    ok(case1 && case1.disabled, '8.2', 'a finished case cannot be gone back to');
    ok(case1 && case1.done, '8.2', 'and it is shown struck through');
    await page.close();
  }

  /* ==================================================================== *
   * 4. THE JOURNAL — rules 4.4, 4.5
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
    await start(page, false);

    for (const id of ['objective_line', 'ex1_2_1', 'ex1_2_2']) {
      const chip = page.locator(`.chip[data-drag*='"${id}"']`).first();
      await chip.scrollIntoViewIfNeeded();
      await chip.dragTo(page.locator('.journal-list'));
      await page.waitForTimeout(120);
    }
    let titles = await page.$$eval('.journal-title', t => t.map(x => x.textContent.trim()));
    ok(titles.length === 3, '4.4', 'three pieces of information were collected', titles.join(' | '));
    ok(titles[0] === 'Objective', '4.4', 'each entry is titled with its label from the content',
       titles[0]);

    /* the long one gets an expand arrow, the short ones do not (rule 4.4) */
    /* `.mini-btn:not(.remove)` used to mean the expand arrow. It no longer
       does — an entry now also carries a pencil, and the panel a mark button
       — so the count came to 4 and the wrong button got pressed. Name the
       one being measured. */
    const expanders = await page.$$eval('.mini-btn.expand', b => b.length);
    ok(expanders === 1, '4.4', 'only the entry with long text offers to expand',
       `${expanders} expand buttons`);
    const clipped = await page.$$eval('.journal-text.is-clipped', t => t.length);
    ok(clipped === 1, '4.4', 'and that entry is shortened until it is expanded');
    await page.click('.mini-btn.expand');
    await page.waitForTimeout(120);
    ok((await page.$$eval('.journal-text.is-clipped', t => t.length)) === 0, '4.4',
       'pressing it shows the whole text');

    /* renaming (rule 4.4) */
    await page.click('.journal-item:nth-child(2) .journal-title');
    await page.waitForTimeout(100);
    await page.fill('.journal-title-input', 'My own name for it');
    await page.click('.journal-list');
    await page.waitForTimeout(150);
    titles = await page.$$eval('.journal-title', t => t.map(x => x.textContent.trim()));
    ok(titles.indexOf('My own name for it') !== -1, '4.4',
       'an entry can be renamed by clicking its title', titles.join(' | '));

    /* reordering by dragging one entry onto another (rule 4.4) */
    const before = await page.$$eval('.journal-title', t => t.map(x => x.textContent.trim()));
    await page.locator('.journal-item').nth(2).dragTo(page.locator('.journal-item').nth(0));
    await page.waitForTimeout(180);
    const after = await page.$$eval('.journal-title', t => t.map(x => x.textContent.trim()));
    ok(before.join('|') !== after.join('|'), '4.4',
       'entries can be dragged into a different order', before.join('|') + '  →  ' + after.join('|'));

    /* removing puts the chip back (rule 4.4) */
    const darkBefore = await page.$$eval('.chip.is-taken', c => c.length);
    await page.click('.journal-item .mini-btn.remove');
    await page.waitForTimeout(150);
    const darkAfter = await page.$$eval('.chip.is-taken', c => c.length);
    const left = await page.$$eval('.journal-item', a => a.length);
    ok(left === 2, '4.4', 'the ✕ removes an entry from the journal', `${left} left`);
    ok(darkAfter === darkBefore - 1, '4.4',
       'and the piece of information becomes available to collect again',
       `${darkBefore} dark chips became ${darkAfter}`);
    await page.close();
  }

  /* ==================================================================== *
   * 5. THE CALCULATOR — rules 6.1 to 6.6
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
    await start(page, false);
    await page.click('[data-act="primary"]'); await popupGo(page); await popupGo(page);

    /* keys, in the order the content-free layout fixes (rule 6.2) */
    const keys = await page.$$eval('.calc-key', k => k.map(x => x.textContent.trim()));
    ok(keys.join(' ') === 'AC ( ) C 7 8 9 / 4 5 6 * 1 2 3 - 0 . = +', '6.2',
       'the calculator keys are in the order the current simulation has them',
       keys.join(' '));

    /* typing an expression and pressing = (rule 6.1) */
    await page.fill('#calc-input', '60/(25*6)');
    await page.click('.calc-key.is-equals');
    await page.waitForTimeout(150);
    let result = (await page.textContent('.calc-result')).trim();
    ok(result === '0.4', '6.1', 'a typed expression is worked out', result);

    /* three decimal places, and no trailing zeros (rule 6.1, R-D17) */
    await page.fill('#calc-input', '365*0.029412');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    result = (await page.textContent('.calc-result')).trim();
    ok(result === '10.735', '6.1', 'Enter works it out and it is rounded to three places', result);
    await page.fill('#calc-input', '161.91');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    result = (await page.textContent('.calc-result')).trim();
    ok(result === '161.91', '6.1', 'and no trailing zeros are added', result);

    /* the history, newest first (rule 6.1) */
    const history = await page.$$eval('.calc-history-row .expr', e => e.map(x => x.textContent.trim()));
    ok(history.length === 3, '6.1', 'every calculation is kept in the history above',
       history.join(' | '));
    ok(history[0].indexOf('161.91') === 0, '6.1', 'newest first', history[0]);

    /* AC and C (rule 6.2) */
    await page.fill('#calc-input', '1234');
    await page.click('.calc-key.is-clear:nth-of-type(4)');   // C
    await page.waitForTimeout(100);
    let line = await page.$eval('#calc-input', i => i.value);
    ok(line === '123', '6.2', 'C removes the last character typed', line);
    await page.click('.calc-key.is-clear');                   // AC
    await page.waitForTimeout(100);
    line = await page.$eval('#calc-input', i => i.value);
    ok(line === '', '6.2', 'AC clears the line', JSON.stringify(line));

    /* an invalid expression says so and leaves the line alone (rule 6.3) */
    await page.fill('#calc-input', '2++');
    await page.click('.calc-key.is-equals');
    await page.waitForTimeout(150);
    result = (await page.textContent('.calc-result')).trim();
    line = await page.$eval('#calc-input', i => i.value);
    ok(result === 'Invalid', '6.3', 'an expression that makes no sense says "Invalid"', result);
    ok(line === '2++', '6.3', 'and what was typed is left alone so it can be corrected', line);

    /* a thousands separator is ignored (rule 6.3) */
    await page.fill('#calc-input', '1,200*0.05');
    await page.click('.calc-key.is-equals');
    await page.waitForTimeout(150);
    result = (await page.textContent('.calc-result')).trim();
    ok(result === '60', '6.3', 'a thousands separator in a dropped value is ignored', result);

    /* the result drags into an answer box (rule 6.4) */
    await page.locator('.calc-result .chip').dragTo(page.locator('.answer-field').first());
    await page.waitForTimeout(200);
    let boxValue = await page.$eval('.answer-field input', i => i.value);
    ok(boxValue === '60', '6.4', 'the result can be dragged into an answer box', boxValue);

    /* and into the journal, as its own entry (rule 6.4) */
    const journalBefore = await page.$$eval('.journal-item', a => a.length);
    await page.locator('.calc-result .chip').dragTo(page.locator('.journal-list'));
    await page.waitForTimeout(200);
    const journalAfter = await page.$$eval('.journal-item', a => a.length);
    ok(journalAfter === journalBefore + 1, '6.4',
       'and into the Research Journal as its own entry');

    /* a history result drags into the input line, replacing it (rule 6.4) */
    await page.fill('#calc-input', '');
    await page.locator('.calc-history-row .chip').first().dragTo(page.locator('#calc-input'));
    await page.waitForTimeout(180);
    line = await page.$eval('#calc-input', i => i.value);
    ok(line.length > 0, '6.4', 'a result from the history can be dragged into the line', line);

    /* v1.2: the history does NOT come into the Cases (rule 6.6, corrected) */
    const before = await page.$$eval('.calc-history-row', r => r.length);
    for (let i = 0; i < 4; i++) { await page.click('[data-act="primary"]'); await popupGo(page); }
    await page.click('[data-act="primary"]'); await popupGo(page);        // Conclude
    /* the Report has no calculator at all (rule 6.5) */
    const calcOnReport = await page.$('.calc');
    ok(calcOnReport === null, '6.5', 'there is no calculator anywhere in the Report');
    await page.click('[data-act="primary"]'); await popupGo(page);
    await page.click('[data-act="primary"]'); await popupGo(page);
    await page.click('[data-act="primary"]'); await popupGo(page);
    await popupGo(page);                                                   // cases tutorial
    const after = await page.$$eval('.calc-history-row', r => r.length);
    ok(before >= 4 && after === 0, '6.6 v1.2',
       'the Analysis history does not come into the Cases: Case 1 starts with an empty history',
       `${before} rows in the Analysis, ${after} on Case 1`);
    await page.close();
  }

  /* ==================================================================== *
   * 5e. THE CALCULATOR'S LINE AND HISTORY ACROSS MOVES — rules 6.6, 6.7 v1.2
   *     (RD-STAGE4-REVIEW item 7, its check exactly as written)
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
    await start(page, false);
    await page.click('[data-act="primary"]'); await popupGo(page); await popupGo(page);

    const calcState = () => page.evaluate(() => ({
      line: document.querySelector('#calc-input').value,
      result: document.querySelector('.calc-result').textContent.trim(),
      history: Array.from(document.querySelectorAll('.calc-history-row')).map(r => r.textContent.replace(/\s+/g, ' ').trim())
    }));

    await page.click('#calc-input');
    await page.keyboard.type('105/4');
    await page.click('.calc-key.is-equals');
    await page.waitForTimeout(150);
    let s = await calcState();
    ok(s.result === '26.25' && s.line === '105/4', '6.1', 'on Question 1, 105/4 = 26.25', JSON.stringify(s));

    await page.click('[data-act="primary"]'); await popupGo(page);        // to Question 2
    s = await calcState();
    ok((await page.textContent('.q-heading')).trim() === 'Question 2', '6.7 v1.2', 'moved to Question 2');
    ok(s.line === '', '6.7 v1.2', 'on arrival at Question 2 the input line is empty', JSON.stringify(s.line));
    ok(s.result === '', '6.7 v1.2', 'and the result box is empty', JSON.stringify(s.result));
    ok(s.history.length === 1 && /^105\/4 =\s*26\.25$/.test(s.history[0]), '6.6 v1.2',
       'the history still shows 105/4 = 26.25', JSON.stringify(s.history));

    await page.click('[data-act="go-investigation"]');
    await page.waitForSelector('.section');
    await page.click('[data-act="go-analysis"]');
    await page.waitForTimeout(150);
    s = await calcState();
    ok(s.history.length === 1 && /26\.25$/.test(s.history[0]), '6.6 v1.2',
       'the history survives a trip to the Investigation and back', JSON.stringify(s.history));

    /* a half-typed line on the last question must not reach the Review page */
    await page.click('[data-act="primary"]'); await popupGo(page);        // Q3
    await page.click('[data-act="primary"]'); await popupGo(page);        // Q4
    await page.fill('#calc-input', '7*6');
    await page.click('.calc-key.is-equals');
    await page.fill('#calc-input', '12+');
    await page.click('[data-act="primary"]'); await popupGo(page);        // Review
    s = await calcState();
    ok((await page.textContent('.q-heading')).trim() === VERSION.labels.review_tab && s.line === '' && s.result === '',
       '6.7 v1.2', 'on arrival at the Review page the line and the result box are empty', JSON.stringify(s));
    ok(s.history.length === 2, '6.6 v1.2', 'and the Analysis history is all still there', JSON.stringify(s.history));
    await page.fill('#calc-input', '3+4');

    await page.click('[data-act="primary"]'); await popupGo(page);        // Conclude
    await page.click('[data-act="primary"]'); await popupGo(page);        // Graph
    await page.click('[data-act="primary"]'); await popupGo(page);        // Visual
    await page.click('[data-act="primary"]'); await popupGo(page);        // Cases
    await popupGo(page);                                                  // tutorial

    const calcCases = CASES.cases.filter(c => c.calculator).map(c => c.number);
    ok(calcCases.join(',') === '1,3,6', '6.5', 'the cases with a calculator are 1, 3 and 6', calcCases.join(','));
    for (let n = 1; n <= 6; n++) {
      const has = await page.$('.calc');
      if (calcCases.indexOf(n) !== -1) {
        s = await calcState();
        ok(has && s.history.length === 0, '6.6 v1.2', `Case ${n} starts with an empty history`, JSON.stringify(s.history));
        ok(has && s.line === '' && s.result === '', '6.7 v1.2',
           `and on arrival at Case ${n} the line and the result box are empty`, JSON.stringify(s));
        await page.fill('#calc-input', '50+170+' + n);
        await page.click('.calc-key.is-equals');
        await page.waitForTimeout(120);
        s = await calcState();
        ok(s.history.length === 1, '6.6', `within Case ${n} the history works as before`, JSON.stringify(s.history));
      } else {
        ok(has === null, '6.5', `Case ${n} has no calculator`);
      }
      if (n < 6) { await page.click('[data-act="primary"]'); await popupGo(page); }
    }
    await page.close();
  }

  /* ==================================================================== *
   * 5f. ANSWERS COPIED INTO THE JOURNAL GO AT THE TOP — rule 5.4 v1.2
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
    await start(page, false);
    for (const id of ['objective_line', 'ex1_2_1']) {
      const chip = page.locator(`.chip[data-drag*='"${id}"']`).first();
      await chip.scrollIntoViewIfNeeded();
      await chip.dragTo(page.locator('.journal-list'));
      await page.waitForTimeout(120);
    }
    await page.click('[data-act="primary"]'); await popupGo(page); await popupGo(page);
    let boxes = await page.$$('.answer-field input');
    await boxes[0].fill('0.4'); await boxes[1].fill('0.3');
    await page.click('[data-act="primary"]'); await popupGo(page);
    const titles1 = await page.$$eval('.journal-title', t => t.map(x => x.textContent.trim()));
    ok(titles1[0] === 'Answer #1 Mistveil Woods' && titles1[1] === 'Answer #1 Bluebell Woods' &&
       titles1[2] === 'Objective', '5.4 v1.2',
       'after Question 1 its two answers are at the top, above what was collected', titles1.join(' | '));

    /* a calculator result dropped in goes to the bottom, as before */
    await page.fill('#calc-input', '2*3'); await page.click('.calc-key.is-equals'); await page.waitForTimeout(120);
    await page.locator('.calc-result .chip').dragTo(page.locator('.journal-list'));
    await page.waitForTimeout(150);

    boxes = await page.$$('.answer-field input');
    await boxes[0].fill('876'); await boxes[1].fill('1205');
    await page.click('[data-act="primary"]'); await popupGo(page);
    const titles2 = await page.$$eval('.journal-title', t => t.map(x => x.textContent.trim()));
    ok(titles2[0] === 'Answer #1 Mistveil Woods' && titles2[1] === 'Answer #1 Bluebell Woods' &&
       titles2[2] === 'Answer #2 Mistveil Woods' && titles2[3] === 'Answer #2 Bluebell Woods', '5.4 v1.2',
       'after Question 2 the first four titles are Answer #1 Mistveil, #1 Bluebell, #2 Mistveil, #2 Bluebell',
       titles2.join(' | '));
    const collectedTitles = Object.keys(INVESTIGATION.items).map(id => INVESTIGATION.items[id].label);
    ok(collectedTitles.indexOf(titles2[4]) !== -1, '5.4 v1.2',
       'and the fifth is a collected item', titles2[4]);
    ok(titles2[titles2.length - 1] === 'Calculator result', '5.4 v1.2',
       'a calculator result still goes to the bottom', titles2.join(' | '));
    await page.close();
  }

  /* ==================================================================== *
   * 5g. THE ✕ IN AN ANSWER BOX IS A CLEAR CONTROL — item 4 (decoration)
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
    await start(page, false);
    const chip = page.locator(`.chip[data-drag*='"objective_line"']`).first();
    await chip.dragTo(page.locator('.journal-list'));
    await page.waitForTimeout(120);
    await page.click('[data-act="primary"]'); await popupGo(page); await popupGo(page);
    await page.mouse.move(2, 2);
    const look = sel => page.$eval(sel, el => {
      const c = getComputedStyle(el);
      return { color: c.color, bg: c.backgroundColor, title: el.getAttribute('title') };
    });
    const rest = await look('.answer-field .clear-btn');
    await page.hover('.answer-field .clear-btn');
    await page.waitForTimeout(250);
    const hover = await look('.answer-field .clear-btn');
    const red = rgb => { const m = rgb.match(/\d+/g).map(Number); return m[0] > 150 && m[0] > m[1] * 1.8 && m[0] > m[2] * 1.8; };
    ok(rest.title === 'Clear', 'item 4', 'the box\'s ✕ carries the tooltip "Clear"', JSON.stringify(rest));
    ok(red(rest.color), 'item 4', 'at rest the ✕ is red, not grey', rest.color);
    ok(red(hover.bg) && hover.color === 'rgb(255, 255, 255)' && hover.bg !== rest.bg, 'item 4',
       'on hover it is a white ✕ on a red disc', JSON.stringify(hover));
    await page.mouse.move(2, 2);
    await page.waitForTimeout(200);
    const journalX = await look('.journal-item .mini-btn.remove');
    ok(journalX.color === 'rgb(91, 102, 119)' && journalX.bg === 'rgb(255, 255, 255)', 'item 4',
       'the journal entry\'s ✕ is unchanged from v1.1 (grey on white)', JSON.stringify(journalX));
    await page.close();
  }

  /* ==================================================================== *
   * 5h. DEMO MODE — item 11, on a copy of the content with
   *     results_mode "demo" (served in place of version.json for this page)
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/data/rr6/version.json', route => {
      const demo = JSON.parse(JSON.stringify(VERSION));
      demo.results_mode = 'demo';
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(demo) });
    });
    await start(page, false);
    const chip = page.locator(`.chip[data-drag*='"objective_line"']`).first();
    await chip.dragTo(page.locator('.journal-list'));
    await page.waitForTimeout(120);
    await runToResults(page);

    const d = await page.evaluate(() => ({
      markRows: document.querySelectorAll('.mark-row').length,
      optionRows: document.querySelectorAll('.option-row').length,
      reasons: document.querySelectorAll('.mark-reason').length,
      reasonsToggle: document.querySelectorAll('[data-act="toggle-reasons"]').length,
      bodies: document.querySelectorAll('.block-body').length,
      blocks: Array.from(document.querySelectorAll('.block')).map(b => ({
        locked: b.classList.contains('is-locked'),
        title: b.querySelector('h2').textContent.trim(),
        score: (b.querySelector('.chev') || {}).textContent })),
      csv: !!document.querySelector('[data-act="csv"]'),
      print: !!document.querySelector('[data-act="print"]'),
      restart: !!document.querySelector('[data-act="restart-now"]'),
      standing: !!document.querySelector('.standing .standing-number'),
      tiles: document.querySelectorAll('.tile').length,
      note: (document.querySelector('.demo-note') || {}).textContent,
      noteHasLock: !!document.querySelector('.demo-note svg'),
      text: document.body.innerText
    }));
    ok(d.markRows === 0 && d.optionRows === 0 && d.reasons === 0, '9.8 v1.2 demo',
       'no answer rows, no ✓/✗, no explanations are drawn', JSON.stringify({ markRows: d.markRows, optionRows: d.optionRows, reasons: d.reasons }));
    ok(d.reasonsToggle === 0 && d.bodies === 0, '9.8 v1.2 demo', 'no reasons toggle and nothing to expand');
    ok(d.blocks.length === 4 && d.blocks.every(b => b.locked && /\d+(\.\d)? \/ \d+/.test(b.score)), '9.8 v1.2 demo',
       'the four phase blocks are drawn locked, heading and score visible', JSON.stringify(d.blocks));
    ok(!d.csv && !d.print && d.restart, '9.8 v1.2 demo', 'the CSV and Print buttons are absent; Restart remains',
       JSON.stringify({ csv: d.csv, print: d.print, restart: d.restart }));
    ok(d.standing && d.tiles === 5, '9.8 v1.2 demo', 'the percentile card and the five tiles are present');
    ok(d.note && d.note.trim() === VERSION.labels.demo_note && d.noteHasLock, '9.8 v1.2 demo',
       'the notice is the content\'s demo_note, with a lock icon', JSON.stringify(d.note));
    const explanations = [INVESTIGATION.explanation].concat(CASES.cases.map(c => c.explanation)).filter(Boolean);
    ok(explanations.every(e => d.text.indexOf(e.slice(0, 40)) === -1), '9.8 v1.2 demo',
       'no worked explanation from the content appears anywhere on the page');

    await page.click('.block .block-head');
    await page.waitForTimeout(200);
    const afterClick = await page.evaluate(() => ({
      bodies: document.querySelectorAll('.block-body').length,
      rows: document.querySelectorAll('.mark-row').length }));
    ok(afterClick.bodies === 0 && afterClick.rows === 0, '9.8 v1.2 demo',
       'clicking a locked block does not open it', JSON.stringify(afterClick));
    await page.focus('.block .block-head').catch(() => {});
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    ok((await page.$$eval('.mark-row', r => r.length)) === 0, '9.8 v1.2 demo', 'nor does the keyboard');
    ok(errors.length === 0, '—', 'no JavaScript errors in demo mode', errors.join(' | '));
    await page.close();
  }

  /* ==================================================================== *
   * 5i. NO EM DASH IN ANYTHING THE PROGRAM DRAWS FOR A CANDIDATE
   *     Every screen's visible text is read. On the results page the
   *     content's own "needed for" lines and explanations are taken out
   *     first: three of them contain em dashes, and data/rr6/investigation.json
   *     is not ours to edit in this round (HANDOVER §5).
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
    const dashes = [];
    const read = async where => {
      const text = await page.evaluate(() => document.body.innerText);
      if (text.indexOf('\u2014') !== -1) dashes.push(where + ': ' + text.slice(Math.max(0, text.indexOf('\u2014') - 40), text.indexOf('\u2014') + 20));
      return text;
    };
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await read('login');
    await page.fill('#login-user', USER); await page.fill('#login-pass', PASS);
    await page.click('#login-form button[type=submit]');
    await page.waitForSelector('[data-act="start"]');
    await read('start');
    await page.click('[data-act="start"]'); await page.waitForSelector('.section');
    let screens = 2;
    await read('Investigation'); screens++;
    const chip = page.locator(`.chip[data-drag*='"objective_line"']`).first();
    await chip.dragTo(page.locator('.journal-list'));
    await page.click('[data-act="primary"]'); await read('to-Analysis popup'); await popupGo(page);
    await read('Analysis tutorial'); await popupGo(page);
    for (let i = 0; i < 4; i++) {
      const bx = await page.$$('.answer-field input');
      for (const b of bx) await b.fill('1');
      await read('Question ' + (i + 1)); screens++;
      await page.click('[data-act="primary"]'); await popupGo(page);
    }
    await read('Review'); await page.click('[data-act="primary"]'); await popupGo(page);
    await read('Written'); await page.click('[data-act="primary"]'); await popupGo(page);
    await read('Graph'); await page.click('[data-act="primary"]'); await popupGo(page);
    for (const id of ['g_mist_coy', 'g_blue_coy', 'g_mist_ill', 'g_blue_ill']) await page.fill(`[data-focus-key="grid:${id}"]`, '5');
    await page.click('input[value="pie"]').catch(() => {});
    await read('Visual'); await page.click('[data-act="primary"]'); await popupGo(page);
    await read('Cases tutorial'); await popupGo(page);
    for (let n = 1; n <= 6; n++) { await read('Case ' + n); screens++; await page.click('[data-act="primary"]'); await popupGo(page); }
    await page.waitForSelector('.results');
    for (const k of ['analysis', 'report', 'cases']) await page.click(`[data-act="toggle-block"][data-id="${k}"]`);
    for (const k of ['investigation', 'analysis', 'report', 'cases']) await page.click(`[data-act="toggle-reasons"][data-id="${k}"]`);
    let resultsText = await page.evaluate(() => document.body.innerText);
    const contentLines = [INVESTIGATION.explanation].concat(
      Object.keys(INVESTIGATION.items).map(id => INVESTIGATION.items[id].needed_for || ''));
    contentLines.filter(x => x && x.indexOf('\u2014') !== -1).forEach(x => { resultsText = resultsText.split(x).join(''); });
    if (resultsText.indexOf('\u2014') !== -1) dashes.push('results: ' + resultsText.slice(resultsText.indexOf('\u2014') - 60, resultsText.indexOf('\u2014') + 20));
    ok(screens >= 12 && resultsText.length > 2000, 'R-D43', 'the dash sweep read every screen and the whole results page',
       `${screens} screens, ${resultsText.length} characters of results`);
    ok(dashes.length === 0, 'R-D43', 'no em dash in any text the program draws for a candidate', dashes.join(' | '));
    await page.close();
  }

  /* ==================================================================== *
   * 5b. THE JOURNAL ENTRY, AS THE REAL GAME ARRANGES IT — rule 4.4 v1.1
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
    await start(page, false);

    /* The (!) in that sentence is a drawn icon, so it contributes no text at
       all — the words either side are what can be read. */
    const hint = (await page.textContent('.journal-hint')).replace(/\s+/g, ' ').trim();
    ok(/^Mark ?for important items$/.test(hint), '4.4',
       'the panel carries the real game\'s hint under its heading', JSON.stringify(hint));
    ok((await page.$$eval('.journal-hint svg', s2 => s2.length)) === 1, '4.4',
       'and the (!) in that sentence is drawn as the same icon the button uses');

    for (const id of ['ex1_2_1', 'objective_line']) {
      const chip = page.locator(`.chip[data-drag*='"${id}"']`).first();
      await chip.scrollIntoViewIfNeeded();
      await chip.dragTo(page.locator('.journal-list'));
      await page.waitForTimeout(140);
    }

    /* the short entry has no expand arrow; the long one does, at the right of
       the value row rather than up in the title row */
    const shape = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.journal-item'));
      return items.map(it => {
        const head = it.querySelector('.journal-head').getBoundingClientRect();
        const valueRow = it.querySelector('.journal-value-row');
        const expand = it.querySelector('.mini-btn.expand');
        const value = it.querySelector('.journal-text').getBoundingClientRect();
        return {
          title: it.querySelector('.journal-title').textContent.trim(),
          hasMark: !!it.querySelector('.mark-btn'),
          hasPencil: !!it.querySelector('.mini-btn.pencil'),
          hasRemove: !!it.querySelector('.mini-btn.remove'),
          hasExpand: !!expand,
          expandInValueRow: expand ? valueRow.contains(expand) : null,
          expandBelowTitleRow: expand ? expand.getBoundingClientRect().top >= head.bottom - 1 : null,
          expandRightOfValue: expand ? expand.getBoundingClientRect().left >= value.right - 1 : null,
          removeIsRightmost: (function () {
            const r = it.querySelector('.mini-btn.remove').getBoundingClientRect();
            const p2 = it.querySelector('.mini-btn.pencil');
            return p2 ? r.left >= p2.getBoundingClientRect().right - 1 : true;
          })(),
          pencilAfterTitle: (function () {
            const p2 = it.querySelector('.mini-btn.pencil');
            const t = it.querySelector('.journal-title').getBoundingClientRect();
            return p2 ? p2.getBoundingClientRect().left >= t.right - 2 : null;
          })()
        };
      });
    });
    ok(shape.length === 2, '4.4', 'two entries were collected', String(shape.length));
    ok(shape.every(e => e.hasMark), '4.4',
       'every entry has a mark-as-important toggle at its left');
    ok(shape.every(e => e.hasPencil), '4.4', 'every entry has a pencil to rename it');
    ok(shape.every(e => e.pencilAfterTitle), '4.4',
       'and the pencil follows the title rather than sitting out at the edge');
    ok(shape.every(e => e.hasRemove && e.removeIsRightmost), '4.4',
       'the ✕ stays at the top right');
    const short = shape.find(e => e.title === 'Marmot population in Mistveil Woods');
    const long = shape.find(e => e.title === 'Objective');
    ok(short && !short.hasExpand, '4.4',
       'a short entry offers no expand arrow', short ? String(short.hasExpand) : 'not found');
    ok(long && long.hasExpand, '4.4', 'a long one does');
    ok(long && long.expandInValueRow && long.expandBelowTitleRow && long.expandRightOfValue, '4.4',
       'and that arrow sits at the right of the VALUE row, not in the title row',
       JSON.stringify(long));

    /* renaming through the pencil */
    await page.click('.journal-item:nth-child(1) .mini-btn.pencil');
    await page.waitForTimeout(120);
    await page.fill('.journal-title-input', 'Renamed by the pencil');
    await page.click('.journal-list');
    await page.waitForTimeout(180);
    let titles = await page.$$eval('.journal-title', t => t.map(x => x.textContent.trim()));
    ok(titles.indexOf('Renamed by the pencil') !== -1, '4.4',
       'the pencil renames an entry', titles.join(' | '));

    /* marking, and that the mark survives a redraw and a trip to the Analysis */
    await page.click('.journal-item:nth-child(2) .mark-btn');
    await page.waitForTimeout(150);
    ok((await page.$$eval('.journal-item.is-marked', a => a.length)) === 1, '4.4',
       'an entry can be marked as important');
    await page.click('.journal-item:nth-child(2) .mark-btn');
    await page.waitForTimeout(150);
    ok((await page.$$eval('.journal-item.is-marked', a => a.length)) === 0, '4.4',
       'and a second press unmarks it');
    await page.click('.journal-item:nth-child(2) .mark-btn');
    await page.waitForTimeout(150);

    await page.click('[data-act="primary"]');
    await popupGo(page); await popupGo(page);
    ok((await page.$$eval('.journal-item.is-marked', a => a.length)) === 1, '4.4',
       'the mark is still there in the Analysis');
    await page.click('[data-act="go-investigation"]');
    await page.waitForSelector('.section');
    ok((await page.$$eval('.journal-item.is-marked', a => a.length)) === 1, '4.4',
       'and still there after going back to the Investigation');
    await page.click('[data-act="go-analysis"]');
    await page.waitForTimeout(150);

    /* E — the titles the real game uses for copied answers */
    const boxes = await page.$$('.answer-field input');
    await boxes[0].fill('0.4'); await boxes[1].fill('0.3');
    await page.click('[data-act="primary"]'); await popupGo(page);
    titles = await page.$$eval('.journal-title', t => t.map(x => x.textContent.trim()));
    ok(titles.indexOf('Answer #1 Mistveil Woods') !== -1 &&
       titles.indexOf('Answer #1 Bluebell Woods') !== -1, '5.4',
       'an answer copied into the journal is titled "Answer #N" plus the box label',
       titles.join(' | '));
    const boxes2 = await page.$$('.answer-field input');
    await boxes2[0].fill('876'); await boxes2[1].fill('1205');
    await page.click('[data-act="primary"]'); await popupGo(page);
    titles = await page.$$eval('.journal-title', t => t.map(x => x.textContent.trim()));
    ok(titles.indexOf('Answer #2 Mistveil Woods') !== -1, '5.4',
       'so the second question\'s answers are told apart from the first\'s',
       titles.join(' | '));
    ok(titles.filter(t => t === 'Mistveil Woods').length === 0, '5.4',
       'and no two entries are left with the same bare box label');
    await page.close();
  }

  /* ==================================================================== *
   * 5c. SUPERSCRIPTS, THE SUB-TAB HIGHLIGHT, AND THE LOGIN — C, G1, G2, G4
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    /* G2 — a wrong password must not wipe the username */
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await page.fill('#login-user', USER);
    await page.fill('#login-pass', 'not-the-password');
    await page.click('#login-form button[type=submit]');
    await page.waitForTimeout(400);
    const keptUser = await page.$eval('#login-user', i => i.value);
    const errorShown = (await page.textContent('#login-error')).trim();
    ok(keptUser === USER, 'G-F6',
       'a wrong password leaves the username where it was typed',
       JSON.stringify(keptUser));
    ok(errorShown.length > 0, 'G-F6', 'and says the two did not match', errorShown);
    await page.fill('#login-pass', PASS);
    await page.click('#login-form button[type=submit]');
    await page.waitForSelector('[data-act="start"]');
    await page.click('[data-act="start"]');
    await page.waitForSelector('.section');

    /* G1 — every sub-tab highlights when clicked, INCLUDING the last */
    const tabIds = await page.$$eval('.tab-sub[data-act="scroll-section"]',
                                     ts => ts.map(t => t.getAttribute('data-id')));
    ok(tabIds.length >= 5, 'G-F5', 'the Investigation has its sub-tabs', tabIds.join(', '));
    for (const id of tabIds) {
      await page.click(`.tab-sub[data-id="${id}"]`);
      await page.waitForTimeout(520);
      const lit = await page.$$eval('.tab-sub.is-inview',
                                    ts => ts.map(t => t.getAttribute('data-id')));
      ok(lit.length === 1 && lit[0] === id, 'G-F5',
         `clicking "${id}" highlights that sub-tab and only that one`,
         'highlighted: ' + (lit.join(', ') || 'none'));
    }
    /* and scrolling to the very bottom leaves the last one highlighted */
    await page.evaluate(() => {
      const s2 = document.querySelector('[data-scroll="investigation"]');
      s2.scrollTop = s2.scrollHeight;
    });
    await page.waitForTimeout(420);
    const atBottom = await page.$$eval('.tab-sub.is-inview',
                                       ts => ts.map(t => t.getAttribute('data-id')));
    ok(atBottom.length === 1 && atBottom[0] === tabIds[tabIds.length - 1], 'G-F5',
       'scrolling to the bottom highlights the last section',
       'highlighted: ' + (atBottom.join(', ') || 'none'));

    /* G-F10 — the highlighted sub-tab must not be the dimmest thing there */
    const inviewLook = await page.evaluate(() => {
      const lit = document.querySelector('.tab-sub.is-inview');
      const plain = Array.from(document.querySelectorAll('.tab-sub:not(.is-inview)'))[0];
      const read = el => {
        const c = getComputedStyle(el);
        return { opacity: parseFloat(c.opacity), color: c.color, bg: c.backgroundColor };
      };
      return { lit: read(lit), plain: read(plain) };
    });
    ok(inviewLook.lit.opacity >= inviewLook.plain.opacity, 'G-F10',
       'the highlighted sub-tab is not drawn fainter than its neighbours',
       JSON.stringify(inviewLook));
    ok(inviewLook.lit.bg !== inviewLook.plain.bg, 'G-F10',
       'and it is visibly picked out from them', JSON.stringify(inviewLook));

    /* C — the superscript convention, on screen */
    await page.click('[data-act="primary"]'); await popupGo(page); await popupGo(page);
    for (let i = 0; i < 4; i++) { await page.click('[data-act="primary"]'); await popupGo(page); }
    await page.click('[data-act="primary"]'); await popupGo(page);
    await page.click('[data-act="primary"]'); await popupGo(page);
    await page.click('[data-act="primary"]'); await popupGo(page);
    await page.click('[data-act="primary"]'); await popupGo(page);
    await popupGo(page);
    const sups = await page.$$eval('.choice sup', ss => ss.map(x => x.textContent.trim()));
    ok(sups.indexOf('(n/7)') !== -1 && sups.indexOf('7') !== -1, 'C',
       'Case 1 draws 2^{(n/7)} and 2^{7} as raised text, not as braces',
       'raised: ' + sups.join(', '));
    const braces = await page.$$eval('.choice-list, .card-choices',
                                     els => els.map(e => e.textContent).join(' '));
    ok(braces.indexOf('^{') === -1, 'C',
       'and no raw "^{" is left anywhere in the options', braces.slice(0, 160));

    await page.close();
  }

  /* ==================================================================== *
   * 5d. A TAB YOU CAN PRESS MUST NOT LOOK LOCKED — G-F8, rule 5.6 v1.1
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
    await start(page, false);

    /* Measured on the two screens that actually HAVE a live-but-not-current
       tab: the Analysis (the Investigation tab is reachable) and the Report's
       Visual page (the Graph sub-tab is). Measuring this on the Cases screen,
       where every tab is locked, would have found nothing to look at and
       called that a pass. */
    const readTabs = () => page.evaluate(() => Array.from(document.querySelectorAll('.tab'))
      .map(t => {
        const c = getComputedStyle(t);
        return { text: t.textContent.trim(), live: !t.disabled,
                 current: t.classList.contains('is-current'),
                 opacity: parseFloat(c.opacity), bg: c.backgroundColor };
      }));

    await page.click('[data-act="primary"]'); await popupGo(page); await popupGo(page);
    let tabs = await readTabs();
    let live = tabs.filter(t => t.live);
    let dead = tabs.filter(t => !t.live && !t.current);
    ok(live.length >= 1, 'G-F8', 'the Analysis screen has a tab that can be pressed',
       live.map(t => t.text).join(', '));
    ok(dead.length >= 1, 'G-F8', 'and tabs that cannot', String(dead.length));
    ok(live.every(t => t.opacity >= 0.99), 'G-F8',
       'on the Analysis screen no tab that can be pressed is drawn dimmed',
       JSON.stringify(live.filter(t => t.opacity < 0.99)));
    ok(dead.every(t => t.opacity < 0.7), 'G-F8',
       'and every unreachable tab still is',
       JSON.stringify(dead.filter(t => t.opacity >= 0.7)));
    ok(live.every(t => t.bg !== dead[0].bg), 'G-F8',
       'a tab you can press does not share the fill of one you cannot',
       JSON.stringify({ live: live[0], dead: dead[0] }));

    for (let i = 0; i < 4; i++) { await page.click('[data-act="primary"]'); await popupGo(page); }
    await page.click('[data-act="primary"]'); await popupGo(page);   // Conclude
    await page.click('[data-act="primary"]'); await popupGo(page);   // Written -> Graph
    await page.click('[data-act="primary"]'); await popupGo(page);   // Graph -> Visual
    tabs = await readTabs();
    live = tabs.filter(t => t.live);
    dead = tabs.filter(t => !t.live && !t.current);
    ok(live.length >= 1 && live.some(t => /Graph/.test(t.text)), 'G-F8 / 7.3',
       'on the Report\'s Visual page the Graph sub-tab can be pressed',
       live.map(t => t.text).join(', '));
    ok(live.every(t => t.opacity >= 0.99), 'G-F8',
       'and it is not drawn dimmed', JSON.stringify(live.filter(t => t.opacity < 0.99)));
    ok(dead.every(t => t.opacity < 0.7), 'G-F8',
       'while the sub-tabs that cannot be pressed still are',
       JSON.stringify(dead.filter(t => t.opacity >= 0.7)));
    await page.close();
  }

  /* ==================================================================== *
   * 6. RESTART — rule 10.1
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
    await start(page, false);
    const chip = page.locator(`.chip[data-drag*='"objective_line"']`).first();
    await chip.dragTo(page.locator('.journal-list'));
    await page.waitForTimeout(150);

    await page.click('[data-act="restart"]');
    await page.waitForTimeout(300);
    const title = (await page.textContent('.modal h2')).trim();
    ok(/Restart/i.test(title), '10.1', 'Restart asks first', title);
    await page.click('[data-act="popup-back"]');
    await page.waitForTimeout(150);
    ok((await page.$$eval('.journal-item', a => a.length)) === 1, '10.1',
       'cancelling changes nothing');

    await page.click('[data-act="restart"]');
    await page.waitForTimeout(300);
    await popupGo(page);
    const onStart = await page.$('[data-act="start"]');
    ok(onStart !== null, '10.1', 'confirming goes back to the start screen');
    const loginAgain = await page.$('#login-form');
    ok(loginAgain === null, '10.1', 'and the login is not asked for a second time');
    await page.click('[data-act="start"]');
    await page.waitForSelector('.section');
    ok((await page.$$eval('.journal-item', a => a.length)) === 0, '10.1',
       'everything collected before has been cleared');
    await page.close();
  }

  /* ==================================================================== *
   * 7. THE WINDOW — rule 1.4
   * ==================================================================== */
  {
    const page = await browser.newPage({ viewport: { width: 1402, height: 789 } });
    await start(page, false);
    ok(await page.$eval('#too-small', el => el.hidden), '1.4',
       'at a normal size the "please enlarge" panel is out of the way');
    await page.setViewportSize({ width: 700, height: 500 });
    await page.waitForTimeout(200);
    ok(await page.$eval('#too-small', el => !el.hidden), '1.4',
       'below the minimum it appears');
    await page.setViewportSize({ width: 1200, height: 700 });
    await page.waitForTimeout(200);
    ok(await page.$eval('#too-small', el => el.hidden), '1.4',
       'and it goes away again by itself when the window grows');
    const stillThere = await page.$('.section');
    ok(stillThere !== null, '1.4', 'and nothing was lost while it was showing');
    await page.close();
  }

  await browser.close();

  console.log('behaviours checked: ' + checks);
  if (checks < 90) {
    console.log('RESULT: FAILED — too few behaviours were checked for this to mean anything.');
    process.exit(1);
  }
  if (failures.length) {
    console.log('');
    failures.forEach(f => console.log('  ✗ rule ' + f));
    console.log('');
    console.log('RESULT: FAILED (' + failures.length + ' of ' + checks + ')');
    process.exit(1);
  }
  console.log('RESULT: PASSED');
})();
