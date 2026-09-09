/* ==========================================================================
   app.js — THE SCREENS

   This file draws everything the candidate sees and works out nothing.

   It never rounds a number, compares an answer, decides whether something is
   right, or counts a score. When it needs one of those it asks js/marking.js
   and reads a plain field off the answer. That separation is the single most
   valuable thing carried over from the Sea Wolf rebuild: it is what let
   dozens of visual changes happen there without ever putting the marking at
   risk (SW-LEARNINGS 1.2).

   HOW IT WORKS

   One object called `state` holds everything. Something happens, a handler
   changes `state`, and `render()` redraws the current screen from scratch.
   Redrawing wholesale is slower than surgically updating one element and on
   a page this size the difference is invisible — but it removes a whole
   category of bug where the screen and the state disagree.

   The trap that comes with redrawing everything is that ANYTHING THE PAGE
   WAS REMEMBERING IS DESTROYED. Sea Wolf's cards snapped shut on every
   redraw because "which cards are open" lived in the page. So here, every
   last thing the interface remembers lives in `state`: journal entries and
   whether each is expanded, the calculator's line and history, which
   Investigation section is in view, how far each column is scrolled, which
   results blocks are open. If you add something the page must remember, put
   it in `state`.

   Three places deliberately do NOT redraw wholesale, because doing so would
   throw away something the candidate is in the middle of:
     - the clock, which updates its own two elements every second;
     - typing in an answer box, which writes to state and leaves the page be;
     - the calculator, which refreshes its own three parts.

   NO BROWSER STORAGE ANYWHERE. None of the browser's own places to keep
   things between pages is used, and none may be added. The old Redrock
   passed the timer, the journal and every answer between nineteen pages
   through browser storage, and that is exactly what produced Sea Wolf's
   intermittent live fault. A refresh returns to the login screen, and that
   is accepted. (The constraint is checked by a search of this folder, so
   even a mention of one of those names in a comment would look like a
   breach — which is why none appears here. README §7 names them.)
   ========================================================================== */

