"""The compact tree history (app/storage/tree_pack.py): sparse nodes, keyframes and deltas, packed on the way into project.json and unpacked
on the way out, so that everything outside the store still sees complete snapshots."""
import copy
import json
import random
from pathlib import Path

from app.storage import project_store as store
from app.storage import tree_history, tree_pack
from app.storage.schema import PROJECT_FILE_VERSION, OutlineNode, PlotNode, TreeSnapshot, utcnow


def _plot(i: int, **over) -> dict:
    return PlotNode(id=f"n{i}", kind="plotpoint", parentId=None, order=i, title=f"Point {i}", **over).model_dump()


def _outline(i: int, **over) -> dict:
    return OutlineNode(id=f"o{i}", kind="scene", parentId=None, order=i, title=f"Scene {i}", **over).model_dump()


def test_a_sparse_node_keeps_only_what_differs_from_the_defaults_and_reads_back_whole() -> None:
    node = _plot(1, body="It rains.", keywords=["storm"])
    sparse = tree_pack.sparse_nodes("plot", [node])[0]
    assert sparse["id"] == "n1" and sparse["body"] == "It rains." and sparse["keywords"] == ["storm"]
    assert "parentId" not in sparse and "customFieldDefs" not in sparse and "flag" not in sparse  # defaults left out
    assert len(json.dumps(sparse)) < len(json.dumps(node)) / 2
    assert tree_pack.dense_nodes("plot", [sparse]) == [node]


def test_dense_nodes_do_not_share_their_default_lists() -> None:
    a, b = tree_pack.dense_nodes("plot", [{"id": "a", "kind": "plotpoint", "order": 0, "title": "A"}, {"id": "b", "kind": "plotpoint", "order": 1, "title": "B"}])
    a["keywords"].append("x")
    assert b["keywords"] == []


def _edit(rng: random.Random, nodes: list[dict], counter: list[int]) -> list[dict]:
    nodes = [dict(n) for n in nodes]
    for _ in range(rng.randint(1, 3)):
        action = rng.choice(["add", "remove", "modify", "modify", "reorder"])
        if action == "add" or not nodes:
            counter[0] += 1
            nodes.insert(rng.randint(0, len(nodes)), _plot(counter[0] + 1000))
        elif action == "remove" and len(nodes) > 1:
            nodes.pop(rng.randrange(len(nodes)))
        elif action == "modify":
            n = rng.choice(nodes)
            n["title"] = f"T{rng.random():.4f}"
            if rng.random() < 0.5:
                n["body"] = "b" * rng.randint(0, 5)
        elif action == "reorder":
            rng.shuffle(nodes)
    return nodes


def test_any_history_reads_back_exactly_as_it_was_saved(storage_root: Path) -> None:
    rng = random.Random(7)
    index = store.create_project(storage_root, "Book")
    pid = index.projectId
    nodes = [_plot(i) for i in range(30)]
    counter = [0]
    expected: list[tuple[str, list[dict]]] = []
    for _ in range(60):
        nodes = _edit(rng, nodes, counter)
        snap = tree_history.maybe_create_snapshot(storage_root, pid, "plot", copy.deepcopy(nodes))
        if snap is not None:
            expected.append((snap.snapshotId, copy.deepcopy(nodes)))
    got = store.list_tree_snapshots(storage_root, pid, "plot")
    assert [s.snapshotId for s in got] == [sid for sid, _ in expected]
    for snap, (_, want) in zip(got, expected):
        assert snap.nodes == want
        assert snap.base is None and snap.ids is None and snap.changed == []  # outside the store a snapshot is whole
    for sid, want in expected[::7]:
        assert store.load_tree_snapshot(storage_root, pid, "plot", sid).nodes == want
    assert store.last_tree_snapshot(storage_root, pid, "plot").nodes == expected[-1][1]


def test_the_stored_history_is_keyframes_and_deltas_and_much_smaller(storage_root: Path) -> None:
    rng = random.Random(3)
    index = store.create_project(storage_root, "Book")
    pid = index.projectId
    nodes = [_plot(i, body="x" * 40) for i in range(200)]
    counter = [0]
    for _ in range(40):
        nodes = _edit(rng, nodes, counter)
        tree_history.maybe_create_snapshot(storage_root, pid, "plot", copy.deepcopy(nodes))
    raw = json.loads((storage_root / pid / "project.json").read_text(encoding="utf-8"))
    hist = raw["plotHistory"]
    kinds = ["key" if s["base"] is None else "delta" for s in hist]
    assert kinds[0] == "key" and kinds.count("delta") > kinds.count("key")
    longest = 0
    run = 0
    for k in kinds:
        run = 0 if k == "key" else run + 1
        longest = max(longest, run)
    assert longest < tree_pack.KEYFRAME_EVERY  # a chain stays short
    dense_size = sum(len(json.dumps(s.nodes)) for s in store.list_tree_snapshots(storage_root, pid, "plot"))
    assert len(json.dumps(hist)) < dense_size / 8


