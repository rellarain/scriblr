import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.deps import get_app_data_storage_root, get_storage_root
from app.main import create_app


def _theme(client: TestClient) -> dict:
    return client.get("/api/user-settings").json()["theme"]


def test_get_seeds_defaults_and_is_stable(client: TestClient) -> None:
    first = client.get("/api/user-settings")
    assert first.status_code == 200
    body = first.json()
    assert body["schemaVersion"] == 1
    assert body["kv"] == {}
    assert body["migratedFromLocal"] is False
    assert body["theme"]["timeBasedEnabled"] is False
    assert body["theme"]["zones"]["day"]["configured"] is True
    assert body["theme"]["zones"]["night"]["configured"] is False
    assert body["theme"]["zones"]["day"]["palette"] == {
        "theme": {"h": 330}, "accent": {"h": 32}, "alert": {"h": 200}, "accent2": {"h": 260},
    }
    assert body["ui"] == {"viewAs": None, "handedness": "right", "autosaveEnabled": True, "autosaveSeconds": 30}
    assert client.get("/api/user-settings").json() == body


def test_put_theme_round_trips(client: TestClient) -> None:
    theme = _theme(client)
    theme["timeBasedEnabled"] = True
    theme["override"] = "day"
    theme["zones"]["night"]["configured"] = True
    theme["zones"]["night"]["startMinute"] = 1290
    theme["zones"]["night"]["palette"]["accent"] = {"h": 120}
    resp = client.put("/api/user-settings/theme", json=theme)
    assert resp.status_code == 200
    assert resp.json()["theme"] == theme
    assert client.get("/api/user-settings").json()["theme"] == theme


def test_put_theme_rejects_out_of_range_values(client: TestClient) -> None:
    theme = _theme(client)

    bad_minute = {**theme, "zones": {**theme["zones"], "day": {**theme["zones"]["day"], "startMinute": 425}}}
    assert client.put("/api/user-settings/theme", json=bad_minute).status_code == 422

    too_late = {**theme, "zones": {**theme["zones"], "day": {**theme["zones"]["day"], "startMinute": 1440}}}
    assert client.put("/api/user-settings/theme", json=too_late).status_code == 422

    palette = {**theme["zones"]["day"]["palette"], "theme": {"h": 361}}
    hue = {**theme, "zones": {**theme["zones"], "day": {**theme["zones"]["day"], "palette": palette}}}
    assert client.put("/api/user-settings/theme", json=hue).status_code == 422

    assert client.put("/api/user-settings/theme", json={**theme, "override": "noon"}).status_code == 422


OLD_PALETTE = {
    "brightness": 35,
    "theme": {"h": 40, "s": 30}, "accent": {"h": 50, "s": 95}, "alert": {"h": 60, "s": 100}, "accent2": {"h": 70, "s": 60},
}


def test_a_file_saved_with_saturation_and_brightness_still_loads_with_its_hues(client: TestClient, app_data_root: Path) -> None:
    theme = _theme(client)
    theme["zones"]["day"]["palette"] = OLD_PALETTE
    (app_data_root / "user-settings.json").write_text(
        json.dumps({"schemaVersion": 1, "theme": theme, "ui": {}, "kv": {}, "migratedFromLocal": False}), encoding="utf-8",
    )
    palette = _theme(client)["zones"]["day"]["palette"]
    assert palette == {"theme": {"h": 40}, "accent": {"h": 50}, "alert": {"h": 60}, "accent2": {"h": 70}}


def test_put_theme_accepts_and_drops_the_old_saturation_and_brightness(client: TestClient) -> None:
    theme = _theme(client)
    theme["zones"]["day"]["palette"] = OLD_PALETTE
    resp = client.put("/api/user-settings/theme", json=theme)
    assert resp.status_code == 200
    assert resp.json()["theme"]["zones"]["day"]["palette"] == {
        "theme": {"h": 40}, "accent": {"h": 50}, "alert": {"h": 60}, "accent2": {"h": 70},
    }


