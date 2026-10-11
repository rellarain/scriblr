from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.storage import reader_store

START = datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> dict:
    state = {"now": START}
    monkeypatch.setattr(reader_store, "_now", lambda: state["now"])
    return state


def _reader(client: TestClient) -> dict:
    resp = client.get("/api/reader")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _put(client: TestClient, path: str, **body):
    return client.put(f"/api/reader{path}", json=body)


def _post(client: TestClient, path: str, **body):
    return client.post(f"/api/reader{path}", json=body)


def _card(client: TestClient, book_id: str) -> dict:
    resp = client.get(f"/api/reader/books/{book_id}/card")
    assert resp.status_code == 200, resp.text
    return resp.json()


# ----------------------------------------------------------------------------------------------------------------------- levels


def test_seeded_invites_set_the_level_and_it_can_be_switched(client: TestClient, clock: dict) -> None:
    levels = _reader(client)["levels"]
    assert levels["ash"] == {"level": "alpha", "invitedBy": "Mara Quill", "override": False}
    assert levels["what-the-fog-owes"]["level"] == "delta" and levels["the-weir"]["level"] == "beta"
    assert "cold-harbor" not in levels  # read at omega, its final edition

    state = _put(client, "/levels/cold-harbor", level="beta").json()
    assert state["levels"]["cold-harbor"] == {"level": "beta", "invitedBy": None, "override": True}
    state = _put(client, "/levels/ash", level="omega").json()
    assert state["levels"]["ash"] == {"level": "omega", "invitedBy": "Mara Quill", "override": True}
    state = _put(client, "/levels/ash", level=None).json()
    assert state["levels"]["ash"]["level"] == "alpha" and state["levels"]["ash"]["override"] is False
    assert _put(client, "/levels/nope", level="alpha").status_code == 404
    assert _put(client, "/levels/ash", level="gamma").status_code == 422


# ----------------------------------------------------------------------------------------------------------------------- reviews


def test_criteria_are_the_readers_own_and_reusable(client: TestClient, clock: dict) -> None:
    assert _reader(client)["criteriaNames"] == ["Plot", "Prose", "Characters", "Pacing"]
    state = _put(client, "/criteria", names=["Voice", " Setting ", "Voice"]).json()
    assert state["criteriaNames"] == ["Voice", "Setting"]
    assert _put(client, "/criteria", names=[]).status_code == 422
    assert _put(client, "/criteria", names=["x" * 41]).status_code == 422


def test_a_draft_is_private_until_it_is_posted_and_then_moves_the_average(client: TestClient, clock: dict) -> None:
    before = _card(client, "cold-harbor")
    assert before["ratings"] == 1208 and before["rating"] == 8.8
    assert all(not r["mine"] for r in before["reviews"])

    state = _put(client, "/reviews/cold-harbor", score=10, criteria={"Plot": 9, "Prose": 10}, comment="Quiet and exact.", spoilerEssay="The ledgers.", noteIds=[]).json()
    read = state["reviews"][0]["reads"][0]
    assert read["status"] == "draft" and read["score"] == 10
    assert not any(r["mine"] for r in _card(client, "cold-harbor")["reviews"])  # a draft stays private

    posted = _post(client, "/reviews/cold-harbor/post").json()
    assert posted["reviews"][0]["reads"][0]["status"] == "posted"
    card = _card(client, "cold-harbor")
    mine = card["reviews"][0]
    assert mine["mine"] and mine["score"] == 10 and mine["comment"] == "Quiet and exact." and mine["reads"] == 1 and mine["edited"] is False
    assert card["ratings"] == 1209 and card["rating"] == round((8.8 * 1208 + 10) / 1209, 1)
    assert {c["name"] for c in card["criteria"]} >= {"Plot", "Prose", "Characters", "Pacing"}

    clock["now"] = START + timedelta(hours=2)
    _put(client, "/reviews/cold-harbor", score=9, criteria={"Plot": 8}, comment="Better the second night.", spoilerEssay="", noteIds=[])
    mine = _card(client, "cold-harbor")["reviews"][0]
    assert mine["score"] == 9 and mine["edited"] is True


