# Redrock RR6 — handover note, fix round

- **Built by:** Claude Opus 5, 9 September 2026, against `RD-STAGE3-FIXES-for-Opus.md`
- **Supersedes:** the first handover note of the same day. The build it describes is unchanged except where §1 below says otherwise.
- **Temporary password still in place:** `change-me-before-launch`. See README §2.

The three supplied files were copied in unchanged and are byte-identical to
what came with the note: `data/rr6/cases.json`, `data/rr6/version.json`,
`reference/mark.py`. The other three content files were not touched, and
`css/shared-styles.css` is still Sea Wolf's file, unedited.

---

## 1. What changed, item by item

### A. A case with no right-hand panel now stretches

On Cases 4 and 5 — neither a calculator nor a journal — the right column is
not drawn at all and the middle column takes its width. The primary button
stays in the bottom-right of the now-wider middle column.

This reverses decision 4 of the first handover note, where I kept an empty
column in place. I had read rule 2.7 as forbidding the change of width; the
amended rule says plainly that it was written about movement *within* a
screen and was never meant to overrule the source screens. The current
simulation stretches and so does the real game.

`reference/layout-check.js` now measures this rather than taking my word for
it: on Cases 4 and 5 it asserts there is no right column at all, and that the
middle column's right edge lands within 3 px of where the right column's edge
sits on **Case 3** — a case that does have one. Measured against Case 3, not
against itself, because a column compared to its own width agrees whatever
happens. Six window sizes.

> `handover-screenshots/new-1402x789-case_4.png` beside `old-1402x789-case_4.png`

### B. Return visits to the Investigation are worth less

The rule, in the words the results screen itself uses:

> A piece of information collected before you first left the Investigation
> earns a full mark. One fetched on a later visit back from the Analysis
> earns ½ mark.

**How it is built.** Two photographs of the journal are taken and never
changed afterwards: `firstPassIds` when "Move to Analysis" is confirmed for
the first time, and `finalIds` when "Conclude" is confirmed — the last moment
the Investigation can be reached. What is in the second but not the first is a
return visit. Because the second photograph is taken at Conclude, **editing
the journal during the Report can no longer change the Investigation score.**

`markCollect(journalIds, items, returnVisitIds, weight)` does the arithmetic
and reports `returnVisit` and `weight` alongside the score, which may now be
fractional. Collect cases still call it with two arguments and are untouched —
there is no going back to a case, so there is no such thing as a return visit
there.

**The half is content, not code.** `return_visit_weight` in `version.json`
carries it. The results screen and the printed key say "½ mark" because the
weight is 0.5; set it to 0.25 and they say "0.3 of a mark" without anything in
`js/` knowing. Absent means 1, which is no penalty at all. A value outside 0
to 1 is refused with a plain-English complaint.

**Where it shows.** The Investigation block is now four lists — collected on
the first pass, collected on a return visit (each row tagged with what it
earned), needed but missed, collected but not needed. Scores print with one
decimal only when they need one: **27.5 / 29**, but 29 rather than 29.0. The
CSV has a last column `Collected on` reading `first pass` or `return visit` on
Investigation rows and blank elsewhere. `tools/answer-key.html` states the
rule and the weight in force.

**Proved three ways.** `tests.html` group 3b (15 checks); the differential
test against the supplied `mark.py` with the generator now inventing
return-visit sets; and `play-key.js`, which plays a run that collects 26 items
first time, goes back through the Investigation tab for the other three, and
finishes — **27.5 / 29 and 54.5 / 56 through the real interface**.

### C. `^{…}` is drawn raised

`2^{7}` shows as 2⁷ and `2^{(n/7)}` as 2 with (n/7) raised. Done once, in
`textToHtml` — the single function every piece of content text passes through
— so it works in questions, options, explanations, table cells, journal
entries, the results page and the printed answer key without any of those
knowing about it. The text is escaped **first** and the tags added second, so
content can never introduce markup of its own.

**One thing this cannot do, and it is worth knowing before RR1 is written.** A
dropdown's `<option>` can hold nothing but plain text — the browser draws it,
not the page — so a raised character is impossible there. Rather than print
the braces at the candidate, an option shows `2^{7}` as `2^7`. README §4 says
so. It never arises in RR6.

> `handover-screenshots/new-1402x789-case_1.png` — options b and d

### D. The journal entry matches the real game

From `RD-EVIDENCE-real-game-2026-09-09/journal.jpg`:

- a **mark-as-important toggle (!)** at the left of every entry, hollow until
  pressed and filled after, kept per entry in `state`, surviving every redraw
  and a trip out to the Analysis and back. It is a note-taking aid and
  **nothing in `marking.js` knows it exists**;
- a **pencil ✎ immediately after the title** — clicking the title still
  renames, the pencil makes it discoverable. It sits after the words, not out
  at the edge, where it would have read as a second remove button;
