# Redrock Study — practice simulation

This folder **is** the website. Whatever is in it is what candidates see.
It is plain HTML, CSS and JavaScript: there is no build step, nothing to
compile, and nothing to install. Change a file, upload it, refresh the page.

---

## 1. What is in here

| File or folder | What it is |
|---|---|
| `index.html` | The only page. Everything is drawn into it. |
| `config.js` | **The file you edit most.** Username, password, and whether the simulation may run outside a lesson. |
| `css/shared-styles.css` | The shared CaseMentor look, the same file every simulation uses. **Do not edit this one** — see §8. |
| `css/app.css` | Everything specific to Redrock. |
| `js/marking.js` | Every rule: what counts as a right answer, how numbers are rounded, how a run is scored. It never touches the screen. |
| `js/content.js` | Reads the content files and refuses to start if any of them is wrong. |
| `js/app.js` | Draws every screen. It works nothing out — when it needs an answer it asks `js/marking.js`. |
| `data/rr6/` | **All the content.** Every question, number, label, option and correct answer for version 6. |
| `tests.html` | Open it in a browser: it checks the rules against the content and shows green or red. |
| `tools/answer-key.html` | Prints the full answer key, straight from the content files. |
| `tools/make-passcode.html` | Turns a password you choose into the scrambled line that goes into `config.js`. |
| `reference/` | Testing tools for a developer. Never opened by a candidate. |

---

## 2. Change the password

1. Open **`tools/make-passcode.html`** in your browser, from the published web
   address (not from a file on your computer — browsers only offer the
   scrambling function on a real address).
2. Type the password you want candidates to use.
3. Copy the long line of letters and numbers it prints.
4. Open **`config.js`** and paste it between the quotes on this line:

   ```js
   passcodeHash: "22d1c9017df0929ef31cfd943bbc97d2adeff40c010e19d89f1a006943f2132c",
   ```

5. Change the username on the line above it if you want to.
6. Save the file and upload it.

> **The password shipped with this folder is temporary.** It is
> `change-me-before-launch`. Change it before the simulation goes near a
> candidate.

To remove the login screen altogether, set `requireLogin: false` in the same
file.

---

## 3. Switch the "only inside our course" check on

`config.js` has:

```js
blockDirectAccess: false,
allowedEmbedDomains: ["app.casementor.com", "casementor.spayee.com"]
```

While `blockDirectAccess` is `false` the simulation runs anywhere. Set it to
`true` and it will only run inside a page on one of the listed addresses.

The check **fails open on purpose**: if the browser does not tell the page
where it was opened from, the simulation loads normally. A candidate who
cannot start their assessment is a far worse outcome than somebody finding
the page by accident. Leave it `false` until you have confirmed in a real
lesson which address your lessons run under.

---

## 4. Add another version (RR1 to RR5)

This is the part the whole design exists for. **No program file is touched.**

1. Copy the folder `data/rr6` and name the copy `data/rr7` (or `rr1`, `rr2`…).
2. Edit the five files inside it. Every question, number, label, option,
   correct answer and worked explanation lives in these five and nowhere else:

   | File | What it holds |
   |---|---|
   | `version.json` | Title, time limit, number of cases, every button word and popup message, the minute-warning wording, the journal's hint line, the "Timer paused" words, the return-visit weight, whether the results are full or a demo, and the percentile table. |
   | `investigation.json` | The study text, the exhibits, and every piece of information the candidate can drag. |
   | `analysis.json` | The questions, their answer boxes and their worked explanations. |
   | `report.json` | The written report with its blanks, the chart question, and the grid of figures. |
   | `cases.json` | The cases, with the kind of answer each one takes. |

3. Open the new version with the address `index.html?v=rr7`.
4. Open `tests.html?v=rr7` — it checks the new content and marks its own
   answer key. **If anything is missing or inconsistent it will say so in
   plain English, naming the file and the field.**
5. Open `tools/answer-key.html?v=rr7` and read it against your Word key.

If you ever find yourself needing to change a file in `js/` to make a new
version work, something in the content format is wrong — say so rather than
patching the program, because that patch would then have to be repeated for
every version afterwards.

### The markers you can write inside content text

- `[[some_id]]` inside a piece of text or a table cell puts the item called
  `some_id` there as something the candidate can drag. Every item declared in
  `items` must be used exactly once, and every `[[…]]` must have an item —
  `tests.html` checks both.
- `{{7}}` puts a bare draggable number on screen. It has no label behind it,
  so it can be dragged into the calculator and into an answer box, but not
  into the Research Journal.
- `^{...}` is drawn raised. Write `2^{7}` and the candidate sees 2 with a
  small 7 above the line; write `2^{(n/7)}` and the `(n/7)` is raised. A `^`
  that is not followed by `{` is left exactly as typed. This works in every
  piece of content text — questions, options, explanations, table cells — and
  on the printed answer key.
  **The one exception is a dropdown's option list.** A dropdown can hold
  nothing but plain text, because the browser draws it rather than the page,
  so `2^{7}` shows there as `2^7`. Do not write a question whose dropdown
  options depend on a raised character.
