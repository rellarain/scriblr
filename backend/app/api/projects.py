from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_storage_root
from ..models import CreateProjectRequest, ProjectSummaryResponse, UpdateProjectRequest
from ..storage import project_store as store
from ..storage import settings_log
from ..storage.schema import ProjectIndex, SettingsLogEntry, utcnow

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectIndex])
def list_projects(root: Path = Depends(get_storage_root)) -> list[ProjectIndex]:
    return store.list_projects(root)


@router.post("", response_model=ProjectIndex)
def create_project(body: CreateProjectRequest, root: Path = Depends(get_storage_root)) -> ProjectIndex:
    return store.create_project(root, body.title)


@router.get("/{project_id}", response_model=ProjectSummaryResponse)
def get_project(project_id: str, root: Path = Depends(get_storage_root)) -> ProjectSummaryResponse:
    index = store.load_index(root, project_id)
    warnings: list[str] = []
    warnings.extend(store.consolidate_project_history(root, project_id))
    outline = None
    try:
        outline = store.load_outline(root, project_id)
    except store.ShardCorruptError as e:
        warnings.append(f"outline is corrupt and was quarantined: {e.reason}")
    plot = None
    try:
        plot = store.load_plot(root, project_id)
    except store.ShardCorruptError as e:
        warnings.append(f"plot tree is corrupt and was quarantined: {e.reason}")
    return ProjectSummaryResponse(index=index, outline=outline, plot=plot, warnings=warnings)


@router.patch("/{project_id}", response_model=ProjectIndex)
def update_project(
    project_id: str, body: UpdateProjectRequest, root: Path = Depends(get_storage_root)
) -> ProjectIndex:
    index = store.load_index(root, project_id)
    if body.title is not None:
        index.title = body.title
    if body.wordCountTarget is not None:
        index.settings.wordCountTarget = body.wordCountTarget
    if body.bookCountTarget is not None:
        index.settings.bookCountTarget = body.bookCountTarget
    if body.bookWordCountTarget is not None:
        index.settings.bookWordCountTarget = body.bookWordCountTarget
    if body.chapterWordCountTarget is not None:
        index.settings.chapterWordCountTarget = body.chapterWordCountTarget
    if body.priorities is not None:
        index.settings.priorities = body.priorities
    if body.routines is not None:
        index.settings.routines = body.routines
    if body.outlineLevels is not None:
        index.settings.outlineLevels = body.outlineLevels
    if body.plotLevels is not None:
        index.settings.plotLevels = body.plotLevels
    if body.readLevels is not None:
        index.settings.readLevels = body.readLevels
    before = {
        "timeSystems": [t.model_dump(mode="json") for t in index.settings.timeSystems],
        "themeHue": index.settings.themeHue,
    }
    if body.timeSystems is not None:
        index.settings.timeSystems = body.timeSystems
    if body.themeHue is not None:
        index.settings.themeHue = body.themeHue
    after = {
        "timeSystems": [t.model_dump(mode="json") for t in index.settings.timeSystems],
        "themeHue": index.settings.themeHue,
    }
    index.updatedAt = utcnow()
    store.save_index(root, index)
    # A change to the time systems or the colour is logged with what it replaced, so it can be undone.
    if before != after:
        store.append_settings_log(root, project_id, settings_log.new_entry("project", "Project settings changed", before))
    return index


# The project's settings changes of the last days with the values they replaced, newest first (Undo reads this).
@router.get("/{project_id}/settings-log", response_model=list[SettingsLogEntry])
def get_settings_log(project_id: str, root: Path = Depends(get_storage_root)) -> list[SettingsLogEntry]:
    return store.list_settings_log(root, project_id)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, root: Path = Depends(get_storage_root)) -> None:
    store.delete_project(root, project_id)
