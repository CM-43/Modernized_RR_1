#!/usr/bin/env python3
"""
difftest.py — THE DIFFERENTIAL TEST

Two markers were written independently from the same written rules:

    js/marking.js        the one the simulation actually uses
    reference/mark.py    Fable's separate implementation, supplied with the spec

This script invents thousands of random answer sets, runs every one through
BOTH markers, and compares the results item by item. If the two ever disagree,
one of them is wrong and the test says which set of answers exposed it.

Why it is worth the trouble: a single marker that agrees with itself proves
nothing. Two markers written from the same words by different hands agreeing
on five thousand random runs is strong evidence that the words were understood
the same way both times.

    Zero differences is the pass. Anything else is a failure.

Usage
-----
    python3 reference/difftest.py                  # 5,000 sets, data/rr6
    python3 reference/difftest.py 20000 data/rr6   # more sets, or another version

Needs Node (for js/marking.js) and Python 3. Neither is needed to RUN the
simulation — only to test it. WK never needs to run this; tests.html is the
view for WK.
"""

import json
import os
import random
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import mark as reference_marker  # noqa: E402  (reference/mark.py)


# ---------------------------------------------------------------------------
# Making up answer sets
# ---------------------------------------------------------------------------

def noisy_number(target, rng):
    """A value near or far from the key, in the messy shapes a person types.

    The point is to land ON the rounding boundaries on purpose, because that
    is the only place the two markers could plausibly disagree.
    """
    style = rng.randrange(12)
    if style == 0:
        return ""                                     # left blank
    if style == 1:
        return rng.choice(["abc", "-", ".", "1.2.3", "n/a", "12a", "  "])
    if style == 2:
        return str(target)                            # exactly right
    if style == 3:                                    # a hair either side of .5
        return str(target + rng.choice([0.05, -0.05, 0.049, -0.049, 0.5, -0.5]))
    if style == 4:
        return "{:,}".format(int(target)) if float(target).is_integer() else str(target)
    if style == 5:
        return " " + str(target) + " "                # padded with spaces
    if style == 6:
        return str(target) + "%"                      # a percent sign
    if style == 7:
        return "+" + str(target)
    if style == 8:
        return str(round(target + rng.uniform(-2, 2), rng.randrange(4)))
    if style == 9:
        return str(rng.randrange(0, 2000))
    if style == 10:
        return str(round(target * rng.choice([0.999, 1.001, 1.005, 0.995]), 6))
    return str(round(target + rng.choice([0.005, -0.005, 0.0049, -0.0049]), 6))


def maybe_late(rng, leaf):
    """Every answer carries the clock reading at the moment it was set.
    A value of zero or less means it was given after time ran out (R-D22)."""
    r = rng.random()
    if r < 0.10:
        leaf["secondsLeft"] = -rng.randrange(0, 300)
    elif r < 0.15:
        leaf["secondsLeft"] = 0
    elif r < 0.20:
        pass                                           # no secondsLeft at all
    else:
        leaf["secondsLeft"] = rng.randrange(1, 2100)
    return leaf


