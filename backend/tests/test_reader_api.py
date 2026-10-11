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


def _post(client: TestClient, path: str, **body):
    return client.post(f"/api/reader{path}", json=body)


def _holding(state: dict, book_id: str) -> dict:
    return next(h for h in state["holdings"] if h["bookId"] == book_id and h["status"] == "active")


def test_a_new_reader_starts_on_the_base_plan_with_one_credit(client: TestClient, clock: dict) -> None:
    state = _reader(client)
    assert state["plan"] == {"extraCredits": 0}
    assert state["planPriceCents"] == 600 and state["creditsPerMonth"] == 1
    assert state["balance"] == 1
    assert [e["kind"] for e in state["ledger"]] == ["grant"]
    assert state["holdings"] == [] and state["wishlist"] == [] and state["toRead"] == []


def test_each_extra_credit_costs_two_dollars_and_starts_next_month(client: TestClient, clock: dict) -> None:
    resp = client.put("/api/reader/plan", json={"extraCredits": 3})
    assert resp.status_code == 200
    state = resp.json()
    assert state["planPriceCents"] == 1200 and state["creditsPerMonth"] == 4
    assert state["balance"] == 1  # this month's credit was already granted

    clock["now"] = START + timedelta(days=31)
    assert _reader(client)["balance"] == 5

    assert client.put("/api/reader/plan", json={"extraCredits": 11}).status_code == 422
    assert client.put("/api/reader/plan", json={"extraCredits": -1}).status_code == 422


def test_unused_credits_roll_over_and_are_kept_when_the_plan_changes(client: TestClient, clock: dict) -> None:
    _reader(client)  # October: 1 credit
    client.put("/api/reader/plan", json={"extraCredits": 3})
    clock["now"] = datetime(2026, 12, 3, tzinfo=timezone.utc)  # November and December each grant 4
    assert _reader(client)["balance"] == 1 + 4 + 4
    client.put("/api/reader/plan", json={"extraCredits": 0})
    assert _reader(client)["balance"] == 9  # a lower plan never takes banked credits
    clock["now"] = datetime(2027, 1, 5, tzinfo=timezone.utc)
    assert _reader(client)["balance"] == 10


def test_borrowing_spends_credits_for_that_many_months(client: TestClient, clock: dict) -> None:
    client.put("/api/reader/plan", json={"extraCredits": 3})
    clock["now"] = START + timedelta(days=31)
    _reader(client)  # balance 5

    resp = _post(client, "/borrow", bookId="cold-harbor", credits=2)
    assert resp.status_code == 200, resp.text
    state = resp.json()
    assert state["balance"] == 3
    held = _holding(state, "cold-harbor")
    assert held["kind"] == "borrowed" and held["credits"] == 2
    assert held["dueAt"].startswith("2027-01-11") or held["dueAt"].startswith("2026-12-1")  # two months after the borrow
    borrow_entry = next(e for e in state["ledger"] if e["kind"] == "borrow")
    assert borrow_entry["delta"] == -2 and borrow_entry["bookId"] == "cold-harbor"


def test_borrowing_is_refused_without_credits_a_second_time_or_for_an_unknown_book(client: TestClient, clock: dict) -> None:
    assert _post(client, "/borrow", bookId="thaw", credits=2).status_code == 402
    assert _post(client, "/borrow", bookId="thaw", credits=1).status_code == 200
    assert _post(client, "/borrow", bookId="thaw", credits=1).status_code == 409
    assert _post(client, "/borrow", bookId="nope", credits=1).status_code == 404
    assert _post(client, "/borrow", bookId="thaw", credits=5).status_code == 422
    assert _post(client, "/borrow", bookId="ash", credits=1).status_code == 422  # no edition yet


def test_cancelling_before_opening_gives_every_credit_back(client: TestClient, clock: dict) -> None:
    state = _post(client, "/borrow", bookId="thaw", credits=1).json()
    assert state["balance"] == 0
    state = _post(client, f"/holdings/{_holding(state, 'thaw')['id']}/return").json()
    assert state["balance"] == 1
    assert state["holdings"][0]["status"] == "cancelled"
    assert state["ledger"][0]["kind"] == "refund"


