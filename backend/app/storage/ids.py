"""Ids that become part of a file path (a project's folder, a legacy per-moment file) are checked before they are used: an id from a URL must
never reach outside the data directory ('..', a path separator, a drive letter), whatever the platform does with it."""
from __future__ import annotations

_FORBIDDEN = set('/\\:*?"<>|')
MAX_ID_LENGTH = 200


class InvalidIdError(ValueError):
    """An id that cannot safely be a file or folder name."""

    def __init__(self, what: str, value: object) -> None:
        self.what = what
        super().__init__(f"invalid {what}: {str(value)[:60]!r}")


def check_id(value: object, what: str = "id") -> str:
    """Return `value` if it is safe to use as one path component; raise InvalidIdError otherwise."""
    if not isinstance(value, str) or value == "" or len(value) > MAX_ID_LENGTH:
        raise InvalidIdError(what, value)
    if value.startswith(".") or ".." in value or value != value.strip() or value.endswith("."):
        raise InvalidIdError(what, value)
    if any(c in _FORBIDDEN or ord(c) < 32 for c in value):
        raise InvalidIdError(what, value)
    return value
