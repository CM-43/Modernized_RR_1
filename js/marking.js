/* ==========================================================================
   marking.js — THE RULES ENGINE

   This file holds every rule in the simulation and nothing else.

   IT MUST NEVER TOUCH THE PAGE. No document, no window, no fetch, no timers,
   no setTimeout. It is plain arithmetic and comparisons. You could run it in
   a terminal with no browser at all — and the differential test does exactly
   that, through Node.

   Why the separation is strict (SW-LEARNINGS 1.2): every visual change on
   the Sea Wolf project touched only app.js and app.css, so the scoring could
   be re-proved identical after every round with one command. Redrock keeps
   that. If you ever find app.js working out a score, a rounding or a
   comparison, the rule belongs here instead.

   The screens must never read meaning out of a string this file produced —
   they read plain fields (correct, late, expected, given). Sea Wolf had a
   latent bug where the results screen searched penalty messages for a word.

   Public functions (RD-BUILD-SPEC §7):
     validateContent(version, investigation, analysis, report, cases)
     evaluate(expr)
     markNumber(value, box)
     markChoice(value, options, answer)
     markMulti(values, options, answer)
     markCollect(journalIds, items, returnVisitIds, weight)
     markGame(content, answers)
     weightedScore(result, phase_weights)   v1.2
     percentile(weighted, benchmark)        v1.2
     answerKey(content)

   The rules themselves come from RD-Master-Doc R-D18..R-D22 and
   RD-GAME-RULES §9. reference/mark.py is an independently written second
   implementation of the same rules; reference/difftest.py compares the two
   over 5,000 random answer sets and any difference is a fault in one of them.
   ========================================================================== */