def test_put_ui(client: TestClient) -> None:
    resp = client.put("/api/user-settings/ui", json={"viewAs": "user", "handedness": "left"})
    assert resp.status_code == 200
    assert resp.json()["ui"] == {"viewAs": "user", "handedness": "left", "autosaveEnabled": True, "autosaveSeconds": 30}
    assert client.put("/api/user-settings/ui", json={"viewAs": "root", "handedness": "left"}).status_code == 422


def test_kv_set_get_overwrite_delete(client: TestClient) -> None:
    resp = client.put("/api/user-settings/kv/scriblr.writer.chapterMode", json={"value": "draft"})
    assert resp.status_code == 200
    assert resp.json()["kv"] == {"scriblr.writer.chapterMode": "draft"}

    notes = [{"id": "a", "title": "T", "body": "B"}]
    client.put("/api/user-settings/kv/scriblr.writer.scratchpad", json={"value": notes})
    client.put("/api/user-settings/kv/scriblr.writer.chapterMode", json={"value": "outline"})
    kv = client.get("/api/user-settings").json()["kv"]
    assert kv == {"scriblr.writer.chapterMode": "outline", "scriblr.writer.scratchpad": notes}

    # Keys may contain dots and slashes.
    client.put("/api/user-settings/kv/scriblr.writer.marks.prj_1.node/2", json={"value": {"x": 1}})
    assert client.get("/api/user-settings").json()["kv"]["scriblr.writer.marks.prj_1.node/2"] == {"x": 1}

    resp = client.delete("/api/user-settings/kv/scriblr.writer.chapterMode")
    assert resp.status_code == 200
    assert "scriblr.writer.chapterMode" not in resp.json()["kv"]
    assert client.delete("/api/user-settings/kv/scriblr.writer.chapterMode").status_code == 200


def test_kv_rejects_foreign_keys_and_huge_values(client: TestClient) -> None:
    assert client.put("/api/user-settings/kv/other.key", json={"value": 1}).status_code == 422
    long_key = "scriblr." + "x" * 300
    assert client.put(f"/api/user-settings/kv/{long_key}", json={"value": 1}).status_code == 422
    huge = "x" * 1_100_000
    assert client.put("/api/user-settings/kv/scriblr.big", json={"value": huge}).status_code == 422


def test_kv_import_only_sets_absent_keys_and_marks_migrated(client: TestClient) -> None:
    client.put("/api/user-settings/kv/scriblr.writer.chapterMode", json={"value": "draft"})
    resp = client.post(
        "/api/user-settings/kv-import",
        json={"values": {"scriblr.writer.chapterMode": "outline", "scriblr.writer.scratchpad": [1]}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["kv"]["scriblr.writer.chapterMode"] == "draft"  # not overwritten
    assert body["kv"]["scriblr.writer.scratchpad"] == [1]
    assert body["migratedFromLocal"] is True

    assert client.post("/api/user-settings/kv-import", json={"values": {"nope": 1}}).status_code == 422


def test_corrupt_file_is_quarantined_with_409(client: TestClient, app_data_root: Path) -> None:
    client.get("/api/user-settings")
    (app_data_root / "user-settings.json").write_text("{not json", encoding="utf-8")
    assert client.get("/api/user-settings").status_code == 409


def test_settings_persist_across_app_instances(storage_root: Path, app_data_root: Path) -> None:
    def make() -> TestClient:
        app = create_app()
        app.dependency_overrides[get_storage_root] = lambda: storage_root
        app.dependency_overrides[get_app_data_storage_root] = lambda: app_data_root
        return TestClient(app)

    make().put("/api/user-settings/kv/scriblr.writer.chapterMode", json={"value": "draft"})
    assert make().get("/api/user-settings").json()["kv"] == {"scriblr.writer.chapterMode": "draft"}


def test_put_ui_autosave(client: TestClient) -> None:
    resp = client.put("/api/user-settings/ui", json={"autosaveEnabled": False, "autosaveSeconds": 600})
    assert resp.status_code == 200
    ui = resp.json()["ui"]
    assert ui["autosaveEnabled"] is False and ui["autosaveSeconds"] == 600
    assert client.get("/api/user-settings").json()["ui"]["autosaveSeconds"] == 600
    for bad in (0, 15, 45, 630):
        assert client.put("/api/user-settings/ui", json={"autosaveSeconds": bad}).status_code == 422
