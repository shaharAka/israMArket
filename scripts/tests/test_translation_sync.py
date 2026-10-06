"""Offline checks for translation reuse, failure guards and partial staging."""
import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


sync = module("translation_sync", "sync-translations.py")
commit = module("translation_commit", "translation-commit.py")


def entry(text):
    mid = "m_" + hashlib.sha256(text.encode()).hexdigest()[:16]
    return mid, {"source": text, "language": "he", "references": [{"file": "web/components/Card.tsx", "line": 1, "kind": "literal"}]}


class SyncTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.destination = self.root / "web/lib/i18n/messages"
        self.destination.mkdir(parents=True)
        self.source_file = self.destination.parent / "source.json"

    def catalogs(self, data):
        for language in sync.LOCALES:
            (self.destination / f"{language}.json").write_text(json.dumps(data))

    def extractor(self, source):
        def run(*args, **kwargs):
            self.source_file.write_text(json.dumps(source, ensure_ascii=False))
            return subprocess.CompletedProcess(args, 0)
        return mock.patch.object(sync.subprocess, "run", side_effect=run)

    def test_reviewed_copy_is_reused_without_a_provider_call(self):
        mid, value = entry("העסק")
        self.catalogs({mid: "Reviewed copy"})
        with self.extractor({mid: value}), mock.patch.object(sync, "read_key") as key, mock.patch.object(sync, "translate") as translate:
            self.assertEqual(sync.sync(self.root), 0)
        key.assert_not_called()
        translate.assert_not_called()
        self.assertEqual(json.loads((self.destination / "en.json").read_text()), {mid: "Reviewed copy"})

    def test_only_changed_copy_is_sent_and_deleted_source_is_pruned(self):
        reused, reused_value = entry("העסק")
        deleted, _ = entry("שורה ישנה")
        changed, changed_value = entry("שורה חדשה")
        self.catalogs({reused: "Reviewed copy", deleted: "Old copy"})

        def fake(batch, key):
            self.assertEqual(set(batch), {changed})
            self.assertEqual(key, "unit-test-only")
            return {locale: {changed: "New copy"} for locale in sync.LOCALES}, [], {"prompt_tokens": 1, "completion_tokens": 1, "calls": 1}

        with self.extractor({reused: reused_value, changed: changed_value}), mock.patch.object(sync, "read_key", return_value="unit-test-only"), mock.patch.object(sync, "translate", side_effect=fake) as translate:
            self.assertEqual(sync.sync(self.root), 0)
        translate.assert_called_once()
        for locale in sync.LOCALES:
            self.assertEqual(json.loads((self.destination / f"{locale}.json").read_text()), {reused: "Reviewed copy", changed: "New copy"})

    def test_check_mode_never_loads_a_key_or_calls_a_model(self):
        mid, value = entry("העסק")
        self.catalogs({})
        with self.extractor({mid: value}), mock.patch.object(sync, "read_key") as key, mock.patch.object(sync, "translate") as translate:
            self.assertEqual(sync.sync(self.root, check=True), 1)
        key.assert_not_called()
        translate.assert_not_called()

    def test_large_change_is_guarded_before_credentials_or_calls(self):
        self.catalogs({})
        source = dict(entry(f"העסק {i}") for i in range(301))
        with self.extractor(source), mock.patch.object(sync, "read_key") as key:
            with self.assertRaisesRegex(RuntimeError, "budget"):
                sync.sync(self.root)
        key.assert_not_called()

    def test_numeric_ranges_placeholders_and_urls_are_preserved(self):
        self.assertFalse(sync.invalid("תקציב: 3,000–7,000 ₪", "Budget: 3,000–7,000 ₪"))
        self.assertTrue(sync.invalid("תקציב: 3,000–7,000 ₪", "Budget: 5,000 ₪"))
        self.assertTrue(sync.invalid("לא נמדד {arg_0}", "Not measured"))
        self.assertFalse(sync.invalid("{arg_0} {arg_1}", "{arg_1} {arg_0}"))
        self.assertFalse(sync.invalid("ו-52%", "و52%"))
        self.assertFalse(sync.invalid("לפחות 2 אותיות", "حرفين على الأقل", [{"form": "حرفين", "value": "2"}]))
        self.assertTrue(sync.invalid("לפחות 3 אותיות", "حرفين على الأقل", [{"form": "حرفين", "value": "2"}]))
        self.assertTrue(sync.invalid("https://example.com/path", "https://another.example/path"))
        self.assertTrue(sync.invalid("name@example.invalid", "name@another.invalid"))
        self.assertTrue(sync.invalid("Missing META_MODEL_API_KEY", "Missing a key"))

    def test_possible_credentials_never_reach_a_provider(self):
        mid, value = entry("טקסט " + "sk-" + "a" * 32)
        self.catalogs({})
        with self.extractor({mid: value}), mock.patch.object(sync, "read_key") as key, mock.patch.object(sync, "translate") as translate:
            with self.assertRaisesRegex(RuntimeError, "Possible credential"):
                sync.sync(self.root)
        key.assert_not_called()
        translate.assert_not_called()


class CommitTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for part in ("web/app", "web/components", "web/lib", "api/app"):
            (self.root / part).mkdir(parents=True)
        self.card = self.root / "web/components/Card.tsx"
        self.card.write_text('export const label = "העסק";\n')
        subprocess.run(["node", str(ROOT / "web/scripts/extract-messages.mjs")], env={**sync.os.environ, "ISRAMARKET_I18N_ROOT": str(self.root)}, check=True, capture_output=True)
        mid, _ = entry("העסק")
        folder = self.root / "web/lib/i18n/messages"
        folder.mkdir(exist_ok=True)
        for locale in sync.LOCALES:
            (folder / f"{locale}.json").write_text(json.dumps({mid: "The business"}, indent=2) + "\n")
        self.git("init", "-q")
        self.git("config", "user.name", "Translation test")
        self.git("config", "user.email", "test@example.invalid")
        self.git("add", ".")
        self.git("commit", "-qm", "fixture")
        self.original_run = subprocess.run

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, check=True, capture_output=True, text=True).stdout

    def run_command(self, args, **kwargs):
        # Use the audited sync implementation, with the isolated staged snapshot.
        if len(args) > 1 and str(args[1]).endswith("/scripts/sync-translations.py"):
            args = [args[0], str(ROOT / "scripts/sync-translations.py"), *args[2:]]
        return self.original_run(args, **kwargs)

    def test_unstaged_source_is_not_translated_or_staged(self):
        self.card.write_text('// staged layout edit\nexport const label = "העסק";\n')
        self.git("add", "web/components/Card.tsx")
        self.card.write_text('export const label = "טקסט שלא נבחר לשמירה";\n')
        with mock.patch.object(commit, "ROOT", self.root), mock.patch.object(commit.subprocess, "run", side_effect=self.run_command):
            self.assertEqual(commit.main(), 0)
        self.assertIn("טקסט שלא נבחר", self.card.read_text())
        self.assertIn("העסק", self.git("show", ":web/components/Card.tsx"))
        source = json.loads(self.git("show", ":web/lib/i18n/source.json"))
        self.assertEqual({value["source"] for value in source.values()}, {"העסק"})
        self.assertEqual(next(iter(source.values()))["references"][0]["line"], 2)

    def test_unstaged_reviewed_translations_are_preserved(self):
        self.card.write_text('// staged edit\nexport const label = "העסק";\n')
        self.git("add", "web/components/Card.tsx")
        catalog = self.root / "web/lib/i18n/messages/en.json"
        catalog.write_text("Unstaged review draft")
        with mock.patch.object(commit, "ROOT", self.root):
            self.assertEqual(commit.main(), 1)
        self.assertEqual(catalog.read_text(), "Unstaged review draft")

    def test_english_display_templates_are_copy_but_css_and_codes_are_not(self):
        self.card.write_text('export function Card() { return <p className={`space-x-${size}`}>{`Next ${count} steps`}{`${a}${b}`}</p>; }\n')
        api = self.root / "api/app/example.py"
        api.write_text('PROMPT = "תן הוראות בעברית"\ndef run():\n    raise ValueError("Invalid selection", code="invalid_selection")\n')
        subprocess.run(["node", str(ROOT / "web/scripts/extract-messages.mjs")], env={**sync.os.environ, "ISRAMARKET_I18N_ROOT": str(self.root)}, check=True, capture_output=True)
        source = json.loads((self.root / "web/lib/i18n/source.json").read_text())
        self.assertEqual({value["source"] for value in source.values()}, {"Next {arg_0} steps", "Invalid selection"})


if __name__ == "__main__":
    unittest.main()