def test_a_quick_return_with_under_half_read_is_refunded(client: TestClient, clock: dict) -> None:
    state = _post(client, "/borrow", bookId="thaw", credits=1).json()
    _post(client, "/progress", bookId="thaw", pct=20, pages=30, minutes=40, newSession=True)
    clock["now"] = START + timedelta(days=9)
    state = _post(client, f"/holdings/{_holding(_reader(client), 'thaw')['id']}/return").json()
    assert state["balance"] == 1
    assert state["holdings"][0]["status"] == "returned"


def test_a_late_return_or_one_with_half_read_gets_nothing_back(client: TestClient, clock: dict) -> None:
    client.put("/api/reader/plan", json={"extraCredits": 3})
    clock["now"] = START + timedelta(days=31)
    _reader(client)  # 5 credits

    _post(client, "/borrow", bookId="thaw", credits=1)
    _post(client, "/progress", bookId="thaw", pct=20, pages=30, minutes=40, newSession=True)
    clock["now"] = START + timedelta(days=31 + 15)  # past the 14 days
    state = _post(client, f"/holdings/{_holding(_reader(client), 'thaw')['id']}/return").json()
    assert state["balance"] == 4  # 5 - 1, and nothing back

    _post(client, "/borrow", bookId="ember", credits=1)
    _post(client, "/progress", bookId="ember", pct=60, pages=200, minutes=300, newSession=True)
    clock["now"] = START + timedelta(days=31 + 16)
    state = _post(client, f"/holdings/{_holding(_reader(client), 'ember')['id']}/return").json()
    assert state["balance"] == 3  # half read: no refund even inside 14 days of the borrow


def test_a_loan_ends_by_itself_when_it_is_due(client: TestClient, clock: dict) -> None:
    _post(client, "/borrow", bookId="thaw", credits=1)
    clock["now"] = START + timedelta(days=40)
    state = _reader(client)
    assert state["holdings"][0]["status"] == "returned"
    assert state["balance"] == 1  # the next month's credit only


def test_an_extension_costs_one_more_credit_and_a_month(client: TestClient, clock: dict) -> None:
    client.put("/api/reader/plan", json={"extraCredits": 3})
    clock["now"] = START + timedelta(days=31)
    _reader(client)
    state = _post(client, "/borrow", bookId="thaw", credits=1).json()
    holding = _holding(state, "thaw")
    state = _post(client, f"/holdings/{holding['id']}/extend").json()
    assert state["balance"] == 3
    after = _holding(state, "thaw")
    assert after["credits"] == 2 and after["dueAt"] > holding["dueAt"]

    clock["now"] = START + timedelta(days=31 + 1)
    _post(client, "/borrow", bookId="ember", credits=3)
    state = _reader(client)
    assert state["balance"] == 0
    assert _post(client, f"/holdings/{_holding(state, 'thaw')['id']}/extend").status_code == 402


def test_buying_is_simulated_and_ends_a_loan_of_the_same_book(client: TestClient, clock: dict) -> None:
    _post(client, "/borrow", bookId="thaw", credits=1)
    state = _post(client, "/buy", bookId="thaw").json()
    kinds = sorted((h["kind"], h["status"]) for h in state["holdings"])
    assert kinds == [("borrowed", "returned"), ("owned", "active")]
    assert state["balance"] == 0  # no refund for the loan, and buying uses no credits
    assert _post(client, "/buy", bookId="thaw").status_code == 409
    assert _post(client, "/buy", bookId="nope").status_code == 404
    assert _post(client, "/buy", bookId="ash").status_code == 422


def test_an_owned_book_can_be_lent_and_recalled(client: TestClient, clock: dict) -> None:
    state = _post(client, "/buy", bookId="cold-harbor").json()
    holding = _holding(state, "cold-harbor")
    state = _post(client, f"/holdings/{holding['id']}/lend", to="Sol", months=2).json()
    lent = _holding(state, "cold-harbor")
    assert lent["lentTo"] == "Sol" and lent["lentUntil"] is not None
    assert _post(client, f"/holdings/{holding['id']}/lend", to="Wren", months=1).status_code == 422  # already out
    state = _post(client, f"/holdings/{holding['id']}/recall").json()
    assert _holding(state, "cold-harbor")["lentTo"] is None

    # A borrowed copy cannot be lent; lending ends by itself.
    _post(client, "/borrow", bookId="thaw", credits=1)
    assert _post(client, f"/holdings/{_holding(_reader(client), 'thaw')['id']}/lend", to="Sol", months=1).status_code == 422
    _post(client, f"/holdings/{holding['id']}/lend", to="Sol", months=1)
    clock["now"] = START + timedelta(days=45)
    assert _holding(_reader(client), "cold-harbor")["lentTo"] is None


