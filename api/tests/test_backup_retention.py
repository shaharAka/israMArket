"""Run cleanup against disposable files, never the live backup disk."""
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest


HELPER = Path(__file__).resolve().parents[2] / "deploy/gcp/prune-backups.sh"


class BackupRetentionTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.root = self.folder / "backups"
        self.root.mkdir()

    def completed(self, name, root=None):
        folder = (root or self.root) / name
        folder.mkdir()
        (folder / "SHA256SUMS").write_text("test manifest")
        (folder / "isramarket.db.gz").write_bytes(b"disposable backup")
        return folder

    def prune(self, root=None, prefix="nightly", cutoff="20260903T120000Z", keep="3"):
        return subprocess.run(
            ["bash", "-c", 'set -euo pipefail; source "$1"; prune_local_backups "$2" "$3" "$4" "$5"',
             "backup-test", str(HELPER), str(root or self.root), prefix, cutoff, keep],
            capture_output=True, text=True,
        )

    def test_expires_infrequent_prefixes_and_keeps_three_recent_completed_copies(self):
        old = self.completed("pre-update-20260901T120000Z")
        boundary = self.completed("restore-check-20260903T120000Z")
        other = self.completed("pre-update-20261001T120000Z")
        recent = [self.completed(f"nightly-202609{day:02d}T120000Z") for day in (26, 27, 28, 29)]
        result = self.prune()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(old.exists())
        self.assertFalse(boundary.exists())
        self.assertFalse(recent[0].exists())
        self.assertTrue(other.exists())
        self.assertTrue(all(p.exists() for p in recent[1:]))

    def test_leaves_unfinished_unrelated_and_symlinked_data_untouched(self):
        incomplete = self.root / "nightly-20261001T120000Z"
        incomplete.mkdir()
        (incomplete / "isramarket.db.gz").write_bytes(b"unfinished")
        unrelated = self.completed("important-data")
        outside = self.completed("outside-20260801T120000Z", root=self.folder)
        (self.root / "nightly-20260802T120000Z").symlink_to(outside, target_is_directory=True)
        linked_manifest = self.root / "nightly-20260803T120000Z"
        linked_manifest.mkdir()
        (linked_manifest / "SHA256SUMS").symlink_to(outside / "SHA256SUMS")
        (linked_manifest / "isramarket.db.gz").write_bytes(b"not a completed backup")
        result = self.prune()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(all(p.exists() for p in (incomplete, unrelated, outside, linked_manifest)))
        self.assertTrue((self.root / "nightly-20260802T120000Z").is_symlink())

    def test_expired_partial_snapshot_is_removed_but_unmarked_directory_is_preserved(self):
        partial = self.root / "pre-update-20260801T120000Z"
        partial.mkdir()
        (partial / "isramarket.db").write_bytes(b"interrupted snapshot")
        unmarked = self.root / "pre-update-20260802T120000Z"
        unmarked.mkdir()
        (unmarked / "notes.txt").write_text("unrelated notes")
        result = self.prune()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(partial.exists())
        self.assertTrue(unmarked.exists())

    def test_invalid_parameters_and_symlink_root_do_not_delete(self):
        old = self.completed("nightly-20260801T120000Z")
        self.assertEqual(self.prune(prefix="../elsewhere").returncode, 2)
        self.assertEqual(self.prune(cutoff="").returncode, 2)
        self.assertEqual(self.prune(keep="0").returncode, 2)
        link = self.folder / "linked-root"
        link.symlink_to(self.root, target_is_directory=True)
        self.assertEqual(self.prune(root=link).returncode, 2)
        self.assertTrue(old.exists())
