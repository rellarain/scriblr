"""Body keys (slice 9f): a shape's keys (one [dx, dy] per point for each key), the morph drive that moves them and `by`, the slider that scales it. Repaired on load,
written only when set; the body templates carry them."""

import json
from pathlib import Path

from app.storage.schema import MODEL_MORPHS_MAX, ModelContent, ModelDrive, ModelShape

PTS = [{"x": 0, "y": 0, "m": "s"}, {"x": 10, "y": 0, "m": "s"}, {"x": 10, "y": 10, "m": "s"}]


def _shape(**extra):
    return ModelShape.model_validate({"id": "s1", "pts": PTS, **extra})


def test_a_shape_has_no_keys_unless_it_says_so():
    assert _shape().morphs is None
    assert "morphs" not in _shape().model_dump(mode="json")


def test_keys_are_kept_in_hundredths_within_their_range_one_move_per_point():
    s = _shape(morphs={"fat": [[1.234, -2], [0, 0], [500, -500]], "fem.a90": [[0, 1], [0, 0], [0, 0]]})
    assert s.morphs == {"fat": [[1.23, -2.0], [0.0, 0.0], [200.0, -200.0]], "fem.a90": [[0.0, 1.0], [0.0, 0.0], [0.0, 0.0]]}
    assert s.model_dump(mode="json")["morphs"]["fat"][0] == [1.23, -2.0]


def test_a_key_of_another_length_an_all_zero_key_and_a_bad_id_are_left_out():
    s = _shape(morphs={"short": [[1, 1]], "zero": [[0, 0]] * 3, "bad key": [[1, 1]] * 3, "ok": [[1, 1], "x", [2]]})
    assert s.morphs == {"ok": [[1.0, 1.0], [0.0, 0.0], [0.0, 0.0]]}
    # a twin has no points, so no keys
    assert ModelShape.model_validate({"id": "t", "pts": [], "mirrorOf": "s1", "morphs": {"fat": [[1, 1]]}}).morphs is None
    many = {f"k{i}": [[1, 0]] * 3 for i in range(MODEL_MORPHS_MAX + 5)}
    assert len(_shape(morphs=many).morphs) == MODEL_MORPHS_MAX


def test_a_morph_drive_needs_a_key_and_moves_all_of_it_at_the_maximum_unless_it_says_otherwise():
    d = ModelDrive.model_validate({"kind": "morph", "id": "fat"})
    assert (d.atMin, d.atMax) == (0.0, 100.0)
    d = ModelDrive.model_validate({"kind": "morph", "id": "fat", "atMin": -5000, "atMax": 170})
    assert (d.atMin, d.atMax) == (-1000.0, 170.0)
    try:
        ModelDrive.model_validate({"kind": "morph"})
        raise AssertionError("a morph drive with no key was taken")
    except ValueError:
        pass


def test_by_is_written_only_when_set_and_a_bad_one_is_dropped():
    d = ModelDrive.model_validate({"kind": "morph", "id": "sits", "by": {"range": "body-fem", "at": 100}})
    assert d.model_dump(mode="json")["by"] == {"range": "body-fem", "at": 100.0}
    assert "by" not in ModelDrive.model_validate({"kind": "turn", "group": "g"}).model_dump(mode="json")
    assert ModelDrive.model_validate({"kind": "morph", "id": "x", "by": {"range": "bad id!"}}).by is None
    assert ModelDrive.model_validate({"kind": "morph", "id": "x", "by": "body-fem"}).by is None


def test_the_body_templates_carry_body_keys_and_the_body_sliders():
    seed = json.loads((Path(__file__).resolve().parents[1] / "app" / "seed" / "body_templates.json").read_text(encoding="utf-8"))
    for t in seed["templates"]:
        c = ModelContent.model_validate(t["content"])
        keyed = [s for s in c.shapes if s.morphs]
        assert keyed and all(not s.mirrorOf for s in keyed), t["id"]
        assert all(len(m) == len(s.pts) for s in keyed for m in s.morphs.values())
        roles = {r.role for r in c.ranges if r.role and r.role.startswith("body-")}
        assert {"body-height", "body-fem", "body-fat", "body-muscle", "body-sits", "body-bust", "body-age", "body-legs"} <= roles, t["id"]
        morph_drives = [d for r in c.ranges for d in r.drives if d.kind == "morph"]
        assert morph_drives and all(d.id for d in morph_drives)
        assert sum(1 for p in c.presets if p.kind == "body") == 7
        # a round trip keeps them
        again = ModelContent.model_validate(c.model_dump(mode="json"))
        assert again.shapes[0].morphs == c.shapes[0].morphs
