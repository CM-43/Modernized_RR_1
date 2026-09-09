/* Runs js/marking.js under Node so the differential test can compare it
   against reference/mark.py. TESTING ONLY — the simulation itself never
   needs Node, and this file is never served to a candidate.

   Usage:  node reference/run_marking.js data/rr6 answers.json
   Reads a JSON list of answer objects, prints a JSON list of results. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dataDir = process.argv[2];
const answersFile = process.argv[3];

const root = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(root, 'js', 'marking.js'), 'utf8'));

const content = {};
for (const name of ['version', 'investigation', 'analysis', 'report', 'cases']) {
  content[name] = JSON.parse(
    fs.readFileSync(path.join(root, dataDir, name + '.json'), 'utf8')
  );
}

const sets = JSON.parse(fs.readFileSync(answersFile, 'utf8'));
const out = sets.map(a => MARKING.markGame(content, a));
process.stdout.write(JSON.stringify(out));
