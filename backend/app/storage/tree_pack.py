"""Compact storage for the outline and plot tree history.

A history snapshot used to hold every node of the tree with every field, defaults and all, so each save of a large tree added tens of kilobytes
to project.json (96% of the largest real file was history). Now:

  * a node is stored *sparse*: only the fields that differ from the model's defaults;
  * a snapshot is a *keyframe* (every node, sparse) or a *delta* against the snapshot before it (`base`): the ids of all its nodes in order
    and only the sparse nodes that are new or changed. A keyframe comes at least every KEYFRAME_EVERY snapshots, so a chain stays short and
    one lost snapshot cannot take more than that many with it.

Everything outside the store sees *dense* snapshots (`nodes` complete, as before): project_store packs on the way in and unpacks on the way
out. Dense and sparse nodes both read back the same, so snapshots written before this existed are keyframes already. Dense node dicts are
shared between snapshots that did not change them, and must be treated as read-only.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any, Optional

from pydantic import BaseModel

from .schema import OutlineNode, PlotNode, TreeSnapshot, TreeType

KEYFRAME_EVERY = 10


@lru_cache(maxsize=None)
def _defaults(tree_type: str) -> dict[str, Any]:
    model = OutlineNode if tree_type == "outline" else PlotNode
    out: dict[str, Any] = {}
    for name, field in model.model_fields.items():
        if field.is_required():
            continue
        value = field.get_default(call_default_factory=True)
        out[name] = value.model_dump() if isinstance(value, BaseModel) else value
    return out


def _sparse(defaults: dict[str, Any], node: dict) -> dict:
    return {k: v for k, v in node.items() if k not in defaults or v != defaults[k]}


def _dense(defaults: dict[str, Any], node: dict) -> dict:
    out = {k: (list(v) if isinstance(v, list) else dict(v) if isinstance(v, dict) else v) for k, v in defaults.items()}
    out.update(node)
    return out


def sparse_nodes(tree_type: TreeType, nodes: list[dict]) -> list[dict]:
    d = _defaults(tree_type)
    return [_sparse(d, n) for n in nodes]


def dense_nodes(tree_type: TreeType, nodes: list[dict]) -> list[dict]:
    d = _defaults(tree_type)
    return [_dense(d, n) for n in nodes]


def is_keyframe(snapshot: TreeSnapshot) -> bool:
    return snapshot.base is None


def _apply_delta(tree_type: TreeType, base: list[dict], ids: list[str], changed: list[dict]) -> Optional[list[dict]]:
    d = _defaults(tree_type)
    base_by_id = {n["id"]: n for n in base}
    changed_by_id = {n["id"]: _dense(d, n) for n in changed}
    out: list[dict] = []
    for node_id in ids:
        node = changed_by_id.get(node_id) or base_by_id.get(node_id)
        if node is None:
            return None  # the base is not what this delta was made against
        out.append(node)
    return out


def dense_all(tree_type: TreeType, history: list[TreeSnapshot]) -> list[Optional[list[dict]]]:
    """The complete node list of every snapshot, in the order of `history` (None for one whose base is missing)."""
    by_id: dict[str, Optional[list[dict]]] = {}
    out: list[Optional[list[dict]]] = []
    for snap in history:
        if is_keyframe(snap):
            nodes: Optional[list[dict]] = dense_nodes(tree_type, snap.nodes)
        else:
            base = by_id.get(snap.base) if snap.base is not None else None
            nodes = _apply_delta(tree_type, base, snap.ids or [], snap.changed) if base is not None else None
        by_id[snap.snapshotId] = nodes
        out.append(nodes)
    return out


def dense_at(tree_type: TreeType, history: list[TreeSnapshot], index: int) -> Optional[list[dict]]:
    """The complete node list of `history[index]`, walking back only as far as its keyframe."""
    index_of = {s.snapshotId: i for i, s in enumerate(history)}
    chain: list[TreeSnapshot] = []
    i: Optional[int] = index
    while i is not None:
        snap = history[i]
        chain.append(snap)
        if is_keyframe(snap):
            break
        i = index_of.get(snap.base) if snap.base is not None else None
        if i is None or i >= len(history) or len(chain) > len(history):
            return None
    nodes: Optional[list[dict]] = None
    for snap in reversed(chain):
        if is_keyframe(snap):
            nodes = dense_nodes(tree_type, snap.nodes)
        else:
            nodes = _apply_delta(tree_type, nodes, snap.ids or [], snap.changed) if nodes is not None else None
    return nodes


def depth_at(history: list[TreeSnapshot], index: int) -> int:
    """How many deltas stand between `history[index]` and its keyframe."""
    index_of = {s.snapshotId: i for i, s in enumerate(history)}
    depth, i = 0, index
    while not is_keyframe(history[i]):
        nxt = index_of.get(history[i].base) if history[i].base is not None else None
        if nxt is None:
            break
        depth, i = depth + 1, nxt
    return depth


def pack(
    tree_type: TreeType, snapshot: TreeSnapshot, previous: Optional[list[dict]], base_id: Optional[str], previous_depth: int,
) -> TreeSnapshot:
    """`snapshot` (dense) in its stored form: a keyframe, or a delta against `previous` (the dense nodes of the snapshot `base_id`)."""
    if previous is None or base_id is None or previous_depth + 1 >= KEYFRAME_EVERY:
        return snapshot.model_copy(update={"nodes": sparse_nodes(tree_type, snapshot.nodes), "base": None, "ids": None, "changed": []})
    d = _defaults(tree_type)
    before = {n["id"]: n for n in previous}
    changed = [_sparse(d, n) for n in snapshot.nodes if before.get(n["id"]) != n]
    return snapshot.model_copy(update={"nodes": [], "base": base_id, "ids": [n["id"] for n in snapshot.nodes], "changed": changed})


def unpack(snapshot: TreeSnapshot, nodes: list[dict]) -> TreeSnapshot:
    """`snapshot` in its dense form, given its complete nodes."""
    return snapshot.model_copy(update={"nodes": nodes, "base": None, "ids": None, "changed": []})


def repack(tree_type: TreeType, history: list[TreeSnapshot]) -> list[TreeSnapshot]:
    """The whole history in its compact stored form (snapshots whose base is missing are dropped: they cannot be read)."""
    out: list[TreeSnapshot] = []
    previous: Optional[list[dict]] = None
    previous_id: Optional[str] = None
    depth = 0
    for snap, nodes in zip(history, dense_all(tree_type, history)):
        if nodes is None:
            continue
        packed = pack(tree_type, unpack(snap, nodes), previous, previous_id, depth)
        depth = 0 if is_keyframe(packed) else depth + 1
        out.append(packed)
        previous, previous_id = nodes, snap.snapshotId
    return out
