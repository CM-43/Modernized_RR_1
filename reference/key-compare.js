/* ==========================================================================
   key-compare.js — DOES THE PRINTED KEY CARRY EVERY FACT IN THE WORD KEY?

       node reference/key-compare.js http://localhost:8000

   Run from a terminal, not by a candidate. Never served.

   The facts below were transcribed from 20260908_RR6_Answer Key.docx (its
   text extracted with pandoc on 10 Sep 2026): every Investigation item with
   its value and label, the eight Analysis answers, the eight written blanks,
   the chart, the four grid figures, and every case answer. For each one the
   page tools/answer-key.html is opened in a real browser and the fact must be
   found INSIDE ONE TABLE ROW, so a value cannot pass by appearing somewhere
   unrelated on the page.

   v1.1 made this comparison by a script that was not shipped with the
   folder; this is it rebuilt and shipped, so anyone can re-run it. On top of
   the Word key's facts it checks what the page adds: the return-visit rule
   and weight, the raised superscript, and (v1.2) the percentile weights,
   zones and table.

   Matching ignores letter case, thousands commas, curly versus straight
   apostrophes, runs of spaces and a full stop at the end. Nothing else is
   loosened. Where the Word key writes a fact differently from the content
   (1,205 against 1205), the Word form is shown beside the check.
   ========================================================================== */
'use strict';

const { chromium } = require('playwright');
const BASE = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');

const norm = s => String(s).toLowerCase()
  .replace(/[‘’]/g, "'").replace(/,(?=\d)/g, '').replace(/\s+/g, ' ')
  .replace(/\.\s*$/, '').trim();

/* [what the Word key says, strings that must all be in one row] */
const INVESTIGATION = [
  ['Review the data and identify the percentage of prey death in Mistveil and Bluebell Woods due to Dashed Coyotes.', 'Objective'],
  ['550', 'Marmot population in Mistveil Woods'], ['820', 'Chinchilla population in Mistveil Woods'],
  ['1,200', 'Hare population in Mistveil Woods'], ['430', 'Gopher population in Mistveil Woods'],
  ['700', 'Marmot population in Bluebell Woods'], ['1,080', 'Chinchilla population in Bluebell Woods'],
  ['1,360', 'Hare population in Bluebell Woods'], ['610', 'Gopher population in Bluebell Woods'],
  ['an insignificant portion of their diets', "Other preys' contribution towards Dashed Coyote diets"],
  ['0.35', 'Kill rate in Mistveil Woods'], ['30', 'Total prey killed in Mistveil Woods'],
  ['17', 'Days tracked in Mistveil Woods'], ['5', 'Pack size in Mistveil Woods'],
  ['0.30', 'Kill rate in Bluebell Woods'], ['40', 'Total prey killed in Bluebell Woods'],
  ['12', 'Days tracked in Bluebell Woods'], ['11', 'Pack size in Bluebell Woods'],
  ['number of the four mapped prey killed per day per Coyote', 'Definition of kill rate'],
  ['the four species are killed proportionately to their population', 'Dashed Coyote hunting behavior'],
  ['Once calculated, the kill rate is expected to remain constant throughout the year (365 days)', 'Kill rate over the year'],
  ['additional 8 days', 'Additional Dashed Coyote tracking time'],
  ['Mistveil Woods pack size was undercounted by 1', 'Additional data #3'],
  ['Mistveil Woods prey killed increased by 30', 'Additional data #4'],
  ['Bluebell Woods prey killed increased by 26', 'Additional data #5'],
  ['10', 'Marmot death rate due to illness and disease (%)'],
  ['15', 'Chinchilla death rate due to illness and disease (%)'],
  ['5', 'Hare death rate due to illness and disease (%)'],
  ['10', 'Gopher death rate due to illness and disease (%)']
];

const FACTS = [];
/* The Word key numbers these 1 to 29 in its own order; the page numbers them
   in the order the content's sections draw them, which puts the Study lines
   in a different place. The number is not part of the fact, so it is not
   matched: the value and its label must share a row, and every label is
   different. */