(function () {
  'use strict';

  var M = MARKING;
  var app = document.getElementById('app');
  var tooSmall = document.getElementById('too-small');

  /* The window below which the simulation stops rather than drawing a
     broken layout. */
  var MIN_WIDTH = 900;
  var MIN_HEIGHT = 540;

  /* When the clock passes each of these (seconds remaining) a notice appears
     top right for four seconds. The clock does NOT pause (R-D34). */
  var WARNING_SECONDS = [300, 240, 180, 120, 60];
  var WARNING_VISIBLE_MS = 4000;

  /* A journal entry longer than this gets an arrow to expand it. */
  var LONG_TEXT = 25;

  /* ====================================================================== *
   * STATE
   * ====================================================================== */

  var state = null;

  function freshRun(content) {
    return {
      phase: 'start',
      content: content,
      loggedIn: true,
      timer: {
        total: content.version.time_limit_minutes * 60,
        secondsLeft: content.version.time_limit_minutes * 60,
        running: false,
        paused: false,
        everStarted: false,
        warningsShown: []
      },
      journal: [],                 /* [{id, label, text, title, expanded, marked}] */

      /* Two photographs of the Research Journal, taken once each and never
         changed afterwards (R-D37):
           firstPassIds — what was in it the first time "Move to Analysis"
                          was confirmed;
           finalIds     — what was in it when "Conclude" was confirmed, which
                          is the last moment the Investigation can be reached.
         Everything the candidate collects between those two moments is a
         return visit and earns a share of a mark instead of a whole one; and
         because the second photograph is taken at Conclude, editing the
         journal later during the Report can no longer change the score. */
      investigation: { firstPassIds: null, finalIds: null },
      calc: { input: '', result: null, error: null, history: [], counter: 0 },
      analysis: { current: 1, answers: {}, tutorialShown: false, atReview: false },
      report: { written: {}, chart: null, grid: {} },
      cases: { current: 1, answers: {}, journals: {}, tutorialShown: false, done: {} },
      reached: { analysis: false, report: false, cases: false },
      ui: {
        popup: null,
        investigationTab: null,
        warning: null,
        scroll: {},
        openBlocks: { investigation: true },
        showReasons: {},
        editingTitle: null,
        loginError: '',
        loginUser: ''
      },
      result: null
    };
  }

  /* ====================================================================== *
   * SMALL HELPERS
   * ====================================================================== */

  function esc(text) {
    return String(text === null || text === undefined ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function attr(value) { return esc(value); }

  /* Turn a piece of text from a content file into what is drawn on screen.

     EVERY piece of content text goes through here, which is the point: the
     two things content may ask for are implemented once, so they work in a
     question, an option, an explanation, a journal entry, the results page
     and the printed answer key without any of those knowing about them.

       · a line break in the file is a line break on screen;
       · ^{…} is drawn raised, so "2^{7}" shows as 2 with a small 7 above the
         line and "2^{(n/7)}" as 2 with (n/7) raised. A "^" that is not
         followed by "{" is left exactly as it is.

     THE ORDER MATTERS. The text is made safe FIRST and the superscript tags
     are put in SECOND. Done the other way round, a piece of content could
     introduce markup of its own into the page. Escaping first means the only
     tags that can ever appear here are the two this function puts there. */
  function textToHtml(text) {
    return esc(text)
      .replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>')
      .replace(/\n/g, '<br>');
  }

  /* A dropdown's <option> can hold nothing but plain text — the browser draws
     it, not the page, so a raised character is simply not possible there.
     Rather than print the raw "^{7}" at the candidate, the braces are dropped
     so it reads as "2^7". README §4 says so, so nobody writes a version that
     depends on a superscript inside a dropdown. */
  function optionText(text) {
    return esc(String(text === null || text === undefined ? '' : text)
                 .replace(/\^\{([^}]*)\}/g, '^$1')
                 .replace(/\n/g, ' '));
  }

  function byId(id) { return document.getElementById(id); }

  function isBlank(v) { return v === null || v === undefined || String(v).trim() === ''; }

  /* Every answer records the clock at the moment it was last changed, so the
     results screen can flag the ones given after time ran out (R-D22). */
  function stamp(value) {
    return { value: value, secondsLeft: state.timer.secondsLeft };
  }

  /* ====================================================================== *
   * THE CLOCK
   * ====================================================================== */

  var tickHandle = null;
  var warningHandle = null;

  function startClock() {
    state.timer.everStarted = true;
    state.timer.running = true;
    state.timer.paused = false;
    if (tickHandle === null) tickHandle = setInterval(tick, 1000);
  }

  /* The clock is kept as SECONDS REMAINING and counted down, never worked
     out from a finishing time. The old code derived it from a wall-clock
     end, which is why its pause only paused the display while time kept
     running underneath (SW-BUILD-SPEC 6.4). */
  function tick() {
    if (!state || !state.timer.running || state.timer.paused) return;
    if (state.timer.secondsLeft > 0) {
      state.timer.secondsLeft--;
      checkWarnings();
    }
    refreshClock();
  }

  function checkWarnings() {
    for (var i = 0; i < WARNING_SECONDS.length; i++) {
      var mark = WARNING_SECONDS[i];
      if (state.timer.secondsLeft <= mark &&
          state.timer.secondsLeft > 0 &&
          state.timer.warningsShown.indexOf(mark) === -1) {
        state.timer.warningsShown.push(mark);
        showWarning(Math.round(mark / 60));
        return;
      }
    }
  }

  /* The wording is the real game's and comes from the content file, with {n}
     standing for the number of minutes (rule 3.4 v1.1). A version that leaves
     `warnings` out still gets a usable notice. */
  function warningWords(minutes) {
    var w = (state.content.version.warnings) || {};
    var title = w.title || '{n} Minute Warning';
    var text = w.text || '';
    var n = String(minutes);
    return { title: title.split('{n}').join(n), text: text.split('{n}').join(n) };
  }

  function showWarning(minutes) {
    state.ui.warning = warningWords(minutes);
    drawWarning();
    if (warningHandle) clearTimeout(warningHandle);
    warningHandle = setTimeout(function () {
      state.ui.warning = null;
      drawWarning();
    }, WARNING_VISIBLE_MS);
  }

  function dismissWarning() {
    if (warningHandle) clearTimeout(warningHandle);
    state.ui.warning = null;
    drawWarning();
  }

  /* The notice repaints its own corner. It must not go through render(),
     which would throw away whatever the candidate was typing when the clock
     happened to reach five minutes. */
  function drawWarning() {
    var host = byId('warning-slot');
    if (!host) return;
    var w = state.ui.warning;
    host.innerHTML = w
      ? '<div class="time-warning" role="status">' +
          '<button class="warning-close" type="button" data-act="dismiss-warning"' +
            ' aria-label="Dismiss this notice">✕</button>' +
          '<div class="warning-title">' + textToHtml(w.title) + '</div>' +
          (w.text ? '<div class="warning-text">' + textToHtml(w.text) + '</div>' : '') +
        '</div>'
      : '';
  }

  function clockText() {
    if (!state.timer.everStarted) {
      return 'Time remaining: ' + Math.ceil(state.timer.total / 60) + ' min';
    }
    if (state.timer.secondsLeft <= 0) return "Time's up";
    return 'Time remaining: ' + Math.ceil(state.timer.secondsLeft / 60) + ' min';
  }

  /* The clock repaints its own two elements every second. It must NOT call
     render(): a full redraw once a second would throw away whatever the
     candidate was typing. */
  function refreshClock() {
    var textEl = byId('time-text');
    var fillEl = byId('time-fill');
    if (textEl) textEl.textContent = clockText();
    if (fillEl) {
      var fraction = state.timer.total > 0
        ? Math.max(0, state.timer.secondsLeft) / state.timer.total : 0;
      fillEl.style.width = (fraction * 100) + '%';
    }
  }

  /* ====================================================================== *
   * POPUPS
   *
   * Custom popups only — never alert(), confirm() or prompt(). Those are
   * drawn by the browser, cannot be styled, and stop everything else dead.
   * ====================================================================== */

  var popupActions = {};

  function openPopup(key, options) {
    var spec = state.content.version.popups[key];
    if (!spec) return;
    options = options || {};
    state.ui.popup = {
      key: key,
      title: spec.title,
      text: spec.text || '',
      back: spec.back || '',
      go: spec.go,
      pauses: !!options.pauses
    };
    if (options.pauses) state.timer.paused = true;
    popupActions.go = options.onGo || function () {};
    popupActions.back = options.onBack || function () {};
    render();
  }

  function closePopup(which) {
    var wasPausing = state.ui.popup && state.ui.popup.pauses;
    state.ui.popup = null;
    if (wasPausing) state.timer.paused = false;
    var action = which === 'go' ? popupActions.go : popupActions.back;
    popupActions = {};
    if (action) action();
    render();
  }

  function popupHtml() {
    var p = state.ui.popup;
    if (!p) return '';
    var buttons = '';
    if (p.back) {
      buttons += '<button class="btn btn-back" data-act="popup-back" type="button">' +
                 esc(p.back) + '</button>';
    }
    buttons += '<button class="btn" data-act="popup-go" type="button">' + esc(p.go) + '</button>';
    return '<div class="modal-backdrop" role="dialog" aria-modal="true">' +
             '<div class="modal">' +
               '<div class="modal-body">' +
                 '<h2>' + esc(p.title) + '</h2>' +
                 (p.text ? '<p>' + textToHtml(p.text) + '</p>' : '') +
               '</div>' +
               '<div class="modal-actions">' + buttons + '</div>' +
             '</div>' +
           '</div>';
  }

  /* ====================================================================== *
   * THE JOURNAL
   * ====================================================================== */

  /* Is this piece of information already collected? It has to ask whichever
     journal is on screen: a "collect" case has its own, separate from the
     Investigation's, so a chip in a case must go dark against the case's
     journal and not the Investigation's. */
  function journalHas(id) {
    var list = activeJournal() || state.journal;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return true;
    }
    return false;
  }

  function addToJournal(entry, list) {
    var target = list || state.journal;
    for (var i = 0; i < target.length; i++) if (target[i].id === entry.id) return false;
    target.push(entry);
    return true;
  }

  function removeFromJournal(id, list) {
    var target = list || state.journal;
    for (var i = 0; i < target.length; i++) {
      if (target[i].id === id) { target.splice(i, 1); return; }
    }
  }

  function moveInJournal(fromId, toId, list) {
    var target = list || state.journal;
    var from = -1, to = -1, i;
    for (i = 0; i < target.length; i++) {
      if (target[i].id === fromId) from = i;
      if (target[i].id === toId) to = i;
    }
    if (from === -1 || to === -1 || from === to) return;
    var moved = target.splice(from, 1)[0];
    target.splice(to, 0, moved);
  }

  /* Draw the Research Journal panel.

     The arrangement of an entry is copied from the real game (rule 4.4 v1.1,
     photographed 9 September):

         (!)  Title of the entry  ✎                              ✕
              [ the value or text, as a chip ]                   ▾

     · (!) on the left marks an entry as important. It is a note-taking aid
       for the candidate and is NEVER scored — nothing in marking.js knows it
       exists. A second click unmarks it.
     · The pencil after the title is the visible way to rename. Clicking the
       title still works; the pencil makes it discoverable.
     · ✕ removes the entry, top right, and the source chip becomes available
       again.
     · The expand arrow sits at the RIGHT OF THE VALUE ROW, not up in the
       title row, and appears only when the text is too long to show.

     `list` lets a "collect" case have its own separate journal, which starts
     empty, exactly as the current simulation does. */
  function journalHtml(list, emptyMessage) {
    var rows = '';
    if (!list.length) {
      rows = '<p class="journal-empty">' + esc(emptyMessage) + '</p>';
    } else {
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var longText = String(e.text).length > LONG_TEXT;
        var editing = state.ui.editingTitle === e.id;
        var titleBit = editing
          ? '<input class="journal-title-input" type="text" data-title-for="' + attr(e.id) + '"' +
            ' value="' + attr(e.title) + '" data-focus-key="title:' + attr(e.id) + '">'
          : '<span class="journal-title" data-act="edit-title" data-id="' + attr(e.id) + '"' +
            ' title="Click to rename">' + textToHtml(e.title) + '</span>';

        rows +=
          '<div class="journal-item' + (e.marked ? ' is-marked' : '') + '" draggable="true"' +
              ' data-drag=\'' + attr(JSON.stringify({ kind: 'journal', id: e.id, text: e.text })) + '\'' +
              ' data-drop=\'' + attr(JSON.stringify({ target: 'journal-slot', id: e.id })) + '\'>' +
            '<div class="journal-head">' +
              '<button class="mark-btn' + (e.marked ? ' is-on' : '') + '" type="button"' +
                ' data-act="mark" data-id="' + attr(e.id) + '"' +
                ' aria-pressed="' + (e.marked ? 'true' : 'false') + '"' +
                ' title="Mark as important" aria-label="Mark as important">' +
                markIcon() +
              '</button>' +
              titleBit +
              (editing ? '' :
                '<button class="mini-btn pencil" type="button" data-act="edit-title" data-id="' +
                  attr(e.id) + '" title="Rename" aria-label="Rename this entry">✎</button>') +
              '<button class="mini-btn remove" type="button" data-act="unjournal" data-id="' +
                attr(e.id) + '" aria-label="Remove from the Research Journal">✕</button>' +
            '</div>' +
            '<div class="journal-value-row">' +
              '<span class="journal-text' + (longText && !e.expanded ? ' is-clipped' : '') + '">' +
                textToHtml(e.text) + '</span>' +
              (longText
                ? '<button class="mini-btn expand" type="button" data-act="expand" data-id="' +
                  attr(e.id) + '" aria-expanded="' + (e.expanded ? 'true' : 'false') +
                  '" aria-label="' + (e.expanded ? 'Show less' : 'Show all of it') + '">' +
                  (e.expanded ? '▴' : '▾') + '</button>'
                : '') +
            '</div>' +
          '</div>';
      }
    }

    /* The hint line under the heading is the real game's. Its wording comes
       from the content file so the next version can say it differently; the
       icon is drawn by the program. */
    var hint = state.content.version.labels.journal_mark_hint;
    return '<div class="journal">' +
             '<h2>Research Journal</h2>' +
             (hint ? '<p class="journal-hint">' + hintWithIcon(hint) + '</p>' : '') +
             '<div class="journal-list" data-drop=\'' +
               attr(JSON.stringify({ target: 'journal' })) + '\'>' + rows + '</div>' +
           '</div>';
  }

  /* The circled exclamation mark, drawn rather than typed.

     A typed "(!)" never sits neatly in a circle, and the character that does
     — ⚠ or ❗ — renders as a coloured emoji on some machines and a plain
     glyph on others. Drawing it keeps it identical everywhere and lets it
     take the surrounding text colour. */
  function markIcon() {
    return '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">' +
             '<circle cx="10" cy="10" r="8.4" fill="none" stroke="currentColor" ' +
               'stroke-width="1.5"/>' +
             '<rect x="9.1" y="5" width="1.8" height="6.4" rx="0.9" fill="currentColor"/>' +
             '<circle cx="10" cy="14.2" r="1.05" fill="currentColor"/>' +
           '</svg>';
  }

  /* The hint reads "Mark (!) for important items". Wherever the content puts
     "(!)", the drawn icon goes instead, so the sentence and the button the
     candidate has to press show the same symbol. */
  function hintWithIcon(text) {
    var parts = String(text).split('(!)');
    var out = textToHtml(parts[0]);
    for (var i = 1; i < parts.length; i++) {
      out += '<span class="hint-icon">' + markIcon() + '</span>' + textToHtml(parts[i]);
    }
    return out;
  }

  /* ====================================================================== *
   * THE CALCULATOR
   * ====================================================================== */

  var CALC_KEYS = [
    ['AC', 'clear'], ['(', 'char'], [')', 'char'], ['C', 'back'],
    ['7', 'char'], ['8', 'char'], ['9', 'char'], ['/', 'op'],
    ['4', 'char'], ['5', 'char'], ['6', 'char'], ['*', 'op'],
    ['1', 'char'], ['2', 'char'], ['3', 'char'], ['-', 'op'],
    ['0', 'char'], ['.', 'char'], ['=', 'equals'], ['+', 'op']
  ];

  function calcHtml() {
    var c = state.calc;
    var history = '';
    if (!c.history.length) {
      history = '<div class="calc-history-empty">Your calculations appear here.</div>';
    } else {
      for (var i = c.history.length - 1; i >= 0; i--) {   /* newest first */
        var h = c.history[i];
        history +=
          '<div class="calc-history-row">' +
            '<span class="expr">' + esc(h.expr) + ' =</span>' +
            chipHtml({ kind: 'calc', id: h.id, text: h.result }, h.result, 'calc-chip', false) +
          '</div>';
      }
    }

    var resultBox;
    if (c.error) {
      resultBox = '<div class="calc-result is-error">' + esc(c.error) + '</div>';
    } else if (c.result === null) {
      resultBox = '<div class="calc-result">&nbsp;</div>';
    } else {
      resultBox = '<div class="calc-result">' +
        chipHtml({ kind: 'calc', id: 'result', text: c.result }, c.result, 'calc-chip', false) +
        '</div>';
    }

    var keys = '';
    for (var k = 0; k < CALC_KEYS.length; k++) {
      var label = CALC_KEYS[k][0], type = CALC_KEYS[k][1];
      var cls = 'calc-key' +
        (type === 'op' ? ' is-op' : '') +
        (type === 'equals' ? ' is-equals' : '') +
        (type === 'clear' || type === 'back' ? ' is-clear' : '');
      keys += '<button class="' + cls + '" type="button" data-act="calc-key" data-key="' +
              attr(label) + '">' + esc(label) + '</button>';
    }

    return '<div class="calc">' +
             '<div class="calc-history" id="calc-history">' + history + '</div>' +
             '<div id="calc-result-slot">' + resultBox + '</div>' +
             '<input class="calc-input" id="calc-input" type="text" inputmode="text"' +
               ' aria-label="Calculator" autocomplete="off" spellcheck="false"' +
               ' data-focus-key="calc" value="' + attr(c.input) + '"' +
               ' data-drop=\'' + attr(JSON.stringify({ target: 'calc' })) + '\'>' +
             '<div class="calc-keys">' + keys + '</div>' +
           '</div>';
  }

  /* Repaint the calculator's three moving parts without rebuilding the input
     element, so the cursor stays where the candidate left it. */
  function refreshCalc() {
    var input = byId('calc-input');
    if (input && input.value !== state.calc.input) input.value = state.calc.input;
    var host = byId('calc-history');
    var slot = byId('calc-result-slot');
    if (!host || !slot) return;
    var fresh = document.createElement('div');
    fresh.innerHTML = calcHtml();
    host.innerHTML = fresh.querySelector('#calc-history').innerHTML;
    slot.innerHTML = fresh.querySelector('#calc-result-slot').innerHTML;
  }

  /* Repaint just the chart on the Visual page. */
  function refreshChart() {
    var slot = byId('chart-slot');
    if (!slot) return;
    var g = state.content.report.grid;
    var kind = state.report.chart ? state.report.chart.value
                                  : state.content.report.chart['default'];
    slot.innerHTML = chartHtml(kind, g.rows, g.columns, gridValues());
  }

  var invalidHandle = null;

  function calcEvaluate() {
    var outcome = M.evaluate(state.calc.input);
    if (outcome.error) {
      /* The line is left exactly as it was so the candidate can correct it;
         the result box says "Invalid" for a moment and then clears. */
      state.calc.error = 'Invalid';
      state.calc.result = null;
      refreshCalc();
      if (invalidHandle) clearTimeout(invalidHandle);
      invalidHandle = setTimeout(function () {
        state.calc.error = null;
        refreshCalc();
      }, 1500);
      return;
    }
    state.calc.error = null;
    var text = M.formatNumber(outcome.value);
    state.calc.result = text;
    state.calc.counter++;
    state.calc.history.push({
      id: 'calc:' + state.calc.counter,
      expr: state.calc.input,
      result: text
    });
    refreshCalc();
  }

  function calcKey(label) {
    var c = state.calc;
    if (label === 'AC') { c.input = ''; c.result = null; c.error = null; refreshCalc(); return; }
    if (label === 'C') { c.input = c.input.slice(0, -1); refreshCalc(); return; }
    if (label === '=') { calcEvaluate(); return; }
    c.input += label;
    refreshCalc();
  }

  /* RD-GAME-RULES 6.4: a value dropped on the input line is appended when the
     line ends in an operator or a bracket, and replaces it otherwise. */
  function calcDrop(text) {
    var value = M.numberTextFromDrop(text);
    if (value === null) return;
    var line = state.calc.input;
    if (line === '' || /[+\-*/(]$/.test(line)) state.calc.input = line + value;
    else state.calc.input = value;
    refreshCalc();
  }

  /* ====================================================================== *
   * DRAGGABLE CHIPS
   * ====================================================================== */

  function chipHtml(payload, label, extraClass, taken) {
    if (taken) {
      return '<span class="chip is-taken ' + (extraClass || '') + '" aria-disabled="true">' +
             textToHtml(label) + '</span>';
    }
    return '<span class="chip ' + (extraClass || '') + '" draggable="true" tabindex="0"' +
             ' data-drag=\'' + attr(JSON.stringify(payload)) + '\'>' +
             '<span class="grip" aria-hidden="true"></span>' + textToHtml(label) +
           '</span>';
  }

  /* One of the Investigation's declared items, as it appears in the text. */
  function itemChip(id, item) {
    var taken = journalHas(id);
    return chipHtml({ kind: 'item', id: id, text: item.text }, item.text, '', taken);
  }

  /* A bare number written {{7}} in the content, or a cell of a table marked
     draggable. It has no label behind it, so it can go into the calculator
     and into an answer box, but it is not something the journal can hold. */
  function bareChip(text) {
    return chipHtml({ kind: 'bare', id: 'bare', text: String(text) }, text, '', false);
  }

  /* ====================================================================== *
   * CONTENT BLOCKS
   *
   * Everything below reads the shape of the content and draws it. No
   * scenario words appear anywhere in this file.
   * ====================================================================== */

  /* Replace [[item_id]] and {{7}} inside a piece of text with chips. */
  function inlineChips(text, items) {
    var out = '';
    var rest = String(text);
    var pattern = /\[\[([A-Za-z0-9_]+)\]\]|\{\{([^}]+)\}\}/;
    var found;
    while ((found = pattern.exec(rest)) !== null) {
      out += textToHtml(rest.slice(0, found.index));
      if (found[1]) {
        var item = items && items[found[1]];
        out += item ? itemChip(found[1], item) : esc('[[' + found[1] + ']]');
      } else {
        out += bareChip(found[2]);
      }
      rest = rest.slice(found.index + found[0].length);
    }
    return out + textToHtml(rest);
  }

  function looksNumeric(text) {
    return M.parseNumber(text, false) !== null;
  }

  function tableHtml(block, items) {
    var html = '<div class="data-table-wrap"><table class="data-table">';
    if (block.header) {
      html += '<thead><tr>';
      for (var h = 0; h < block.header.length; h++) {
        html += '<th scope="col">' + textToHtml(block.header[h]) + '</th>';
      }
      html += '</tr></thead>';
    }
    html += '<tbody>';
    for (var r = 0; r < (block.rows || []).length; r++) {
      html += '<tr>';
      for (var c = 0; c < block.rows[r].length; c++) {
        var cell = block.rows[r][c];
        /* The first column of a row names it. It is a label, never a value
           the candidate collects. */
        if (c === 0) {
          html += '<td class="row-label">' + inlineChips(cell, items) + '</td>';
        } else if (block.draggable && looksNumeric(cell)) {
          html += '<td>' + bareChip(cell) + '</td>';
        } else {
          html += '<td>' + inlineChips(cell, items) + '</td>';
        }
      }
      html += '</tr>';
    }
    return html + '</tbody></table></div>';
  }

  /* A bar chart drawn from data, with every bar's value a draggable chip.
     RR6 has no charted exhibit; RR1 to RR3 do, and they are drawn from the
     numbers rather than being pictures (R-D28), so nothing is unreadable and
     every number can be collected. */
  function barChartHtml(block) {
    var categories = block.categories || [];
    var series = block.series || [];
    var maximum = 0, s, v;
    for (s = 0; s < series.length; s++) {
      for (v = 0; v < (series[s].values || []).length; v++) {
        var n = Number(series[s].values[v]);
        if (isFinite(n) && n > maximum) maximum = n;
      }
    }
    if (maximum <= 0) maximum = 1;

    var W = 720, H = 320, padL = 46, padR = 12, padT = 26, padB = 46;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var groupW = plotW / Math.max(1, categories.length);
    var barW = Math.min(46, (groupW - 12) / Math.max(1, series.length));

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Bar chart">';
    var g;
    for (g = 0; g <= 4; g++) {
      var y = padT + plotH - (plotH * g / 4);
      svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y +
             '" stroke="#d7dce5" stroke-width="1"/>' +
             '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" ' +
             'font-size="11" fill="#5b6677">' + Math.round(maximum * g / 4) + '</text>';
    }
    var chips = '';
    for (var ci = 0; ci < categories.length; ci++) {
      var groupX = padL + groupW * ci;
      for (s = 0; s < series.length; s++) {
        var raw = (series[s].values || [])[ci];
        var value = Number(raw);
        if (!isFinite(value)) continue;
        var barH = plotH * (value / maximum);
        var x = groupX + (groupW - barW * series.length) / 2 + barW * s;
        var yTop = padT + plotH - barH;
        svg += '<rect x="' + x + '" y="' + yTop + '" width="' + (barW - 3) + '" height="' +
               Math.max(1, barH) + '" fill="' + seriesColour(s) + '" rx="3"/>';
        chips += '<span class="bar-value" style="left:' +
                 (((x + (barW - 3) / 2) / W) * 100) + '%;top:' + ((yTop / H) * 100) + '%">' +
                 (((series[s].items || [])[ci])
                    ? itemChip(series[s].items[ci], state.content.investigation.items[series[s].items[ci]])
                    : bareChip(raw)) +
                 '</span>';
      }
      svg += '<text x="' + (groupX + groupW / 2) + '" y="' + (H - padB + 18) +
             '" text-anchor="middle" font-size="11" fill="#1a2230">' +
             esc(categories[ci]) + '</text>';
    }
    svg += '</svg>';

    var legend = '';
    if (series.length > 1) {
      legend = '<div class="chart-legend">';
      for (s = 0; s < series.length; s++) {
        legend += '<span><i style="background:' + seriesColour(s) + '"></i>' +
                  esc(series[s].name || ('Series ' + (s + 1))) + '</span>';
      }
      legend += '</div>';
    }

    return '<div class="chart-frame"><div class="bar-chart-wrap">' + svg + chips +
           '</div>' + legend + '</div>';
  }

  var SERIES_COLOURS = ['#2563eb', '#0e9f6e', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];
  function seriesColour(i) { return SERIES_COLOURS[i % SERIES_COLOURS.length]; }

  function blocksHtml(blocks, items) {
    var html = '';
    for (var i = 0; i < (blocks || []).length; i++) {
      var b = blocks[i];
      if (b.kind === 'text') {
        html += '<p class="block-text">' + inlineChips(b.text, items) + '</p>';
      } else if (b.kind === 'heading') {
        html += '<h3>' + textToHtml(b.text) + '</h3>';
      } else if (b.kind === 'list') {
        html += '<ul class="block-list">';
        for (var j = 0; j < b.items.length; j++) {
          html += '<li>' + inlineChips(b.items[j], items) + '</li>';
        }
        html += '</ul>';
      } else if (b.kind === 'table') {
        html += tableHtml(b, items);
      } else if (b.kind === 'bar_chart') {
        html += barChartHtml(b);
      }
    }
    return html;
  }

  /* ====================================================================== *
   * ANSWER BOXES
   * ====================================================================== */

  function answerFieldHtml(id, value, unit, focusKey) {
    return '<span class="answer-field" data-drop=\'' +
             attr(JSON.stringify({ target: 'box', id: id })) + '\'>' +
             '<input type="text" inputmode="decimal" autocomplete="off" spellcheck="false"' +
               ' data-box="' + attr(id) + '" data-focus-key="' + attr(focusKey || ('box:' + id)) + '"' +
               ' value="' + attr(value === null || value === undefined ? '' : value) + '"' +
               ' aria-label="Answer">' +
             '<button class="clear-btn" type="button" data-act="clear-box" data-id="' + attr(id) +
               '" aria-label="Clear this box" title="Clear">✕</button>' +
             (unit ? '<span class="answer-unit">' + textToHtml(unit) + '</span>' : '') +
           '</span>';
  }

  function answerRowsHtml(boxes, values) {
    var html = '';
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      var leaf = values[b.id];
      html += '<div class="answer-row">' +
                '<span class="answer-label">' + textToHtml(b.label) + '</span>' +
                answerFieldHtml(b.id, leaf ? leaf.value : '', b.unit || '') +
              '</div>';
    }
    return html;
  }

  /* ====================================================================== *
   * THE FRAME
   * ====================================================================== */

  function headerHtml() {
    var v = state.content.version;
    var inCases = (state.phase === 'cases');
    var fraction = state.timer.total > 0
      ? Math.max(0, state.timer.secondsLeft) / state.timer.total : 0;
    var canFullscreen = !!(document.documentElement.requestFullscreen &&
                           document.fullscreenEnabled);

    return '<div class="header-bar">' +
        '<div class="header-left">' +
          '<span class="part-tab' + (inCases ? '' : ' is-current') + '">Part 1 · Study</span>' +
          '<span class="part-tab' + (inCases ? ' is-current' : '') + '">Part 2 · ' +
            textToHtml(v.labels.cases_tab) + ' (' + v.case_count + ')</span>' +
        '</div>' +
        '<div class="header-middle">' +
          '<span class="time-text" id="time-text">' + esc(clockText()) + '</span>' +
          '<div class="time-bar"><div class="time-bar-fill" id="time-fill" style="width:' +
            (fraction * 100) + '%"></div></div>' +
        '</div>' +
        '<div class="header-right">' +
          (canFullscreen
            ? '<button class="icon-btn" type="button" data-act="fullscreen" ' +
              'aria-label="Full screen" title="Full screen">' + fullscreenIcon() + '</button>'
            : '') +
        '</div>' +
      '</div>';
  }

  function fullscreenIcon() {
    var on = !!document.fullscreenElement;
    return on
      ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
        'stroke-width="1.6"><path d="M6 1v5H1M10 15v-5h5"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
        'stroke-width="1.6"><path d="M1 6V1h5M15 10v5h-5"/></svg>';
  }

  /* --- the left column -------------------------------------------------- */

  function tabHtml(label, options) {
    options = options || {};
    var cls = 'tab' + (options.sub ? ' tab-sub' : '') +
              (options.current ? ' is-current' : '') +
              (options.inView ? ' is-inview' : '') +
              (options.done ? ' is-done' : '') +
              (options.live ? '' : ' is-locked');
    return '<button class="' + cls + '" type="button"' +
             (options.live ? ' data-act="' + attr(options.act) + '"' +
                             (options.id !== undefined ? ' data-id="' + attr(options.id) + '"' : '')
                           : ' disabled') +
           '>' + textToHtml(label) + '</button>';
  }

  function navHtml() {
    var v = state.content.version;
    var phase = state.phase;
    var html = '<div class="nav-list">';
    var i;

    if (phase === 'cases') {
      html += tabHtml(v.labels.cases_menu, { current: true, live: false });
      for (i = 0; i < state.content.cases.cases.length; i++) {
        var number = state.content.cases.cases[i].number;
        html += tabHtml('Case ' + number, {
          sub: true,
          current: number === state.cases.current,
          done: !!state.cases.done[number],
          live: false                      /* forward only; earlier cases are gone */
        });
      }
    } else {
      var inInvestigation = (phase === 'investigation');
      var inAnalysis = (phase === 'analysis' || phase === 'review');
      var inReport = (phase.indexOf('report') === 0);

      /* Investigation. Reachable backwards from Analysis, never from the
         Report (RD-GAME-RULES 5.6 and 7.1). */
      html += tabHtml(v.labels.investigation_tab, {
        current: inInvestigation,
        live: inAnalysis,
        act: 'go-investigation'
      });
      if (inInvestigation) {
        var tabs = state.content.investigation.tabs;
        for (i = 0; i < tabs.length; i++) {
          html += tabHtml(tabs[i].label, {
            sub: true, live: true, act: 'scroll-section', id: tabs[i].id,
            inView: state.ui.investigationTab === tabs[i].id
          });
        }
      }

      /* Analysis. Once it has been started it can be returned to from the
         Investigation, and it lands on the question the candidate was on. */
      html += tabHtml(v.labels.analysis_tab, {
        current: inAnalysis,
        live: inInvestigation && state.reached.analysis,
        act: 'go-analysis'
      });
      if (inAnalysis) {
        for (i = 0; i < state.content.analysis.questions.length; i++) {
          var q = state.content.analysis.questions[i];
          html += tabHtml('Question ' + q.number, {
            sub: true,
            current: phase === 'analysis' && q.number === state.analysis.current,
            live: false                     /* earlier questions are locked (5.5) */
          });
        }
        html += tabHtml(v.labels.review_tab, {
          sub: true, current: phase === 'review', live: false
        });
      }

      /* Report. Forward only, and nothing before it is reachable from it. */
      html += tabHtml(v.labels.report_tab, { current: inReport, live: false });
      if (inReport) {
        html += tabHtml(v.labels.written_tab, {
          sub: true, current: phase === 'report_written', live: false
        });
        html += tabHtml(v.labels.graph_tab, {
          sub: true,
          current: phase === 'report_graph',
          live: phase === 'report_visual',   /* the chart choice can be changed (7.3) */
          act: 'go-graph'
        });
        html += tabHtml(v.labels.visual_tab, {
          sub: true, current: phase === 'report_visual', live: false
        });
      }
    }

    html += '</div>';

    /* Restart stays under the tab strip, where the current Redrock puts it
       (R-D23) — not in the header where Sea Wolf has it. */
    html += '<div class="nav-foot">' +
              '<button class="btn-quiet btn-restart" type="button" data-act="restart">Restart</button>' +
            '</div>';
    return '<div class="nav-col">' + html + '</div>';
  }

  /* --- the working area and the right column ---------------------------- */

  function screenHtml(parts) {
    var actions = parts.button
      ? '<button class="btn" type="button" data-act="primary">' + esc(parts.button) + '</button>'
      : '';
    var middle;
    if (parts.split) {
      middle = '<div class="work-split">' +
                 '<div class="question-col" data-scroll="question">' + parts.body + '</div>' +
                 '<div class="calc-col" data-scroll="calc">' + parts.split + '</div>' +
               '</div>';
    } else {
      middle = '<div class="work-scroll" data-scroll="' + attr(parts.scrollKey || 'work') + '">' +
               parts.body + '</div>';
    }
    /* A case with neither a calculator nor a journal has NO right-hand column
       at all, and the middle takes its width (rule 2.5, v1.1). The current
       simulation does this and so does the real game; rule 2.7's "nothing
       resizes" was written about movement within a screen and does not
       overrule the source screens. The primary button stays bottom-right of
       the middle column, which is now the wider one. */
    var hasSide = !!parts.side;
    return '<div class="columns">' +
             navHtml() +
             '<div class="work-col' + (hasSide ? '' : ' is-wide') + '">' + middle +
               '<div class="work-actions">' + actions + '</div>' +
             '</div>' +
             (hasSide ? '<div class="side-col">' + parts.side + '</div>' : '') +
           '</div>';
  }

  /* ====================================================================== *
   * SCREEN: LOGIN
   * ====================================================================== */

  function loginHtml() {
    return '<div class="centre-screen">' +
             '<form class="card login-card" id="login-form">' +
               '<h1>Log in</h1>' +
               '<div class="field">' +
                 '<label for="login-user">Username</label>' +
                 '<input id="login-user" type="text" autocomplete="username"' +
                   ' data-focus-key="login-user" spellcheck="false"' +
                   ' value="' + attr(state.ui.loginUser || '') + '">' +
               '</div>' +
               '<div class="field">' +
                 '<label for="login-pass">Password</label>' +
                 '<input id="login-pass" type="password" autocomplete="current-password"' +
                   ' data-focus-key="login-pass">' +
               '</div>' +
               '<div class="form-error" id="login-error">' + esc(state.ui.loginError) + '</div>' +
               '<button class="btn" type="submit">Log in</button>' +
             '</form>' +
           '</div>';
  }

  function toHex(buffer) {
    return Array.prototype.map.call(new Uint8Array(buffer), function (b) {
      return ('00' + b.toString(16)).slice(-2);
    }).join('');
  }

  function attemptLogin(username, password) {
    /* Keep what was typed. Wiping the username after a wrong password means
       typing it again every time, and the thing that was wrong is almost
       always the password. */
    state.ui.loginUser = username;
    if (username !== CONFIG.username) {
      state.ui.loginError = 'That username and password do not match.';
      render();
      return;
    }
    if (!window.crypto || !window.crypto.subtle) {
      state.ui.loginError = 'Login needs the page to be opened over https.';
      render();
      return;
    }
    window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
      .then(function (digest) {
        if (toHex(digest) === String(CONFIG.passcodeHash).toLowerCase()) {
          state.loggedIn = true;
          state.ui.loginError = '';
          state.phase = 'start';
        } else {
          state.ui.loginError = 'That username and password do not match.';
        }
        render();
      })
      .catch(function () {
        state.ui.loginError = 'Login needs the page to be opened over https.';
        render();
      });
  }

  /* ====================================================================== *
   * SCREEN: START (before the clock — free design)
   * ====================================================================== */

  var PHASE_BLURBS = {
    investigation: 'Read the study and drag only the relevant information into your Research Journal.',
    analysis: 'Answer the questions using the calculator and what you collected.',
    report: 'Complete the written report, choose the right chart, and fill in the figures.',
    cases: 'Answer a set of separate case questions.'
  };

  function startHtml() {
    var v = state.content.version;
    var phases = '';
    for (var i = 0; i < v.phases.length; i++) {
      var key = v.phases[i];
      var label = v.labels[key + '_tab'] || key;
      phases += '<div class="start-phase">' +
                  '<span class="n">' + (i + 1) + '</span>' +
                  '<span class="what"><b>' + textToHtml(label) + '</b>' +
                    esc(PHASE_BLURBS[key] || '') + '</span>' +
                '</div>';
    }
    return '<div class="centre-screen">' +
             '<div class="card start-card">' +
               '<h1>' + esc(v.title) + '</h1>' +
               '<p class="start-scenario">' + esc(v.scenario) + '</p>' +
               '<div class="start-phases">' + phases + '</div>' +
               '<div class="start-facts">' +
                 '<div class="start-fact"><div class="k">Time limit</div>' +
                   '<div class="v">' + v.time_limit_minutes + ' minutes</div></div>' +
                 '<div class="start-fact"><div class="k">' + textToHtml(v.labels.cases_tab) + '</div>' +
                   '<div class="v">' + v.case_count + '</div></div>' +
                 '<div class="start-fact"><div class="k">One clock</div>' +
                   '<div class="v">Both parts</div></div>' +
               '</div>' +
               '<div class="start-actions">' +
                 '<button class="btn" type="button" data-act="start">Start</button>' +
               '</div>' +
             '</div>' +
           '</div>';
  }

  /* ====================================================================== *
   * SCREEN: INVESTIGATION
   * ====================================================================== */

  function investigationHtml() {
    var inv = state.content.investigation;
    var body = '<p class="directions">' + textToHtml(inv.directions) + '</p>';
    for (var i = 0; i < inv.sections.length; i++) {
      var sec = inv.sections[i];
      body += '<section class="section" id="section-' + attr(sec.id) +
                '" data-section="' + attr(sec.id) + '">' +
                '<h2>' + textToHtml(sec.heading) + '</h2>' +
                blocksHtml(sec.blocks, inv.items) +
              '</section>';
    }
    return screenHtml({
      body: body,
      scrollKey: 'investigation',
      button: state.content.version.buttons.complete_investigation,
      side: journalHtml(state.journal,
        'Drag information from the study into this panel to collect it.')
    });
  }

  /* ====================================================================== *
   * SCREEN: ANALYSIS, and the Review page after it
   * ====================================================================== */

  function analysisHtml() {
    var questions = state.content.analysis.questions;
    var q = null;
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].number === state.analysis.current) q = questions[i];
    }
    if (!q) q = questions[0];

    var body = '<h2 class="q-heading">Question ' + q.number + '</h2>' +
               '<p class="q-text">' + textToHtml(q.text) + '</p>' +
               answerRowsHtml(q.boxes, state.analysis.answers);

    var isLast = (q.number === questions[questions.length - 1].number);
    return screenHtml({
      body: body,
      split: calcHtml(),
      button: isLast ? state.content.version.buttons.review
                     : state.content.version.buttons.next_question,
      side: journalHtml(state.journal, 'Nothing was collected during the Investigation.')
    });
  }

  function reviewHtml() {
    var body = '<h2 class="q-heading">' + textToHtml(state.content.version.labels.review_tab) + '</h2>' +
               '<p class="q-text">' + textToHtml(state.content.analysis.review_text) + '</p>';
    return screenHtml({
      body: body,
      split: calcHtml(),
      button: state.content.version.buttons.conclude,
      side: journalHtml(state.journal, 'Nothing was collected during the Investigation.')
    });
  }

  /* ====================================================================== *
   * SCREEN: THE REPORT — Written, Graph, Visual
   * ====================================================================== */

  function reportWrittenHtml() {
    var written = state.content.report.written;
    var paragraphs = String(written.template).split(/\n\s*\n/);
    var body = '<div class="report-prose">';
    for (var p = 0; p < paragraphs.length; p++) {
      body += '<p>' + blanksHtml(paragraphs[p], written.blanks) + '</p>';
    }
    body += '</div>';
    return screenHtml({
      body: body,
      scrollKey: 'report',
      button: state.content.version.buttons.next_section,
      side: journalHtml(state.journal, 'Nothing was collected during the Investigation.')
    });
  }

  function blanksHtml(text, blanks) {
    var out = '', rest = String(text), found;
    var pattern = /\[\[([A-Za-z0-9_]+)\]\]/;
    while ((found = pattern.exec(rest)) !== null) {
      out += textToHtml(rest.slice(0, found.index));
      var id = found[1], blank = blanks[id];
      if (!blank) {
        out += esc(found[0]);
      } else if (blank.kind === 'dropdown') {
        var leaf = state.report.written[id];
        var chosen = leaf ? leaf.value : '';
        var options = '<option value=""></option>';
        var keys = Object.keys(blank.options);
        for (var k = 0; k < keys.length; k++) {
          options += '<option value="' + attr(keys[k]) + '"' +
                     (chosen === keys[k] ? ' selected' : '') + '>' +
                     optionText(blank.options[keys[k]]) + '</option>';
        }
        out += '<select class="dropdown" data-blank="' + attr(id) + '"' +
               ' data-focus-key="blank:' + attr(id) + '" aria-label="Choose">' +
               options + '</select>';
      } else {
        var numberLeaf = state.report.written[id];
        out += answerFieldHtml(id, numberLeaf ? numberLeaf.value : '', '', 'blank:' + id);
      }
      rest = rest.slice(found.index + found[0].length);
    }
    return out + textToHtml(rest);
  }

  var CHART_ICONS = {
    bar: '<svg class="chart-icon" width="46" height="34" viewBox="0 0 46 34" aria-hidden="true">' +
         '<rect x="4" y="16" width="7" height="14" fill="#2563eb"/>' +
         '<rect x="14" y="8" width="7" height="22" fill="#60a5fa"/>' +
         '<rect x="24" y="20" width="7" height="10" fill="#2563eb"/>' +
         '<rect x="34" y="4" width="7" height="26" fill="#60a5fa"/>' +
         '<line x1="2" y1="30" x2="44" y2="30" stroke="#5b6677" stroke-width="1.4"/></svg>',
    line: '<svg class="chart-icon" width="46" height="34" viewBox="0 0 46 34" aria-hidden="true">' +
          '<polyline points="4,26 14,16 24,20 34,7 42,11" fill="none" stroke="#2563eb" ' +
          'stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' +
          '<polyline points="4,18 14,22 24,10 34,17 42,5" fill="none" stroke="#94b8f7" ' +
          'stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
          '<line x1="2" y1="30" x2="44" y2="30" stroke="#5b6677" stroke-width="1.4"/></svg>',
    pie: '<svg class="chart-icon" width="46" height="34" viewBox="0 0 46 34" aria-hidden="true">' +
         '<circle cx="23" cy="17" r="13" fill="#60a5fa"/>' +
         '<path d="M23 17 L23 4 A13 13 0 0 1 34.3 23.5 Z" fill="#2563eb"/>' +
         '<path d="M23 17 L34.3 23.5 A13 13 0 0 1 15 29 Z" fill="#bfdbfe"/></svg>',
    scatter: '<svg class="chart-icon" width="46" height="34" viewBox="0 0 46 34" aria-hidden="true">' +
         '<circle cx="10" cy="24" r="2.6" fill="#2563eb"/><circle cx="17" cy="18" r="2.6" fill="#2563eb"/>' +
         '<circle cx="24" cy="20" r="2.6" fill="#2563eb"/><circle cx="31" cy="11" r="2.6" fill="#2563eb"/>' +
         '<circle cx="38" cy="8" r="2.6" fill="#2563eb"/>' +
         '<line x1="2" y1="30" x2="44" y2="30" stroke="#5b6677" stroke-width="1.4"/></svg>',
    histogram: '<svg class="chart-icon" width="46" height="34" viewBox="0 0 46 34" aria-hidden="true">' +
         '<rect x="4" y="22" width="8" height="8" fill="#2563eb"/>' +
         '<rect x="12" y="12" width="8" height="18" fill="#2563eb"/>' +
         '<rect x="20" y="6" width="8" height="24" fill="#2563eb"/>' +
         '<rect x="28" y="14" width="8" height="16" fill="#2563eb"/>' +
         '<rect x="36" y="24" width="8" height="6" fill="#2563eb"/>' +
         '<line x1="2" y1="30" x2="44" y2="30" stroke="#5b6677" stroke-width="1.4"/></svg>'
  };

  var CHART_NAMES = {
    bar: 'Bar chart', line: 'Line chart', pie: 'Pie chart',
    scatter: 'Scatter plot', histogram: 'Histogram'
  };

  function reportGraphHtml() {
    var chart = state.content.report.chart;
    var chosen = state.report.chart ? state.report.chart.value : chart['default'];
    var rows = '';
    for (var i = 0; i < chart.options.length; i++) {
      var id = chart.options[i];
      rows += '<label class="choice' + (chosen === id ? ' is-chosen' : '') + '">' +
                '<input type="radio" name="chart-choice" value="' + attr(id) + '"' +
                  (chosen === id ? ' checked' : '') + ' data-chart-choice="1"' +
                  ' data-focus-key="chart:' + attr(id) + '">' +
                (CHART_ICONS[id] || '') +
                '<span class="label">' + esc(CHART_NAMES[id] || id) + '</span>' +
              '</label>';
    }
    var body = '<p class="q-text">' + textToHtml(chart.prompt) + '</p>' +
               '<div class="choice-list">' + rows + '</div>';
    return screenHtml({
      body: body,
      scrollKey: 'report',
      button: state.content.version.buttons.next_section,
      side: journalHtml(state.journal, 'Nothing was collected during the Investigation.')
    });
  }

  /* Read the grid's numbers out of what the candidate has typed. A cell that
     is empty or not a number simply has no value, and the chart draws
     whatever it can. */
  function gridValues() {
    var g = state.content.report.grid;
    var values = [];
    for (var r = 0; r < g.cells.length; r++) {
      values.push([]);
      for (var c = 0; c < g.cells[r].length; c++) {
        var cell = g.cells[r][c];
        var raw;
        if ('fixed' in cell) raw = cell.fixed;
        else {
          var leaf = state.report.grid[cell.id];
          raw = leaf ? leaf.value : '';
        }
        values[r].push(M.parseNumber(raw, false));
      }
    }
    return values;
  }

  function reportVisualHtml() {
    var g = state.content.report.grid;
    var kind = state.report.chart ? state.report.chart.value : state.content.report.chart['default'];
    var values = gridValues();

    var head = '<tr><th></th>';
    for (var c = 0; c < g.columns.length; c++) head += '<th scope="col">' + textToHtml(g.columns[c]) + '</th>';
    head += '</tr>';

    var rows = '';
    for (var r = 0; r < g.rows.length; r++) {
      rows += '<tr><th class="grid-row-label" scope="row">' + textToHtml(g.rows[r]) + '</th>';
      for (c = 0; c < g.columns.length; c++) {
        var cell = g.cells[r][c];
        if ('fixed' in cell) {
          rows += '<td class="is-fixed">' + textToHtml(cell.fixed) + '</td>';
        } else {
          var leaf = state.report.grid[cell.id];
          rows += '<td>' + answerFieldHtml(cell.id, leaf ? leaf.value : '', '',
                                           'grid:' + cell.id) + '</td>';
        }
      }
      rows += '</tr>';
    }

    var body = '<p class="q-text">' + textToHtml(g.prompt) + '</p>' +
               '<div id="chart-slot">' + chartHtml(kind, g.rows, g.columns, values) + '</div>' +
               '<div class="data-table-wrap" style="display:inline-block">' +
                 '<table class="grid-table"><thead>' + head + '</thead><tbody>' + rows +
                 '</tbody></table></div>';

    return screenHtml({
      body: body,
      scrollKey: 'report',
      button: state.content.version.buttons.complete_report,
      side: journalHtml(state.journal, 'Nothing was collected during the Investigation.')
    });
  }

  /* --- drawing the chart the candidate chose ---------------------------- */

  function chartHtml(kind, rowNames, colNames, values) {
    var any = false, r, c;
    for (r = 0; r < values.length; r++) {
      for (c = 0; c < values[r].length; c++) if (values[r][c] !== null) any = true;
    }
    if (!any) {
      return '<div class="chart-frame"><p class="chart-empty">' +
             'The chart appears here as you fill in the figures below.</p></div>';
    }
    if (kind === 'pie') return pieChart(rowNames, colNames, values);
    if (kind === 'line') return lineChart(rowNames, colNames, values);
    return barChart(rowNames, colNames, values);
  }

  function axisFrame(W, H, padL, padT, plotW, plotH, maximum) {
    var svg = '';
    for (var g = 0; g <= 4; g++) {
      var y = padT + plotH - (plotH * g / 4);
      svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (padL + plotW) + '" y2="' + y +
             '" stroke="#d7dce5" stroke-width="1"/>' +
             '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" ' +
             'fill="#5b6677">' + Math.round(maximum * g / 4) + '</text>';
    }
    return svg;
  }

  function legendHtml(names) {
    var out = '<div class="chart-legend">';
    for (var i = 0; i < names.length; i++) {
      out += '<span><i style="background:' + seriesColour(i) + '"></i>' + esc(names[i]) + '</span>';
    }
    return out + '</div>';
  }

  function maxOf(values) {
    var maximum = 0;
    for (var r = 0; r < values.length; r++) {
      for (var c = 0; c < values[r].length; c++) {
        if (values[r][c] !== null && values[r][c] > maximum) maximum = values[r][c];
      }
    }
    return maximum > 0 ? maximum : 1;
  }

  /* Bars grouped by column, one bar per row within each group. */
  function barChart(rowNames, colNames, values) {
    var W = 660, H = 280, padL = 52, padR = 14, padT = 18, padB = 42;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var maximum = maxOf(values);
    var groupW = plotW / Math.max(1, colNames.length);
    var barW = Math.min(56, (groupW - 18) / Math.max(1, rowNames.length));

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Bar chart of the figures below">';
    svg += axisFrame(W, H, padL, padT, plotW, plotH, maximum);
    for (var c = 0; c < colNames.length; c++) {
      var groupX = padL + groupW * c;
      for (var r = 0; r < rowNames.length; r++) {
        var value = values[r][c];
        if (value === null) continue;
        var barH = plotH * (value / maximum);
        var x = groupX + (groupW - barW * rowNames.length) / 2 + barW * r;
        svg += '<rect x="' + x + '" y="' + (padT + plotH - barH) + '" width="' + (barW - 4) +
               '" height="' + Math.max(1, barH) + '" fill="' + seriesColour(r) + '" rx="3"/>' +
               '<text x="' + (x + (barW - 4) / 2) + '" y="' + (padT + plotH - barH - 5) +
               '" text-anchor="middle" font-size="11" fill="#1a2230">' + value + '</text>';
      }
      svg += '<text x="' + (groupX + groupW / 2) + '" y="' + (H - padB + 20) +
             '" text-anchor="middle" font-size="11" fill="#1a2230">' + esc(colNames[c]) + '</text>';
    }
    svg += '<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (padL + plotW) +
           '" y2="' + (padT + plotH) + '" stroke="#5b6677" stroke-width="1.4"/></svg>';
    return '<div class="chart-frame">' + svg + legendHtml(rowNames) + '</div>';
  }

  /* One line per row, across the columns. */
  function lineChart(rowNames, colNames, values) {
    var W = 660, H = 280, padL = 52, padR = 14, padT = 18, padB = 42;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var maximum = maxOf(values);
    var step = colNames.length > 1 ? plotW / (colNames.length - 1) : 0;
    var xAt = function (c) { return colNames.length > 1 ? padL + step * c : padL + plotW / 2; };
    var yAt = function (v) { return padT + plotH - plotH * (v / maximum); };

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Line chart of the figures below">';
    svg += axisFrame(W, H, padL, padT, plotW, plotH, maximum);
    for (var r = 0; r < rowNames.length; r++) {
      var points = [], c;
      for (c = 0; c < colNames.length; c++) {
        if (values[r][c] !== null) points.push([xAt(c), yAt(values[r][c]), values[r][c]]);
      }
      if (points.length > 1) {
        svg += '<polyline fill="none" stroke="' + seriesColour(r) + '" stroke-width="2.4" ' +
               'stroke-linejoin="round" stroke-linecap="round" points="' +
               points.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '"/>';
      }
      for (c = 0; c < points.length; c++) {
        svg += '<circle cx="' + points[c][0] + '" cy="' + points[c][1] + '" r="4" fill="' +
               seriesColour(r) + '"/>' +
               '<text x="' + points[c][0] + '" y="' + (points[c][1] - 10) +
               '" text-anchor="middle" font-size="11" fill="#1a2230">' + points[c][2] + '</text>';
      }
    }
    for (var k = 0; k < colNames.length; k++) {
      svg += '<text x="' + xAt(k) + '" y="' + (H - padB + 20) + '" text-anchor="middle" ' +
             'font-size="11" fill="#1a2230">' + esc(colNames[k]) + '</text>';
    }
    svg += '<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (padL + plotW) +
           '" y2="' + (padT + plotH) + '" stroke="#5b6677" stroke-width="1.4"/></svg>';
    return '<div class="chart-frame">' + svg + legendHtml(rowNames) + '</div>';
  }

  /* One slice per cell, so a reader sees how the whole breaks down by row
     and by column at once. */
  function pieChart(rowNames, colNames, values) {
    var slices = [], total = 0, r, c;
    for (r = 0; r < values.length; r++) {
      for (c = 0; c < values[r].length; c++) {
        if (values[r][c] !== null && values[r][c] > 0) {
          slices.push({ label: rowNames[r] + ' — ' + colNames[c], value: values[r][c] });
          total += values[r][c];
        }
      }
    }
    if (!total) {
      return '<div class="chart-frame"><p class="chart-empty">' +
             'The chart appears here as you fill in the figures below.</p></div>';
    }

    /* The circle is drawn as a picture; the key beside it is ordinary text,
       NOT text inside the picture. Text inside an SVG cannot wrap, and a
       label made of a row name, a column name and a figure is long enough to
       run off the edge of the drawing and be cut in half — which is exactly
       what happened. As ordinary text it wraps, and it will still fit
       whatever the next version's row and column names turn out to be. */
    var size = 260, cx = 130, cy = 130, radius = 108;
    var svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" ' +
              'role="img" aria-label="Pie chart of the figures below">';
    var angle = -Math.PI / 2;
    var key = '';
    for (var i = 0; i < slices.length; i++) {
      var sweep = (slices[i].value / total) * Math.PI * 2;
      var x1 = cx + radius * Math.cos(angle), y1 = cy + radius * Math.sin(angle);
      var x2 = cx + radius * Math.cos(angle + sweep), y2 = cy + radius * Math.sin(angle + sweep);
      var large = sweep > Math.PI ? 1 : 0;
      if (slices.length === 1) {
        svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="' +
               seriesColour(i) + '"/>';
      } else {
        svg += '<path d="M ' + cx + ' ' + cy + ' L ' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
               ' A ' + radius + ' ' + radius + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ' ' +
               y2.toFixed(2) + ' Z" fill="' + seriesColour(i) + '" stroke="#fff" stroke-width="1.5"/>';
      }
      var mid = angle + sweep / 2;
      var lx = cx + (radius * 0.68) * Math.cos(mid), ly = cy + (radius * 0.68) * Math.sin(mid);
      var share = Math.round((slices[i].value / total) * 100);
      if (share >= 6) {
        svg += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="middle" ' +
               'font-size="13" font-weight="700" fill="#fff">' + share + '%</text>';
      }
      key += '<span><i style="background:' + seriesColour(i) + '"></i>' +
             textToHtml(slices[i].label) + ' <b>' + slices[i].value + '</b></span>';
      angle += sweep;
    }
    svg += '</svg>';
    return '<div class="chart-frame"><div class="chart-with-key">' + svg +
           '<div class="chart-key">' + key + '</div></div></div>';
  }

  /* ====================================================================== *
   * SCREEN: CASES
   * ====================================================================== */

  function currentCase() {
    var list = state.content.cases.cases;
    for (var i = 0; i < list.length; i++) {
      if (list[i].number === state.cases.current) return list[i];
    }
    return list[0];
  }

  function caseAnswer(number) {
    if (!state.cases.answers[number]) state.cases.answers[number] = {};
    return state.cases.answers[number];
  }

  function looksLikeChartChoice(options) {
    var keys = Object.keys(options);
    for (var i = 0; i < keys.length; i++) {
      if (!CHART_NAMES[keys[i]]) return false;
    }
    return keys.length > 0;
  }

  function casesHtml() {
    var c = currentCase();
    var answer = caseAnswer(c.number);
    var items = (c.mechanism === 'collect') ? c.items : null;

    var body = '<p class="q-text">' + inlineChips(c.prompt, items) + '</p>' +
               blocksHtml(c.data, items) +
               '<h3 class="sub-heading">Question</h3>' +
               '<p class="q-text">' + inlineChips(c.question, items) + '</p>';

    var i, keys, id;
    if (c.mechanism === 'number' || c.mechanism === 'numbers') {
      var values = {};
      keys = Object.keys(answer.boxes || {});
      for (i = 0; i < keys.length; i++) values[keys[i]] = { value: answer.boxes[keys[i]] };
      body += answerRowsHtml(c.boxes, values);

    } else if (c.mechanism === 'choose_one') {
      keys = Object.keys(c.options);
      var asCards = looksLikeChartChoice(c.options);
      body += '<div class="' + (asCards ? 'card-choices' : 'choice-list') + '">';
      for (i = 0; i < keys.length; i++) {
        id = keys[i];
        body += '<label class="choice' + (answer.value === id ? ' is-chosen' : '') + '">' +
                  '<input type="radio" name="case-choice" value="' + attr(id) + '"' +
                    (answer.value === id ? ' checked' : '') + ' data-case-one="1" data-focus-key="caseone:' + attr(id) + '">' +
                  (asCards ? (CHART_ICONS[id] || '') : '') +
                  '<span class="label">' + textToHtml(c.options[id]) + '</span>' +
                '</label>';
      }
      body += '</div>';

    } else if (c.mechanism === 'choose_many') {
      keys = Object.keys(c.options);
      var chosen = answer.values || [];
      body += '<div class="choice-list">';
      for (i = 0; i < keys.length; i++) {
        id = keys[i];
        var on = chosen.indexOf(id) !== -1;
        body += '<label class="choice' + (on ? ' is-chosen' : '') + '">' +
                  '<input type="checkbox" value="' + attr(id) + '"' + (on ? ' checked' : '') +
                    ' data-case-many="1" data-focus-key="casemany:' + attr(id) + '">' +
                  '<span class="label">' + textToHtml(c.options[id]) + '</span>' +
                '</label>';
      }
      body += '</div>';

    } else if (c.mechanism === 'dropdowns') {
      var given = answer.dropdowns || {};
      for (i = 0; i < c.dropdowns.length; i++) {
        var d = c.dropdowns[i];
        var options = '<option value=""></option>';
        var optionKeys = Object.keys(d.options);
        for (var k = 0; k < optionKeys.length; k++) {
          options += '<option value="' + attr(optionKeys[k]) + '"' +
                     (given[d.id] === optionKeys[k] ? ' selected' : '') + '>' +
                     optionText(d.options[optionKeys[k]]) + '</option>';
        }
        body += '<div class="answer-row">' +
                  '<span class="answer-label">' + textToHtml(d.label) + '</span>' +
                  '<select class="dropdown" data-case-drop="' + attr(d.id) + '"' +
                    ' data-focus-key="casedrop:' + attr(d.id) + '" aria-label="' +
                    attr(d.label) + '">' + options + '</select>' +
                '</div>';
      }
    }

    /* The right-hand column: the calculator on the cases that have one, the
       case's own journal on a collect case, and otherwise an empty column —
       kept in place so the middle never changes width (RD-GAME-RULES 2.7). */
    var side = '';
    if (c.mechanism === 'collect') {
      side = journalHtml(caseJournal(c.number),
        'Drag the data you would use into this panel.');
    } else if (c.calculator) {
      side = calcHtml();
    }

    var isLast = (c.number === state.content.cases.cases.length);
    return screenHtml({
      body: body,
      scrollKey: 'case' + c.number,
      button: isLast ? state.content.version.buttons.finish
                     : state.content.version.buttons.next_case,
      side: side
    });
  }

  function caseJournal(number) {
    if (!state.cases.journals[number]) state.cases.journals[number] = [];
    return state.cases.journals[number];
  }

  /* ====================================================================== *
   * SCREEN: RESULTS (after the clock — free design)
   * ====================================================================== */

  function answersForMarking() {
    /* The Investigation is judged on the Conclude photograph. If the run ended
       before Conclude — the candidate pressed Restart's way out, or the run is
       being marked early — the journal as it stands is used instead, so a
       score is always possible. */
    var finalIds = state.investigation.finalIds !== null
                     ? state.investigation.finalIds : journalItemIds();
    var firstPassIds = state.investigation.firstPassIds !== null
                     ? state.investigation.firstPassIds : finalIds;
    var firstPass = {};
    for (var f = 0; f < firstPassIds.length; f++) firstPass[firstPassIds[f]] = true;
    var returnVisit = finalIds.filter(function (id) { return !firstPass[id]; });
    var cases = {};
    var numbers = Object.keys(state.cases.answers);
    for (var i = 0; i < numbers.length; i++) {
      var n = numbers[i];
      var entry = state.cases.answers[n];
      var copy = {};
      for (var k in entry) if (Object.prototype.hasOwnProperty.call(entry, k)) copy[k] = entry[k];
      if (state.cases.journals[n]) {
        copy.journal = state.cases.journals[n].map(function (e) { return e.id; });
      }
      cases[n] = copy;
    }
    return {
      investigation: { journal: finalIds, return_visit: returnVisit },
      analysis: state.analysis.answers,
      report: {
        written: state.report.written,
        chart: state.report.chart,
        grid: state.report.grid
      },
      cases: cases
    };
  }

  /* A score can be fractional now that a return visit is worth half a mark,
     so it is printed with one decimal place only when it needs one: 27.5, but
     29 rather than 29.0. */
  function showScore(n) {
    if (typeof n !== 'number') return String(n);
    return (Math.round(n * 10) / 10 === Math.round(n)) ? String(Math.round(n))
                                                       : (Math.round(n * 10) / 10).toFixed(1);
  }

  function tileHtml(name, score, of, extraClass) {
    return '<div class="tile' + (score === of ? ' is-best' : '') + ' ' + (extraClass || '') + '">' +
             '<div class="tile-name">' + esc(name) + '</div>' +
             '<div class="tile-score">' + showScore(score) + ' / ' + showScore(of) + '</div>' +
             '<div class="tile-best">best possible ' + showScore(of) + '</div>' +
           '</div>';
  }

  function markRow(options) {
    var right = options.correct;
    var show = !right || state.ui.showReasons[options.block];
    var answers = '';
    if (options.given !== undefined) {
      /* A choice is shown the way the option itself was drawn, because that is
         what the candidate clicked. A typed value is only ever escaped — the
         results screen must never draw a candidate's typing as markup. */
      var shown = isBlank(options.given) ? 'Not answered'
                : (options.givenIsContent ? textToHtml(options.given) : esc(options.given));
      answers += '<span>your answer <b>' + shown + '</b></span>';
    }
    if (options.expected !== undefined) {
      answers += '<span>expected <b>' + textToHtml(options.expected) + '</b></span>';
    }
    return '<div class="mark-row ' + (right ? 'is-right' : 'is-wrong') + '">' +
             '<span class="mark-icon">' + (right ? '✓' : '✗') + '</span>' +
             '<span class="mark-what">' +
               '<b>' + textToHtml(options.label) + '</b>' +
               (options.late ? '<span class="late-tag">after time</span>' : '') +
               (answers ? '<span class="mark-answers">' + answers + '</span>' : '') +
               (options.extra || '') +
               (show && options.reason
                 ? '<div class="mark-reason">' + textToHtml(options.reason) + '</div>' : '') +
             '</span>' +
           '</div>';
  }

  function blockHtml(key, title, scoreLine, inner) {
    var open = !!state.ui.openBlocks[key];
    return '<section class="block">' +
             '<div class="block-head" data-act="toggle-block" data-id="' + attr(key) + '" ' +
               'role="button" tabindex="0" aria-expanded="' + (open ? 'true' : 'false') + '">' +
               '<h2>' + esc(title) + '</h2>' +
               '<span class="head-right">' +
                 '<span class="chev">' + esc(scoreLine) + '</span>' +
                 '<span class="chev">' + (open ? '▴ hide' : '▾ show') + '</span>' +
               '</span>' +
             '</div>' +
             '<div class="block-body"' + (open ? '' : ' hidden') + '>' +
               '<div style="margin-bottom:var(--space-3)">' +
                 '<button class="btn-quiet" type="button" data-act="toggle-reasons" data-id="' +
                   attr(key) + '" style="color:var(--on-light);border-color:var(--surface-line)">' +
                   (state.ui.showReasons[key]
                     ? 'Hide the reasons for correct answers'
                     : 'Show the reasons for correct answers') +
                 '</button>' +
               '</div>' +
               inner +
             '</div>' +
           '</section>';
  }

  function resultsHtml() {
    var r = state.result;
    var v = state.content.version;
    var i, j;

    var tiles = tileHtml(v.labels.investigation_tab, r.investigation.score, r.investigation.of) +
                tileHtml(v.labels.analysis_tab, r.analysis.score, r.analysis.of) +
                tileHtml(v.labels.report_tab, r.report.score, r.report.of) +
                tileHtml(v.labels.cases_tab, r.casesScore, r.casesOf) +
                tileHtml('Total', r.total.score, r.total.of, 'tile-total');

    var finished = state.result.finished;
    var summary = finished
      ? 'You reached the end of the simulation.'
      : 'The simulation was ended before the last case.';
    summary += ' ' + (r.late === 0
      ? 'Every answer was given before time ran out.'
      : r.late + (r.late === 1 ? ' answer was' : ' answers were') +
        ' given after time ran out; they are marked normally and tagged below.');

    /* --- Investigation ------------------------------------------------- */
    var inv = r.investigation;
    function itemList(ids, emptyText, tag) {
      if (!ids.length) return '<p class="none">' + esc(emptyText) + '</p>';
      var out = '<ul>';
      for (var n = 0; n < ids.length; n++) {
        var label = inv.labels[ids[n]];
        out += '<li>' + textToHtml(label ? label.label : ids[n]) +
               (tag ? ' <span class="earned-tag">' + esc(tag) + '</span>' : '') +
               (label && label.needed_for ? ' <span style="color:var(--on-light-muted)">— ' +
                 textToHtml(label.needed_for) + '</span>' : '') + '</li>';
      }
      return out + '</ul>';
    }

    /* What a return visit earned, said in words rather than as a number. The
       words come from the weight in the content file, so changing 0.5 to 0.25
       in version.json changes this line too and nothing here has to know. */
    var w = inv.weight;
    var earnedWords = w === 1 ? 'full mark'
                    : w === 0 ? 'no mark'
                    : w === 0.5 ? '½ mark'
                    : showScore(w) + ' of a mark';
    var onReturn = {};
    for (var rvi = 0; rvi < inv.returnVisit.length; rvi++) onReturn[inv.returnVisit[rvi]] = true;
    var firstPass = inv.found.filter(function (id) { return !onReturn[id]; });

    var invInner =
      '<p class="summary-line" style="margin-bottom:var(--space-4)">' +
        'A piece of information collected before you first left the Investigation earns a ' +
        'full mark. One fetched on a later visit back from the Analysis earns ' +
        esc(earnedWords) + '.</p>' +
      '<div class="collect-lists">' +
        '<div class="col-found"><h3>Collected on the first pass (' + firstPass.length + ')</h3>' +
          itemList(firstPass, 'Nothing that was needed was collected first time.') + '</div>' +
        '<div class="col-return"><h3>Collected on a return visit (' +
          inv.returnVisit.length + ')</h3>' +
          itemList(inv.returnVisit, 'Nothing was fetched on a return visit.', earnedWords) +
        '</div>' +
        '<div class="col-missed"><h3>Needed, but missed (' + inv.missing.length + ')</h3>' +
          itemList(inv.missing, 'Nothing was missed.') + '</div>' +
        '<div><h3>Collected, but not needed (' + inv.extras.length + ')</h3>' +
          itemList(inv.extras, 'Nothing unnecessary was collected.') +
          '<p class="none" style="margin-top:8px">These cost no marks.</p></div>' +
      '</div>' +
      (inv.explanation
        ? '<div class="mark-reason" style="margin-top:var(--space-4)">' +
          textToHtml(inv.explanation) + '</div>' : '');

    /* --- Analysis ------------------------------------------------------- */
    var anaInner = '';
    for (i = 0; i < r.analysis.questions.length; i++) {
      var q = r.analysis.questions[i];
      anaInner += '<h3 style="margin:var(--space-4) 0 var(--space-2)">Question ' + q.number +
                  '</h3><p class="mark-reason" style="margin:0 0 var(--space-2)">' +
                  textToHtml(q.text) + '</p>';
      for (j = 0; j < q.boxes.length; j++) {
        var box = q.boxes[j];
        anaInner += markRow({
          block: 'analysis', label: box.label + (box.unit ? ' (' + box.unit + ')' : ''),
          given: box.given, expected: box.expected,
          correct: box.correct, late: box.late, reason: box.explanation
        });
      }
    }

    /* --- Report --------------------------------------------------------- */
    var repInner = '<h3 style="margin:0 0 var(--space-2)">' + textToHtml(v.labels.written_tab) + '</h3>';
    for (i = 0; i < r.report.written.length; i++) {
      var w = r.report.written[i];
      repInner += markRow({
        block: 'report',
        label: 'Blank ' + w.id.toUpperCase(),
        given: w.kind === 'dropdown' ? (w.givenLabel || w.given) : w.given,
        givenIsContent: w.kind === 'dropdown',
        expected: w.kind === 'dropdown' ? w.expectedLabel : w.expected,
        correct: w.correct, late: w.late, reason: w.explanation
      });
    }
    repInner += '<h3 style="margin:var(--space-5) 0 var(--space-2)">' +
                textToHtml(v.labels.graph_tab) + '</h3>' +
      markRow({
        block: 'report', label: 'Chart type',
        given: CHART_NAMES[r.report.chart.given] || r.report.chart.given,
        expected: CHART_NAMES[r.report.chart.expected] || r.report.chart.expected,
        correct: r.report.chart.correct, late: r.report.chart.late,
        reason: r.report.chart.explanation
      });
    repInner += '<h3 style="margin:var(--space-5) 0 var(--space-2)">' +
                textToHtml(v.labels.visual_tab) + '</h3>';
    for (i = 0; i < r.report.grid.length; i++) {
      var cell = r.report.grid[i];
      repInner += markRow({
        block: 'report', label: cell.rowLabel + ' — ' + cell.colLabel,
        given: cell.given, expected: cell.expected,
        correct: cell.correct, late: cell.late,
        reason: (i === r.report.grid.length - 1) ? r.report.gridExplanation : ''
      });
    }

    /* --- Cases ---------------------------------------------------------- */
    var casesInner = '';
    for (i = 0; i < r.cases.length; i++) {
      var c = r.cases[i];
      var extra = '', d = c.detail;
      var given, expected;
      var givenIsContent = false;
      if (c.mechanism === 'choose_one') {
        given = d.givenLabel || d.given; expected = d.expectedLabel;
        givenIsContent = true;
      } else if (c.mechanism === 'choose_many') {
        given = undefined; expected = undefined;
        var optionIds = Object.keys(d.labels);
        for (j = 0; j < optionIds.length; j++) {
          var oid = optionIds[j], po = d.per_option[oid];
          var rightHere = (po.chosen === po.shouldBe);
          extra += '<div class="option-row ' + (rightHere ? 'is-right' : 'is-wrong') + '">' +
                     '<span class="icon">' + (rightHere ? '✓' : '✗') + '</span>' +
                     '<span>' + textToHtml(d.labels[oid]) +
                       ' <span style="color:var(--on-light-muted)">— you ' +
                       (po.chosen ? 'selected' : 'did not select') + ' it; it ' +
                       (po.shouldBe ? 'is' : 'is not') + ' supported</span>' +
                       (d.option_explanations[oid]
                         ? '<div class="mark-reason">' + textToHtml(d.option_explanations[oid]) +
                           '</div>' : '') +
                     '</span>' +
                   '</div>';
        }
        extra = '<div style="margin-top:6px">' + extra + '</div>';
      } else if (c.mechanism === 'dropdowns') {
        given = d.dropdowns.map(function (x) { return x.givenLabel || x.given || '—'; }).join(', ');
        expected = d.dropdowns.map(function (x) { return x.expectedLabel; }).join(', ');
        givenIsContent = true;
      } else if (c.mechanism === 'number' || c.mechanism === 'numbers') {
        given = undefined; expected = undefined;
        for (j = 0; j < d.boxes.length; j++) {
          var cb = d.boxes[j];
          extra += '<div class="option-row ' + (cb.correct ? 'is-right' : 'is-wrong') + '">' +
                     '<span class="icon">' + (cb.correct ? '✓' : '✗') + '</span>' +
                     '<span>' + textToHtml(cb.label) + ' you put <b>' +
                       (isBlank(cb.given) ? 'Not answered' : esc(cb.given)) +
                       '</b>, expected <b>' + textToHtml(cb.expected) + '</b>' +
                       (cb.explanation
                         ? '<div class="mark-reason">' + textToHtml(cb.explanation) + '</div>' : '') +
                     '</span>' +
                   '</div>';
        }
        extra = '<div style="margin-top:6px">' + extra + '</div>';
      } else if (c.mechanism === 'collect') {
        given = undefined; expected = undefined;
        extra = '<div class="collect-lists" style="margin-top:8px">' +
          '<div class="col-found"><h3>Collected, and needed (' + d.found.length + ')</h3>' +
            (d.found.length
              ? '<ul>' + d.found.map(function (id) {
                  return '<li>' + textToHtml(d.labels[id].label) + '</li>'; }).join('') + '</ul>'
              : '<p class="none">None.</p>') + '</div>' +
          '<div class="col-missed"><h3>Needed, but missed (' + d.missing.length + ')</h3>' +
            (d.missing.length
              ? '<ul>' + d.missing.map(function (id) {
                  return '<li>' + textToHtml(d.labels[id].label) + '</li>'; }).join('') + '</ul>'
              : '<p class="none">Nothing was missed.</p>') + '</div>' +
          '<div><h3>Collected, but not needed (' + d.extras.length + ')</h3>' +
            (d.extras.length
              ? '<ul>' + d.extras.map(function (id) {
                  return '<li>' + textToHtml(d.labels[id].label) + '</li>'; }).join('') + '</ul>'
              : '<p class="none">Nothing unnecessary.</p>') + '</div>' +
          '</div>';
      }
      casesInner += markRow({
        block: 'cases', label: 'Case ' + c.number + ' — ' + c.question,
        given: given, givenIsContent: givenIsContent, expected: expected,
        correct: c.correct, late: c.late, extra: extra, reason: c.explanation
      });
    }

    return '<div class="results"><div class="results-inner">' +
      '<div class="results-top">' +
        '<h1>Your results</h1>' +
        '<div class="results-actions">' +
          '<button class="btn-quiet" type="button" data-act="print" ' +
            'style="color:var(--on-light);border-color:var(--surface-line)">Print</button>' +
          '<button class="btn-quiet" type="button" data-act="csv" ' +
            'style="color:var(--on-light);border-color:var(--surface-line)">Download CSV</button>' +
          '<button class="btn" type="button" data-act="restart-now">Restart</button>' +
        '</div>' +
      '</div>' +
      '<div class="tiles">' + tiles + '</div>' +
      '<p class="summary-line">' + esc(summary) + '</p>' +
      blockHtml('investigation', v.labels.investigation_tab,
                showScore(inv.score) + ' / ' + showScore(inv.of), invInner) +
      blockHtml('analysis', v.labels.analysis_tab,
                showScore(r.analysis.score) + ' / ' + showScore(r.analysis.of), anaInner) +
      blockHtml('report', v.labels.report_tab,
                showScore(r.report.score) + ' / ' + showScore(r.report.of), repInner) +
      blockHtml('cases', v.labels.cases_tab,
                showScore(r.casesScore) + ' / ' + showScore(r.casesOf), casesInner) +
    '</div></div>';
  }

  /* --- the CSV ---------------------------------------------------------- */

  function csvText() {
    var r = state.result, v = state.content.version;
    /* v1.1: a last column saying whether an Investigation item was collected
       on the first pass or fetched on a return visit. It is blank on every
       other row, because the idea does not apply to them. */
    var rows = [['Phase', 'Item', 'Your answer', 'Expected', 'Correct', 'After time',
                 'Collected on']];
    var i, j;

    var inv = r.investigation;
    var onReturn = {};
    for (i = 0; i < inv.returnVisit.length; i++) onReturn[inv.returnVisit[i]] = true;
    for (i = 0; i < inv.found.length; i++) {
      var fid = inv.found[i];
      rows.push([v.labels.investigation_tab, inv.labels[fid].label,
                 'Collected', 'Collect it', 'Yes', 'No',
                 onReturn[fid] ? 'return visit' : 'first pass']);
    }
    for (i = 0; i < inv.missing.length; i++) {
      rows.push([v.labels.investigation_tab, inv.labels[inv.missing[i]].label,
                 'Not collected', 'Collect it', 'No', 'No', '']);
    }
    for (i = 0; i < inv.extras.length; i++) {
      rows.push([v.labels.investigation_tab, inv.labels[inv.extras[i]].label,
                 'Collected', 'Not needed (no penalty)', '-', 'No',
                 onReturn[inv.extras[i]] ? 'return visit' : 'first pass']);
    }
    for (i = 0; i < r.analysis.questions.length; i++) {
      var q = r.analysis.questions[i];
      for (j = 0; j < q.boxes.length; j++) {
        var b = q.boxes[j];
        rows.push([v.labels.analysis_tab, 'Question ' + q.number + ' — ' + b.label,
                   b.given, b.expected, b.correct ? 'Yes' : 'No', b.late ? 'Yes' : 'No', '']);
      }
    }
    for (i = 0; i < r.report.written.length; i++) {
      var w = r.report.written[i];
      rows.push([v.labels.report_tab, 'Blank ' + w.id.toUpperCase(),
                 w.kind === 'dropdown' ? (w.givenLabel || w.given) : w.given,
                 w.kind === 'dropdown' ? w.expectedLabel : w.expected,
                 w.correct ? 'Yes' : 'No', w.late ? 'Yes' : 'No', '']);
    }
    rows.push([v.labels.report_tab, 'Chart type',
               CHART_NAMES[r.report.chart.given] || r.report.chart.given,
               CHART_NAMES[r.report.chart.expected] || r.report.chart.expected,
               r.report.chart.correct ? 'Yes' : 'No', r.report.chart.late ? 'Yes' : 'No', '']);
    for (i = 0; i < r.report.grid.length; i++) {
      var cell = r.report.grid[i];
      rows.push([v.labels.report_tab, cell.rowLabel + ' — ' + cell.colLabel,
                 cell.given, cell.expected, cell.correct ? 'Yes' : 'No',
                 cell.late ? 'Yes' : 'No', '']);
    }
    for (i = 0; i < r.cases.length; i++) {
      var c = r.cases[i];
      var given = '', expected = '';
      if (c.mechanism === 'choose_one') {
        given = c.detail.givenLabel || c.detail.given || '';
        expected = c.detail.expectedLabel;
      } else if (c.mechanism === 'choose_many') {
        var chosen = [], should = [];
        Object.keys(c.detail.per_option).forEach(function (id) {
          if (c.detail.per_option[id].chosen) chosen.push(c.detail.labels[id]);
          if (c.detail.per_option[id].shouldBe) should.push(c.detail.labels[id]);
        });
        given = chosen.join(' | '); expected = should.join(' | ');
      } else if (c.mechanism === 'dropdowns') {
        given = c.detail.dropdowns.map(function (x) { return x.givenLabel || x.given || ''; }).join(' | ');
        expected = c.detail.dropdowns.map(function (x) { return x.expectedLabel; }).join(' | ');
      } else if (c.mechanism === 'number' || c.mechanism === 'numbers') {
        given = c.detail.boxes.map(function (x) { return x.label + ' ' + (x.given || ''); }).join(' | ');
        expected = c.detail.boxes.map(function (x) { return x.label + ' ' + x.expected; }).join(' | ');
      } else if (c.mechanism === 'collect') {
        given = c.detail.found.map(function (id) { return c.detail.labels[id].label; }).join(' | ');
        expected = c.detail.found.concat(c.detail.missing)
                    .map(function (id) { return c.detail.labels[id].label; }).join(' | ');
      }
      rows.push([v.labels.cases_tab, 'Case ' + c.number, given, expected,
                 c.correct ? 'Yes' : 'No', c.late ? 'Yes' : 'No', '']);
    }
    rows.push(['Total', 'Score', showScore(r.total.score), showScore(r.total.of), '', '', '']);

    return rows.map(function (row) {
      return row.map(function (cellText) {
        var t = String(cellText === null || cellText === undefined ? '' : cellText);
        return '"' + t.replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
  }

  function downloadCsv() {
    var blob = new Blob(['﻿' + csvText()], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = state.content.version.id + '-results.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ====================================================================== *
   * RENDER
   * ====================================================================== */

  function render() {
    /* Remember what the candidate was doing, so a redraw does not take it
       away: which element had the keyboard, where the caret was in it, and
       how far each scrolling column had been scrolled. */
    var active = document.activeElement;
    var focusKey = (active && active.getAttribute) ? active.getAttribute('data-focus-key') : null;
    var caret = null;
    if (focusKey && typeof active.selectionStart === 'number') caret = active.selectionStart;
    rememberScroll();

    document.body.classList.toggle('scrolls', state.phase === 'results');

    var html;
    if (state.phase === 'login') {
      html = loginHtml();
    } else if (state.phase === 'results') {
      html = resultsHtml();
    } else if (state.phase === 'start') {
      html = headerHtml() + '<div class="stage"><div class="main-box">' +
             startHtml() + '</div></div>';
    } else {
      var inner;
      if (state.phase === 'investigation') inner = investigationHtml();
      else if (state.phase === 'analysis') inner = analysisHtml();
      else if (state.phase === 'review') inner = reviewHtml();
      else if (state.phase === 'report_written') inner = reportWrittenHtml();
      else if (state.phase === 'report_graph') inner = reportGraphHtml();
      else if (state.phase === 'report_visual') inner = reportVisualHtml();
      else if (state.phase === 'cases') inner = casesHtml();
      else inner = '';
      html = headerHtml() +
             '<div class="stage"><div class="main-box"><div id="warning-slot"></div>' +
             inner + '</div></div>';
    }

    app.innerHTML = html + popupHtml();

    restoreScroll();
    drawWarning();
    watchSections();

    if (focusKey) {
      var again = app.querySelector('[data-focus-key="' + focusKey.replace(/"/g, '\\"') + '"]');
      if (again) {
        again.focus();
        if (caret !== null && typeof again.setSelectionRange === 'function') {
          try { again.setSelectionRange(caret, caret); } catch (e) { /* not a text field */ }
        }
      }
    }
    checkSize();
  }

  function rememberScroll() {
    var boxes = app.querySelectorAll('[data-scroll]');
    for (var i = 0; i < boxes.length; i++) {
      state.ui.scroll[boxes[i].getAttribute('data-scroll')] = boxes[i].scrollTop;
    }
  }

  function restoreScroll() {
    var boxes = app.querySelectorAll('[data-scroll]');
    for (var i = 0; i < boxes.length; i++) {
      var key = boxes[i].getAttribute('data-scroll');
      if (state.ui.scroll[key]) boxes[i].scrollTop = state.ui.scroll[key];
      boxes[i].addEventListener('scroll', rememberScrollSoon, { passive: true });
    }
  }

  var scrollTimer = null;
  function rememberScrollSoon() {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function () { scrollTimer = null; rememberScroll(); }, 120);
  }

  /* The Investigation's sub-tabs light up as their section comes into view.

     The highlight is applied straight to the tabs rather than by redrawing
     the page, because redrawing on every scroll would fight the scrolling.

     This works the position out from the scroll offset rather than from an
     IntersectionObserver, for one reason: THE LAST SECTION CAN NEVER REACH
     THE TOP OF THE BOX. Once the page is scrolled as far as it goes, Exhibit
     3 is still sitting halfway down, so an "is it near the top?" test picked
     Exhibit 2 and the last sub-tab could never light up — including when the
     candidate clicked it. Being at the bottom of the scroll is therefore its
     own answer, checked first. */
  var sectionScroller = null;
  var sectionScrollHandler = null;

  function watchSections() {
    if (sectionScroller && sectionScrollHandler) {
      sectionScroller.removeEventListener('scroll', sectionScrollHandler);
      sectionScroller = null;
      sectionScrollHandler = null;
    }
    if (state.phase !== 'investigation') return;
    var scroller = app.querySelector('[data-scroll="investigation"]');
    if (!scroller || !app.querySelectorAll('[data-section]').length) return;

    var waiting = false;
    sectionScroller = scroller;
    sectionScrollHandler = function () {
      if (waiting) return;
      waiting = true;
      window.requestAnimationFrame(function () { waiting = false; updateSectionInView(); });
    };
    scroller.addEventListener('scroll', sectionScrollHandler, { passive: true });
    updateSectionInView();
  }

  function updateSectionInView() {
    var scroller = app.querySelector('[data-scroll="investigation"]');
    var sections = app.querySelectorAll('[data-section]');
    if (!scroller || !sections.length) return;

    var chosen;
    var atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
    if (atBottom) {
      chosen = sections[sections.length - 1].getAttribute('data-section');
    } else {
      /* The section in view is the last one whose heading has reached the TOP
         of the box.

         A quarter of the way down was the obvious line to use and it was
         wrong: the Study section is a single short paragraph, so as soon as
         it was scrolled to the top the next heading was already past the
         quarter line and Exhibit 1 lit up instead. Clicking "Study" then
         highlighted "Exhibit 1", which is worse than no highlight at all. */
      var line = scroller.getBoundingClientRect().top + 8;
      chosen = sections[0].getAttribute('data-section');
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top <= line) {
          chosen = sections[i].getAttribute('data-section');
        }
      }
    }
    if (chosen === state.ui.investigationTab) return;
    state.ui.investigationTab = chosen;
    highlightSectionTab(chosen);
  }

  function highlightSectionTab(id) {
    var tabs = app.querySelectorAll('.tab-sub[data-act="scroll-section"]');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('is-inview', tabs[i].getAttribute('data-id') === id);
    }
  }

  /* ====================================================================== *
   * MOVING BETWEEN SCREENS
   * ====================================================================== */

  function journalItemIds() {
    /* Only the pieces of information count. Calculator results and Analysis
       answers copied in automatically are in the journal too, and are not
       part of any score. */
    var items = state.content.investigation.items;
    var ids = [];
    for (var i = 0; i < state.journal.length; i++) {
      if (items[state.journal[i].id]) ids.push(state.journal[i].id);
    }
    return ids;
  }

  function goAnalysis() {
    /* The first time the candidate leaves the Investigation, photograph the
       journal. Everything added after this is a return visit (R-D37). */
    if (state.investigation.firstPassIds === null) {
      state.investigation.firstPassIds = journalItemIds();
    }
    /* Coming back from the Investigation lands on whichever Analysis page the
       candidate left — the question they were on, or the Review page. */
    state.phase = state.analysis.atReview ? 'review' : 'analysis';
    state.reached.analysis = true;
    if (!state.analysis.tutorialShown) {
      state.analysis.tutorialShown = true;
      /* The clock stops while the tutorial popup is up, and starts again the
         moment it is dismissed. Two pauses in the whole run: this one and
         the one before the cases (R-D16). */
      openPopup('analysis_tutorial', { pauses: true });
      return;
    }
    render();
  }

  function nextQuestion() {
    var questions = state.content.analysis.questions;
    var index = 0;
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].number === state.analysis.current) index = i;
    }
    /* Every filled box is copied into the Research Journal as the candidate
       moves on, which is what the current simulation does (R-D16). */
    var boxes = questions[index].boxes;
    for (i = 0; i < boxes.length; i++) {
      var leaf = state.analysis.answers[boxes[i].id];
      if (leaf && !isBlank(leaf.value)) {
        /* "Answer #1" followed by the box's own label, as the real game
           titles them (rule 5.4 v1.1). The label on its own is not enough:
           in RR6 all four questions have boxes with the SAME two labels, so
           the journal filled up with four identical titles and the candidate
           could not tell which answer was which. (No scenario word appears in
           this file — the labels come from the content.) */
        var answerTitle = 'Answer #' + questions[index].number + ' ' + boxes[i].label;
        addToJournal({
          id: 'ans:' + boxes[i].id,
          label: answerTitle,
          title: answerTitle,
          text: String(leaf.value),
          expanded: false,
          marked: false
        });
      }
    }
    if (index + 1 < questions.length) {
      state.analysis.current = questions[index + 1].number;
      state.phase = 'analysis';
      state.analysis.atReview = false;
    } else {
      state.phase = 'review';
      state.analysis.atReview = true;
    }
    render();
  }

  function goCases() {
    state.phase = 'cases';
    state.reached.cases = true;
    if (!state.cases.tutorialShown) {
      state.cases.tutorialShown = true;
      openPopup('cases_tutorial', { pauses: true });
      return;
    }
    render();
  }

  function nextCase() {
    state.cases.done[state.cases.current] = true;
    var list = state.content.cases.cases;
    if (state.cases.current < list.length) {
      state.cases.current++;
      render();
    } else {
      finish(true);
    }
  }

  function finish(reachedTheEnd) {
    state.timer.running = false;
    state.result = M.markGame(state.content, answersForMarking());
    state.result.finished = !!reachedTheEnd;
    state.phase = 'results';
    render();
  }

  function primaryAction() {
    if (state.phase === 'investigation') {
      openPopup('to_analysis', { onGo: goAnalysis });
    } else if (state.phase === 'analysis') {
      openPopup('next_question', { onGo: nextQuestion });
    } else if (state.phase === 'review') {
      openPopup('to_report', {
        onGo: function () {
          /* Conclude is the last moment the Investigation can be reached, so
             this is the journal that gets marked. Anything the candidate does
             to the journal during the Report cannot change the score. */
          state.investigation.finalIds = journalItemIds();
          state.phase = 'report_written';
          state.reached.report = true;
          render();
        }
      });
    } else if (state.phase === 'report_written') {
      openPopup('next_section', {
        onGo: function () { state.phase = 'report_graph'; render(); }
      });
    } else if (state.phase === 'report_graph') {
      /* Nothing is chosen until the candidate reaches this page, so the
         default from the content is recorded as their answer when they move
         on unless they picked something else (R-D16). */
      if (!state.report.chart) {
        state.report.chart = stamp(state.content.report.chart['default']);
      }
      openPopup('next_section', {
        onGo: function () { state.phase = 'report_visual'; render(); }
      });
    } else if (state.phase === 'report_visual') {
      openPopup('next_section', { onGo: goCases });
    } else if (state.phase === 'cases') {
      openPopup('next_case', { onGo: nextCase });
    }
  }

  /* ====================================================================== *
   * DRAG AND DROP
   * ====================================================================== */

  var carrying = null;

  function payloadFrom(element) {
    try { return JSON.parse(element.getAttribute('data-drag')); } catch (e) { return null; }
  }
  function targetFrom(element) {
    try { return JSON.parse(element.getAttribute('data-drop')); } catch (e) { return null; }
  }

  /* Which journal is on screen right now: the Investigation's, or a collect
     case's own separate one. */
  function activeJournal() {
    if (state.phase === 'cases') {
      var c = currentCase();
      if (c.mechanism === 'collect') return caseJournal(c.number);
      return null;
    }
    return state.journal;
  }

  function deliver(target, payload) {
    if (!target || !payload) return;

    if (target.target === 'journal' || target.target === 'journal-slot') {
      var list = activeJournal();
      if (!list) return;

      if (payload.kind === 'journal') {
        if (target.target === 'journal-slot') moveInJournal(payload.id, target.id, list);
        render();
        return;
      }
      /* Only a labelled item or a calculator result can be kept in the
         journal. A bare number has no label behind it, so there is nothing
         to record (RD-BUILD-SPEC §5.5). */
      if (payload.kind === 'item') {
        var items = (state.phase === 'cases') ? currentCase().items
                                              : state.content.investigation.items;
        var item = items[payload.id];
        if (!item) return;
        addToJournal({ id: payload.id, label: item.label, title: item.label,
                       text: item.text, expanded: false, marked: false }, list);
        render();
        return;
      }
      if (payload.kind === 'calc') {
        addToJournal({ id: 'calcres:' + payload.id + ':' + Date.now(),
                       label: 'Calculator result', title: 'Calculator result',
                       text: String(payload.text), expanded: false, marked: false }, list);
        render();
      }
      return;
    }

    if (target.target === 'calc') { calcDrop(payload.text); return; }

    if (target.target === 'box') {
      var value = M.numberTextFromDrop(payload.text);
      if (value === null) return;                 /* not a number: refused */
      setBoxValue(target.id, value);
      render();
    }
  }

  /* ====================================================================== *
   * WRITING ANSWERS
   * ====================================================================== */

  function setBoxValue(id, value) {
    if (state.phase === 'analysis') {
      state.analysis.answers[id] = stamp(value);
    } else if (state.phase === 'report_written') {
      state.report.written[id] = stamp(value);
    } else if (state.phase === 'report_visual') {
      state.report.grid[id] = stamp(value);
    } else if (state.phase === 'cases') {
      var answer = caseAnswer(state.cases.current);
      if (!answer.boxes) answer.boxes = {};
      answer.boxes[id] = value;
      answer.secondsLeft = state.timer.secondsLeft;
    }
  }

  /* ====================================================================== *
   * EVENTS
   * ====================================================================== */

  var ACTIONS = {
    'start': function () { state.phase = 'investigation'; startClock(); render(); },

    'primary': primaryAction,

    'popup-go': function () { closePopup('go'); },
    'popup-back': function () { closePopup('back'); },

    'go-investigation': function () { state.phase = 'investigation'; render(); },
    'go-analysis': function () {
      state.phase = state.analysis.atReview ? 'review' : 'analysis';
      render();
    },
    'go-graph': function () { state.phase = 'report_graph'; render(); },

    'scroll-section': function (element) {
      var id = element.getAttribute('data-id');
      var section = app.querySelector('[data-section="' + id + '"]');
      var scroller = app.querySelector('[data-scroll="investigation"]');
      if (!section || !scroller) return;
      scroller.scrollTop = section.offsetTop - scroller.offsetTop;
      state.ui.investigationTab = id;
      highlightSectionTab(id);
      /* The scroll may have hit the bottom of the box, in which case the
         section actually in view is the last one, not necessarily the one
         clicked. Let the same rule that runs while scrolling decide, once the
         browser has finished moving. */
      window.requestAnimationFrame(updateSectionInView);
    },

    'unjournal': function (element) {
      removeFromJournal(element.getAttribute('data-id'), activeJournal());
      render();
    },
    'expand': function (element) {
      var list = activeJournal();
      var id = element.getAttribute('data-id');
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) list[i].expanded = !list[i].expanded;
      }
      render();
    },
    'edit-title': function (element) {
      state.ui.editingTitle = element.getAttribute('data-id');
      render();
    },
    /* Marking an entry as important is the candidate's own note to
       themselves. It lives in state so it survives every redraw and every
       trip out to the Analysis and back, and marking.js never sees it. */
    'mark': function (element) {
      var list = activeJournal();
      if (!list) return;
      var id = element.getAttribute('data-id');
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) list[i].marked = !list[i].marked;
      }
      render();
    },

    'clear-box': function (element) {
      setBoxValue(element.getAttribute('data-id'), '');
      render();
    },

    'calc-key': function (element) { calcKey(element.getAttribute('data-key')); },

    'restart': function () {
      openPopup('restart', {
        pauses: true,
        onGo: function () {
          var content = state.content;
          state = freshRun(content);
          state.timer.running = false;
          render();
        }
      });
    },
    'restart-now': function () {
      var content = state.content;
      state = freshRun(content);
      render();
    },

    'fullscreen': function () {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(function () { /* refused */ });
      }
    },

    'toggle-block': function (element) {
      var key = element.getAttribute('data-id');
      state.ui.openBlocks[key] = !state.ui.openBlocks[key];
      render();
    },
    'toggle-reasons': function (element) {
      var key = element.getAttribute('data-id');
      state.ui.showReasons[key] = !state.ui.showReasons[key];
      render();
    },

    'dismiss-warning': function () { dismissWarning(); },

    'print': function () { window.print(); },
    'csv': function () { downloadCsv(); }
  };

  document.addEventListener('click', function (event) {
    var element = event.target.closest ? event.target.closest('[data-act]') : null;
    if (!element) return;
    var action = ACTIONS[element.getAttribute('data-act')];
    if (!action) return;
    event.preventDefault();
    action(element);
  });

  document.addEventListener('keydown', function (event) {
    var element = event.target;
    if (event.key === 'Enter' && element && element.id === 'calc-input') {
      event.preventDefault();
      calcEvaluate();
      return;
    }
    if (event.key === 'Enter' && element && element.classList &&
        element.classList.contains('journal-title-input')) {
      event.preventDefault();
      element.blur();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && element &&
        element.getAttribute && element.getAttribute('data-act') === 'toggle-block') {
      event.preventDefault();
      ACTIONS['toggle-block'](element);
    }
  });

  document.addEventListener('input', function (event) {
    var element = event.target;
    if (!element || !element.getAttribute) return;

    if (element.id === 'calc-input') { state.calc.input = element.value; return; }

    var boxId = element.getAttribute('data-box');
    if (boxId) {
      setBoxValue(boxId, element.value);
      /* The Visual page draws the chart live from these figures, so it has to
         follow every keystroke. Only the chart is repainted — a full redraw
         would take the keyboard away from the box being typed into. */
      if (state.phase === 'report_visual') refreshChart();
      return;
    }
  });

  document.addEventListener('change', function (event) {
    var element = event.target;
    if (!element || !element.getAttribute) return;

    var blankId = element.getAttribute('data-blank');
    if (blankId) { state.report.written[blankId] = stamp(element.value); render(); return; }

    if (element.getAttribute('data-chart-choice')) {
      state.report.chart = stamp(element.value);
      render();
      return;
    }
    if (element.getAttribute('data-case-one')) {
      var one = caseAnswer(state.cases.current);
      one.value = element.value;
      one.secondsLeft = state.timer.secondsLeft;
      render();
      return;
    }
    if (element.getAttribute('data-case-many')) {
      var many = caseAnswer(state.cases.current);
      if (!many.values) many.values = [];
      var at = many.values.indexOf(element.value);
      if (element.checked && at === -1) many.values.push(element.value);
      if (!element.checked && at !== -1) many.values.splice(at, 1);
      many.secondsLeft = state.timer.secondsLeft;
      render();
      return;
    }
    var caseDropId = element.getAttribute('data-case-drop');
    if (caseDropId) {
      var drops = caseAnswer(state.cases.current);
      if (!drops.dropdowns) drops.dropdowns = {};
      drops.dropdowns[caseDropId] = element.value;
      drops.secondsLeft = state.timer.secondsLeft;
      render();
    }
  });

  /* Renaming a journal entry commits when the box loses the keyboard. */
  document.addEventListener('focusout', function (event) {
    var element = event.target;
    if (!element || !element.getAttribute) return;
    var forId = element.getAttribute('data-title-for');
    if (!forId) return;
    var list = activeJournal() || state.journal;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === forId) {
        list[i].title = element.value.trim() || list[i].label;
      }
    }
    state.ui.editingTitle = null;
    render();
  });

  /* --- dragging with a mouse ------------------------------------------- */

  document.addEventListener('dragstart', function (event) {
    var source = event.target.closest ? event.target.closest('[data-drag]') : null;
    if (!source) return;
    carrying = payloadFrom(source);
    source.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      try { event.dataTransfer.setData('text/plain', source.getAttribute('data-drag')); }
      catch (e) { /* some browsers refuse; `carrying` covers us */ }
    }
  });

  document.addEventListener('dragend', function () {
    carrying = null;
    var dragging = app.querySelectorAll('.is-dragging');
    for (var i = 0; i < dragging.length; i++) dragging[i].classList.remove('is-dragging');
    clearDropHighlights();
  });

  document.addEventListener('dragover', function (event) {
    var zone = event.target.closest ? event.target.closest('[data-drop]') : null;
    if (!zone) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    highlightDropZone(zone);
  });

  document.addEventListener('dragleave', function (event) {
    var zone = event.target.closest ? event.target.closest('[data-drop]') : null;
    if (zone) unhighlight(zone);
  });

  document.addEventListener('drop', function (event) {
    var zone = event.target.closest ? event.target.closest('[data-drop]') : null;
    if (!zone) return;
    event.preventDefault();
    var payload = carrying;
    if (!payload && event.dataTransfer) {
      try { payload = JSON.parse(event.dataTransfer.getData('text/plain')); } catch (e) { payload = null; }
    }
    clearDropHighlights();
    carrying = null;
    deliver(targetFrom(zone), payload);
  });

  function highlightDropZone(zone) {
    clearDropHighlights();
    var target = targetFrom(zone);
    if (!target) return;
    if (target.target === 'journal') zone.classList.add('is-target');
    else if (target.target === 'journal-slot') zone.classList.add('is-over');
    else if (target.target === 'calc') zone.classList.add('is-target');
    else if (target.target === 'box') zone.classList.add('is-target');
  }
  function unhighlight(zone) { zone.classList.remove('is-target', 'is-over'); }
  function clearDropHighlights() {
    var marked = app.querySelectorAll('.is-target, .is-over');
    for (var i = 0; i < marked.length; i++) unhighlight(marked[i]);
  }

  /* --- dragging with a finger ------------------------------------------
     Touch screens do not fire the drag events above, so a small
     pointer-driven equivalent stands in: press a chip, drag it, and it is
     delivered to whatever is under the finger when it lifts. */

  var touch = null;

  document.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'mouse') return;
    var source = event.target.closest ? event.target.closest('[data-drag]') : null;
    if (!source) return;
    touch = { payload: payloadFrom(source), ghost: null, moved: false };
  });

  document.addEventListener('pointermove', function (event) {
    if (!touch || !touch.payload) return;
    event.preventDefault();
    touch.moved = true;
    if (!touch.ghost) {
      touch.ghost = document.createElement('div');
      touch.ghost.className = 'chip';
      touch.ghost.style.cssText = 'position:fixed;z-index:300;pointer-events:none;opacity:0.9';
      touch.ghost.textContent = touch.payload.text;
      document.body.appendChild(touch.ghost);
    }
    touch.ghost.style.left = (event.clientX + 10) + 'px';
    touch.ghost.style.top = (event.clientY - 14) + 'px';
    var under = document.elementFromPoint(event.clientX, event.clientY);
    var zone = under && under.closest ? under.closest('[data-drop]') : null;
    clearDropHighlights();
    if (zone) highlightDropZone(zone);
  }, { passive: false });

  document.addEventListener('pointerup', function (event) {
    if (!touch) return;
    var payload = touch.payload, moved = touch.moved;
    if (touch.ghost && touch.ghost.parentNode) touch.ghost.parentNode.removeChild(touch.ghost);
    touch = null;
    clearDropHighlights();
    if (!payload || !moved) return;
    var under = document.elementFromPoint(event.clientX, event.clientY);
    var zone = under && under.closest ? under.closest('[data-drop]') : null;
    if (zone) deliver(targetFrom(zone), payload);
  });

  /* --- the login form --------------------------------------------------- */

  document.addEventListener('submit', function (event) {
    if (!event.target || event.target.id !== 'login-form') return;
    event.preventDefault();
    attemptLogin(byId('login-user').value.trim(), byId('login-pass').value);
  });

  /* --- window size and fullscreen --------------------------------------- */

  function checkSize() {
    var small = (window.innerWidth < MIN_WIDTH || window.innerHeight < MIN_HEIGHT);
    tooSmall.hidden = !small;
  }
  window.addEventListener('resize', checkSize);
  document.addEventListener('fullscreenchange', function () { if (state) render(); });

  /* ====================================================================== *
   * STARTING UP
   * ====================================================================== */

  /* The embed check FAILS OPEN, deliberately. A candidate who cannot start
     their assessment is far worse than somebody finding the page by
     accident, so anything uncertain loads normally. */
  function embedAllowed() {
    if (!CONFIG.blockDirectAccess) return true;
    try {
      if (window.self === window.top) return false;
      if (!document.referrer) return true;                 /* nothing to judge on */
      var host = new URL(document.referrer).hostname;
      return CONFIG.allowedEmbedDomains.indexOf(host) !== -1;
    } catch (e) {
      return true;
    }
  }

  function showMessage(title, lines) {
    app.innerHTML = '<div class="centre-screen"><div class="card load-error">' +
      '<h1>' + esc(title) + '</h1><ul>' +
      lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') +
      '</ul></div></div>';
  }

  function boot() {
    app.innerHTML = '<div class="centre-screen"><div class="card load-error">' +
                    '<h1>Loading…</h1></div></div>';
    checkSize();

    if (!embedAllowed()) {
      showMessage('Please open the simulation from your course',
                  ['This page is meant to be opened inside your CaseMentor lesson.']);
      return;
    }

    var id = CONTENT.versionFromUrl(window.location.search, 'rr6');
    CONTENT.loadVersion(id, '').then(function (loaded) {
      if (!loaded.ok) {
        showMessage('This simulation’s content could not be used', loaded.errors);
        return;
      }
      state = freshRun(loaded.content);
      state.phase = CONFIG.requireLogin ? 'login' : 'start';
      state.loggedIn = !CONFIG.requireLogin;
      document.title = loaded.content.version.title;
      render();
    });
  }

  boot();

}());
