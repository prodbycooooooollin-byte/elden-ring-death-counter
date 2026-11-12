import io
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

from tests import fake_save  # noqa: F401  (adds project root to sys.path)
from app import updater


def archive(files, folder="elden-ring-death-counter-9.9.9"):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as bundle:
        for name, text in files.items():
            bundle.writestr(f"{folder}/{name}", text)
    return buffer.getvalue()


class UpdaterTest(unittest.TestCase):
    def test_version_compare(self):
        self.assertGreater(updater.parse("v1.0.10"), updater.parse("1.0.9"))
        self.assertEqual(updater.parse("1.2"), (1, 2, 0))

    def test_apply_replaces_program_and_keeps_user_data(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "app").mkdir()
            (root / "app" / "__main__.py").write_text("old")
            (root / "data").mkdir()
            (root / "data" / "state.json").write_text("mine")
            (root / "assets").mkdir()
            (root / "assets" / "icon.png").write_text("my icon")
            bundle = archive({
                "app/__main__.py": "new",
                "VERSION": "9.9.9",
                "data/state.json": "theirs",
                "assets/icon.png": "their icon",
            })
            with mock.patch.object(updater, "ROOT", root):
                updater.Updater.__new__(updater.Updater)._apply(bundle)
            self.assertEqual((root / "app" / "__main__.py").read_text(), "new")
            self.assertEqual((root / "VERSION").read_text(), "9.9.9")
            self.assertEqual((root / "data" / "state.json").read_text(), "mine")
            self.assertEqual((root / "assets" / "icon.png").read_text(), "my icon")

    def test_apply_rejects_archive_without_app(self):
        with tempfile.TemporaryDirectory() as temp, mock.patch.object(updater, "ROOT", Path(temp)):
            with self.assertRaises(ValueError):
                updater.Updater.__new__(updater.Updater)._apply(archive({"README.md": "x"}))


if __name__ == "__main__":
    unittest.main()