INVESTIGATION.forEach(([value, label], i) => FACTS.push({
  what: `Investigation item ${i + 1}: ${value} (${label})`,
  row: [value, label]
}));

[['1', 'Mistveil Woods', '0.4'], ['1', 'Bluebell Woods', '0.3'],
 ['2', 'Mistveil Woods', '876'], ['2', 'Bluebell Woods', '1,205'],
 ['3', 'Mistveil Woods', '9%'], ['3', 'Bluebell Woods', '10%'],
 ['4', 'Mistveil Woods', '76%'], ['4', 'Bluebell Woods', '77%']].forEach(([q, box, ans]) =>
  FACTS.push({ what: `Analysis Question ${q}: ${box} = ${ans}`, row: [box, ans], rowStartsWith: 'q' + q + ' ' }));

[['A', 'WILL'], ['B', '876'], ['C', '281'], ['D', '76'],
 ['E', "WON'T"], ['F', '1,205'], ['G', '361'], ['H', '77']].forEach(([blank, ans]) =>
  FACTS.push({ what: `Report Part 1, blank ${blank}: ${ans}`, row: [ans], rowStartsWith: blank.toLowerCase() + ' ' + norm(ans) }));

FACTS.push({ what: 'Report Part 2: PIE', row: ['Select the best graph to visualize how the total deaths', 'PIE'] });

[['Deaths due to Dashed Coyotes', '876'], ['Deaths due to Dashed Coyotes', '1,205'],
 ['Deaths due to Illness and Disease', '281'], ['Deaths due to Illness and Disease', '361']].forEach(([row, v]) =>
  FACTS.push({ what: `Report Part 3: ${row}, ${v}`, row: [row, v] }));

FACTS.push({ what: 'Case 1: P = 820 * 2^((n/7))  (drawn as P = 820 × 2 with (n/7) raised)',
             row: ['What is the best equation', 'P = 820 × 2(n/7)'] });
[['# of existing packs in Teklan Hills: 3', 'number of packs, existing table'],
 ['Average annual hunts per existing pack in Teklan Hills: 40', 'average annual hunts per pack, existing table'],
 ['Average kills per hunt for existing wolves in Teklan Hills: 3', 'average kills per hunt, existing table'],
 ['# of new packs in Teklan Hills: 1', 'number of packs, new table'],
 ['Average annual hunts per new pack in Teklan Hills: 42', 'average annual hunts per pack, new table'],
 ['Average kills per hunt for new wolves in Teklan Hills: 4', 'average kills per hunt, new table']].forEach(([s, word]) =>
  FACTS.push({ what: `Case 2 (Word key: Teklan Hills, ${word}): ${s}`, row: ['What information is used', s] }));
FACTS.push({ what: 'Case 3: 878', row: ['expected number of new infections for Month 12', '878'] });
FACTS.push({ what: 'Case 4: Line Graph', row: ['Which chart type best visualizes', 'Line Graph'] });
FACTS.push({ what: 'Case 5: Reef Petrels had their strongest breeding improvement in West Shoals.',
             row: ['Which of the following statements are supported', 'Reef Petrels had their strongest breeding improvement in West Shoals'] });
[['Mean', '21.3'], ['Median', '21'], ['Mode', '15']].forEach(([k, v]) =>
  FACTS.push({ what: `Case 6: ${k} = ${v}`, row: ['Report the mean, mode, and median', `${k} = ${v} (`] }));

const WORD_FACTS = FACTS.length;

/* what the page adds beyond the Word key */
FACTS.push({ what: 'page: the return-visit rule is stated', text: 'One fetched on a return visit from the Analysis earns half a mark' });
FACTS.push({ what: 'page: the weight in force is shown (0.5)', text: 'currently 0.5' });
FACTS.push({ what: 'page: ^{(n/7)} is drawn raised, not printed with braces', html: '<sup>(n/7)</sup>', notText: '^{' });
FACTS.push({ what: 'page (v1.2): the four phase weights, 25 each',
             rows: [['Investigation', '25'], ['Analysis', '25'], ['Report', '25'], ['Cases', '25']] });
