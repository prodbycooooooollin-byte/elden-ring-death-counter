"""Run with:  py -3 -m unittest discover tests"""

import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest import mock

from tests import fake_save  # noqa: F401  (adds project root to sys.path)
import death_counter as dc
from app.tracker import Tracker


class TrackerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.appdata = root / "appdata"
        self.save = self.appdata / "EldenRing" / "76561198000000001" / "ER0000.sl2"
        self.env = mock.patch.dict(os.environ, {"APPDATA": str(self.appdata)})
        self.env.start()
        self.data = root / "data"
        self.obs = root / "obs"

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def write(self, chars):
        fake_save.write(self.save, chars)
        # make sure the stamp changes even on coarse file systems
        t = time.time() + len(str(chars))
        os.utime(self.save, (t, t))

    def test_parser_reads_fake_save(self):
        self.write({1: ("Tarnished", 12, 3600, 143)})
        data = self.save.read_bytes()
        self.assertEqual(dc.read_deaths(data, 1), 143)

    def test_existing_deaths_count_toward_total_not_session(self):
        self.write({1: ("Tarnished", 12, 3600, 143)})
        tracker = Tracker(self.data, self.obs)
        tracker.poll_save()
        self.assertEqual(tracker.save_path, str(self.save))
        self.assertEqual(tracker.total(), 143)
        self.assertEqual(tracker.session(), 0)
        self.write({1: ("Tarnished", 12, 3700, 145)})
        tracker.poll_save()
        self.assertEqual(tracker.total(), 145)
        self.assertEqual(tracker.session(), 2)
        self.assertEqual((self.obs / "deaths_total.txt").exists(), False)  # written by the run loop
        tracker._flush()
        self.assertEqual((self.obs / "deaths_total.txt").read_text(), "145")

    def test_follows_the_character_being_played(self):
        self.write({1: ("Main", 80, 90000, 500), 2: ("Alt", 10, 2000, 9)})
        tracker = Tracker(self.data, self.obs)
        tracker.poll_save()
        self.assertEqual(tracker.slot, 1)  # most playtime first
        self.write({1: ("Main", 80, 90000, 500), 2: ("Alt", 10, 2100, 10)})
        tracker.poll_save()
        self.assertEqual(tracker.slot, 2)
        self.assertEqual(tracker.total(), 10)
        self.assertEqual(tracker.session(), 0)  # switching characters is not a death
        self.write({1: ("Main", 80, 90000, 500), 2: ("Alt", 10, 2200, 11)})
        tracker.poll_save()
        self.assertEqual(tracker.session(), 1)

    def test_picks_newest_of_several_profiles(self):
        other = self.appdata / "EldenRing" / "76561198000000002" / "ER0000.sl2"
        fake_save.write(other, {1: ("Old", 5, 100, 1)})
        os.utime(other, (1, 1))
        self.write({1: ("New", 5, 100, 7)})
        tracker = Tracker(self.data, self.obs)
        tracker.poll_save()
        self.assertEqual(tracker.save_path, str(self.save))
        self.assertEqual(tracker.total(), 7)

    def test_no_save_searches_and_counts_by_hand(self):
        tracker = Tracker(self.data, self.obs)
        tracker.poll_save()
        self.assertEqual(tracker.status, "searching")
        tracker.apply({"type": "death_add"})
        self.assertEqual((tracker.total(), tracker.session()), (1, 1))

    def test_hand_count_does_not_inflate_a_newly_found_save(self):
        tracker = Tracker(self.data, self.obs)
        tracker.poll_save()
        for _ in range(5):
            tracker.apply({"type": "death_add"})
        self.write({1: ("Tarnished", 12, 3600, 9)})
        tracker.poll_save()
        self.assertEqual(tracker.total(), 9)

    def test_corrupt_save_reports_error_and_keeps_value(self):
        self.write({1: ("Tarnished", 12, 3600, 20)})
        tracker = Tracker(self.data, self.obs)
        tracker.poll_save()
        self.save.write_bytes(b"BND4" + b"\0" * 100)
        tracker.poll_save()
        self.assertEqual(tracker.status, "error")
        self.assertEqual(tracker.total(), 20)


if __name__ == "__main__":
    unittest.main()