def test_a_review_needs_a_score_in_range_to_post(client: TestClient, clock: dict) -> None:
    assert _post(client, "/reviews/cold-harbor/post").status_code == 422  # nothing written
    _put(client, "/reviews/cold-harbor", score=None, criteria={}, comment="Thoughts", spoilerEssay="", noteIds=[])
    assert _post(client, "/reviews/cold-harbor/post").status_code == 422
    assert _put(client, "/reviews/cold-harbor", score=11, criteria={}, comment="", spoilerEssay="", noteIds=[]).status_code == 422
    assert _put(client, "/reviews/cold-harbor", score=5, criteria={"Plot": 0}, comment="", spoilerEssay="", noteIds=[]).status_code == 422
    assert _put(client, "/reviews/nope", score=5, criteria={}, comment="", spoilerEssay="", noteIds=[]).status_code == 404


def test_a_draft_can_be_discarded_but_a_posted_review_cannot(client: TestClient, clock: dict) -> None:
    _put(client, "/reviews/thaw", score=7, criteria={}, comment="", spoilerEssay="", noteIds=[])
    assert client.delete("/api/reader/reviews/thaw/draft").json()["reviews"] == []
    _put(client, "/reviews/thaw", score=7, criteria={}, comment="", spoilerEssay="", noteIds=[])
    _post(client, "/reviews/thaw/post")
    assert len(client.delete("/api/reader/reviews/thaw/draft").json()["reviews"]) == 1


def test_a_re_read_adds_a_tab_and_resets_progress(client: TestClient, clock: dict) -> None:
    client.post("/api/reader/buy", json={"bookId": "cold-harbor"})
    client.post("/api/reader/progress", json={"bookId": "cold-harbor", "pct": 95, "pages": 300, "minutes": 400, "newSession": True})
    assert _post(client, "/reviews/cold-harbor/reread").status_code == 422  # nothing posted yet

    _put(client, "/reviews/cold-harbor", score=8, criteria={"Plot": 8}, comment="First read.", spoilerEssay="", noteIds=[])
    assert _post(client, "/reviews/cold-harbor/reread").status_code == 422  # a draft is not posted
    _post(client, "/reviews/cold-harbor/post")

    state = _post(client, "/reviews/cold-harbor/reread").json()
    reads = state["reviews"][0]["reads"]
    assert [r["n"] for r in reads] == [1, 2] and reads[1]["status"] == "draft" and reads[1]["score"] is None
    assert state["progress"]["cold-harbor"]["pct"] == 0 and state["progress"]["cold-harbor"]["finishedAt"] is None
    assert _post(client, "/reviews/cold-harbor/reread").status_code == 422  # one re-read at a time

    # The public view keeps showing the latest posted read, with a count.
    assert _card(client, "cold-harbor")["reviews"][0]["comment"] == "First read."
    _put(client, "/reviews/cold-harbor", score=10, criteria={}, comment="Second read.", spoilerEssay="", noteIds=[])
    _post(client, "/reviews/cold-harbor/post")
    mine = _card(client, "cold-harbor")["reviews"][0]
    assert mine["comment"] == "Second read." and mine["reads"] == 2


def test_notes_are_kept_per_book_and_can_be_included_in_a_review(client: TestClient, clock: dict) -> None:
    assert _post(client, "/notes", bookId="cold-harbor", quote="", note=" ").status_code == 422
    state = _post(client, "/notes", bookId="cold-harbor", quote="The early tide.", note="Remember this.").json()
    note_id = state["notes"][0]["id"]
    state = _put(client, "/reviews/cold-harbor", score=8, criteria={}, comment="", spoilerEssay="", noteIds=[note_id, "bogus"]).json()
    assert state["reviews"][0]["reads"][0]["noteIds"] == [note_id]
    state = client.delete(f"/api/reader/notes/{note_id}").json()
    assert state["notes"] == [] and state["reviews"][0]["reads"][0]["noteIds"] == []
    assert _post(client, "/notes", bookId="nope", quote="x", note="").status_code == 404


