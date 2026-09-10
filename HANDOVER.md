# Redrock RR6 — handover note, Stage 4 review round (v1.2)

- **Built by:** Claude Opus 5, 10 September 2026, against `RD-STAGE4-REVIEW-for-Opus.md` (items 1 to 11), `RD-GAME-RULES.md` v1.2, `RD-BUILD-SPEC.md` v1.2 and R-D39 to R-D44.
- **Started from:** `Claude outputs/redrock-rr6-v1.1/`, copied to this folder.
- **Content:** `data/rr6/version.json` is `RD-BUILD-v1.2/data/rr6/version.json`, copied unchanged (md5 `b40c6a5c…` for both). The other four content files, `css/shared-styles.css`, `config.js`, `index.html`, `reference/mark.py` and `reference/difftest.py` are byte-for-byte v1.1's.
- **Temporary password still in place:** `change-me-before-launch`.

Files changed: `js/app.js`, `js/marking.js`, `js/content.js` (one error message), `css/app.css`, `tools/answer-key.html`, `tests.html`, `README.md`, `reference/layout-check.js`, `reference/behaviour-check.js`, `reference/play-key.js`. New: `reference/key-compare.js`, `handover-screenshots/`.

Screenshots are in `handover-screenshots/` as `before-<name>.png` (v1.1) and `after-<name>.png` (v1.2), same name after the prefix. Scrollbars are drawn in these (headless Chromium hides them by default), so an overflowing box shows its bar.

---

## 1. What changed, item by item

**1. Start screen and embed tag.** Phases are a 2 × 2 grid (14 px gaps); the three fact tiles and Start share one row, button right; card 900 px wide, padding 26 / 32 / 24 px, tightening below 600 px of height. Measured against `start-screen-v2-1717x966.png` by pixel: the mock's card is 898 × 428 inside its border and ours is 898 × 430. The fact tiles sit at y 633 in the mock and y 632 in ours. Title and scenario come from content. README §6 shows the 16:9 tag. Login and start fit with no scroll at the six sizes, in the three iframe boxes, and at 72 more window sizes from 900 × 540 to 2560 × 1440. v1.1 measured 610 against 607 in the 693 px box, which is exactly WK's scrollbar.
Pairs: `start-1402x789`, `start-900x540`, `start-iframe-1000x562`, `start-iframe-1717x966`, `start-iframe-1717x693`, `login-1402x789`, `login-900x540`.

**2. Popup titles.** Nothing to build. The behaviour check reads "Moving to the Analysis" and "Moving to the Cases" off the screen and compares them with `version.json`.

**3. Answers at the top of the journal.** Each "Next Question" inserts its filled boxes after the last entry whose id starts `ans:`, or at the top when there is none. Calculator results and collected items still go to the bottom. Pair: `analysis-q3-journal-1402x789`.

**4. The ✕ inside answer boxes.** It is now muted red on a pale red disc at rest, and a white ✕ on a red disc on hover and keyboard focus. The tooltip reads "Clear". Contrast is 5.6 : 1 at rest and 5.7 : 1 on hover. The journal entry's ✕ is unchanged, and the behaviour check confirms it still has v1.1's grey on white. Pairs: `answer-box-rest`, `answer-box-hover`, `journal-entry`, `journal-entry-hover`.

**5. Report, Graph.** Three cards in one row: picture, name, radio at the bottom. The whole card is the label (click target), and the arrow keys still work. Bar is pre-selected. The row never wraps; at 900 wide the cards simply get smaller. Pairs: `report-graph-1402x789`, `report-graph-900x540`.

**6. "Timer paused".** `labels.timer_paused` is drawn beneath the time text, positioned over the bar area, while either tutorial or the Restart popup is open. It is removed the moment the clock runs again. The header height, the clock, its bar and the Part tabs are measured identical paused and running. Pairs: `tutorial-popup-1402x789`, `tutorial-header-crop`, `restart-popup-header-crop`, `cases-tutorial-header-crop`.