- A **line break** in a text field is a line break on screen, so a list of
  assumptions can be written as separate lines.
- A table with `"draggable": true` turns every numeric cell into a bare
  draggable number automatically. The first column of any table is always
  treated as the row's name, never as a value.
- A **charted exhibit** is a `bar_chart` block: it names its `categories`, and
  a `series` with the `values` and the `items` those bars stand for. The bars
  are drawn from the numbers, and each bar's value is a real chip the
  candidate can pick up — so nothing is a picture of a number.

### The other things `version.json` controls

```json
"title": "Redrock Study Simulation",
"scenario": "Aldarin Island: Dashed Coyotes",

"return_visit_weight": 0.5,

"labels": {
  "journal_mark_hint": "Mark (!) for important items",
  "timer_paused": "Timer paused",
  "demo_note": "This is the free demo, which shows your score and percentile only. Our full simulations come with every answer explained in detail."
},

"warnings": {
  "title": "{n} Minute Warning",
  "text":  "{n} minutes remain to finish your work for both the study and the cases"
},

"results_mode": "full",

"benchmark": {
  "note": "This percentile is our own estimate for this simulation, not a McKinsey figure. …",
  "phase_weights": { "investigation": 25, "analysis": 25, "report": 25, "cases": 25 },
  "zones": [ { "from": 0,  "label": "Below 70th" },
             { "from": 70, "label": "Borderline" },
             { "from": 80, "label": "Likely pass" },
             { "from": 90, "label": "Comfortable" } ],
  "percentiles": [[0,1],[20,5],[35,12],[45,20],[55,30],[62,40],[68,50],[74,60],
                  [79,68],[84,75],[88,80],[91,85],[94,90],[96,94],[98,97],[100,99]]
}
```

- **`title`** carries **no simulation number**. The versions get moved around,
  so they are told apart by repository and link, never on screen. The
  **`scenario`** line is drawn beneath it. The downloaded results file is
  named after the title too (`redrock-study-simulation-results.csv`), never
  after the `id`. On em dashes (—) in anything a candidate reads: use one only
  where it reads better than a colon or a comma, never out of habit.

- **`return_visit_weight`** is what a piece of information is worth if the
  candidate went back to the Investigation to fetch it after first leaving.
  `1` means no penalty at all, `0.5` means half a mark, `0` means only what
  was collected on the first pass counts. Leave the line out altogether and
  it behaves as `1`. It must be a number from 0 to 1, and `tests.html` says
  so plainly if it is not. See §5 below for exactly when the journal is
  judged.
- **`labels.journal_mark_hint`** is the line under the Research Journal's
  heading. Wherever you write `(!)` in it, the drawn icon appears instead, so
  the sentence and the button show the same symbol.
- **`warnings`** is the notice that appears at 5, 4, 3, 2 and 1 minutes
  remaining. `{n}` is replaced by the number of minutes. The notice carries a
  ✕ to dismiss it and hides itself after four seconds; the clock never pauses
  for it.
- **`labels.timer_paused`** is shown under the clock while it is paused: during
  the two popups that open the Analysis and the Cases, and while the Restart
  question is open. Leave it out and nothing is shown there.
- **`results_mode`** decides what the results page gives away.
  - `"full"` (or the line left out): every answer, marked and explained.
  - `"demo"`: the percentile card, the four score tiles, the total and the
    summary line are shown as usual; then `labels.demo_note` with a lock; then
    the four phase blocks **greyed out and locked**, heading and score only.
    No ticks or crosses, no explanations, nothing to open, and **no Print or
    CSV button** (the CSV lists the expected answers). A demo needs a
    `demo_note`; `tests.html` says so if it is missing.

  **A free demo is a content switch, not a code change.** Copy a version's
  folder, set `"results_mode": "demo"`, and give it its own `benchmark` if its
  table should be more conservative.

  **Do not upload `tools/answer-key.html` with a demo version.** It prints
  every answer. (The content files themselves can be read by anyone who looks
  for them. That is true of every published version and has been accepted.)
- **`benchmark`** is the "Where you stand" card at the top of the results. Leave
  the whole block out and no card is drawn. It is an **estimate from a table**;
  there is no database behind it, and its footnote says so.
  - **`phase_weights`**: how much each phase counts, out of 100. They must add
    up to exactly 100. With 25 each, every phase counts a quarter, so one
    collected item is no longer worth the same as one Analysis answer. The
    **weighted score** is each phase's score divided by its best possible,
    times its weight, added up: 24.5/29, 8/8, 9/13 and 3/6 give
    25 × (0.845 + 1 + 0.692 + 0.5) = **75.9**. The score tiles still show the
    ordinary counts; nothing about marking changes.
  - **`percentiles`**: a list of `[weighted score, percentile]` points, from
    the lowest score to the highest. Scores run 0 to 100, percentiles 1 to 99,
    and a percentile may never go down as the score goes up. Between two
    points the percentile runs in a straight line and is rounded to a whole
    number: 75.9 lies between `[74,60]` and `[79,68]`, so it reads as
    60 + (1.9 ÷ 5) × 8 = 63.0, the **63rd**. The weighted score is rounded to
    one decimal first, so the figure on screen is the one you look up.
    Outside the table the nearest end point holds.
  - **`zones`**: bands of percentile, lowest first, the first starting at 0.
    The candidate's zone label is printed in the pill ("Decile 7 · top 38% ·
    Below 70th"), and the zones colour the decile band. **The colours go by
    position, not by label:** the first zone is grey, the highest is green,
    the one below it light green, any others amber. Never red.
  - **`note`**: the footnote under the card.

  `tools/answer-key.html` prints the weights, the zones and the table, so you
  can see the mapping without opening the file, and `tests.html` refuses a
  table that is out of order, weights that do not add up to 100, or zones that
  do not start at 0, each in plain English.

