"""The packaged backend's entry point and where the app keeps its data."""

import platform
import sys
from pathlib import Path

import server_main
from app.storage import paths


def test_dist_is_next_to_the_repo_when_run_from_source(monkeypatch) -> None:
    monkeypatch.delattr(sys, "_MEIPASS", raising=False)
    assert server_main.frontend_dist_path() == Path(server_main.__file__).resolve().parent.parent / "frontend" / "dist"


def test_dist_is_in_the_bundle_when_frozen(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    assert server_main.frontend_dist_path() == tmp_path / "frontend_dist"


def test_a_start_without_stdout_or_stderr_gets_somewhere_to_write(monkeypatch) -> None:
    monkeypatch.setattr(sys, "stdout", None)
    monkeypatch.setattr(sys, "stderr", None)
    server_main.ensure_std_streams()
    try:
        assert sys.stdout is not None and sys.stderr is not None
        sys.stdout.write("kept\n")
        sys.stderr.write("kept\n")
    finally:
        sys.stdout.close()
        sys.stderr.close()


def test_streams_that_exist_are_left_alone(monkeypatch) -> None:
    out, err = sys.stdout, sys.stderr
    server_main.ensure_std_streams()
    assert sys.stdout is out and sys.stderr is err


def test_data_dir_override_is_created_and_holds_the_projects(monkeypatch, tmp_path: Path) -> None:
    root = tmp_path / "somewhere" / "else"
    monkeypatch.setenv("SCRIBLR_DATA_DIR", str(root))
    assert paths.get_app_data_root() == root
    assert paths.get_projects_root() == root / "projects" and (root / "projects").is_dir()
    assert paths.get_project_dir("p1") == root / "projects" / "p1"


def test_default_data_dir_per_platform(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.delenv("SCRIBLR_DATA_DIR", raising=False)
    monkeypatch.setattr(platform, "system", lambda: "Windows")
    monkeypatch.setenv("APPDATA", str(tmp_path / "roaming"))
    assert paths._default_app_data_dir() == tmp_path / "roaming"

    monkeypatch.delenv("APPDATA")
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path / "home"))
    assert paths._default_app_data_dir() == tmp_path / "home" / "AppData" / "Roaming"

    monkeypatch.setattr(platform, "system", lambda: "Darwin")
    assert paths._default_app_data_dir() == tmp_path / "home" / "Library" / "Application Support"

    monkeypatch.setattr(platform, "system", lambda: "Linux")
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))
    assert paths._default_app_data_dir() == tmp_path / "xdg"
    monkeypatch.delenv("XDG_DATA_HOME")
    assert paths._default_app_data_dir() == tmp_path / "home" / ".local" / "share"