**7. Calculator line and history.** "Next Question" (including the last one, into Review), "Conclude" and "Next Case" clear the input, the result and any "Invalid". Arriving at the Cases clears the Analysis history, and every "Next Case" clears the history too. Within a case, the calculator behaves as before. The behaviour check runs the note's sequence exactly. Pairs: `analysis-q2-arrival-1402x789`, `case1-1402x789`, `case3-arrival-1402x789`.

**8. Taller calculator.** The panel stretches to the bottom of its column, capped at 640 px, with the history taking the space above the keypad. The layout check measures height = min(room in column, 640) within 3 px on the Analysis, Review and Cases 1, 3 and 6, in all nine boxes. Key sizes match the v1.1 figures (hard-coded, measured before any change) at all six sizes. Pairs: `analysis-q1-1402x789`, `analysis-q3-1920x1080`, `analysis-q3-900x540`.

**9. Answer-key page.** The page now uses compact tables instead of cards:
- the four count tiles and the return-visit sentence at the top;
- one table per Investigation section (#, value, label, needed for);
- one Analysis table (question row, box, answer, accepted range, explanation on a second line);
- a written-blanks table, a graph table and a grid table;
- one Cases table;
- the percentile weights, zones and table.

In print, rows never split across pages and table headings repeat on each page. Print-to-PDF (A4): **6 pages** (`after-answer-key-print.pdf`; v1.1 was not measured). The page warns if the version is a demo. Pair: `answer-key-1402`, `answer-key-1402-top`.

**10. "Where you stand".** Four parts:
- `marking.js` gains `weightedScore(result, phase_weights)`, `percentile(weighted, benchmark)`, `decileOf` and `zoneOf`.
- `markGame` returns `weighted` (one decimal), `percentile`, `decile`, `topShare` and `zone`. It returns null for all five when there is no benchmark.
- `validateContent` refuses bad weights, points and zones in plain English.
- The card sits above the tiles. The CSV gains `Total, Weighted score` and `Total, Percentile` rows, and the printed results include the card.

Pairs: `results-1402x789`, `results-900x540`, `results-full-1402`. Also `after-results-borderline-card-1402.png`, a real run at 81.7 → 72nd, beside `mock-percentile-card-crop.png`.

**11. Demo mode.** With `results_mode: "demo"`:
- The card, tiles, total and summary line show as usual. The `demo_note` follows, with a lock icon.
- The four blocks are locked: heading and score only. No rows, explanations or toggles are in the page at all, and the blocks cannot be opened by click or keyboard.
- The Print and CSV buttons are not drawn, and their actions are also guarded.
- Validation accepts `full`, `demo` and absent, and refuses anything else. A demo without `demo_note` is refused.

The README documents the switch and says not to upload `tools/answer-key.html` with a demo. After-only screenshots (v1.1 has no demo): `results-demo-1402x789`, `results-demo-full-1402`, `results-demo-900x540`.

### Found by the new checks, fixed, outside the eleven items

- **Data tables scrolled sideways (a v1.1 fault).** The item 1 sweep ("nothing scrolls except…") found it at 1180 px and below, and in the 1000 × 562 box: Investigation exhibits, Case 2 and Case 3. At 900 × 540, Case 3's Months 4 to 6 were hidden behind an invisible sideways scroll, and Month 6 is the figure the question needs. Fix, drawing only: headings and row names may wrap, and under 1180 px table cells lose spare padding and the chip grips. Pair: `case3-900x540` (the before is v1.1's own handover picture).
- **"Timer paused" was unreadable behind the popup's blurred backdrop.** While the clock is paused, the header now sits above the backdrop (z-index only; nothing moves).
- **Em dashes in text the program draws.** Pie key and grid labels now use ", ". Case rows use "Case N: …", "needed for" uses " · ", an empty dropdown reads "Not answered", CSV labels use ": " and ",", and two on-screen load-error messages were changed too.

---

## 2. Decisions I made