### How a right answer is decided

An answer is right if it **rounds to** the key's figure, at the number of
decimal places the content says:

```json
"answer": 0.4,
"accept": { "decimals": 1 }
```

means anything from 0.35 up to (but not including) 0.45 is right. If a second
figure should also be accepted — because the question asked candidates to
round partway through, so two defensible answers exist — list it:

```json
"answer": 281,
"accept": { "decimals": 0, "any_of": [270] }
```

---

## 5. How the Investigation is scored

Worth understanding, because it is the one rule that is not simply
right-or-wrong.

**The journal is judged as it stood when the candidate pressed "Conclude"** —
the last moment the Investigation can still be reached. Editing the journal
later, during the Report, cannot change the score.

Each required piece of information then earns:

| | |
|---|---|
| collected **before** the candidate first left the Investigation | a full mark |
| fetched on a **return visit** back from the Analysis | `return_visit_weight` (0.5 in RR6) |
| never collected | nothing |

So a candidate who collected 26 of the 29 first time and went back for the
other three scores **27.5 out of 29**, and the results screen shows the four
groups separately, with each return-visit item tagged "½ mark".

Items collected that were **not** required cost nothing at all — they are
listed as "collected, but not needed" and that is the end of it.

**Keep the start screen short.** It has to fit a 16:9 lesson box as small as
1000 × 562 without a scrollbar. If a version's phase descriptions or title are
longer, run `reference/layout-check.js`, which measures exactly that.

---

## 6. Put it on the web

The simulation is hosted on GitHub Pages and shown inside a lesson.

1. Create the repository.
2. **Upload the folder itself, not the files inside it.** Dragging the files
   out of the folder into GitHub's uploader puts them all in the root, throws
   away the `css/`, `js/` and `data/` folders, and gives no warning at all.
   This cost the previous project three uploads that appeared to do nothing.
3. Turn on GitHub Pages for the repository.
4. Put this in the lesson. It is a **16:9 box**, the same as Sea Wolf's
   lessons use: the lesson page scrolls rather than the simulation being
   squeezed under the course platform's header, and candidates are expected to
   press the full-screen button.

   ```html
   <iframe src="https://<user>.github.io/<repo>/index.html" allowfullscreen allow="fullscreen"
           style="width:100%;aspect-ratio:16/9;border:0;display:block"></iframe>
   ```

   Keep `allowfullscreen allow="fullscreen"`: without them the browser refuses
   full screen inside the lesson and the full-screen button hides itself.

Check afterwards that `css/`, `js/` and `data/` really are folders in the
repository, and not a heap of loose files.

---

## 7. Run the tests

**The one you need: `tests.html`.** Open it from the published address. It
shows either

> **ALL TEST GROUPS PASSED**

or a red banner naming the group that failed and every check inside it. It
needs nothing installed. Open it after every content change.

The two in `reference/` are for a developer and need Node and Python:

```
python3 reference/difftest.py          # marks 5,000 random runs with two
                                       # separately written markers and
                                       # compares them. 0 differences is the pass.

node reference/layout-check.js http://localhost:8000
                                       # plays the whole simulation at six
                                       # window sizes and inside the lesson's
                                       # 16:9 box, and measures that
                                       # everything is still where it belongs
                                       # and that nothing scrolls that should not.

node reference/behaviour-check.js http://localhost:8000
node reference/play-key.js http://localhost:8000
node reference/key-compare.js http://localhost:8000
                                       # the clock, journal, calculator and
                                       # demo mode; the answer key played
                                       # through the screens; the printed key
                                       # against the Word key.
```

---

## 8. Things not to do

- **Do not edit `css/shared-styles.css`.** It is shared with Sea Wolf and with
  every simulation after it. Editing it here is what makes the family stop
  looking like a family. Put Redrock-only styling in `css/app.css`.
- **Do not put a question, a number or an answer in a `js/` file.** All of it
  belongs in `data/<version>/`, or the next version becomes a fortnight's work
  instead of a day's.
- **Do not add browser storage** (`localStorage` and the like). The old
  Redrock passed everything between nineteen pages that way, and it caused a
  live intermittent fault on Sea Wolf. Refreshing the page starts again, and
  that is accepted.
- **Do not add anything loaded from another website** — no fonts, no chart
  libraries, no jQuery. Everything must work with nothing but these files.
