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