def test_compaction_keeps_the_newest_and_the_oldest_kept_becomes_a_keyframe(storage_root: Path) -> None:
    rng = random.Random(11)
    index = store.create_project(storage_root, "Book")
    pid = index.projectId
    nodes = [_plot(i) for i in range(20)]
    counter = [0]
    expected = []
    for _ in range(store.TREE_HISTORY_COMPACT_THRESHOLD + 12):
        nodes = _edit(rng, nodes, counter)
        snap = tree_history.maybe_create_snapshot(storage_root, pid, "plot", copy.deepcopy(nodes))
        if snap is not None:
            expected.append((snap.snapshotId, copy.deepcopy(nodes)))
    assert len(expected) > store.TREE_HISTORY_COMPACT_THRESHOLD
    store.consolidate_project_history(storage_root, pid)
    got = store.list_tree_snapshots(storage_root, pid, "plot")
    want = expected[-store.TREE_HISTORY_KEEP:]
    assert [s.snapshotId for s in got] == [sid for sid, _ in want]
    assert [s.nodes for s in got] == [n for _, n in want]
    stored = store._load_project_file(storage_root, pid)[0].plotHistory
    assert stored[0].base is None  # the snapshots it was a delta against are gone
    tree_history.maybe_create_snapshot(storage_root, pid, "plot", copy.deepcopy(_edit(rng, nodes, counter)))  # and history carries on
    assert len(store.list_tree_snapshots(storage_root, pid, "plot")) == store.TREE_HISTORY_KEEP + 1


def test_a_lost_snapshot_costs_only_the_deltas_that_depended_on_it(storage_root: Path) -> None:
    rng = random.Random(5)
    index = store.create_project(storage_root, "Book")
    pid = index.projectId
    nodes = [_plot(i) for i in range(15)]
    counter = [0]
    ids = []
    for _ in range(25):
        nodes = _edit(rng, nodes, counter)
        snap = tree_history.maybe_create_snapshot(storage_root, pid, "plot", copy.deepcopy(nodes))
        if snap is not None:
            ids.append(snap.snapshotId)
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    lost = raw["plotHistory"][3]["snapshotId"]
    raw["plotHistory"] = [s for s in raw["plotHistory"] if s["snapshotId"] != lost]
    path.write_text(json.dumps(raw), encoding="utf-8")
    left = {s.snapshotId for s in store.list_tree_snapshots(storage_root, pid, "plot")}
    assert lost not in left
    assert ids[0] in left and ids[-1] in left or len(left) > 10  # the keyframes after the gap, and what follows them, survive
    assert len(left) >= len(ids) - tree_pack.KEYFRAME_EVERY


def test_dense_history_from_before_is_converted_on_the_first_write_and_the_old_file_kept(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Old")
    pid = index.projectId
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    nodes = [_plot(i, body="text " * 20) for i in range(60)]
    dense = []
    for k in range(12):
        nodes = [dict(n) for n in nodes]
        nodes[k]["title"] = f"Edited {k}"
        dense.append(TreeSnapshot(snapshotId=f"tsnap_{k:02d}", treeType="plot", createdAt=utcnow(), trigger="auto", nodes=copy.deepcopy(nodes)))
    raw["schemaVersion"] = 3
    raw["plotHistory"] = [json.loads(s.model_dump_json()) for s in dense]
    for s in raw["plotHistory"]:
        s.pop("base", None), s.pop("ids", None), s.pop("changed", None)  # the shape written before this existed
    path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
    before = path.stat().st_size

    assert [s.nodes for s in store.list_tree_snapshots(storage_root, pid, "plot")] == [s.nodes for s in dense]  # readable as it is
    store.update_project_metadata(storage_root, pid, title="Renamed")  # the first write

    assert (storage_root / pid / "project.json.v3.bak").stat().st_size == before
    assert path.stat().st_size < before / 3
    assert [s.nodes for s in store.list_tree_snapshots(storage_root, pid, "plot")] == [s.nodes for s in dense]
    assert json.loads(path.read_text(encoding="utf-8"))["schemaVersion"] == PROJECT_FILE_VERSION


def test_project_json_is_compact_and_keeps_real_text(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Smart “quotes” — and 日本語")
    text = (storage_root / index.projectId / "project.json").read_text(encoding="utf-8")
    assert "“quotes” — and 日本語" in text  # not \u-escaped
    assert '": ' not in text and '", "' not in text  # no padding after the separators
    assert store.load_index(storage_root, index.projectId).title == "Smart “quotes” — and 日本語"
