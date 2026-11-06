"""Links between the things of the story world: a plot node, a character, a place. One record joins two refs of different kinds, so the link reads the same from
either end and cannot disagree with itself. A link whose end is gone (a deleted character, a place that lost its name) is left out of every read and dropped the next
time the list changes."""

from pathlib import Path

from . import project_store as store
from .schema import WORLD_LINK_REF, WORLD_MAX_LINKS, ProjectFile, WorldLink


class InvalidWorldLinkError(ValueError):
    pass


def _exists(pf: ProjectFile, ref: str) -> bool:
    kind, _, key = ref.partition(":")
    if kind == "plot":
        return any(n.id == key for n in pf.plot.nodes)
    if kind == "char":
        return key in pf.characters
    map_id, _, symbol_id = key.partition("/")
    doc = pf.maps.get(map_id)
    return doc is not None and not doc.versionOf and any(s.id == symbol_id and s.name for s in doc.symbols)


def _live(pf: ProjectFile) -> list[WorldLink]:
    return [link for link in pf.worldLinks if _exists(pf, link.a) and _exists(pf, link.b)]


def list_links(root: Path, project_id: str) -> list[WorldLink]:
    pf, _errors = store._load_project_file(root, project_id)
    return _live(pf)


def _checked(a: str, b: str) -> WorldLink:
    if not (WORLD_LINK_REF.match(a) and WORLD_LINK_REF.match(b)):
        raise InvalidWorldLinkError("a link joins two things of the story world")
    try:
        return WorldLink(a=a, b=b)
    except ValueError as exc:
        raise InvalidWorldLinkError("a link joins two things of different kinds") from exc


def add_link(root: Path, project_id: str, a: str, b: str) -> list[WorldLink]:
    link = _checked(a, b)
    out: list[WorldLink] = []

    def apply(pf: ProjectFile) -> None:
        if not (_exists(pf, link.a) and _exists(pf, link.b)):
            raise InvalidWorldLinkError("both ends of a link must exist")
        links = _live(pf)
        if not any(x.a == link.a and x.b == link.b for x in links):
            if len(links) >= WORLD_MAX_LINKS:
                raise InvalidWorldLinkError(f"a project holds at most {WORLD_MAX_LINKS} links")
            links.append(link)
        pf.worldLinks = links
        out.extend(links)

    store._mutate(root, project_id, apply)
    return out


def remove_link(root: Path, project_id: str, a: str, b: str) -> list[WorldLink]:
    link = _checked(a, b)
    out: list[WorldLink] = []

    def apply(pf: ProjectFile) -> None:
        pf.worldLinks = [x for x in _live(pf) if not (x.a == link.a and x.b == link.b)]
        out.extend(pf.worldLinks)

    store._mutate(root, project_id, apply)
    return out
