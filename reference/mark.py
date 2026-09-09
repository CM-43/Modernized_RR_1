"""
Redrock reference marker — Fable's independent implementation of RD-BUILD-SPEC.md §7.

Used only by reference/difftest.py to cross-check js/marking.js. Never served.
Usage:  python3 mark.py data/rr6 answers.json     -> prints the result object as JSON
        python3 mark.py data/rr6 --key             -> marks the answer key transcribed below (self-test)

Rules implemented (RD-Master-Doc R-D18..R-D21, RD-GAME-RULES §9):
  numbers      : right iff round(given, d) == round(answer, d) or == round(a, d) for a in any_of
  choose_one   : right iff id equals answer
  choose_many  : right iff chosen set equals answer set
  collect      : found / required; extras listed, no penalty
  a case with several boxes is one mark, right only if every box is right
"""
import json, math, sys, os, re

def rnd(x, d):
    f = 10 ** d
    return math.floor(x * f + 0.5 + 1e-9) / f        # round half up, with the float guard

def parse_number(s, has_unit_percent=False):
    if s is None: return None
    if isinstance(s, (int, float)): return float(s)
    t = str(s).strip().replace(',', '').replace(' ', '')
    if t == '': return None
    pct = t.endswith('%')
    if pct: t = t[:-1]
    if not re.fullmatch(r'[+-]?(\d+\.?\d*|\.\d+)', t): return None
    v = float(t)
    if pct and not has_unit_percent: v = v / 100.0
    return v

def mark_number(given, box):
    d = box['accept']['decimals']
    g = parse_number(given, box.get('unit') == '%')
    if g is None:
        return {'correct': False, 'given': given, 'expected': box['answer'], 'not_answered': given in (None, '')}
    targets = [box['answer']] + box['accept'].get('any_of', [])
    ok = any(rnd(g, d) == rnd(t, d) for t in targets)
    return {'correct': ok, 'given': given, 'expected': box['answer']}

def late(leaf):
    return isinstance(leaf, dict) and leaf.get('secondsLeft') is not None and leaf['secondsLeft'] <= 0

def val(leaf):
    return leaf.get('value') if isinstance(leaf, dict) else leaf

def mark_collect(journal_ids, items, return_visit_ids=None, weight=1):
    # R-D37: a required item collected on a RETURN visit to the Investigation
    # (after "Complete Investigation" was first confirmed) earns `weight`
    # instead of 1. weight comes from version.json (return_visit_weight);
    # 1 = no penalty, 0.5 = WK's half-mark rule, 0 = first pass only.
    # Collect cases never pass return_visit_ids, so they are unaffected.
    required = [i for i, v in items.items() if v.get('required')]
    js = set(journal_ids or [])
    rv = set(return_visit_ids or [])
    found = [i for i in required if i in js]
    missing = [i for i in required if i not in js]
    extras = [i for i in js if i in items and i not in required]
    return_visit = [i for i in found if i in rv]
    score = sum(weight if i in rv else 1 for i in found)
    if score == int(score):
        score = int(score)
    return {'required': len(required), 'found': found, 'missing': missing, 'extras': extras,
            'returnVisit': return_visit, 'weight': weight,
            'score': score, 'of': len(required)}

