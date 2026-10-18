from pathlib import Path

from app.storage import backup


def _seed(root: Path) -> None:
    (root / "projects" / "prj_1").mkdir(parents=True)
    (root / "projects" / "prj_1" / "project.json").write_text('{"a": 1}', encoding="utf-8")
    (root / "user-settings.json").write_text("{}", encoding="utf-8")
    (root / "projects" / "prj_1" / "project.json.tmp").write_text("partial", encoding="utf-8")


def test_backup_copies_the_data_beside_it_not_inside_it(tmp_path):
    root = tmp_path / "Scriblr"
    _seed(root)
    dest = backup.backup_app_data(root)
    assert dest.parent == tmp_path / "Scriblr-backups"
    assert (dest / "projects" / "prj_1" / "project.json").read_text(encoding="utf-8") == '{"a": 1}'
    assert (dest / "user-settings.json").exists()
    assert not (dest / "projects" / "prj_1" / "project.json.tmp").exists()  # half-written temp files are not data
    assert not any(p.name.endswith("-backups") for p in root.iterdir())  # nothing is written into the data directory


def test_backups_keep_only_the_newest_few(tmp_path):
    root = tmp_path / "Scriblr"
    _seed(root)
    made = [backup.backup_app_data(root, keep=3) for _ in range(5)]
    left = sorted(p.name for p in backup.backups_root(root).iterdir())
    assert left == sorted(p.name for p in made[-3:])


def test_a_backup_is_never_pruned_away_entirely(tmp_path):
    root = tmp_path / "Scriblr"
    _seed(root)
    backup.backup_app_data(root, keep=0)
    assert len(list(backup.backups_root(root).iterdir())) == 1


def _project(root: Path, name: str, version: int, indent: bool = False) -> None:
    import json

    folder = root / "projects" / name
    folder.mkdir(parents=True)
    body = {"schemaVersion": version, "index": {}}
    (folder / "project.json").write_text(json.dumps(body, indent=2 if indent else None), encoding="utf-8")


def test_a_backup_is_made_once_before_older_projects_are_converted(tmp_path):
    root = tmp_path / "Scriblr"
    _project(root, "prj_old", 2, indent=True)  # an older, indented file
    _project(root, "prj_new", 4)
    made = backup.ensure_pre_migration_backup(root, 4)
    assert made is not None and (made / "projects" / "prj_old" / "project.json").exists()
    assert backup.ensure_pre_migration_backup(root, 4) is None  # not again for this version
    assert len(list(backup.backups_root(root).iterdir())) == 1


def test_no_backup_when_everything_is_current_or_there_is_nothing(tmp_path):
    root = tmp_path / "Scriblr"
    _project(root, "prj_new", 4)
    assert backup.ensure_pre_migration_backup(root, 4) is None
    empty = tmp_path / "Empty"
    (empty / "projects").mkdir(parents=True)
    assert backup.ensure_pre_migration_backup(empty, 4) is None
    assert not backup.backups_root(root).exists() and not backup.backups_root(empty).exists()
