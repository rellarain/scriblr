"""Pictures to trace (WUI slice 9b): a picture under a model's canvas, kept beside the draft (never in the model, so never published), chosen, faded and moved, and taken
away; each library keeps its own, and a model's id is never a path."""

from app.storage import model_traces
from app.storage.character_models_store import ADMIN_LIBRARY

PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def test_a_model_has_no_picture_until_one_is_chosen(client):
    assert client.get("/api/character-models/m1/trace").json() is None


def test_a_picture_is_chosen_faded_moved_and_taken_away(client):
    put = client.put("/api/character-models/m1/trace", json={"image": PNG, "name": " sketch-front.png ", "x": 10, "y": 4, "w": 180, "h": 430})
    assert put.status_code == 200, put.text
    got = client.get("/api/character-models/m1/trace").json()
    assert got["name"] == "sketch-front.png" and got["opacity"] == 0.35 and got["locked"] is True and got["shown"] is True and got["image"] == PNG
    patched = client.patch("/api/character-models/m1/trace", json={"name": "sketch-front.png", "opacity": 0.6, "locked": False, "shown": True, "x": 20, "y": 4, "w": 180, "h": 430})
    assert patched.status_code == 200
    got = client.get("/api/character-models/m1/trace").json()
    assert got["opacity"] == 0.6 and got["locked"] is False and got["x"] == 20 and got["image"] == PNG
    assert client.delete("/api/character-models/m1/trace").status_code == 204
    assert client.get("/api/character-models/m1/trace").json() is None


def test_settings_without_a_picture_are_404_and_a_picture_must_be_an_image(client):
    assert client.patch("/api/character-models/m2/trace", json={"opacity": 0.5}).status_code == 404
    assert client.put("/api/character-models/m2/trace", json={"image": "data:text/html;base64,PGI+"}).status_code == 422
    assert client.put("/api/character-models/m2/trace", json={"image": "not a picture"}).status_code == 422


def test_settings_are_held_to_their_ranges():
    from app.storage.schema import ModelTraceSettings
    s = ModelTraceSettings.model_validate({"opacity": 9, "w": -5, "x": "far", "name": 7})
    assert s.opacity == 1.0 and s.w == 1.0 and s.x == 0.0 and s.name == ""


def test_each_library_keeps_its_own_and_an_id_is_never_a_path(client, app_data_root):
    client.put("/api/character-models/m1/trace", json={"image": PNG})
    assert client.get("/api/my-models/m1/trace").json() is None
    # the files are named for a hash of the id, in the library's folder
    files = sorted(p.name for p in (app_data_root / "character-model-traces").iterdir() if p.is_file())
    assert len(files) == 2 and all(len(name.split(".")[0]) == 32 for name in files)
    assert client.get("/api/character-models/..%2F..%2Fx/trace").status_code in (404, 422)


def test_a_picture_is_never_part_of_the_model(client, app_data_root):
    client.put("/api/character-models/m1/trace", json={"image": PNG})
    put = client.put("/api/character-models", json={"models": [{"id": "m1", "draft": {"name": "Traced"}}]})
    assert put.status_code == 200 and "base64" not in put.text
    assert "base64" not in (app_data_root / "character-models.json").read_text(encoding="utf-8")
    assert model_traces.get_trace(app_data_root, ADMIN_LIBRARY, "m1") is not None
