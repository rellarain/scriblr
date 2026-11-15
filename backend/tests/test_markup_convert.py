"""The converters into Scriblr's markup (storage/markup_convert.py), used once when an old Resources or Training file is read."""

from app.storage.markup_convert import MARKERS, markdown_to_markup, merge_assessments, plain_to_markup, questions_to_markup


def test_markdown_headings_are_turned_round() -> None:
    assert markdown_to_markup("# Big\n## Less\n###### Small") == "###### Big\n##### Less\n# Small"
    # a closing run of hashes goes, and so does a line that is not a heading in Markdown either
    assert markdown_to_markup("## Title ##") == "##### Title"
    assert markdown_to_markup("#hashtag") == "#hashtag"


def test_markdown_lists_become_the_markup_lists() -> None:
    md = "- one\n* two\n+ three\n  - inner\n1. first\n2) second\n   3. inner number"
    assert markdown_to_markup(md) == "> one\n> two\n> three\n>>> inner\n>> first\n>> second\n>>>> inner number"


def test_markdown_quotes_links_underscores_and_rules() -> None:
    assert markdown_to_markup("> said it\n>\n> again") == '" said it\n\n" again'
    assert markdown_to_markup("See [the guide](https://example.com) now") == "See the guide (https://example.com) now"
    assert markdown_to_markup("__bold__ and _it_ but snake_case_name stays") == "**bold** and *it* but snake_case_name stays"
    assert markdown_to_markup("**kept** and *kept*") == "**kept** and *kept*"
    assert markdown_to_markup("a\n---\nb") == "a\n\nb"


def test_markdown_lines_that_would_be_markers_are_escaped() -> None:
    assert markdown_to_markup("? not a field\n! not an answer\n\" not a quote") == "\\? not a field\n\\! not an answer\n\\\" not a quote"
    assert markdown_to_markup("####### seven") == "\\####### seven"
    assert markdown_to_markup("write to @team today") == "write to \\@team today"
    assert markdown_to_markup("name@mail.com") == "name@mail.com"


def test_markdown_code_fences_keep_their_text() -> None:
    assert markdown_to_markup("```\n# not a heading\n*star*\n```") == "\\# not a heading\n\\*star\\*"


def test_plain_text_only_escapes() -> None:
    assert plain_to_markup("No.") == "No."
    assert plain_to_markup("2 * 3 = 6") == "2 \\* 3 = 6"
    assert plain_to_markup("# not a heading\n> not a list\n?why") == "\\# not a heading\n\\> not a list\n\\?why"
    assert plain_to_markup("C:\\Users stays") == "C:\\Users stays"
    # a backslash that would escape something is shown as typed
    assert plain_to_markup("a \\* b") == "a \\\\\\* b"
    assert plain_to_markup("ask @lee") == "ask \\@lee"


def test_form_questions_keep_their_ids() -> None:
    questions = [
        {"id": "q1", "prompt": "Pick one", "options": [{"id": "o1", "text": "Right", "isCorrect": True}, {"id": "o2", "text": "Wrong", "isCorrect": False}]},
        {"id": "q2", "prompt": "Pick *two*", "options": [{"text": "A", "isCorrect": True}, {"text": "B", "isCorrect": True}, {"text": "C"}]},
        {"id": "bad id!", "prompt": "", "options": []},
    ]
    assert questions_to_markup(questions) == "????#q1 Pick one\n?! Right\n?? Wrong\n\n????#q2 Pick \\*two\\*\n??! A\n??! B\n??? C\n\n???? Question"


def test_extra_assessments_are_merged_into_the_first() -> None:
    assert merge_assessments("", [("Quiz 2", "More.", ""), ("Quiz 3", "", "????#q9 Why?\n? because")]) == "##### Quiz 2\n\nMore.\n\n##### Quiz 3\n\n????#q9 Why?\n? because"
    assert merge_assessments("own", []) == "own"


def test_markers_are_listed_longest_first_in_each_family() -> None:
    for family in "#>?":
        run = [m for m in MARKERS if m[0] == family and set(m) == {family}]
        assert run == sorted(run, key=len, reverse=True)
