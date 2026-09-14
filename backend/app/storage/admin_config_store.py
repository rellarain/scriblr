"""Global (not project-scoped) storage for AUI's Configuration outline --
one admin-editable Console -> Component -> Feature tree per Configuration
sub-tab. Lives at %APPDATA%\\Scriblr\\admin-config.json, a sibling of
presets.json. Reuses project_store's atomic-write/quarantine-on-corruption
helpers -- they operate purely on Path/model arguments, nothing project-id
specific despite their parameter names.
"""

from pathlib import Path
from typing import TypedDict

from . import project_store
from .schema import AuiConfig, AuiConfigNode, AuiConfigNodeKind


class _FeatureSeed(TypedDict):
    name: str
    idea: str


class _ComponentSeed(TypedDict):
    name: str
    features: list[_FeatureSeed]


class _ConsoleSeed(TypedDict):
    name: str
    components: list[_ComponentSeed]


# Content drafted for each Configuration sub-tab -- kept in this nested,
# readable shape (matching how it was designed) and flattened into
# AuiConfigNode's flat id/parentId/order storage format by _build_defaults
# below, rather than hand-writing every parentId reference.
_SEED_OUTLINE: dict[str, list[_ConsoleSeed]] = {
    "projectPlan": [
        {"name": "Roadmap Tracker", "components": [
            {"name": "Page/Console/Component Status Grid", "features": [
                {"name": "Build-Status Board", "idea": "A status flag (Not Started / In Progress / Built / Needs Rework) per Page→Console→Component row, mirroring scrilbrPlan.md’s own hierarchy, so admins see build progress across every page at a glance."},
                {"name": "Doc Sync Indicator", "idea": "Flags rows where the live code has drifted from what the plan doc describes, prompting a doc or code update."},
            ]},
            {"name": "Milestones", "features": [
                {"name": "Milestone Editor", "idea": "Group roadmap items into named milestones/releases with target dates."},
            ]},
        ]},
        {"name": "Feature Requests", "components": [
            {"name": "Intake", "features": [
                {"name": "Request Submission Form", "idea": "Lets helpers/admins submit feature ideas that feed into the tracker as new \"Not Started\" rows."},
            ]},
            {"name": "Prioritization", "features": [
                {"name": "Impact/Effort Scoring", "idea": "Score each request so the roadmap can sort by priority."},
            ]},
        ]},
        {"name": "Release Notes", "components": [
            {"name": "Changelog", "features": [
                {"name": "Auto-Draft from Git", "idea": "Draft release notes from recent commits for admins to edit and publish."},
            ]},
        ]},
    ],
    "visitorConfig": [
        {"name": "Welcome", "components": [
            {"name": "Reader Services", "features": [
                {"name": "Subscription Info Editor", "idea": "Edit the marketing copy/pricing table shown to prospective readers."},
                {"name": "Preview Content Picker", "idea": "Choose which library books/bookclubs/reading-tool screenshots are featured on the landing page."},
            ]},
            {"name": "Writer Services", "features": [
                {"name": "Subscription Info Editor", "idea": "Same, for writer-facing marketing copy."},
                {"name": "Preview Tool Picker", "idea": "Choose which Project/Plotting/Outline/Drafting/Translator/Revision tool screenshots appear as previews."},
            ]},
            {"name": "Service Reviews", "features": [
                {"name": "Review Moderation Queue", "idea": "Approve/hide testimonials before they go public."},
            ]},
        ]},
        {"name": "Registration", "components": [
            {"name": "Reader/Writer Registration Forms", "features": [
                {"name": "Field Editor", "idea": "Add/remove/reorder signup fields, per role."},
                {"name": "Required-Field Toggle", "idea": "Mark which fields are mandatory vs optional."},
            ]},
            {"name": "Subscription Payment", "features": [
                {"name": "Payment Provider Settings", "idea": "Configure the connected processor’s keys/webhooks."},
                {"name": "Tax/Region Rules", "idea": "Set tax handling per billing region."},
            ]},
        ]},
        {"name": "Login", "components": [
            {"name": "Account Recovery", "features": [
                {"name": "Recovery Flow Editor", "idea": "Customize forgot-account/forgot-password email copy and reset-link expiry."},
            ]},
            {"name": "Auth Methods", "features": [
                {"name": "Passkey Toggle", "idea": "Enable/disable passkey login app-wide."},
                {"name": "Lockout Policy", "idea": "Set failed-login attempt limits before a temporary lockout."},
            ]},
        ]},
    ],
    "userPageConfig": [
        {"name": "Dashboard", "components": [
            {"name": "Activity Log", "features": [
                {"name": "Retention Window", "idea": "Set how many days of activity history a user can see/export."},
            ]},
            {"name": "Schedule", "features": [
                {"name": "Default Reminder Rules", "idea": "Admin-set defaults for work/break reminder cadence, overridable per user."},
            ]},
            {"name": "Notifications", "features": [
                {"name": "Category Toggles", "idea": "Enable/disable entire notification categories app-wide (e.g. mute chat notifications during maintenance)."},
            ]},
        ]},
        {"name": "Account", "components": [
            {"name": "Profile", "features": [
                {"name": "Required Profile Fields", "idea": "Mark which fields (display name, org, photo) are mandatory."},
            ]},
            {"name": "Subscription", "features": [
                {"name": "Self-Serve Plan Change Toggle", "idea": "Allow/disallow users changing their own tier without going through support."},
            ]},
            {"name": "Portfolio", "features": [
                {"name": "Public Portfolio Toggle", "idea": "Control whether a portfolio is publicly linkable or account-only."},
            ]},
        ]},
        {"name": "Training", "components": [
            {"name": "Per-Page Curriculum (User/Reader/Translator/Writer/Admin)", "features": [
                {"name": "Curriculum Editor", "idea": "Author/reorder each page’s lesson list."},
                {"name": "Completion Requirements", "idea": "Gate specific features behind required lessons (e.g. finish \"Plot Tree Basics\" before Plot tools unlock)."},
            ]},
        ]},
    ],
    "readerPageConfig": [
        {"name": "Nook", "components": [
            {"name": "Dashboard", "features": [
                {"name": "Widget Picker", "idea": "Choose which dashboard widgets (currently reading, bookclub activity, recommended next read) are on by default."},
            ]},
            {"name": "Bookclub", "features": [
                {"name": "Club Creation Permissions", "idea": "Allow any reader to start a bookclub, or restrict to admins."},
            ]},
            {"name": "Reading Stack", "features": [
                {"name": "Stack Size Limit", "idea": "Cap how many books a reader can queue at once, per tier."},
            ]},
            {"name": "Journal", "features": [
                {"name": "Review Visibility Default", "idea": "Set whether new reviews default to public or private."},
            ]},
        ]},
        {"name": "Library", "components": [
            {"name": "Browse / Filter / Search", "features": [
                {"name": "Default Sort Order", "idea": "Newest, most reviewed, or alphabetical by default."},
                {"name": "Filter Taxonomy Editor", "idea": "Manage the genre/tag taxonomy used in filters."},
            ]},
            {"name": "Series & Book", "features": [
                {"name": "Featured Placement", "idea": "Pin specific series/books to the top of Library for promotion."},
            ]},
        ]},
        {"name": "Book", "components": [
            {"name": "Book Detail Page", "features": [
                {"name": "Review Moderation", "idea": "Approve/hide reviews, flag abuse."},
                {"name": "Tag/Flag Vocabulary", "idea": "Manage the allowed content tags/flags authors can apply."},
            ]},
        ]},
        {"name": "Pages", "components": [
            {"name": "E-Reader Tool", "features": [
                {"name": "Offline Cache Limit", "idea": "Cap how many purchased/borrowed books can be cached offline per device."},
                {"name": "Borrow Window Length", "idea": "Configure how many days a borrowed book stays accessible."},
            ]},
        ]},
    ],
    "translatorPageConfig": [
        {"name": "Language Pairs", "components": [
            {"name": "Supported Languages", "features": [
                {"name": "Language Pair Manager", "idea": "Enable/disable which source→target language pairs are offered."},
                {"name": "MT Provider Config", "idea": "Set which machine-translation engine backs each pair, with fallback ordering."},
            ]},
        ]},
        {"name": "Translation Workspace", "components": [
            {"name": "Side-by-Side Editor", "features": [
                {"name": "Segment Length Limit", "idea": "Cap characters per submitted segment for quality control."},
            ]},
            {"name": "Glossary", "features": [
                {"name": "Shared Term Bank", "idea": "Curate book-specific or app-wide terms/names that must translate consistently."},
            ]},
        ]},
        {"name": "Review Queue", "components": [
            {"name": "Translation QA", "features": [
                {"name": "Reviewer Assignment Rules", "idea": "Auto-assign submissions to a reviewer based on language pair."},
                {"name": "Approval Threshold", "idea": "Require N approvals before a translated chapter publishes."},
            ]},
        ]},
    ],
    "writerPageConfig": [
        {"name": "Shelves", "components": [
            {"name": "Project Template", "features": [
                {"name": "Template Manager", "idea": "The writer-facing picker for project templates authored in Project Plan’s Toolkit-style flow, chosen at project creation."},
            ]},
            {"name": "Scratchpad", "features": [
                {"name": "Auto-Convert Rules", "idea": "Configure which note patterns (e.g. \"TODO:\", \"[scene]\") get suggested as outline/plot conversion candidates."},
            ]},
        ]},
        {"name": "Shelf", "components": [
            {"name": "Project Plot & Outline", "features": [
                {"name": "Default Hierarchy Depth", "idea": "Choose which outline kinds (series/book/arc/chapter/act/scene/moment) are enabled by default for new projects, so a short-story writer isn’t shown all seven levels."},
            ]},
            {"name": "Project History", "features": [
                {"name": "Revision Retention Policy", "idea": "Configure auto-compaction thresholds (today’s fixed 75→50 pruning) per subscription tier."},
            ]},
        ]},
        {"name": "Book", "components": [
            {"name": "Book Editor & Outline", "features": [
                {"name": "Color Palette Manager", "idea": "Manage the set of book/arc accent colors offered in the color picker."},
            ]},
        ]},
        {"name": "Page", "components": [
            {"name": "Paragraph / Sentence / Bookmark", "features": [
                {"name": "Auto-Save Interval", "idea": "Configure the idle-time threshold before an auto revision snapshot fires (currently a fixed 5 minutes)."},
            ]},
        ]},
        {"name": "Pages", "components": [
            {"name": "Reaction & Flag", "features": [
                {"name": "Reaction Tier Editor", "idea": "Customize the Love/Adore/Like/Dislike/Loath/Hate click-tier labels and icons."},
                {"name": "Flag Type Manager", "idea": "Manage which flag types (Add/Remove/Merge/Change/Simplify/Expand) are available."},
            ]},
            {"name": "Export", "features": [
                {"name": "Format Availability", "idea": "Toggle which export formats (JSON/EPUB/PDF/DOC) are enabled per tier."},
            ]},
        ]},
    ],
    "helperPageConfig": [
        {"name": "Schedule", "components": [
            {"name": "Workweek / Workday", "features": [
                {"name": "Shift Template Manager", "idea": "Define standard helper shift templates (hours, break rules) assignable to helper accounts."},
            ]},
        ]},
        {"name": "Chat", "components": [
            {"name": "Conversation & Help Tool", "features": [
                {"name": "Canned Response Library", "idea": "Manage shared quick-reply snippets helpers can insert into chats."},
                {"name": "Max Concurrent Chats", "idea": "Cap how many active conversations one helper can hold at once."},
            ]},
        ]},
        {"name": "Inbox", "components": [
            {"name": "Toning / Sorting / Explicating", "features": [
                {"name": "Channel Taxonomy Editor", "idea": "Manage the Page→Component→Feature taxonomy the Sort tab’s channel tags use."},
                {"name": "Tone Priority Defaults", "idea": "Set the app-wide default tone-processing priority order."},
            ]},
        ]},
        {"name": "Queue", "components": [
            {"name": "Queue Toggle-Meter", "features": [
                {"name": "Meter Threshold Config", "idea": "Make the fixed/proportional segment-display switchover point (today a hardcoded 30-user threshold) admin-tunable instead."},
            ]},
        ]},
        {"name": "Dispatch", "components": [
            {"name": "Performance", "features": [
                {"name": "Helper Scorecards", "idea": "Track response time / resolution rate per helper."},
            ]},
            {"name": "Department", "features": [
                {"name": "Department Roster Sync", "idea": "Keep Dispatch’s department list in sync with Director’s own Department Roster console."},
            ]},
        ]},
    ],
    "adminPageConfig": [
        {"name": "Role & Access", "components": [
            {"name": "Admin Role Levels", "features": [
                {"name": "Console Access Matrix", "idea": "A Console × Admin-role grid controlling which of AUI’s 7 consoles each admin sub-role can see."},
            ]},
        ]},
        {"name": "Processor", "components": [
            {"name": "Voting", "features": [
                {"name": "Processing Order Override", "idea": "Let a top-level admin lock the tone/sort processing order so Processor-level admins can’t change it."},
            ]},
        ]},
        {"name": "Organizer", "components": [
            {"name": "Channel & Bookclub Management", "features": [
                {"name": "Auto-Archive Rules", "idea": "Auto-archive bookclubs inactive for N days."},
            ]},
        ]},
        {"name": "Manager", "components": [
            {"name": "Allotment & Assignment", "features": [
                {"name": "Allotment Formula Editor", "idea": "Configure the formula/ratio used to auto-suggest team allotments."},
            ]},
        ]},
        {"name": "Director", "components": [
            {"name": "Department Roster & Analytics", "features": [
                {"name": "Analytics Refresh Interval", "idea": "Set how often department analytics recompute."},
            ]},
        ]},
        {"name": "Office", "components": [
            {"name": "Hire/Term Admin", "features": [
                {"name": "Approval Chain", "idea": "Require Director-level sign-off before an Office-level hire/terminate action takes effect."},
            ]},
        ]},
    ],
}