def random_answers(content, rng):
    inv = content["investigation"]
    item_ids = list(inv["items"].keys())
    journal = [i for i in item_ids if rng.random() < rng.choice([0.2, 0.5, 0.9])]
    if rng.random() < 0.1:
        journal = []
    if rng.random() < 0.1:                             # things that are not items
        journal = journal + ["calc:1", "q1_mistveil"]
    rng.shuffle(journal)

    # R-D37: some of what is in the journal was fetched on a return visit to
    # the Investigation and is worth a share of a mark. The generator also
    # sometimes names an id that is NOT in the journal, because "listed as a
    # return visit but never actually collected" has to mark as simply missed.
    return_visit = [i for i in journal if rng.random() < 0.4]
    if rng.random() < 0.15:
        return_visit = list(journal)
    if rng.random() < 0.1:
        return_visit = []
    if rng.random() < 0.12 and item_ids:
        return_visit = return_visit + [rng.choice(item_ids)]

    answers = {
        "investigation": {"journal": journal, "return_visit": return_visit},
        "analysis": {},
        "report": {"written": {}, "grid": {}},
        "cases": {},
    }

    for q in content["analysis"]["questions"]:
        for b in q["boxes"]:
            if rng.random() < 0.06:
                continue                               # the box was never touched
            answers["analysis"][b["id"]] = maybe_late(
                rng, {"value": noisy_number(b["answer"], rng)}
            )

    rep = content["report"]
    for bid, blank in rep["written"]["blanks"].items():
        if rng.random() < 0.06:
            continue
        if blank["kind"] == "dropdown":
            choices = list(blank["options"].keys()) + ["", "not-an-option"]
            value = rng.choice(choices)
        else:
            value = noisy_number(blank["answer"], rng)
        answers["report"]["written"][bid] = maybe_late(rng, {"value": value})

    if rng.random() > 0.05:
        answers["report"]["chart"] = maybe_late(
            rng, {"value": rng.choice(rep["chart"]["options"] + ["", "donut"])}
        )

    for row in rep["grid"]["cells"]:
        for cell in row:
            if "fixed" in cell or rng.random() < 0.06:
                continue
            answers["report"]["grid"][cell["id"]] = maybe_late(
                rng, {"value": noisy_number(cell["answer"], rng)}
            )

    for c in content["cases"]["cases"]:
        mech = c["mechanism"]
        if rng.random() < 0.05:
            continue                                   # the case was skipped
        if mech == "choose_one":
            entry = {"value": rng.choice(list(c["options"].keys()) + ["", None])}
        elif mech == "choose_many":
            opts = list(c["options"].keys())
            picked = [o for o in opts if rng.random() < 0.4]
            if rng.random() < 0.15:
                picked = list(c["answer"])
            if rng.random() < 0.05:
                picked.append("ghost")
            entry = {"values": picked}
        elif mech == "dropdowns":
            given = {}
            for d in c["dropdowns"]:
                if rng.random() < 0.9:
                    given[d["id"]] = rng.choice(list(d["options"].keys()) + ["", "zzz"])
            entry = {"dropdowns": given}
        elif mech in ("number", "numbers"):
            boxes = {}
            for b in c["boxes"]:
                if rng.random() < 0.9:
                    boxes[b["id"]] = noisy_number(b["answer"], rng)
            entry = {"boxes": boxes}
        elif mech == "collect":
            ids = list(c["items"].keys())
            picked = [i for i in ids if rng.random() < rng.choice([0.3, 0.6, 0.95])]
            if rng.random() < 0.12:
                picked = [i for i, v in c["items"].items() if v.get("required")]
            if rng.random() < 0.08:
                picked = picked + ["calc:3"]
            rng.shuffle(picked)
            entry = {"journal": picked}
        else:
            raise SystemExit("unknown mechanism in data: " + mech)
        answers["cases"][c["number"]] = maybe_late(rng, entry)

    return answers


# ---------------------------------------------------------------------------
# Reducing both markers' output to the facts that must agree
# ---------------------------------------------------------------------------

def shape(result):
    """The comparable core of a marked run.

    Deliberately not the whole object: js/marking.js also carries labels and
    explanations through for the results screen, which mark.py has no reason
    to produce. What must agree is every right/wrong verdict, every score,
    every denominator, and the count of answers given after time.
    """
    inv = result["investigation"]
    rep = result["report"]
    return {
        "inv": {
            "score": inv["score"], "of": inv["of"],
            "found": sorted(inv["found"]),
            "missing": sorted(inv["missing"]),
            "extras": sorted(inv["extras"]),
            "returnVisit": sorted(inv["returnVisit"]),
            "weight": inv["weight"],
        },
        "analysis": {
            "score": result["analysis"]["score"], "of": result["analysis"]["of"],
            "boxes": [
                [b["id"], bool(b["correct"]), bool(b["late"])]
                for q in result["analysis"]["questions"] for b in q["boxes"]
            ],
        },
        "report": {
            "score": rep["score"], "of": rep["of"],
            "written": [[w["id"], bool(w["correct"]), bool(w["late"])] for w in rep["written"]],
            "chart": [bool(rep["chart"]["correct"]), bool(rep["chart"]["late"])],
            "grid": [[g["id"], bool(g["correct"]), bool(g["late"])] for g in rep["grid"]],
        },
        "cases": [[c["number"], bool(c["correct"]), bool(c["late"])] for c in result["cases"]],
        "casesScore": result["casesScore"], "casesOf": result["casesOf"],
        "total": result["total"],
        "late": result["late"],
    }