[['0 to 69', 'Below 70th'], ['70 to 79', 'Borderline'], ['80 to 89', 'Likely pass'], ['90 and above', 'Comfortable']]
  .forEach(([range, label]) => FACTS.push({ what: `page (v1.2): zone ${range}, ${label}`, row: [range, label] }));
FACTS.push({ what: 'page (v1.2): the percentile table, all 16 points in order', points: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1402, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/tools/answer-key.html', { waitUntil: 'networkidle' });
  const hasTables = await page.waitForSelector('table.key', { timeout: 15000 }).then(() => true, () => false);
  if (!hasTables) {
    console.log('RESULT: FAILED — the page drew no key tables to compare against.');
    await browser.close();
    process.exit(1);
  }
  const got = await page.evaluate(() => ({
    rows: Array.from(document.querySelectorAll('table.key tr')).map(tr => tr.innerText),
    text: document.body.innerText,
    html: document.getElementById('out').innerHTML,
    points: Array.from(document.querySelectorAll('table.points tbody td')).map(td => td.textContent.trim())
  }));
  await browser.close();

  const rows = got.rows.map(norm);
  const inRow = (parts, startsWith) => rows.some(r =>
    (!startsWith || r.indexOf(norm(startsWith)) === 0) && parts.every(p => r.indexOf(norm(p)) !== -1));

  const expectedPoints = [[0, 1], [20, 5], [35, 12], [45, 20], [55, 30], [62, 40], [68, 50], [74, 60],
                          [79, 68], [84, 75], [88, 80], [91, 85], [94, 90], [96, 94], [98, 97], [100, 99]];
  const missing = [];
  let checked = 0;
  for (const f of FACTS) {
    checked++;
    let found;
    if (f.row) found = inRow(f.row, f.rowStartsWith);
    else if (f.rows) found = f.rows.every(r => inRow(r));
    else if (f.text) found = norm(got.text).indexOf(norm(f.text)) !== -1;
    else if (f.html) found = got.html.indexOf(f.html) !== -1 && got.text.indexOf(f.notText) === -1;
    else if (f.points) found = expectedPoints.map(p => p.join(',')).join('|') ===
      got.points.filter(x => x !== '').reduce((acc, x, i, a) => (i % 2 ? acc : acc.concat(a[i] + ',' + a[i + 1])), []).join('|');
    if (!found) missing.push(f.what);
  }

  /* Controls: a matcher that finds everything is not a matcher. */
  const controls = [
    ['a wrong value against a right label is NOT found in one row', !inRow(['551', 'Marmot population in Mistveil Woods'])],
    ['a wrong case answer is NOT found', !inRow(['expected number of new infections for Month 12', '877 ('])],
    ['the other formula is NOT given as the answer', !inRow(['What is the best equation', 'P = 840'])]
  ];

  console.log('facts from the Word key checked : ' + WORD_FACTS);
  console.log('facts the page adds, checked    : ' + (FACTS.length - WORD_FACTS));
  console.log('total facts checked             : ' + checked);
  console.log('table rows read from the page   : ' + rows.length);
  console.log('missing from tools/answer-key.html : ' + missing.length);
  missing.forEach(m => console.log('  ✗ ' + m));
  controls.forEach(([what, pass]) => console.log('  control: ' + what + ' — ' + (pass ? 'yes' : 'NO')));
  if (errors.length) console.log('JavaScript errors: ' + errors.join(' | '));

  if (checked < 60 || rows.length < 60) {
    console.log('RESULT: FAILED — too little was compared for this to mean anything.');
    process.exit(1);
  }
  if (missing.length || errors.length || controls.some(c => !c[1])) {
    console.log('RESULT: FAILED');
    process.exit(1);
  }
  console.log('RESULT: PASSED');
})();