# ----------------------------------------------------------------------------------------------------------------------- follows, feed, notifications


def test_following_adds_a_person_s_activity_to_the_feed(client: TestClient, clock: dict) -> None:
    assert client.get("/api/reader/feed").json() == []
    state = _put(client, "/following/r-sol").json()
    assert state["following"] == ["r-sol"]
    feed = client.get("/api/reader/feed").json()
    assert [f["whoId"] for f in feed] == ["r-sol"] and feed[0]["bookId"] == "lantern-hours"
    state = client.delete("/api/reader/following/r-sol").json()
    assert state["following"] == [] and client.get("/api/reader/feed").json() == []


def test_a_followed_author_s_recent_news_is_a_notification_once(client: TestClient, clock: dict) -> None:
    _put(client, "/following/mara-quill")
    notes = _reader(client)["notifications"]
    assert [n["kind"] for n in notes if n["kind"] == "follow"] == ["follow"]
    assert "footnotes" in next(n for n in notes if n["kind"] == "follow")["title"]
    _reader(client)
    assert len([n for n in _reader(client)["notifications"] if n["kind"] == "follow"]) == 1


def test_my_own_reading_shows_in_the_feed(client: TestClient, clock: dict) -> None:
    client.post("/api/reader/buy", json={"bookId": "thaw"})
    client.post("/api/reader/progress", json={"bookId": "thaw", "pct": 100, "pages": 10, "minutes": 10, "newSession": True})
    feed = client.get("/api/reader/feed").json()
    assert [f["title"] for f in feed] == ["You finished a book"]


def test_blocking_a_reader_hides_them_and_unfollows(client: TestClient, clock: dict) -> None:
    _put(client, "/following/r-sol")
    state = _put(client, "/blocked/r-sol").json()
    assert state["blocked"] == ["r-sol"] and state["following"] == []
    assert _put(client, "/following/r-sol").status_code == 200
    assert client.get("/api/reader/feed").json() == []  # a blocked reader never reaches the feed
    assert client.delete("/api/reader/blocked/r-sol").json()["blocked"] == []
    assert _put(client, "/blocked/nobody").status_code == 404


# ----------------------------------------------------------------------------------------------------------------------- clubs


def _club(client: TestClient, club_id: str) -> dict:
    return next(c for c in client.get("/api/reader/clubs").json() if c["club"]["id"] == club_id)


def test_the_seeded_clubs_can_be_joined_and_left(client: TestClient, clock: dict) -> None:
    clubs = client.get("/api/reader/clubs").json()
    assert len(clubs) == 5 and not any(c["joined"] for c in clubs)
    before = _club(client, "rope-readers")["memberCount"]
    state = _put(client, "/clubs/rope-readers/membership").json()
    assert state["joinedClubs"] == ["rope-readers"]
    assert _club(client, "rope-readers")["memberCount"] == before + 1
    assert client.delete("/api/reader/clubs/rope-readers/membership").json()["joinedClubs"] == []
    assert _put(client, "/clubs/nope/membership").status_code == 404


def test_a_club_meeting_soon_is_a_notification(client: TestClient, clock: dict) -> None:
    _put(client, "/clubs/essay-hour/membership")  # meets in 1 day
    _put(client, "/clubs/slow-burners/membership")  # meets in 5 days
    titles = [n["title"] for n in _reader(client)["notifications"] if n["kind"] == "club"]
    assert titles == ["The Essay Hour meets soon"]