- **✕ stays top-right**;
- the **expand arrow ▾ is at the right of the value row**, not in the title
  row, and appears only when the text is too long;
- the panel carries the hint **"Mark (!) for important items"** under its
  heading, wording from `labels.journal_mark_hint`, with the `(!)` in that
  sentence drawn as the same icon the button uses.

The icon is drawn, not typed: a typed "(!)" never sits in a circle, and the
characters that do render as a coloured emoji on some machines.

Also fixed while doing this: a clipped entry showed a sliver of its second
line under the box, because a line clamp cuts at the line box rather than at
the edge you can see. It truncates a single line with an ellipsis now, as the
real game does.

> `handover-screenshots/new-journal-entries.png` beside `real-game-journal.jpg`

### E. Answers copied into the journal are titled "Answer #N …"

"Answer #1 Mistveil Woods", "Answer #2 Mistveil Woods". RR6's four questions
all have boxes with the same two labels, so the journal used to fill with four
entries called the same thing and the candidate could not tell which answer
was which.

### F. The minute warning carries its text and a ✕

Title and text come from `version.json`'s `warnings`, with `{n}` replaced by
the minute count, so it reads "5 Minute Warning / 5 minutes remain to finish
your work for both the study and the cases". It has a ✕ that dismisses it, it
still hides itself after four seconds, and the clock still does not pause.

It is drawn inside the playing area, below the header bar, so it **cannot**
cover the clock or the Part tabs — the behaviour check measures that, not just
that a notice appeared.

### G. The five small fixes

1. **The last sub-tab now highlights.** The cause was the rule for "which
   section is in view": it looked for the last heading past a line a quarter
   of the way down the box, and the last section can never get that far up, so
   Exhibit 3 could never light up even when clicked. The line is now the top
   of the box, and **being scrolled to the bottom is its own answer, checked
   first**. Fixing that exposed a second one the old rule had hidden: the
   Study section is a single short paragraph, so clicking "Study" scrolled
   Exhibit 1's heading past the quarter line and highlighted *Exhibit 1*. The
   behaviour check now clicks all five sub-tabs and requires that exact one
   lit, plus the bottom case.
2. **A wrong password keeps the username.** It is held in state and put back.
3. **The results tiles.** The four phase tiles are a fixed four-column grid
   exactly as wide as the Total tile beneath them, and a score never wraps.
   `auto-fit` was the cause: above about 1400 px it made room for five
   columns, so four tiles left a gap at the right and each column was narrow
   enough that "13 / 13" broke over two lines. The layout check now measures
   the row's left and right edges against the Total tile's, and measures each
   score's height against one line of its own text — a wrapped score is twice
   as tall.
4. **A tab you can press no longer looks locked.** A live tab is drawn at full
   brightness with a clear fill and a visible border; locked tabs are dimmer
   and lighter-weight. The two were 5% white against transparent-at-42% before
   — different in the stylesheet, near enough identical to the eye.
5. **The in-view sub-tab is a highlight again.** It was a pale fill with dark
   text, which measures perfectly well for contrast and still read as the
   greyed-out one of the six, because in a dark interface "light chip, dark
   text" means disabled. It is now a brightened accent wash with white text
   and an accent bar — clearly picked out, and still clearly softer than the
   solid accent of the phase you are in.

> `handover-screenshots/before-subtab-inview-1920.png` and
> `before-results-tiles.png` are Fable's pictures of the two faults;
> `new-1402x789-index.png`, `new-1402x789-calculator_question_1.png` and
> `new-1402x789-results.png` are the same places now.
> `real-game-left-tabs.png` is the evidence for G4.

### H — not changed, as instructed

The Report-Visual grid is still one light card; type size on wide monitors is
still whatever `shared-styles.css` sets; `shared-styles.css` is not edited.

---

## 2. Decisions I had to make

Only three, all small.

1. **Where the return-visit snapshot is taken when a run ends early.** If
   `markGame` is ever reached without Conclude having been confirmed, the
   journal as it stands is used, and if the Investigation was never left, no
   item counts as a return visit. It cannot arise by playing normally — Finish
   Study is only reachable through Conclude — but a score is always possible
   rather than the marker failing.
2. **A superscript inside a dropdown option** shows as `2^7` rather than the
   raw braces, and README §4 warns against depending on one. See §1C.
3. **The "your answer" column on the results screen** draws a choice the way
   the option itself was drawn (so a raised exponent looks the same in both
   places), but a **typed** value is only ever escaped. The results screen
   must never draw a candidate's own typing as markup.

---

## 3. Test output

All run against the built folder served over HTTP.

