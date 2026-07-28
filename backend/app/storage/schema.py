from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field

SCHEMA_VERSION = 1


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProjectManifest(BaseModel):
    outline: str = "outline/tree.json"
    brainstorm: str = "brainstorm/notes.json"
    draftScenes: list[str] = Field(default_factory=list)
    revisionScenes: list[str] = Field(default_factory=list)


class ProjectSettings(BaseModel):
    wordCountTarget: Optional[int] = None


class ProjectIndex(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    projectId: str
    title: str
    createdAt: datetime
    updatedAt: datetime
    settings: ProjectSettings = Field(default_factory=ProjectSettings)
    manifest: ProjectManifest = Field(default_factory=ProjectManifest)


OutlineNodeKind = Literal["book", "chapter", "scene"]


class OutlineNode(BaseModel):
    id: str
    kind: OutlineNodeKind
    parentId: Optional[str] = None
    order: int
    title: str
    synopsis: str = ""
    draftRef: Optional[str] = None


class OutlineTree(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    nodes: list[OutlineNode] = Field(default_factory=list)


class BrainstormNote(BaseModel):
    id: str
    createdAt: datetime
    updatedAt: datetime
    body: str
    tags: list[str] = Field(default_factory=list)
    linkedOutlineNodeId: Optional[str] = None


class BrainstormNotes(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    notes: list[BrainstormNote] = Field(default_factory=list)


class DraftScene(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    sceneId: str
    outlineNodeId: str
    updatedAt: datetime
    wordCount: int = 0
    format: Literal["markdown"] = "markdown"
    body: str = ""


class CommentAnchor(BaseModel):
    type: Literal["text-offset"] = "text-offset"
    start: int
    end: int


CommentFlag = Optional[Literal["primary", "secondary"]]


class RevisionComment(BaseModel):
    id: str
    anchor: CommentAnchor
    body: str
    flag: CommentFlag = None
    createdAt: datetime


RevisionTrigger = Literal["manual", "session-close"]


class RevisionSnapshot(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    snapshotId: str
    sceneId: str
    createdAt: datetime
    label: str = ""
    trigger: RevisionTrigger = "manual"
    body: str = ""
    wordCount: int = 0
    notes: list[RevisionComment] = Field(default_factory=list)


class RevisionSummary(BaseModel):
    snapshotId: str
    createdAt: datetime
    label: str
    trigger: RevisionTrigger
    wordCount: int