def _build_defaults() -> list[AuiConfigNode]:
    nodes: list[AuiConfigNode] = []

    def add(tab: str, kind: AuiConfigNodeKind, parent_id: str | None, order: int, name: str, idea: str = "") -> str:
        node_id = project_store.new_id("auiNode")
        nodes.append(AuiConfigNode(id=node_id, tab=tab, kind=kind, parentId=parent_id, order=order, name=name, idea=idea))
        return node_id

    for tab, consoles in _SEED_OUTLINE.items():
        for console_order, console in enumerate(consoles):
            console_id = add(tab, "console", None, console_order, console["name"])
            for component_order, component in enumerate(console["components"]):
                component_id = add(tab, "component", console_id, component_order, component["name"])
                for feature_order, feature in enumerate(component["features"]):
                    add(tab, "feature", component_id, feature_order, feature["name"], feature["idea"])

    return nodes


DEFAULT_ADMIN_CONFIG: list[AuiConfigNode] = _build_defaults()


def _admin_config_path(root: Path) -> Path:
    return root / "admin-config.json"


def load_admin_config(root: Path) -> AuiConfig:
    path = _admin_config_path(root)
    if not path.exists():
        config = AuiConfig(nodes=DEFAULT_ADMIN_CONFIG)
        save_admin_config(root, config)
        return config
    return project_store._read_shard(path, AuiConfig)


def save_admin_config(root: Path, config: AuiConfig) -> None:
    project_store._write_shard(root, _admin_config_path(root), config)
