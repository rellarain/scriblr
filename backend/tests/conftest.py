from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.deps import get_storage_root
from app.main import create_app


@pytest.fixture
def storage_root(tmp_path: Path) -> Path:
    root = tmp_path / "projects"
    root.mkdir()
    return root


@pytest.fixture
def client(storage_root: Path) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_storage_root] = lambda: storage_root
    return TestClient(app)