(function (root) {
  'use strict';

  /* ======================================================================
     1. NUMBERS: ROUNDING AND READING WHAT THE CANDIDATE TYPED
     ====================================================================== */

  /* Round to `d` decimal places, half up.

     R-D19 in plain words: an answer is right if it rounds to the key's
     figure. If the key says 0.4 at 1 decimal place, everything from 0.35 up
     to (but not including) 0.45 is right.

     The `1e-9` is not decoration. Floating-point arithmetic cannot hold
     1.005 exactly; the nearest value the computer can store is a hair BELOW
     it, so 1.005 * 100 comes out as 100.49999999999999 and rounds down to
     1.00 instead of up to 1.01. The tiny nudge puts genuine halves back on
     the correct side of the line without moving anything else, because no
     real answer sits within a billionth of a rounding boundary.

     Math.floor(x + 0.5) rather than Math.round is deliberate: it is exactly
     what reference/mark.py does, so the two engines cannot drift on a
     negative number. */
  function roundTo(x, d) {
    var f = Math.pow(10, d);
    return Math.floor(x * f + 0.5 + 1e-9) / f;
  }

  /* Turn whatever the candidate typed into a number, or null if it is not a
     number at all.

     - spaces and thousands separators are removed, so "1,205" and "876 "
       are read as 1205 and 876;
     - a leading + or - is allowed;
     - a trailing % divides by 100 — but ONLY when the box does not already
       print a "%" after it. A box captioned "%" is asking for the bare
       number, so "9%" typed into it still means 9, not 0.09. (RD-BUILD-SPEC
       §7.3.)
     - anything else — letters, two dots, an empty string — is not a number. */
  function parseNumber(s, boxShowsPercent) {
    if (s === null || s === undefined) return null;
    if (typeof s === 'number') return isFinite(s) ? s : null;
    var t = String(s).trim().replace(/,/g, '').replace(/ /g, '');
    if (t === '') return null;
    var pct = t.charAt(t.length - 1) === '%';
    if (pct) t = t.slice(0, -1);
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
    var v = Number(t);
    if (!isFinite(v)) return null;
    if (pct && !boxShowsPercent) v = v / 100;
    return v;
  }

  /* Mark one number box against its key.
     `box` is {answer, accept:{decimals, any_of?}, unit?} straight from the
     content file. Nothing about the rule lives in code — the number of
     decimal places and any extra accepted figures come from the data. */
  function markNumber(value, box) {
    var d = box.accept.decimals;
    var g = parseNumber(value, box.unit === '%');
    if (g === null) {
      return {
        correct: false,
        given: value,
        expected: box.answer,
        notAnswered: (value === null || value === undefined || value === '')
      };
    }
    var targets = [box.answer].concat(box.accept.any_of || []);
    var ok = false;
    for (var i = 0; i < targets.length; i++) {
      if (roundTo(g, d) === roundTo(targets[i], d)) { ok = true; break; }
    }
    return { correct: ok, given: value, expected: box.answer };
  }

  /* What an answer box should contain after something is dropped into it.

     RD-GAME-RULES 5.3: a dropped value replaces whatever was in the box; a
     value carrying a "%" becomes the fraction ("16%" becomes 0.16); anything
     that is not a number at all is refused and the box is left as it was.

     This lives here rather than in app.js because it is a rule about what a
     value MEANS, and app.js is not allowed to decide that. The screen calls
     this and puts the answer in the box.

     Returns a plain string, or null if the text was not a number. */
  function numberTextFromDrop(text) {
    var n = parseNumber(text, false);
    if (n === null) return null;
    /* toPrecision(12) then tidy: enough digits for anything a candidate can
       produce, without turning 0.1 + 0.2 into 0.30000000000000004. */
    var s = Number(n.toPrecision(12)).toString();
    return (s.indexOf('e') === -1) ? s : String(n);
  }

  /* ======================================================================
     2. CHOICES
     ====================================================================== */

  /* One option from a list — a radio, a dropdown, the chart-type question.
     Right only if the chosen id is exactly the key's id. Nothing chosen is
     wrong, and the screen shows "Not answered". (R-D19.) */
  function markChoice(value, options, answer) {
    return {
      correct: value === answer,
      given: value === undefined ? null : value,
      expected: answer,
      notAnswered: (value === null || value === undefined || value === '')
    };
  }

  /* Several options from a list — "select all that apply".

     All-or-nothing for the score (R-D20): the set chosen must equal the set
     in the key. Getting three of four right scores zero. But `perOption`
     reports every option separately so the results screen can still show the
     candidate exactly which one they got wrong, which is the whole point of
     marking it. */
  function markMulti(values, options, answer) {
    var chosen = {}, expected = {}, i;
    var vs = values || [];
    for (i = 0; i < vs.length; i++) chosen[vs[i]] = true;
    for (i = 0; i < answer.length; i++) expected[answer[i]] = true;

    var perOption = {};
    var ids = Object.keys(options);
    var ok = true;
    for (i = 0; i < ids.length; i++) {
      var id = ids[i];
      var c = !!chosen[id], s = !!expected[id];
      perOption[id] = { chosen: c, shouldBe: s };
      if (c !== s) ok = false;
    }
    /* A chosen id that is not an option at all would slip past the loop
       above, so count the sets as well. */
    if (Object.keys(chosen).length !== Object.keys(expected).length) ok = false;

    return { correct: ok, per_option: perOption, given: vs.slice(), expected: answer.slice() };
  }

  /* ======================================================================
     3. COLLECTING (the Investigation journal, and "collect" cases)
     ====================================================================== */

  /* R-D18 and R-D37. Score = the required items present, out of the required
     items — but an item fetched on a SECOND visit to the Investigation is
     worth less than one collected first time.

     Why: going back from the Analysis to look something up is allowed, and
     the candidate who planned properly and collected it first time should not
     score the same as the one who went back for it. How much less is a
     decision for the business, not for this file, so `weight` comes from
     `version.json` as `return_visit_weight`: 1 means no penalty at all, 0.5
     is the half mark WK and Francesco chose, 0 means only the first pass
     counts. Absent means 1.

     Items the candidate collected that were NOT required are listed on the
     results screen as "collected but not needed" and carry NO penalty. That
     is deliberate: the real game does not tell the candidate they
     over-collected, and punishing it twice (once by wasted time, once by
     score) is not what we are measuring.

     Anything in the journal that is not one of this phase's items at all — a
     calculator result, an Analysis answer copied in automatically — is
     neither found nor an extra. It simply is not part of this count.

     Collect CASES call this with two arguments and are unaffected: there is
     no going back to a case, so there is no such thing as a return visit. */
  function markCollect(journalIds, items, returnVisitIds, weight) {
    var ids = Object.keys(items);
    var required = [], i, id;
    for (i = 0; i < ids.length; i++) if (items[ids[i]].required) required.push(ids[i]);

    var inJournal = {};
    var js = journalIds || [];
    for (i = 0; i < js.length; i++) inJournal[js[i]] = true;

    var onReturn = {};
    var rv = returnVisitIds || [];
    for (i = 0; i < rv.length; i++) onReturn[rv[i]] = true;
    var w = (weight === undefined || weight === null) ? 1 : weight;

    var found = [], missing = [], returnVisit = [], score = 0;
    for (i = 0; i < required.length; i++) {
      id = required[i];
      if (!inJournal[id]) { missing.push(id); continue; }
      found.push(id);
      /* An id listed as a return visit but never actually in the journal is
         not found at all, so it is simply missed — it can never earn part of
         a mark for something that was not collected. */
      if (onReturn[id]) { returnVisit.push(id); score += w; } else { score += 1; }
    }

    var isRequired = {};
    for (i = 0; i < required.length; i++) isRequired[required[i]] = true;

    /* Walk the journal in the order the candidate built it, so the extras
       list is the same every time it is computed. */
    var extras = [], seen = {};
    for (i = 0; i < js.length; i++) {
      id = js[i];
      if (items[id] && !isRequired[id] && !seen[id]) { extras.push(id); seen[id] = true; }
    }

    return {
      required: required.length,
      found: found, missing: missing, extras: extras,
      returnVisit: returnVisit, weight: w,
      score: score, of: required.length
    };
  }

  /* ======================================================================
     4. THE CALCULATOR'S ARITHMETIC

     R-D3: the candidate does the sums, the calculator does not do the work
     for them. So this is an ordinary four-function evaluator, nothing more.

     There is NO `eval` here and there must never be. `eval` would run any
     JavaScript the expression happened to contain, which is both a security
     hole and impossible to reason about. Instead the expression is broken
     into tokens and read by a small parser that only knows about numbers,
     four operators and brackets. Anything else is an error.
     ====================================================================== */

  function evaluate(expr) {
    var src = String(expr === null || expr === undefined ? '' : expr)
                .replace(/,/g, '')     // "1,200" is 1200 (RD-GAME-RULES 6.3)
                .replace(/\s+/g, '');
    if (src === '') return { error: 'Empty' };

    var pos = 0;

    function peek() { return src.charAt(pos); }

    /* A number, a bracketed expression, or a sign in front of either. */
    function factor() {
      var c = peek();
      if (c === '+' || c === '-') {
        pos++;
        var inner = factor();
        if (inner.error) return inner;
        return { value: c === '-' ? -inner.value : inner.value };
      }
      if (c === '(') {
        pos++;
        var e = expression();
        if (e.error) return e;
        if (peek() !== ')') return { error: 'Missing )' };
        pos++;
        return e;
      }
      var start = pos;
      while (pos < src.length && src.charAt(pos) >= '0' && src.charAt(pos) <= '9') pos++;
      if (peek() === '.') {
        pos++;
        while (pos < src.length && src.charAt(pos) >= '0' && src.charAt(pos) <= '9') pos++;
      }
      if (pos === start) return { error: 'Unexpected "' + (c || 'end') + '"' };
      var text = src.slice(start, pos);
      if (text === '.') return { error: 'Unexpected "."' };
      return { value: Number(text) };
    }

    function term() {
      var left = factor();
      if (left.error) return left;
      while (peek() === '*' || peek() === '/') {
        var op = peek(); pos++;
        var right = factor();
        if (right.error) return right;
        if (op === '*') {
          left = { value: left.value * right.value };
        } else {
          if (right.value === 0) return { error: 'Cannot divide by zero' };
          left = { value: left.value / right.value };
        }
      }
      return left;
    }

    function expression() {
      var left = term();
      if (left.error) return left;
      while (peek() === '+' || peek() === '-') {
        var op = peek(); pos++;
        var right = term();
        if (right.error) return right;
        left = { value: op === '+' ? left.value + right.value : left.value - right.value };
      }
      return left;
    }

    var result = expression();
    if (result.error) return result;
    if (pos !== src.length) return { error: 'Unexpected "' + src.charAt(pos) + '"' };
    if (!isFinite(result.value)) return { error: 'Not a number' };

    /* R-D17: every result is rounded to 3 decimal places. This is what the
       real game does — confirmed from a candidate's screenshot, where
       365 * 0.029412 showed as 10.735. */
    return { value: Math.round(result.value * 1000) / 1000 };
  }

  /* How a calculator result is written out: 3 decimal places at most, and no
     trailing zeros ("161.91" stays "161.91", never "161.910"). */
  function formatNumber(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    var s = (Math.round(n * 1000) / 1000).toFixed(3);
    s = s.replace(/\.?0+$/, '');
    return s === '' || s === '-' ? '0' : s;
  }

  /* ======================================================================
     5. MARKING A WHOLE RUN
     ====================================================================== */

  function isLate(leaf) {
    return !!(leaf && typeof leaf === 'object' &&
              leaf.secondsLeft !== null && leaf.secondsLeft !== undefined &&
              leaf.secondsLeft <= 0);
  }
  function leafValue(leaf) {
    return (leaf && typeof leaf === 'object' && 'value' in leaf) ? leaf.value : leaf;
  }

  /* markGame is called ONCE, when Finish Study is confirmed. Nothing is
     marked as the candidate plays and nothing about marking is visible
     before the results screen (RD-GAME-RULES 9.1). */
  function markGame(content, answers) {
    var inv = content.investigation, ana = content.analysis;
    var rep = content.report, cas = content.cases;
    var A = answers || {};
    var lateCount = 0;
    var i, j;

    /* ---- Investigation ---- */
    var invAnswers = A.investigation || {};
    var returnWeight = (content.version && content.version.return_visit_weight !== undefined &&
                        content.version.return_visit_weight !== null)
                         ? content.version.return_visit_weight : 1;
    var investigation = markCollect(invAnswers.journal || [], inv.items,
                                    invAnswers.return_visit || [], returnWeight);
    investigation.explanation = inv.explanation || '';
    /* Carry each item's label and its "why it was needed" line through, so
       the results screen never has to look anything up itself. */
    investigation.labels = {};
    var itemIds = Object.keys(inv.items);
    for (i = 0; i < itemIds.length; i++) {
      var it = inv.items[itemIds[i]];
      investigation.labels[itemIds[i]] = {
        label: it.label, text: it.text, needed_for: it.needed_for || ''
      };
    }

    /* ---- Analysis ---- */
    var questions = [], aScore = 0, aOf = 0;
    for (i = 0; i < ana.questions.length; i++) {
      var q = ana.questions[i], boxes = [];
      for (j = 0; j < q.boxes.length; j++) {
        var b = q.boxes[j];
        var leaf = (A.analysis || {})[b.id];
        var m = markNumber(leafValue(leaf), b);
        m.id = b.id;
        m.label = b.label;
        m.unit = b.unit || '';
        m.explanation = b.explanation || '';
        m.late = isLate(leaf);
        if (m.late) lateCount++;
        aOf++; if (m.correct) aScore++;
        boxes.push(m);
      }
      questions.push({ number: q.number, text: q.text, boxes: boxes });
    }
    var analysis = { questions: questions, score: aScore, of: aOf };

    /* ---- Report ---- */
    var R = A.report || {};
    var written = [], rScore = 0, rOf = 0;
    var blankIds = Object.keys(rep.written.blanks);
    for (i = 0; i < blankIds.length; i++) {
      var bid = blankIds[i], blank = rep.written.blanks[bid];
      var wLeaf = (R.written || {})[bid];
      var wm;
      if (blank.kind === 'dropdown') {
        wm = markChoice(leafValue(wLeaf), blank.options, blank.answer);
        wm.expectedLabel = blank.options[blank.answer];
        wm.givenLabel = (wm.given !== null && blank.options[wm.given] !== undefined)
                          ? blank.options[wm.given] : null;
      } else {
        wm = markNumber(leafValue(wLeaf), blank);
      }
      wm.id = bid;
      wm.kind = blank.kind;
      wm.explanation = blank.explanation || '';
      wm.late = isLate(wLeaf);
      if (wm.late) lateCount++;
      rOf++; if (wm.correct) rScore++;
      written.push(wm);
    }

    var cLeaf = R.chart;
    var chart = markChoice(leafValue(cLeaf), rep.chart.options, rep.chart.answer);
    chart.explanation = rep.chart.explanation || '';
    chart.late = isLate(cLeaf);
    if (chart.late) lateCount++;
    rOf++; if (chart.correct) rScore++;

    var grid = [];
    for (i = 0; i < rep.grid.cells.length; i++) {
      for (j = 0; j < rep.grid.cells[i].length; j++) {
        var cell = rep.grid.cells[i][j];
        if ('fixed' in cell) continue;          // pre-filled cells are not marked (9.6)
        var gLeaf = (R.grid || {})[cell.id];
        var gm = markNumber(leafValue(gLeaf), cell);
        gm.id = cell.id;
        gm.row = i; gm.col = j;
        gm.rowLabel = rep.grid.rows[i];
        gm.colLabel = rep.grid.columns[j];
        gm.late = isLate(gLeaf);
        if (gm.late) lateCount++;
        rOf++; if (gm.correct) rScore++;
        grid.push(gm);
      }
    }
    var report = {
      written: written, chart: chart, grid: grid,
      gridExplanation: rep.grid.explanation || '',
      score: rScore, of: rOf
    };

    /* ---- Cases ----
       A case is ONE mark however many boxes it has: right only if every box
       is right. That matches the multi-select rule and keeps the case count
       (6) the same as the score's denominator. `detail` still carries every
       box so the results screen shows which one was wrong. */
    var casesOut = [], cScore = 0;
    for (i = 0; i < cas.cases.length; i++) {
      var c = cas.cases[i];
      var ans = (A.cases || {})[c.number] || (A.cases || {})[String(c.number)] || {};
      var mech = c.mechanism;
      var caseLate = isLate(ans);
      if (caseLate) lateCount++;
      var ok = false, detail = {};

      if (mech === 'choose_one') {
        var cm = markChoice(ans.value, c.options, c.answer);
        ok = cm.correct;
        detail = {
          given: cm.given, expected: c.answer,
          givenLabel: (cm.given !== null && c.options[cm.given] !== undefined) ? c.options[cm.given] : null,
          expectedLabel: c.options[c.answer],
          notAnswered: cm.notAnswered
        };
      } else if (mech === 'choose_many') {
        var mm = markMulti(ans.values, c.options, c.answer);
        ok = mm.correct;
        detail = { per_option: mm.per_option, labels: c.options,
                   option_explanations: c.option_explanations || {} };
      } else if (mech === 'dropdowns') {
        var given = ans.dropdowns || {};
        var per = [];
        ok = true;
        for (j = 0; j < c.dropdowns.length; j++) {
          var d = c.dropdowns[j];
          var dm = markChoice(given[d.id], d.options, d.answer);
          per.push({
            id: d.id, label: d.label, given: dm.given, expected: d.answer,
            givenLabel: (dm.given !== null && d.options[dm.given] !== undefined) ? d.options[dm.given] : null,
            expectedLabel: d.options[d.answer],
            correct: dm.correct, notAnswered: dm.notAnswered
          });
          if (!dm.correct) ok = false;
        }
        detail = { dropdowns: per };
      } else if (mech === 'number' || mech === 'numbers') {
        var gb = ans.boxes || {};
        var pb = [];
        ok = true;
        for (j = 0; j < c.boxes.length; j++) {
          var cb = c.boxes[j];
          var bm = markNumber(gb[cb.id], cb);
          bm.id = cb.id; bm.label = cb.label;
          bm.explanation = cb.explanation || '';
          pb.push(bm);
          if (!bm.correct) ok = false;
        }
        detail = { boxes: pb };
      } else if (mech === 'collect') {
        var col = markCollect(ans.journal || [], c.items);
        ok = col.missing.length === 0;
        col.labels = {};
        var cIds = Object.keys(c.items);
        for (j = 0; j < cIds.length; j++) {
          col.labels[cIds[j]] = { label: c.items[cIds[j]].label, text: c.items[cIds[j]].text };
        }
        detail = col;
      } else {
        throw new Error('unknown mechanism ' + mech);
      }

      if (ok) cScore++;
      casesOut.push({
        number: c.number, mechanism: mech, correct: !!ok, late: caseLate,
        question: c.question, detail: detail, explanation: c.explanation || ''
      });
    }

    var totalScore = investigation.score + analysis.score + report.score + cScore;
    var totalOf = investigation.of + analysis.of + report.of + cas.cases.length;

    var out = {
      investigation: investigation,
      analysis: analysis,
      report: report,
      cases: casesOut,
      casesScore: cScore,
      casesOf: cas.cases.length,
      total: { score: totalScore, of: totalOf },
      late: lateCount
    };

    /* ---- Where the candidate stands (v1.2, R-D42) ----
       Only when the content carries a `benchmark` block. The raw scores
       above are untouched: this is an extra reading of them, not a change
       to marking. Absent block = these five fields are all null, and the
       results screen draws no percentile card. */
    var bench = content.version && content.version.benchmark;
    if (bench) {
      out.weighted = weightedScore(out, bench.phase_weights);
      out.percentile = percentile(out.weighted, bench);
      out.decile = decileOf(out.percentile);
      out.topShare = 100 - out.percentile;
      out.zone = zoneOf(out.percentile, bench.zones);
    } else {
      out.weighted = null;
      out.percentile = null;
      out.decile = null;
      out.topShare = null;
      out.zone = null;
    }
    return out;
  }

  /* ======================================================================
     5b. WHERE THE CANDIDATE STANDS — the weighted score and the percentile
         (v1.2, R-D41 to R-D43)

     No database. The percentile is ESTIMATED from the score by a table in
     the content file, and the results screen says so.

     Why a weighted score and not the raw total: the raw total treats one
     collected piece of information as worth exactly one Analysis answer,
     which is not how anyone would rank a candidate. So each phase counts as
     a share of 100 set in the content (25 each for RR6):

         weighted = sum over the four phases of  weight x (score / out of)

     With 24.5/29, 8/8, 9/13 and 3/6 that is 25 x (0.845 + 1 + 0.692 + 0.5)
     = 75.9. Because it is always 0 to 100 whatever the item counts, one
     percentile table can serve every version.
     ====================================================================== */

  var PHASE_SCORES = {
    investigation: function (r) { return [r.investigation.score, r.investigation.of]; },
    analysis:      function (r) { return [r.analysis.score, r.analysis.of]; },
    report:        function (r) { return [r.report.score, r.report.of]; },
    cases:         function (r) { return [r.casesScore, r.casesOf]; }
  };

  /* The weighted score out of 100, to ONE decimal place.

     It is rounded here, once, and the percentile is then read off the
     rounded figure. That way the number the candidate sees ("75.9 / 100")
     is exactly the number anyone checking by hand would look up in the
     table, and the two can never disagree by a rounding hair. */
  function weightedScore(result, weights) {
    var sum = 0;
    var keys = Object.keys(PHASE_SCORES);
    for (var i = 0; i < keys.length; i++) {
      var w = (weights && typeof weights[keys[i]] === 'number') ? weights[keys[i]] : 0;
      var pair = PHASE_SCORES[keys[i]](result);
      if (pair[1] > 0) sum += w * (pair[0] / pair[1]);
    }
    return Math.round(sum * 10 + 1e-9) / 10;
  }

  /* Read a percentile off the content's table.

     `benchmark.percentiles` is a list of [weighted score, percentile] points,
     sorted by score. Between two points the percentile runs in a straight
     line; the result is rounded to a whole number. Outside the table the
     nearest end point holds, and the answer is always kept between 1 and 99
     (nobody is told they beat everyone, or no one). With RR6's table,
     68 -> 50, 75.9 -> 63 and 100 -> 99. */
  function percentile(weighted, benchmark) {
    var pts = (benchmark && benchmark.percentiles) || [];
    if (!pts.length || typeof weighted !== 'number' || !isFinite(weighted)) return null;
    var value;
    if (weighted <= pts[0][0]) {
      value = pts[0][1];
    } else if (weighted >= pts[pts.length - 1][0]) {
      value = pts[pts.length - 1][1];
    } else {
      value = pts[pts.length - 1][1];
      for (var i = 1; i < pts.length; i++) {
        if (weighted <= pts[i][0]) {
          var x0 = pts[i - 1][0], y0 = pts[i - 1][1], x1 = pts[i][0], y1 = pts[i][1];
          value = (x1 === x0) ? y1 : y0 + (y1 - y0) * (weighted - x0) / (x1 - x0);
          break;
        }
      }
    }
    var whole = Math.floor(value + 0.5 + 1e-9);
    return Math.max(1, Math.min(99, whole));
  }

  /* Decile 1 to 10: the 72nd percentile is in decile 8 (R-D41). */
  function decileOf(p) {
    if (typeof p !== 'number') return null;
    return Math.max(1, Math.min(10, Math.ceil(p / 10)));
  }

  /* The last zone whose `from` is at or below the percentile. The index is
     returned as well so the screen can colour it without reading meaning
     out of the label. */
  function zoneOf(p, zones) {
    if (typeof p !== 'number' || !zones || !zones.length) return null;
    var found = null;
    for (var i = 0; i < zones.length; i++) {
      if (zones[i].from <= p) found = { index: i, from: zones[i].from, label: zones[i].label };
    }
    return found;
  }

  /* ======================================================================
     6. THE ANSWER KEY (what tools/answer-key.html prints)
     ====================================================================== */

  function answerKey(content) {
    var inv = content.investigation, out, i, j;

    /* Which section each item appears in, so the key can be grouped the way
       the printed key is. Worked out by looking for [[id]] in every block. */
    var sectionOf = {}, sectionIndexOf = {};
    for (i = 0; i < inv.sections.length; i++) {
      var sec = inv.sections[i];
      var text = JSON.stringify(sec.blocks);
      var ids = Object.keys(inv.items);
      for (j = 0; j < ids.length; j++) {
        if (text.indexOf('[[' + ids[j] + ']]') !== -1) {
          sectionOf[ids[j]] = sec.heading;
          sectionIndexOf[ids[j]] = i;
        }
      }
    }

    var investigation = [];
    var allIds = Object.keys(inv.items);
    for (i = 0; i < allIds.length; i++) {
      var it = inv.items[allIds[i]];
      if (!it.required) continue;
      investigation.push({
        id: allIds[i], label: it.label, text: it.text,
        section: sectionOf[allIds[i]] || '',
        sectionIndex: sectionIndexOf[allIds[i]] === undefined ? 999 : sectionIndexOf[allIds[i]],
        needed_for: it.needed_for || ''
      });
    }
    /* Print them grouped by the part of the study they came from, in the
       order those parts appear on screen — otherwise a heading repeats every
       time the items happen to jump back to an earlier exhibit, which reads
       like a mistake. A stable sort keeps the original order within a part. */
    investigation = investigation.map(function (item, order) {
      return { item: item, order: order };
    }).sort(function (a, b) {
      return (a.item.sectionIndex - b.item.sectionIndex) || (a.order - b.order);
    }).map(function (wrapped) { return wrapped.item; });

    var analysis = [];
    for (i = 0; i < content.analysis.questions.length; i++) {
      var q = content.analysis.questions[i];
      var boxes = [];
      for (j = 0; j < q.boxes.length; j++) {
        var b = q.boxes[j];
        boxes.push({
          id: b.id, label: b.label, unit: b.unit || '', answer: b.answer,
          decimals: b.accept.decimals, any_of: b.accept.any_of || [],
          explanation: b.explanation || ''
        });
      }
      analysis.push({ number: q.number, text: q.text, boxes: boxes });
    }

    var rep = content.report;
    var written = [];
    var blankIds = Object.keys(rep.written.blanks);
    for (i = 0; i < blankIds.length; i++) {
      var bl = rep.written.blanks[blankIds[i]];
      written.push({
        id: blankIds[i], kind: bl.kind,
        answer: bl.answer,
        answerLabel: bl.kind === 'dropdown' ? bl.options[bl.answer] : String(bl.answer),
        decimals: bl.kind === 'number' ? bl.accept.decimals : null,
        any_of: bl.kind === 'number' ? (bl.accept.any_of || []) : [],
        explanation: bl.explanation || ''
      });
    }
    var gridCells = [];
    for (i = 0; i < rep.grid.cells.length; i++) {
      for (j = 0; j < rep.grid.cells[i].length; j++) {
        var cell = rep.grid.cells[i][j];
        gridCells.push({
          id: cell.id || null, row: rep.grid.rows[i], col: rep.grid.columns[j],
          answer: ('fixed' in cell) ? cell.fixed : cell.answer,
          fixed: ('fixed' in cell),
          decimals: (cell.accept && typeof cell.accept.decimals === 'number') ? cell.accept.decimals : null,
          any_of: (cell.accept && cell.accept.any_of) || []
        });
      }
    }

    var cases = [];
    for (i = 0; i < content.cases.cases.length; i++) {
      var c = content.cases.cases[i];
      var entry = {
        number: c.number, mechanism: c.mechanism, question: c.question,
        explanation: c.explanation || '', answer: null, parts: []
      };
      if (c.mechanism === 'choose_one') {
        entry.answer = c.options[c.answer];
      } else if (c.mechanism === 'choose_many') {
        var picked = [];
        for (j = 0; j < c.answer.length; j++) picked.push(c.options[c.answer[j]]);
        entry.answer = picked.join('; ');
      } else if (c.mechanism === 'dropdowns') {
        for (j = 0; j < c.dropdowns.length; j++) {
          entry.parts.push({ label: c.dropdowns[j].label,
                             answer: c.dropdowns[j].options[c.dropdowns[j].answer] });
        }
      } else if (c.mechanism === 'number' || c.mechanism === 'numbers') {
        for (j = 0; j < c.boxes.length; j++) {
          entry.parts.push({ label: c.boxes[j].label, answer: String(c.boxes[j].answer),
                             decimals: c.boxes[j].accept.decimals,
                             any_of: c.boxes[j].accept.any_of || [],
                             explanation: c.boxes[j].explanation || '' });
        }
      } else if (c.mechanism === 'collect') {
        var reqd = [], cIds = Object.keys(c.items);
        for (j = 0; j < cIds.length; j++) {
          if (c.items[cIds[j]].required) {
            reqd.push({ label: c.items[cIds[j]].label, answer: c.items[cIds[j]].text });
          }
        }
        entry.parts = reqd;
      }
      cases.push(entry);
    }

    out = {
      title: content.version.title,
      scenario: content.version.scenario,
      returnVisitWeight: (content.version.return_visit_weight === undefined ||
                          content.version.return_visit_weight === null)
                           ? 1 : content.version.return_visit_weight,
      investigation: investigation,
      investigationExplanation: inv.explanation || '',
      analysis: analysis,
      report: {
        template: rep.written.template, written: written,
        chart: { prompt: rep.chart.prompt, answer: rep.chart.answer,
                 explanation: rep.chart.explanation || '' },
        grid: { prompt: rep.grid.prompt, cells: gridCells,
                explanation: rep.grid.explanation || '' }
      },
      cases: cases,
      /* v1.2: what the results page's percentile card is read from, so the
         printed key shows WK the mapping (weights, zones, table) and whether
         this version is a demo. */
      benchmark: content.version.benchmark || null,
      resultsMode: content.version.results_mode || 'full',
      totals: {
        investigation: investigation.length,
        analysis: analysis.reduce(function (n, q) { return n + q.boxes.length; }, 0),
        report: written.length + 1 + gridCells.filter(function (c) { return !c.fixed; }).length,
        cases: cases.length
      }
    };
    out.totals.total = out.totals.investigation + out.totals.analysis +
                       out.totals.report + out.totals.cases;
    return out;
  }

  /* ======================================================================
     7. CONTENT VALIDATION (RD-BUILD-SPEC §4)

     The point of this is that WK will be typing the next five versions by
     hand. A typo must produce a plain-English complaint naming the file and
     the field, not a blank screen or — far worse — a simulation that runs
     and marks the wrong thing.
     ====================================================================== */

  /* Which declared items a set of blocks actually uses.

     There are TWO ways a block can call for an item and validation has to
     know about both, or it will refuse perfectly good content:

       · [[some_id]] written inside a piece of text, a list entry or a table
         cell — the common case;
       · a bar chart, where each bar's value names its item in the series'
         "items" list rather than in any text.

     RR6 has no charted exhibit, so only the first form appears in it. RR1 to
     RR3 do have charted exhibits, and leaving the second form out here would
     have made every one of them fail to load with a complaint that its items
     were "declared but never used" — a fault that would only have surfaced
     at replication, which is the moment this whole format exists to make
     easy. ({{7}} needs no declaration and is not counted.) */
  function itemsUsedIn(blocks) {
    var found = [];
    var list = blocks || [];
    for (var i = 0; i < list.length; i++) {
      var block = list[i];
      if (block && block.kind === 'bar_chart') {
        var series = block.series || [];
        for (var s = 0; s < series.length; s++) {
          var ids = series[s].items || [];
          for (var k = 0; k < ids.length; k++) if (ids[k]) found.push(ids[k]);
        }
        continue;                       /* a bar chart carries no [[…]] text */
      }
      var text = JSON.stringify(block);
      var re = /\[\[([A-Za-z0-9_]+)\]\]/g, m;
      while ((m = re.exec(text)) !== null) found.push(m[1]);
    }
    return found;
  }

  /* The percentile block (v1.2). Every complaint says what is wrong and what
     it should look like, because WK will be editing these numbers by hand. */
  function validateBenchmark(b, errors) {
    var where = 'version.json: benchmark';
    function isNum(v) { return typeof v === 'number' && isFinite(v); }
    if (typeof b !== 'object' || Array.isArray(b)) {
      errors.push(where + ' must be a block of settings in curly brackets, or left out altogether.');
      return;
    }
    if (b.note !== undefined && typeof b.note !== 'string') {
      errors.push(where + '."note" must be a piece of text in quotes.');
    }

    /* phase_weights: four numbers adding up to 100 */
    var phases = ['investigation', 'analysis', 'report', 'cases'];
    var w = b.phase_weights;
    if (!w || typeof w !== 'object') {
      errors.push(where + '."phase_weights" is missing. It needs a number for each of ' +
                  'investigation, analysis, report and cases, adding up to 100.');
    } else {
      var sum = 0, allNumbers = true;
      for (var i = 0; i < phases.length; i++) {
        if (!isNum(w[phases[i]]) || w[phases[i]] < 0) {
          errors.push(where + '."phase_weights"."' + phases[i] + '" must be a number of 0 or more.');
          allNumbers = false;
        } else {
          sum += w[phases[i]];
        }
      }
      if (allNumbers && Math.abs(sum - 100) > 1e-6) {
        errors.push(where + '."phase_weights" add up to ' + sum + ', but they must add up to ' +
                    'exactly 100 (25 each counts every phase equally).');
      }
    }

    /* zones: sorted by "from", the first starting at 0 */
    var z = b.zones;
    if (!Array.isArray(z) || !z.length) {
      errors.push(where + '."zones" must be a list of bands, each {"from": number, "label": "text"}, ' +
                  'the first starting at 0.');
    } else {
      for (var j = 0; j < z.length; j++) {
        if (!z[j] || !isNum(z[j].from) || z[j].from < 0 || z[j].from > 100) {
          errors.push(where + ' zone ' + (j + 1) + ' needs a "from" percentile between 0 and 100.');
        }
        if (!z[j] || typeof z[j].label !== 'string' || z[j].label.trim() === '') {
          errors.push(where + ' zone ' + (j + 1) + ' has no "label".');
        }
        if (j > 0 && z[j] && z[j - 1] && isNum(z[j].from) && isNum(z[j - 1].from) &&
            z[j].from <= z[j - 1].from) {
          errors.push(where + ' zones are out of order: zone ' + (j + 1) + ' starts at ' + z[j].from +
                      ', which is not above zone ' + j + '\'s ' + z[j - 1].from +
                      '. List them from the lowest "from" to the highest.');
        }
      }
      if (z[0] && isNum(z[0].from) && z[0].from !== 0) {
        errors.push(where + ' the first zone must start at 0, so every percentile falls in a zone. ' +
                    'It starts at ' + z[0].from + '.');
      }
    }

    /* percentiles: [score 0-100, percentile 1-99], sorted, never falling */
    var pts = b.percentiles;
    if (!Array.isArray(pts) || pts.length < 2) {
      errors.push(where + '."percentiles" must be a list of at least two [weighted score, percentile] ' +
                  'points, for example [[0,1],[100,99]].');
    } else {
      for (var k = 0; k < pts.length; k++) {
        var pt = pts[k];
        var label = where + ' point ' + (k + 1);
        if (!Array.isArray(pt) || pt.length !== 2 || !isNum(pt[0]) || !isNum(pt[1])) {
          errors.push(label + ' must be two numbers in square brackets: [weighted score, percentile].');
          continue;
        }
        if (pt[0] < 0 || pt[0] > 100) {
          errors.push(label + ' has a weighted score of ' + pt[0] + '; scores run from 0 to 100.');
        }
        if (pt[1] < 1 || pt[1] > 99) {
          errors.push(label + ' has a percentile of ' + pt[1] + '; percentiles run from 1 to 99.');
        }
        var prev = pts[k - 1];
        if (k > 0 && Array.isArray(prev) && isNum(prev[0]) && isNum(prev[1])) {
          if (pt[0] <= prev[0]) {
            errors.push(label + ' has a score of ' + pt[0] + ', which is not above the point before it (' +
                        prev[0] + '). List the points from the lowest score to the highest.');
          }
          if (pt[1] < prev[1]) {
            errors.push(label + ' has a percentile of ' + pt[1] + ', lower than the point before it (' +
                        prev[1] + '). A higher score can never mean a lower percentile.');
          }
        }
      }
    }
  }

  function validateContent(version, investigation, analysis, report, cases) {
    var errors = [];
    var i, j, k, ids, id;

    function need(cond, msg) { if (!cond) errors.push(msg); }
    function nonEmpty(v) { return typeof v === 'string' && v.trim() !== ''; }

    /* ---- version.json ---- */
    need(version && nonEmpty(version.id), 'version.json: "id" is missing or empty.');
    need(version && nonEmpty(version.title), 'version.json: "title" is missing or empty.');
    need(version && typeof version.time_limit_minutes === 'number' && version.time_limit_minutes > 0,
         'version.json: "time_limit_minutes" must be a number greater than zero.');
    need(version && typeof version.case_count === 'number' && version.case_count > 0,
         'version.json: "case_count" must be a number greater than zero.');
    if (version && version.return_visit_weight !== undefined && version.return_visit_weight !== null) {
      need(typeof version.return_visit_weight === 'number' &&
           version.return_visit_weight >= 0 && version.return_visit_weight <= 1,
           'version.json: "return_visit_weight" must be a number from 0 to 1. It is the ' +
           'share of a mark earned by an item fetched on a return visit to the Investigation ' +
           '(1 = no penalty, 0.5 = half a mark, 0 = only the first visit counts). ' +
           'Leave it out altogether for no penalty.');
    }
    /* v1.2 — the results page's two new switches. Both optional. */
    if (version && version.results_mode !== undefined && version.results_mode !== null) {
      need(version.results_mode === 'full' || version.results_mode === 'demo',
           'version.json: "results_mode" must be "full" (every answer explained) or "demo" ' +
           '(score and percentile only, the explanations locked). Leave it out for "full".');
    }
    if (version && version.results_mode === 'demo') {
      need(version.labels && nonEmpty(version.labels.demo_note),
           'version.json: "results_mode" is "demo", so labels."demo_note" must say what the ' +
           'demo leaves out. It is the notice shown above the locked answers.');
    }
    if (version && version.benchmark !== undefined && version.benchmark !== null) {
      validateBenchmark(version.benchmark, errors);
    }
    if (version && version.buttons) {
      var needButtons = ['complete_investigation', 'next_question', 'conclude',
                         'next_section', 'complete_report', 'next_case', 'finish'];
      for (i = 0; i < needButtons.length; i++) {
        need(nonEmpty(version.buttons[needButtons[i]]),
             'version.json: buttons."' + needButtons[i] + '" is missing or empty.');
      }
    } else {
      errors.push('version.json: "buttons" is missing.');
    }
    if (version && version.popups) {
      var needPopups = ['to_analysis', 'analysis_tutorial', 'next_question', 'to_report',
                        'next_section', 'cases_tutorial', 'next_case', 'restart'];
      for (i = 0; i < needPopups.length; i++) {
        var p = version.popups[needPopups[i]];
        need(p && nonEmpty(p.title) && nonEmpty(p.go),
             'version.json: popups."' + needPopups[i] + '" needs a "title" and a "go" label.');
      }
    } else {
      errors.push('version.json: "popups" is missing.');
    }

    /* ---- investigation.json ---- */
    if (!investigation || !investigation.items || !investigation.sections) {
      errors.push('investigation.json: "items" and "sections" are both required.');
    } else {
      need(nonEmpty(investigation.directions), 'investigation.json: "directions" is empty.');

      var sectionIds = {};
      for (i = 0; i < investigation.sections.length; i++) {
        var sec = investigation.sections[i];
        need(nonEmpty(sec.id), 'investigation.json: section ' + (i + 1) + ' has no "id".');
        need(nonEmpty(sec.heading), 'investigation.json: section "' + sec.id + '" has no "heading".');
        sectionIds[sec.id] = true;
      }
      for (i = 0; i < (investigation.tabs || []).length; i++) {
        need(sectionIds[investigation.tabs[i].id],
             'investigation.json: tab "' + investigation.tabs[i].id +
             '" points at a section that does not exist.');
      }

      /* Every [[id]] must resolve, and every declared item must be used
         exactly once. An item used twice would give the candidate two copies
         of the same draggable, and one used never is invisible but still
         scored — both are silent faults, so both are refused. */
      var used = {};
      var all = [];
      for (i = 0; i < investigation.sections.length; i++) {
        all = all.concat(itemsUsedIn(investigation.sections[i].blocks));
      }
      for (i = 0; i < all.length; i++) {
        id = all[i];
        if (!investigation.items[id]) {
          errors.push('investigation.json: [[' + id + ']] appears in the text but is not ' +
                      'declared in "items".');
        }
        used[id] = (used[id] || 0) + 1;
      }
      ids = Object.keys(investigation.items);
      var requiredCount = 0;
      for (i = 0; i < ids.length; i++) {
        id = ids[i];
        var item = investigation.items[id];
        need(nonEmpty(item.label), 'investigation.json: item "' + id + '" has no "label".');
        need(nonEmpty(String(item.text === undefined ? '' : item.text)),
             'investigation.json: item "' + id + '" has no "text".');
        if (!used[id]) {
          errors.push('investigation.json: item "' + id + '" is declared but never used ' +
                      'as [[' + id + ']] in any section.');
        } else if (used[id] > 1) {
          errors.push('investigation.json: item "' + id + '" is used ' + used[id] +
                      ' times; each item may appear only once.');
        }
        if (item.required) requiredCount++;
      }
      need(requiredCount >= 1,
           'investigation.json: no item is marked "required": true, so the Investigation ' +
           'phase would be scored out of zero.');
    }

    /* ---- analysis.json ---- */
    if (!analysis || !analysis.questions || !analysis.questions.length) {
      errors.push('analysis.json: "questions" is missing or empty.');
    } else {
      for (i = 0; i < analysis.questions.length; i++) {
        var q = analysis.questions[i];
        var qn = 'analysis.json: question ' + (q.number !== undefined ? q.number : i + 1);
        need(nonEmpty(q.text), qn + ' has no "text".');
        if (!q.boxes || !q.boxes.length) {
          errors.push(qn + ' has no answer boxes.');
        } else {
          need(q.boxes.length <= 4, qn + ' has ' + q.boxes.length +
               ' answer boxes; the layout supports at most 4.');
          for (j = 0; j < q.boxes.length; j++) {
            var b = q.boxes[j];
            need(nonEmpty(b.id), qn + ': a box has no "id".');
            need(nonEmpty(b.label), qn + ': box "' + b.id + '" has no "label".');
            need(typeof b.answer === 'number',
                 qn + ': box "' + b.id + '" must have a numeric "answer".');
            need(b.accept && typeof b.accept.decimals === 'number',
                 qn + ': box "' + b.id + '" must have "accept": {"decimals": n}.');
          }
        }
      }
      need(nonEmpty(analysis.review_text), 'analysis.json: "review_text" is empty.');
    }

    /* ---- report.json ---- */
    if (!report || !report.written || !report.chart || !report.grid) {
      errors.push('report.json: "written", "chart" and "grid" are all required.');
    } else {
      var tpl = report.written.template || '';
      var blanks = report.written.blanks || {};
      var inTemplate = {}, re = /\[\[([A-Za-z0-9_]+)\]\]/g, m;
      while ((m = re.exec(tpl)) !== null) inTemplate[m[1]] = (inTemplate[m[1]] || 0) + 1;
      ids = Object.keys(blanks);
      for (i = 0; i < ids.length; i++) {
        id = ids[i];
        if (!inTemplate[id]) {
          errors.push('report.json: blank "' + id + '" is declared but [[' + id +
                      ']] does not appear in the template.');
        } else if (inTemplate[id] > 1) {
          errors.push('report.json: [[' + id + ']] appears ' + inTemplate[id] +
                      ' times in the template; each blank may appear only once.');
        }
        var bl = blanks[id];
        if (bl.kind === 'dropdown') {
          need(bl.options && Object.keys(bl.options).length >= 2,
               'report.json: blank "' + id + '" needs at least two "options".');
          need(bl.options && bl.options[bl.answer] !== undefined,
               'report.json: blank "' + id + '" has answer "' + bl.answer +
               '" which is not one of its options.');
        } else if (bl.kind === 'number') {
          need(typeof bl.answer === 'number',
               'report.json: blank "' + id + '" must have a numeric "answer".');
          need(bl.accept && typeof bl.accept.decimals === 'number',
               'report.json: blank "' + id + '" must have "accept": {"decimals": n}.');
        } else {
          errors.push('report.json: blank "' + id + '" has kind "' + bl.kind +
                      '"; it must be "dropdown" or "number".');
        }
      }
      var tplIds = Object.keys(inTemplate);
      for (i = 0; i < tplIds.length; i++) {
        if (!blanks[tplIds[i]]) {
          errors.push('report.json: the template contains [[' + tplIds[i] +
                      ']] but there is no blank called "' + tplIds[i] + '".');
        }
      }

      var opts = report.chart.options || [];
      need(opts.length >= 2, 'report.json: chart needs at least two "options".');
      need(opts.indexOf(report.chart.answer) !== -1,
           'report.json: chart.answer "' + report.chart.answer + '" is not one of chart.options.');
      need(opts.indexOf(report.chart.default) !== -1,
           'report.json: chart.default "' + report.chart.default + '" is not one of chart.options.');
      need(nonEmpty(report.chart.prompt), 'report.json: chart has no "prompt".');

      var g = report.grid;
      need(g.columns && g.columns.length >= 1, 'report.json: grid needs "columns".');
      need(g.rows && g.rows.length >= 1, 'report.json: grid needs "rows".');
      if (g.cells) {
        need(g.cells.length === (g.rows || []).length,
             'report.json: grid has ' + g.cells.length + ' rows of cells but ' +
             (g.rows || []).length + ' row labels.');
        for (i = 0; i < g.cells.length; i++) {
          need(g.cells[i].length === (g.columns || []).length,
               'report.json: grid row ' + (i + 1) + ' has ' + g.cells[i].length +
               ' cells but there are ' + (g.columns || []).length + ' columns.');
          for (j = 0; j < g.cells[i].length; j++) {
            var cell = g.cells[i][j];
            var isFixed = ('fixed' in cell);
            var isAnswer = (typeof cell.answer === 'number' &&
                            cell.accept && typeof cell.accept.decimals === 'number');
            need(isFixed || isAnswer,
                 'report.json: grid cell at row ' + (i + 1) + ', column ' + (j + 1) +
                 ' must be either {"fixed": value} or {"id", "answer", "accept":{"decimals"}}.');
            if (!isFixed) {
              need(nonEmpty(cell.id),
                   'report.json: grid cell at row ' + (i + 1) + ', column ' + (j + 1) +
                   ' has no "id".');
            }
          }
        }
      } else {
        errors.push('report.json: grid has no "cells".');
      }
    }

    /* ---- cases.json ---- */
    if (!cases || !cases.cases) {
      errors.push('cases.json: "cases" is missing.');
    } else {
      need(cases.cases.length === (version ? version.case_count : -1),
           'cases.json: there are ' + cases.cases.length + ' cases but version.json says ' +
           'case_count is ' + (version ? version.case_count : '?') + '.');
      for (i = 0; i < cases.cases.length; i++) {
        var c = cases.cases[i];
        var cn = 'cases.json: case ' + (c.number !== undefined ? c.number : i + 1);
        need(c.number === i + 1, cn + ' is out of order; cases must be numbered 1 to ' +
             cases.cases.length + ' in order.');
        need(nonEmpty(c.prompt), cn + ' has no "prompt".');
        need(nonEmpty(c.question), cn + ' has no "question".');
        need(nonEmpty(c.explanation), cn + ' has no "explanation".');

        if (c.mechanism === 'choose_one') {
          need(c.options && Object.keys(c.options).length >= 2, cn + ' needs at least two "options".');
          need(c.options && c.options[c.answer] !== undefined,
               cn + ': answer "' + c.answer + '" is not one of its options.');
        } else if (c.mechanism === 'choose_many') {
          need(c.options && Object.keys(c.options).length >= 2, cn + ' needs at least two "options".');
          if (!Array.isArray(c.answer)) {
            errors.push(cn + ': a choose_many case needs "answer" to be a list of option ids.');
          } else {
            for (j = 0; j < c.answer.length; j++) {
              need(c.options && c.options[c.answer[j]] !== undefined,
                   cn + ': answer "' + c.answer[j] + '" is not one of its options.');
            }
          }
        } else if (c.mechanism === 'dropdowns') {
          if (!c.dropdowns || !c.dropdowns.length) {
            errors.push(cn + ': a dropdowns case needs a "dropdowns" list.');
          } else {
            for (j = 0; j < c.dropdowns.length; j++) {
              var dd = c.dropdowns[j];
              need(nonEmpty(dd.id), cn + ': a dropdown has no "id".');
              need(dd.options && dd.options[dd.answer] !== undefined,
                   cn + ': dropdown "' + dd.id + '" has answer "' + dd.answer +
                   '" which is not one of its options.');
            }
          }
        } else if (c.mechanism === 'number' || c.mechanism === 'numbers') {
          if (!c.boxes || !c.boxes.length) {
            errors.push(cn + ': a ' + c.mechanism + ' case needs a "boxes" list.');
          } else {
            for (j = 0; j < c.boxes.length; j++) {
              need(nonEmpty(c.boxes[j].id), cn + ': a box has no "id".');
              need(nonEmpty(c.boxes[j].label), cn + ': box "' + c.boxes[j].id + '" has no "label".');
              need(typeof c.boxes[j].answer === 'number',
                   cn + ': box "' + c.boxes[j].id + '" must have a numeric "answer".');
              need(c.boxes[j].accept && typeof c.boxes[j].accept.decimals === 'number',
                   cn + ': box "' + c.boxes[j].id + '" must have "accept": {"decimals": n}.');
            }
          }
        } else if (c.mechanism === 'collect') {
          if (!c.items || !Object.keys(c.items).length) {
            errors.push(cn + ': a collect case needs an "items" list.');
          } else {
            var reqHere = 0, usedHere = {};
            var ph = itemsUsedIn(c.data);
            for (j = 0; j < ph.length; j++) {
              if (!c.items[ph[j]]) {
                errors.push(cn + ': [[' + ph[j] + ']] appears in the data but is not declared ' +
                            'in "items".');
              }
              usedHere[ph[j]] = (usedHere[ph[j]] || 0) + 1;
            }
            var cIds = Object.keys(c.items);
            for (j = 0; j < cIds.length; j++) {
              if (c.items[cIds[j]].required) reqHere++;
              need(nonEmpty(c.items[cIds[j]].label),
                   cn + ': item "' + cIds[j] + '" has no "label".');
              if (!usedHere[cIds[j]]) {
                errors.push(cn + ': item "' + cIds[j] + '" is declared but never used as [[' +
                            cIds[j] + ']] in the data.');
              }
            }
            need(reqHere >= 1, cn + ': no item is marked "required": true, so the case ' +
                 'could never be got right.');
          }
        } else {
          errors.push(cn + ': mechanism "' + c.mechanism + '" is not one of number, numbers, ' +
                      'choose_one, choose_many, dropdowns, collect.');
        }

        /* Bare {{n}} draggables and draggable tables need no declaration,
           but a table marked draggable must actually have rows. */
        for (j = 0; j < (c.data || []).length; j++) {
          if (c.data[j].kind === 'table') {
            need(c.data[j].rows && c.data[j].rows.length >= 1,
                 cn + ': a table in the data has no rows.');
          }
        }
      }
    }

    return errors.length ? { ok: false, errors: errors } : { ok: true, errors: [] };
  }

  /* ====================================================================== */

  root.MARKING = {
    validateContent: validateContent,
    evaluate: evaluate,
    formatNumber: formatNumber,
    roundTo: roundTo,
    parseNumber: parseNumber,
    numberTextFromDrop: numberTextFromDrop,
    markNumber: markNumber,
    markChoice: markChoice,
    markMulti: markMulti,
    markCollect: markCollect,
    markGame: markGame,
    weightedScore: weightedScore,
    percentile: percentile,
    decileOf: decileOf,
    zoneOf: zoneOf,
    answerKey: answerKey
  };

}(typeof globalThis !== 'undefined' ? globalThis : this));