def describe(a, b, path=""):
    """Say, in words, the first place two shapes differ."""
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a:
                return path + "." + k + ": only mark.py has it"
            if k not in b:
                return path + "." + k + ": only marking.js has it"
            found = describe(a[k], b[k], path + "." + k)
            if found:
                return found
        return ""
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return path + ": marking.js has " + str(len(a)) + " entries, mark.py " + str(len(b))
        for i, (x, y) in enumerate(zip(a, b)):
            found = describe(x, y, path + "[" + str(i) + "]")
            if found:
                return found
        return ""
    if a != b:
        return path + ": marking.js says " + json.dumps(a) + ", mark.py says " + json.dumps(b)
    return ""


# ---------------------------------------------------------------------------

def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    data_dir = sys.argv[2] if len(sys.argv) > 2 else "data/rr6"
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 20260909

    content = reference_marker.load(os.path.join(ROOT, data_dir))
    rng = random.Random(seed)

    print("Differential test — js/marking.js against reference/mark.py")
    print("  content : " + data_dir)
    print("  sets    : " + str(count) + "  (seed " + str(seed) + ")")
    print("")

    # The answer key itself goes in first, so a run that generated nothing
    # useful can never report a pass.
    sets = [reference_marker.key_answers(content)]
    for _ in range(count):
        sets.append(random_answers(content, rng))

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        json.dump(sets, fh)
        answers_path = fh.name

    try:
        completed = subprocess.run(
            ["node", os.path.join("reference", "run_marking.js"), data_dir, answers_path],
            cwd=ROOT, capture_output=True, text=True,
        )
        if completed.returncode != 0:
            print("FAILED: js/marking.js could not be run under Node.")
            print(completed.stderr.strip()[:4000])
            return 1
        js_results = json.loads(completed.stdout)
    finally:
        os.unlink(answers_path)

    if len(js_results) != len(sets):
        print("FAILED: marking.js returned " + str(len(js_results)) +
              " results for " + str(len(sets)) + " answer sets.")
        return 1

    # A test that measures nothing must fail (SW-LEARNINGS 3.2).
    if len(sets) < 2:
        print("FAILED: no answer sets were generated, so nothing was compared.")
        return 1

    differences = []
    checks = 0
    for index, (answers, js_result) in enumerate(zip(sets, js_results)):
        py_result = reference_marker.mark_game(content, answers)
        a, b = shape(js_result), shape(py_result)
        checks += 1
        if a != b:
            differences.append((index, describe(a, b), answers))

    # Sanity: the first set is the answer key and must be a full score in both.
    key_shape = shape(js_results[0])
    if key_shape["total"]["score"] != key_shape["total"]["of"]:
        print("FAILED: the answer key did not mark full marks under marking.js " +
              "(" + str(key_shape["total"]["score"]) + " of " +
              str(key_shape["total"]["of"]) + ").")
        return 1

    print("answer sets compared : " + str(checks))
    print("answer key           : " + str(key_shape["total"]["score"]) + " / " +
          str(key_shape["total"]["of"]) + " under both markers")
    print("differences          : " + str(len(differences)))
    print("")

    if differences:
        print("The first ten differing answer sets:")
        for index, reason, answers in differences[:10]:
            print("")
            print("  set #" + str(index) + " — " + reason)
            print("  " + json.dumps(answers)[:1200])
        print("")
        print("RESULT: FAILED — " + str(len(differences)) + " of " + str(checks) +
              " sets marked differently.")
        return 1

    print("RESULT: PASSED — 0 differences over " + str(checks) + " answer sets.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