def test_posting_needs_membership_and_replies_and_spoilers_are_kept(client: TestClient, clock: dict) -> None:
    assert _post(client, "/clubs/slow-burners/posts", text="Hello", spoiler=False).status_code == 422
    _put(client, "/clubs/slow-burners/membership")
    state = _post(client, "/clubs/slow-burners/posts", text="  Chapter 4 changed my mind.  ", spoiler=True).json()
    assert state is not None
    posts = _club(client, "slow-burners")["posts"]
    mine = [p for p in posts if p["authorId"] == "me"][0]
    assert mine["text"] == "Chapter 4 changed my mind." and mine["spoiler"] is True
    seeded = next(p for p in posts if p["authorId"] != "me")
    assert _post(client, "/clubs/slow-burners/posts", text="Same.", spoiler=False, replyTo=seeded["id"]).status_code == 200
    assert _post(client, "/clubs/slow-burners/posts", text="Lost", spoiler=False, replyTo="nope").status_code == 404
    assert _post(client, "/clubs/slow-burners/posts", text="  ", spoiler=False).status_code == 422
    assert client.delete(f"/api/reader/posts/{mine['id']}").status_code == 200
    assert all(p["authorId"] != "me" or p["replyTo"] for p in _club(client, "slow-burners")["posts"])
    assert client.delete("/api/reader/posts/seed-0").status_code == 404  # a seeded post is not mine to delete


def test_a_reader_can_start_and_delete_their_own_club(client: TestClient, clock: dict) -> None:
    assert _post(client, "/clubs", name=" ", description="").status_code == 422
    state = _post(client, "/clubs", name="Harbor Hours", description="Winter reads.", bookId="cold-harbor", meets="Tuesdays").json()
    club_id = state["joinedClubs"][0]
    view = _club(client, club_id)
    assert view["club"]["mine"] and view["joined"] and view["memberCount"] == 1
    assert client.delete(f"/api/reader/clubs/{club_id}/membership").status_code == 422  # leave by deleting
    _post(client, f"/clubs/{club_id}/posts", text="First!", spoiler=False)
    assert client.delete("/api/reader/clubs/rope-readers").status_code == 422  # only your own
    state = client.delete(f"/api/reader/clubs/{club_id}").json()
    assert state["joinedClubs"] == [] and len(client.get("/api/reader/clubs").json()) == 5
    assert _post(client, "/clubs", name="X", description="", bookId="nope").status_code == 404


# ----------------------------------------------------------------------------------------------------------------------- moderation


def test_a_reported_review_is_remembered_once_and_can_be_undone(client: TestClient, clock: dict) -> None:
    target = _card(client, "cold-harbor")["reviews"][0]["id"]
    state = _post(client, "/reports", kind="review", targetId=target, reason="spoiler").json()
    assert [(r["kind"], r["targetId"], r["reason"]) for r in state["reports"]] == [("review", target, "spoiler")]
    assert len(_post(client, "/reports", kind="review", targetId=target, reason="abuse").json()["reports"]) == 1
    assert _post(client, "/reports", kind="post", targetId="seed-1", reason="rude").status_code == 422
    assert _post(client, "/reports", kind="comment", targetId="x", reason="hide").status_code == 422
    report_id = state["reports"][0]["id"]
    assert client.delete(f"/api/reader/reports/{report_id}").json()["reports"] == []


# ----------------------------------------------------------------------------------------------------------------------- the library's book details


def test_a_book_has_front_and_back_matter_planning_and_statistics(client: TestClient, clock: dict) -> None:
    detail = client.get("/api/library/books/cold-harbor/detail").json()
    assert detail["bookId"] == "cold-harbor" and detail["authorNote"]
    assert len(detail["contents"]) == 11 and detail["contents"][0]["n"] == 1
    assert detail["planning"]["goalWords"] == 80000 and detail["planning"]["chaptersTotal"] == 11
    assert len(detail["stats"]["leaveBars"]) == 8 and detail["stats"]["clubs"] == 1 and detail["stats"]["readingNow"] > 0
    assert client.get("/api/library/books/cold-harbor/detail").json() == detail  # fixed, not random
    assert client.get("/api/library/books/nope/detail").status_code == 404


def test_the_seeded_readers_are_listed(client: TestClient, clock: dict) -> None:
    readers = client.get("/api/library/readers").json()
    assert len(readers) == 12 and {"id", "name", "initials", "bio"} <= set(readers[0])
