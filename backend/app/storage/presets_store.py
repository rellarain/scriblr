"""Global (not project-scoped) storage for the plot-category preset catalog.
Lives at %APPDATA%\\Scriblr\\presets.json, a sibling of the projects/
directory. Reuses project_store's atomic-write/quarantine-on-corruption
helpers -- they operate purely on Path/model arguments, nothing project-id
specific despite their parameter names.
"""

from pathlib import Path

from . import project_store
from .schema import PresetCatalog, PresetCategory

DEFAULT_PRESETS: list[PresetCategory] = [
    PresetCategory(
        id=project_store.new_id("preset"),
        name="Characters",
        fields=[
            "Name",
            "Role",
            "Physical Description",
            "Personality",
            "Backstory",
            "Motivation",
            "Internal Conflict",
            "Relationships",
            "Arc",
        ],
    ),
    PresetCategory(
        id=project_store.new_id("preset"),
        name="Settings",
        fields=["Location", "Time Period", "Atmosphere", "Sensory Details", "Significance to Plot"],
    ),
    PresetCategory(
        id=project_store.new_id("preset"),
        name="Themes",
        fields=["Statement", "Symbols and Motifs", "How It Is Explored"],
    ),
    PresetCategory(
        id=project_store.new_id("preset"),
        name="Conflicts",
        fields=["Type", "Stakes", "Opposing Forces", "Resolution"],
    ),
    PresetCategory(
        id=project_store.new_id("preset"),
        name="Subplots",
        fields=["Summary", "Connection to Main Plot", "Characters Involved", "Arc"],
    ),
    PresetCategory(
        id=project_store.new_id("preset"),
        name="World-building",
        fields=[
            "Rules and Systems",
            "History",
            "Culture and Customs",
            "Politics and Power Structures",
            "Technology or Magic Level",
        ],
    ),
    PresetCategory(
        id=project_store.new_id("preset"),
        name="Plot Structure",
        fields=["Inciting Incident", "Rising Action", "Midpoint Turn", "Climax", "Resolution", "Stakes"],
    ),
    PresetCategory(
        id=project_store.new_id("preset"),
        name="Relationships",
        fields=["Between Whom", "Dynamic", "History", "Tension", "Evolution Over the Story"],
    ),
    PresetCategory(
        id=project_store.new_id("preset"),
        name="Foreshadowing",
        fields=["Setup", "Payoff", "Planted In", "Paid Off In", "Significance"],
    ),
    PresetCategory(
        id=project_store.new_id("preset"),
        name="Objects and Artifacts",
        fields=["Description", "Origin", "Significance", "Current Owner", "Current Location"],
    ),
]


def _presets_path(root: Path) -> Path:
    return root / "presets.json"


def load_presets(root: Path) -> PresetCatalog:
    path = _presets_path(root)
    if not path.exists():
        catalog = PresetCatalog(presets=DEFAULT_PRESETS)
        save_presets(root, catalog)
        return catalog
    return project_store._read_shard(path, PresetCatalog)


def save_presets(root: Path, catalog: PresetCatalog) -> None:
    project_store._write_shard(root, _presets_path(root), catalog)
