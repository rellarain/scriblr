from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.storage import project_store
from app.deps import get_app_data_storage_root, get_storage_root
from app.main import create_app


@pytest.fixture(autouse=True)
def checked_project_cache():
    """Every read that the in-memory project cache answers is checked against a fresh read of the file, so a test fails if anything changes a kept
    ProjectFile on the side. The cache starts empty for each test."""
    project_store._cache.clear()
    project_store._VERIFY_CACHE = True
    yield
    project_store._VERIFY_CACHE = False
    project_store._cache.clear()


@pytest.fixture
def storage_root(tmp_path: Path) -> Path:
    root = tmp_path / "projects"
    root.mkdir()
    return root


@pytest.fixture
def app_data_root(tmp_path: Path) -> Path:
    root = tmp_path / "appdata"
    root.mkdir()
    return root


@pytest.fixture
def client(storage_root: Path, app_data_root: Path) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_storage_root] = lambda: storage_root
    app.dependency_overrides[get_app_data_storage_root] = lambda: app_data_root
    return TestClient(app)