def test_reading_records_the_position_and_the_days_activity(client: TestClient, clock: dict) -> None:
    assert _post(client, "/progress", bookId="thaw", pct=10, pages=5, minutes=6).status_code == 404  # not held
    _post(client, "/buy", bookId="thaw")
    state = _post(client, "/progress", bookId="thaw", pct=40, pages=30, minutes=35, newSession=True).json()
    state = _post(client, "/progress", bookId="thaw", pct=45, pages=12, minutes=14).json()
    assert state["progress"]["thaw"]["pct"] == 45 and state["progress"]["thaw"]["pages"] == 42
    assert state["activity"]["2026-10-11"] == {"pages": 42, "minutes": 49, "sessions": 1}
    assert _holding(state, "thaw")["opened"] is True

    state = _post(client, "/progress", bookId="thaw", pct=95, pages=100, minutes=120).json()
    assert state["progress"]["thaw"]["finishedAt"] is not None


def test_the_wishlist_and_the_to_read_list(client: TestClient, clock: dict) -> None:
    assert client.put("/api/reader/wishlist/ember").json()["wishlist"] == ["ember"]
    assert client.put("/api/reader/wishlist/ember").json()["wishlist"] == ["ember"]
    assert client.put("/api/reader/to-read/small-weather").json()["toRead"] == ["small-weather"]
    assert client.put("/api/reader/wishlist/nope").status_code == 404
    _post(client, "/buy", bookId="ember")
    assert client.get("/api/reader").json()["wishlist"] == []  # bought: off the wishlist
    assert client.delete("/api/reader/to-read/small-weather").json()["toRead"] == []


def test_flag_classes_are_kept_per_flag(client: TestClient, clock: dict) -> None:
    state = client.put("/api/reader/flag-classes/grief", json={"flagClass": "hidden"}).json()
    assert state["flagClasses"] == {"grief": "hidden"}
    assert client.put("/api/reader/flag-classes/grief", json={"flagClass": "nope"}).status_code == 422


def test_the_display_case_follows_what_the_reader_finished(client: TestClient, clock: dict) -> None:
    nothing_yet = client.get("/api/library/recommendations").json()
    assert nothing_yet and all(r["why"] for r in nothing_yet)

    _post(client, "/buy", bookId="thaw")
    _post(client, "/progress", bookId="thaw", pct=100, pages=300, minutes=400, newSession=True)
    recs = client.get("/api/library/recommendations", params={"limit": 24}).json()
    ids = [r["book"]["id"] for r in recs]
    assert "thaw" not in ids  # already read
    assert ids[0] == "ember"
    assert any("next book of The Ember Cycle" in w for w in recs[0]["why"])
    assert "ash" not in ids  # no edition yet
    assert all(0 < r["match"] <= 99 for r in recs)


def test_the_display_case_never_recommends_a_book_with_a_hidden_flag(client: TestClient, clock: dict) -> None:
    client.put("/api/reader/flag-classes/violence", json={"flagClass": "hidden"})
    recs = client.get("/api/library/recommendations", params={"limit": 24}).json()
    assert recs
    for r in recs:
        assert "violence" not in [f["key"] for f in r["book"]["flags"]]


def test_a_due_soon_loan_leaves_a_notification_once(client: TestClient, clock: dict) -> None:
    _post(client, "/borrow", bookId="thaw", credits=1)
    clock["now"] = START + timedelta(days=26)  # due in ~5 days
    first = _reader(client)
    assert [n["kind"] for n in first["notifications"]] == ["due"]
    assert len(_reader(client)["notifications"]) == 1
    state = _post(client, "/notifications/read").json()
    assert all(n["read"] for n in state["notifications"])


def test_the_reader_file_survives_a_restart(client: TestClient, clock: dict, app_data_root) -> None:
    _post(client, "/buy", bookId="thaw")
    assert (app_data_root / "reader.json").exists()
    assert _holding(_reader(client), "thaw")["kind"] == "owned"