1. **The percentile is read off the one-decimal weighted score**, not the unrounded one, so the figure on screen is the one a person looks up. On RR6 both readings agree for every example in the note.
2. **Outside the table's range the nearest end point holds**, and the result is always clamped to 1 to 99. The note's "clamp to 1 and 99" can be read two ways. RR6's table spans 0 to 100, so this never arises for RR6. `tests.html` pins the behaviour.
3. **Some fixed wording on the card lives in `app.js`:** "Estimated: your weighted score of … beats about … in 100 candidates who practised this simulation", "Decile", "top", "You ·" and the legend ranges. The note says all wording comes from content, but `version.json` has no keys for these and had to be copied unchanged. Moving them to content is a content-format change for a later round.
4. **Zone colours go by position in the list, never by label.** The first zone is grey, the last green, the one below it light green, and any others amber. That gives the agreed grey / amber / light green / green for RR6.
5. **Legend:** the first zone shows its label only (as in the mock), middle zones show "70–79 · label", and the last shows "90+ · label".
6. **Locked demo blocks show a lock icon in place of "▾ show"**, because they are not expandable. The demo note's first sentence is bold (split at the first ". "), as in the mock.
7. **A demo needs `labels.demo_note`** (validation). An absent `labels.timer_paused` shows nothing.
8. **An answer entry is recognised by its id (`ans:`), not its title**, since the candidate may rename it.
9. **The Analysis history is discarded on arrival at the Cases** (the first `Complete report` → Cases), as well as on every Next Case.
10. **The squeezed iframe is 1717 × 693**, a wide lesson column at the old fixed height. Each host page is 60 px taller than its iframe, so the host never squeezes it.
11. **The scroll sweep allows exactly the note's four boxes.** `.question-col` and `.calc-col` are not allowed, and neither scrolls anywhere in RR6.
12. **Report chart names stay "Bar chart / Line chart / Pie chart"** (v1.1's program names). Content has no names for them.
13. **`answerKey()` output gains** `decimals` for grid and case boxes, `benchmark` and `resultsMode`. These are additive, and the differential test compares none of them.
14. **The key comparison is rebuilt and shipped** as `reference/key-compare.js`, because v1.1's script was not in the folder. It checks 63 facts from the Word key plus 9 the page adds, 72 in all. It is not the same list as v1.1's "67", so the two counts are not comparable one for one. Each fact must sit in one table row. The Word key's own 1 to 29 numbering is not matched, because the page numbers items in content-section order.
15. **`handover-screenshots/` holds only this round's pairs.** The v1.1 folder on disk had none.

---

## 3. Test outputs (all against this folder served over HTTP, Chromium headless)

`tests.html` (read off the page):

```
ALL TEST GROUPS PASSED — 143 checks run across 8 groups.
  ✓ 1. Content validation   13 of 13 checks passed · minimum 12
  ✓ 2. Answer-key reproduction   9 of 9 checks passed · minimum 8
  ✓ 3. Known-wrong answers   28 of 28 checks passed · minimum 16
  ✓ 3b. Return visits to the Investigation   15 of 15 checks passed · minimum 10
  ✓ 4. Calculator arithmetic   18 of 18 checks passed · minimum 12
  ✓ 5. Rounding rule   13 of 13 checks passed · minimum 9
  ✓ 6. Engine invariants   9 of 9 checks passed · minimum 6
  ✓ 7. Weighted score, percentile and demo mode   38 of 38 checks passed · minimum 30
```

`reference/difftest.py` (default, then three more seeds):

```
Differential test — js/marking.js against reference/mark.py
  content : data/rr6
  sets    : 5000  (seed 20260909)

answer sets compared : 5001
answer key           : 56 / 56 under both markers
differences          : 0

RESULT: PASSED — 0 differences over 5001 answer sets.
seed 7         RESULT: PASSED — 0 differences over 8001 answer sets.
seed 99        RESULT: PASSED — 0 differences over 8001 answer sets.
seed 20260910  RESULT: PASSED — 0 differences over 8001 answer sets.
```

`reference/play-key.js`:

```
The answer key, played through the interface:
  Investigation   29 / 29
  Analysis        8 / 8
  Report          13 / 13
  Cases           6 / 6
  Total           56 / 56
  Where you stand 99th percentile, weighted 100 / 100  (Decile 10 · top 1% · Comfortable)

A run with deliberate mistakes:
  Investigation   28 / 29
  Analysis        7 / 8
  Report          11 / 13
  Cases           2 / 6
  Total           48 / 56
  Where you stand 62nd percentile, weighted 75.5 / 100  (Decile 7 · top 38% · Below 70th)
  wrong answers shown: 7, each with its worked explanation: 14

A run that went back to the Investigation for three items:
  Investigation   27.5 / 29
  Analysis        8 / 8
  Report          13 / 13
  Cases           6 / 6
  Total           54.5 / 56
  Where you stand 98th percentile, weighted 98.7 / 100  (Decile 10 · top 2% · Comfortable)

checks made: 37
RESULT: PASSED
```

`reference/layout-check.js`:

```
  1920x1080: 13 screens
  1440x900: 13 screens
  1402x789: 13 screens
  1180x700: 13 screens
  1024x640: 13 screens
  900x540: 13 screens
  16:9 iframe 1000x562: 13 screens
  16:9 iframe 1717x966: 13 screens
  squeezed iframe 1717x693: 13 screens
  login and start swept at 72 more window sizes

window sizes      : 6 plain, 3 lesson iframes, 72 in the login/start sweep
screens measured  : 117
measurements made : 2625

RESULT: PASSED — every position held at every size.
```

`reference/behaviour-check.js` (it prints only failures and the count; there were none):

```
behaviours checked: 173
RESULT: PASSED
```

`reference/key-compare.js`:

```
facts from the Word key checked : 63
facts the page adds, checked    : 9
total facts checked             : 72
table rows read from the page   : 104
missing from tools/answer-key.html : 0
  control: a wrong value against a right label is NOT found in one row — yes
  control: a wrong case answer is NOT found — yes
  control: the other formula is NOT given as the answer — yes
RESULT: PASSED
```

**Do the new checks measure anything?**

- The same v1.2 scripts run against the v1.1 build:
  - `layout-check.js`: **183 failures** (start overflow, including 610 against 607 in the 693 box; graph cards; calculator height; Timer paused; the percentile card; sideways tables).
  - `behaviour-check.js`: **40 of 173 failed** (titles, Timer paused, calculator clearing, journal order, red ✕, the percentile and CSV rows, demo mode, em dashes).
  - `play-key.js`: **6 failed** (the percentile).
  - `key-compare.js`: **FAILED** (no tables).
- `tests.html` against a copy of `marking.js` with five rules broken on purpose: **group 7 failed 5 of 38**, each on the broken rule.

Constraint sweeps:

```
grep -rn "localStorage\|sessionStorage\|indexedDB\|document.cookie\|eval(\|<script src=\"http" index.html js/ tools/ tests.html   → nothing
grep -rn "Mistveil\|Coyote\|Aldarin\|Bluebell" index.html js/ css/                                                           → nothing
grep -rn "https\?://" index.html js/ css/ tools/ tests.html config.js                                                        → nothing
cmp css/shared-styles.css (v1.1)  → identical
node --check js/*.js reference/*.js config.js                                                                               → clean
```

---

## 4. What I could not prove

1. **Not run inside a real lesson, on Windows, or at a real 125 % zoom.** Scrolling is measured instead of looked for. The grid covers 1366 × 768 and 1600 × 900, either side of a 1717 px column at 125 % (1374 × 773), but not that exact size.
2. **Fullscreen was not entered; only Chromium was used** (no Safari, Edge or iPad). Touch dragging is still untested.
3. **The percentile has only one implementation.** `reference/mark.py` does not compute it, so the differential test does not cover it. The evidence is `tests.html` group 7 (hand-worked values), `play-key.js` reading the screen, and the behaviour check comparing the card with the table.
4. **The table's numbers themselves are judgement.** They are content (R-D42), unverified.
5. **Three em dashes remain in content** a candidate reads on the results page, in `data/rr6/investigation.json`: two `needed_for` lines ("Every question — …", "Question 2 — …") and the Investigation explanation. I may not edit that file this round. The behaviour check removes those three lines before sweeping the results page for dashes, and says so.
6. **Print was checked as PDF, not on paper.** The CSV was downloaded in Chromium only.

## 5. Before this goes near a candidate

1. Change the password.
2. Upload the folder, not its contents.
3. Use the 16:9 tag in README §6.
4. Never upload `tools/answer-key.html` with a demo version.
5. `HANDOVER.md` and `handover-screenshots/` can be deleted from the repository after review.
