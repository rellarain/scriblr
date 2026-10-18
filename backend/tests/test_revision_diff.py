"""The revision diff: correct for any two texts, and fast for a long chapter."""
import random
import time

import pytest

from app.api.revisions import _diff_texts


def _rebuild(ops) -> tuple[str, str]:
    before = "".join(o.text for o in ops if o.op in ("equal", "delete"))
    after = "".join(o.text for o in ops if o.op in ("equal", "insert"))
    return before, after


def test_the_ops_rebuild_both_texts() -> None:
    a = "The rain fell.\nShe waited at the gate.\n\nHe never came."
    b = "The rain fell hard.\nShe waited at the gate.\n\nHe came late, at last."
    ops = _diff_texts(a, b)
    assert _rebuild(ops) == (a, b)
    assert ops[0].op == "equal" and ops[0].text.startswith("The rain")


def test_identical_and_empty_texts() -> None:
    assert [(o.op, o.text) for o in _diff_texts("same\n", "same\n")] == [("equal", "same\n")]
    assert _diff_texts("", "") == []
    assert [(o.op, o.text) for o in _diff_texts("", "new")] == [("insert", "new")]
    assert [(o.op, o.text) for o in _diff_texts("old", "")] == [("delete", "old")]


def test_a_changed_word_inside_a_line_is_found_at_the_word() -> None:
    ops = _diff_texts("one two three\nfour five\n", "one 2 three\nfour five\n")
    assert [(o.op, o.text) for o in ops] == [("equal", "one "), ("delete", "two"), ("insert", "2"), ("equal", " three\nfour five\n")]


def test_random_edits_always_rebuild() -> None:
    rng = random.Random(1)
    words = ["alpha", "beta", "gamma", "delta", "x", "y", "z", "storm", "gate"]

    def text(n: int) -> str:
        out = []
        for _ in range(n):
            out.append(rng.choice(words) + rng.choice([" ", " ", " ", "\n", "  ", "\n\n"]))
        return "".join(out)

    for _ in range(60):
        a = text(rng.randint(0, 80))
        b = "".join(c for c in a if rng.random() > 0.03) + text(rng.randint(0, 20))
        assert _rebuild(_diff_texts(a, b)) == (a, b)


@pytest.mark.parametrize("paragraphs", [300])
def test_a_long_chapter_diffs_quickly(paragraphs: int) -> None:
    rng = random.Random(2)
    para = lambda i: " ".join(f"word{rng.randint(0, 400)}" for _ in range(17)) + f" end{i}."  # noqa: E731
    a_paras = [para(i) for i in range(paragraphs)]
    b_paras = list(a_paras)
    for i in range(0, paragraphs, 25):
        b_paras[i] = b_paras[i] + " An added sentence."
    del b_paras[40]
    a, b = "\n\n".join(a_paras), "\n\n".join(b_paras)
    assert len(a.split()) > 5000
    started = time.perf_counter()
    ops = _diff_texts(a, b)
    assert time.perf_counter() - started < 1.0  # was 8 to 11 seconds
    assert _rebuild(ops) == (a, b)
