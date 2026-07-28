from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_storage_root
from ..models import CreateNoteRequest, UpdateNoteRequest
from ..storage import project_store as store
from ..storage.schema import BrainstormNote, BrainstormNotes, utcnow

router = APIRouter(prefix="/api/projects/{project_id}/brainstorm", tags=["brainstorm"])


@router.get("", response_model=BrainstormNotes)
def get_notes(project_id: str, root: Path = Depends(get_storage_root)) -> BrainstormNotes:
    return store.load_brainstorm(root, project_id)


@router.post("", response_model=BrainstormNote)
def create_note(
    project_id: str, body: CreateNoteRequest, root: Path = Depends(get_storage_root)
) -> BrainstormNote:
    notes = store.load_brainstorm(root, project_id)
    now = utcnow()
    note = BrainstormNote(
        id=store.new_id("note"),
        createdAt=now,
        updatedAt=now,
        body=body.body,
        tags=body.tags,
        linkedOutlineNodeId=body.linkedOutlineNodeId,
    )
    notes.notes.append(note)
    store.save_brainstorm(root, project_id, notes)
    return note


@router.patch("/{note_id}", response_model=BrainstormNote)
def update_note(
    project_id: str,
    note_id: str,
    body: UpdateNoteRequest,
    root: Path = Depends(get_storage_root),
) -> BrainstormNote:
    notes = store.load_brainstorm(root, project_id)
    for note in notes.notes:
        if note.id == note_id:
            if body.body is not None:
                note.body = body.body
            if body.tags is not None:
                note.tags = body.tags
            if body.linkedOutlineNodeId is not None:
                note.linkedOutlineNodeId = body.linkedOutlineNodeId
            note.updatedAt = utcnow()
            store.save_brainstorm(root, project_id, notes)
            return note
    raise HTTPException(status_code=404, detail=f"note not found: {note_id}")


@router.delete("/{note_id}", status_code=204)
def delete_note(project_id: str, note_id: str, root: Path = Depends(get_storage_root)) -> None:
    notes = store.load_brainstorm(root, project_id)
    remaining = [n for n in notes.notes if n.id != note_id]
    if len(remaining) == len(notes.notes):
        raise HTTPException(status_code=404, detail=f"note not found: {note_id}")
    notes.notes = remaining
    store.save_brainstorm(root, project_id, notes)