```
tests.html                ALL TEST GROUPS PASSED — 105 checks across 7 groups
  1.  Content validation                    13 of 13   · minimum 12
  2.  Answer-key reproduction                9 of  9   · minimum  8
  3.  Known-wrong answers                   28 of 28   · minimum 16
  3b. Return visits to the Investigation    15 of 15   · minimum 10
  4.  Calculator arithmetic                 18 of 18   · minimum 12
  5.  Rounding rule                         13 of 13   · minimum  9
  6.  Engine invariants                      9 of  9   · minimum  6

reference/difftest.py     0 differences over 5,001 answer sets
                          and 0 over 8,001 on each of three further seeds
                          (24,003 more comparisons), with the generator now
                          inventing return-visit sets — including ids named as
                          return visits that were never collected

reference/play-key.js     the answer key, played by mouse and keyboard:
                            29 / 29, 8 / 8, 13 / 13, 6 / 6 — 56 / 56
                          a run of deliberate mistakes:
                            28 / 29, 7 / 8, 11 / 13, 2 / 6 — 48 / 56
                          a run that went back for three items:
                            27.5 / 29, 8 / 8, 13 / 13, 6 / 6 — 54.5 / 56
                          31 checks — PASSED

reference/layout-check.js 876 measurements, 78 screens, 6 window sizes
                          (1920×1080, 1440×900, 1402×789, 1180×700,
                           1024×640, 900×540) — PASSED

reference/behaviour-check.js  116 behaviours — PASSED
```

The answer key against `20260908_RR6_Answer Key.docx`: **67 facts checked, 0
missing** — now including that the printed key raises `^{…}` rather than
printing braces, and that it states the return-visit rule and its weight.

Constraint checks:

```
grep -rn "localStorage\|sessionStorage\|indexedDB\|document.cookie\|eval(\|<script src=\"http" index.html js/ tools/   → nothing
grep -rn "Mistveil\|Coyote\|Aldarin" index.html js/ css/                                                              → nothing
grep -rn "https\?://" index.html js/ css/ tools/ tests.html config.js                                                 → nothing
```

The CSV now reads:

```
"Phase","Item","Your answer","Expected","Correct","After time","Collected on"
"Investigation","Objective","Collected","Collect it","Yes","No","return visit"
```

---

## 4. Six of my own checks were wrong, and one product fault came out of it

Worth recording, because a green suite is evidence about the suite.

The first run of the extended behaviour checks failed six times. Five were the
checks, not the product:

- `.mini-btn:not(.remove)` used to mean "the expand arrow" and now also
  matches the pencil and the mark button, so it counted four and pressed the
  wrong one;
- the hint check looked for text between "Mark" and "for important items",
  and the `(!)` there is a drawn icon contributing no text at all;
- the tab-brightness check ran on the Cases screen, where **every** tab is
  locked — it had nothing to look at and would have reported a pass over
  nothing had I not made it fail on an empty measurement. It now runs on the
  Analysis screen and the Report's Visual page, which do have a live tab;
- and it counted the current phase's tab as "unreachable and should be dim",
  which it is not — it is where you are.

The sixth was real, and is fix G1 above: clicking "Study" highlighted
"Exhibit 1".

One more, in the answer-key comparison: it looked for the literal text
`2^(n/7)`, which no longer appears because the exponent is now raised. Changed
to check the flat text *and* the `<sup>` separately — checking only the flat
text would have passed whether the braces were raised or printed.

---

## 5. What I still could not prove from here

Unchanged from the first note, and still true:

1. **It has never run inside a real lesson.** The embed check ships off and
   fails open even when switched on.
2. **Fullscreen has not been entered.** A headless browser will not grant it.
3. **Only Chromium.** No Safari, Edge or iPad.
4. **Dragging with a finger is written but untested** — no touch device here.
   Mouse dragging is tested on every source and every target.
5. **The printed page has been checked mechanically, not looked at.**
6. **The Word key was compared as extracted text**, not opened in Word.
7. **The format is proved on RR6 and on one invented test version.** The bar
   chart, the picture-card case and the pre-filled grid cell work, but with
   content I made up, not RR1 to RR5's real content.

New to this round:

8. **The mark-as-important toggle has no equivalent in the answer key or the
   results**, by design — it is the candidate's own note. If you later want to
   see what a candidate marked, that is a new decision, not an oversight.
9. **`return_visit_weight` is proved at 1, 0.5 and 0.** A value like 0.3 is
   accepted and the wording falls back to "0.3 of a mark"; it has not been
   played through the interface.

---

## 6. Before this goes near a candidate

1. **Change the password.** `change-me-before-launch` is still live.
2. **Upload the folder, not the files inside it.** GitHub's web uploader
   flattens a folder you drag the contents out of, silently.
3. **Write the repository's address into `RD-Master-Doc.md`.**
4. **Open `tests.html` from the published address** and confirm the green
   banner there, not only locally.
5. `HANDOVER.md` and `handover-screenshots/` are for review and can be deleted
   from the repository once you are done with them.
