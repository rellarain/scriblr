"""The settings activity log (theme, UI and project settings): entries hold the value a change replaced, so the change can be undone.
Shared by the user-settings store and the project store; both keep a short history."""

from datetime import timedelta
from typing import Any
import uuid

from .schema import SETTINGS_LOG_DAYS, SETTINGS_LOG_MAX, SettingsLogEntry, SettingsLogKind, utcnow


def new_entry(kind: SettingsLogKind, label: str, before: dict[str, Any]) -> SettingsLogEntry:
    return SettingsLogEntry(id=f"slog_{uuid.uuid4().hex[:8]}", kind=kind, label=label, before=before)


def append_pruned(log: list[SettingsLogEntry], entry: SettingsLogEntry) -> list[SettingsLogEntry]:
    """The log with `entry` added (newest last), without entries older than SETTINGS_LOG_DAYS and at most SETTINGS_LOG_MAX of them."""
    cutoff = utcnow() - timedelta(days=SETTINGS_LOG_DAYS)
    kept = [e for e in log if e.createdAt >= cutoff]
    kept.append(entry)
    return kept[-SETTINGS_LOG_MAX:]