def mark_game(content, answers):
    inv, ana, rep, cas = content['investigation'], content['analysis'], content['report'], content['cases']
    A = answers or {}
    late_count = 0
    # Investigation
    inv_a = A.get('investigation') or {}
    weight = content['version'].get('return_visit_weight', 1)
    investigation = mark_collect(inv_a.get('journal', []), inv['items'],
                                 inv_a.get('return_visit', []), weight)
    # Analysis
    qs, score, of = [], 0, 0
    for q in ana['questions']:
        boxes = []
        for b in q['boxes']:
            leaf = (A.get('analysis') or {}).get(b['id'])
            m = mark_number(val(leaf), b); m['id'] = b['id']; m['late'] = late(leaf)
            late_count += m['late']; of += 1; score += m['correct']
            boxes.append(m)
        qs.append({'number': q['number'], 'boxes': boxes})
    analysis = {'questions': qs, 'score': score, 'of': of}
    # Report
    R = A.get('report') or {}
    written, rscore, rof = [], 0, 0
    for bid, blank in rep['written']['blanks'].items():
        leaf = (R.get('written') or {}).get(bid)
        if blank['kind'] == 'dropdown':
            m = {'correct': val(leaf) == blank['answer'], 'given': val(leaf), 'expected': blank['answer']}
        else:
            m = mark_number(val(leaf), blank)
        m['id'] = bid; m['late'] = late(leaf); late_count += m['late']; rof += 1; rscore += m['correct']
        written.append(m)
    cl = R.get('chart'); chart = {'correct': val(cl) == rep['chart']['answer'], 'given': val(cl), 'expected': rep['chart']['answer'], 'late': late(cl)}
    late_count += chart['late']; rof += 1; rscore += chart['correct']
    grid = []
    for ri, row in enumerate(rep['grid']['cells']):
        for ci, cell in enumerate(row):
            if 'fixed' in cell: continue
            leaf = (R.get('grid') or {}).get(cell['id'])
            m = mark_number(val(leaf), cell); m.update({'id': cell['id'], 'row': ri, 'col': ci, 'late': late(leaf)})
            late_count += m['late']; rof += 1; rscore += m['correct']; grid.append(m)
    report = {'written': written, 'chart': chart, 'grid': grid, 'score': rscore, 'of': rof}
    # Cases
    cases_out, cscore = [], 0
    for c in cas['cases']:
        ans = (A.get('cases') or {}).get(str(c['number'])) or (A.get('cases') or {}).get(c['number']) or {}
        mech = c['mechanism']; is_late = late(ans); late_count += is_late
        if mech == 'choose_one':
            ok = ans.get('value') == c['answer']; detail = {'given': ans.get('value'), 'expected': c['answer']}
        elif mech == 'choose_many':
            chosen = set(ans.get('values') or []); exp = set(c['answer'])
            ok = chosen == exp
            detail = {'per_option': {o: {'chosen': o in chosen, 'shouldBe': o in exp} for o in c['options']}}
        elif mech == 'dropdowns':
            given = ans.get('dropdowns') or {}
            per = [{'id': d['id'], 'given': given.get(d['id']), 'expected': d['answer'], 'correct': given.get(d['id']) == d['answer']} for d in c['dropdowns']]
            ok = all(p['correct'] for p in per); detail = {'dropdowns': per}
        elif mech in ('number', 'numbers'):
            given = ans.get('boxes') or {}
            per = [dict(mark_number(given.get(b['id']), b), id=b['id']) for b in c['boxes']]
            ok = all(p['correct'] for p in per); detail = {'boxes': per}
        elif mech == 'collect':
            col = mark_collect(ans.get('journal', []), c['items']); ok = col['missing'] == []; detail = col
        else:
            raise ValueError('unknown mechanism ' + mech)
        cscore += ok
        cases_out.append({'number': c['number'], 'mechanism': mech, 'correct': bool(ok), 'late': is_late, 'detail': detail})
    total_score = investigation['score'] + analysis['score'] + report['score'] + cscore
    total_of = investigation['of'] + analysis['of'] + report['of'] + len(cas['cases'])
    return {'investigation': investigation, 'analysis': analysis, 'report': report, 'cases': cases_out,
            'casesScore': cscore, 'casesOf': len(cas['cases']),
            'total': {'score': total_score, 'of': total_of}, 'late': int(late_count)}

def load(folder):
    return {n: json.load(open(os.path.join(folder, n + '.json'), encoding='utf-8'))
            for n in ('version', 'investigation', 'analysis', 'report', 'cases')}

def key_answers(content):
    """The RR6 answer key (20260908_RR6_Answer Key.docx), transcribed. Must mark 29/8/13/6."""
    inv = content['investigation']
    A = {'investigation': {'journal': [i for i, v in inv['items'].items() if v['required']]},
         'analysis': {}, 'report': {'written': {}, 'grid': {}}, 'cases': {}}
    for q in content['analysis']['questions']:
        for b in q['boxes']: A['analysis'][b['id']] = {'value': str(b['answer']), 'secondsLeft': 100}
    rep = content['report']
    for bid, bl in rep['written']['blanks'].items(): A['report']['written'][bid] = {'value': str(bl['answer'])}
    A['report']['chart'] = {'value': rep['chart']['answer']}
    for row in rep['grid']['cells']:
        for cell in row:
            if 'id' in cell: A['report']['grid'][cell['id']] = {'value': str(cell['answer'])}
    for c in content['cases']['cases']:
        m = c['mechanism']
        if m == 'choose_one': A['cases'][c['number']] = {'value': c['answer']}
        elif m == 'choose_many': A['cases'][c['number']] = {'values': list(c['answer'])}
        elif m == 'dropdowns': A['cases'][c['number']] = {'dropdowns': {d['id']: d['answer'] for d in c['dropdowns']}}
        elif m in ('number', 'numbers'): A['cases'][c['number']] = {'boxes': {b['id']: str(b['answer']) for b in c['boxes']}}
        elif m == 'collect': A['cases'][c['number']] = {'journal': [i for i, v in c['items'].items() if v['required']]}
    return A

if __name__ == '__main__':
    content = load(sys.argv[1])
    answers = key_answers(content) if sys.argv[2] == '--key' else json.load(open(sys.argv[2]))
    print(json.dumps(mark_game(content, answers), indent=1))
