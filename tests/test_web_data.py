from __future__ import annotations

import json
from pathlib import Path
import unittest

from scripts.export_web_data import build_web_database


ROOT = Path(__file__).resolve().parents[1]
WEB_DATA_DIR = ROOT / "web" / "data"


class WebDataTests(unittest.TestCase):
    def test_generated_web_data_matches_excel_sources(self):
        expected_database = build_web_database()
        generated_database = json.loads(
            (WEB_DATA_DIR / "chemistry-database.json").read_text(encoding="utf-8")
        )

        self.assertEqual(generated_database, expected_database)


if __name__ == "__main__":
    unittest.main()
