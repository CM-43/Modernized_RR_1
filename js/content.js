/* ==========================================================================
   content.js — LOADING AND CHECKING THE CONTENT FILES

   Every question, number, label, button word and correct answer lives in
   data/<version>/. This file fetches those five files and hands them to the
   rules engine's checker before anything is drawn.

   It contains no rules and touches no page. Its only job is: read the files,
   say plainly what is wrong if anything is, hand back the content.

   Which version loads comes from the address: index.html?v=rr6. A second
   version is a second folder under data/ — no code changes.
   ========================================================================== */

(function (root) {
  'use strict';

  var FILES = ['version', 'investigation', 'analysis', 'report', 'cases'];

  /* Read the version id out of the page's address, e.g. "?v=rr6".
     Only letters, digits, hyphen and underscore are allowed, so the id can
     never be used to reach outside the data folder. */
  function versionFromUrl(search, fallback) {
    var m = /[?&]v=([A-Za-z0-9_-]+)/.exec(search || '');
    return m ? m[1] : (fallback || 'rr6');
  }

  /* Fetch the five files for one version.

     Returns a promise for { ok: true, content: {...} } or
     { ok: false, errors: [ "...", ... ] } — never a thrown exception, so the
     caller always has something plain to put on the screen.

     `base` lets tools/answer-key.html and tests.html, which sit one folder
     down, reach the same data with "../". */
  function loadVersion(id, base) {
    var prefix = (base || '') + 'data/' + id + '/';
    var jobs = FILES.map(function (name) {
      return fetch(prefix + name + '.json', { cache: 'no-store' })
        .then(function (response) {
          if (!response.ok) {
            throw new Error('Could not read ' + name + '.json (the server said ' +
                            response.status + ' ' + response.statusText + ').');
          }
          return response.text();
        })
        .then(function (text) {
          try {
            return JSON.parse(text);
          } catch (e) {
            throw new Error(name + '.json is not valid JSON — ' + e.message +
                            '. A missing comma or a stray quote is the usual cause.');
          }
        });
    });

    return Promise.all(jobs).then(function (parts) {
      var content = {};
      for (var i = 0; i < FILES.length; i++) content[FILES[i]] = parts[i];
      var check = root.MARKING.validateContent(
        content.version, content.investigation, content.analysis,
        content.report, content.cases
      );
      if (!check.ok) return { ok: false, errors: check.errors, content: content };
      content.id = id;
      return { ok: true, errors: [], content: content };
    }).catch(function (err) {
      return {
        ok: false,
        errors: [
          'The content for version "' + id + '" could not be loaded.',
          String(err.message || err),
          'Check that the folder data/' + id + '/ exists and holds all five files: ' +
          FILES.map(function (f) { return f + '.json'; }).join(', ') + '.'
        ],
        content: null
      };
    });
  }

  root.CONTENT = {
    FILES: FILES,
    loadVersion: loadVersion,
    versionFromUrl: versionFromUrl
  };

}(typeof globalThis !== 'undefined' ? globalThis : this));
