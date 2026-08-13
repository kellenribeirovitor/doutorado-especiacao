from pathlib import Path
import math
import re
import unittest

from chemistry.acid_base import validate_acid_base_database
from data.database import load_database


ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "data" / "base_componentes.xlsx"


class DatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.database = load_database(DATABASE)

    def test_component_ids_are_three_digit_strings(self):
        ids = [row["component_id"] for row in self.database["components"]]
        self.assertEqual(ids, [f"{number:03d}" for number in range(1, 10)])
        self.assertTrue(all(re.fullmatch(r"\d{3}", item) for item in ids))

    def test_water_autoionization_representation(self):
        acid_base = validate_acid_base_database(self.database)
        hydroxide_id = acid_base["hydroxide_species_id"]
        self.assertEqual(
            self.database["composition"][hydroxide_id],
            {acid_base["proton_component_id"]: -1.0},
        )
        self.assertEqual(acid_base["log_kw"], -14.0)

    def test_formation_constants_match_source_dissociation_constants(self):
        by_formula = {row["formula"]: row for row in self.database["species"]}
        for formula in ("HF", "NH4+", "HSO4-", "CH3COOH"):
            row = by_formula[formula]
            self.assertIsNotNone(row["source_logk"])
            self.assertTrue(
                math.isclose(
                    row["log_beta"],
                    -row["source_logk"],
                    rel_tol=0.0,
                    abs_tol=1e-12,
                )
            )
        self.assertEqual(by_formula["HCit-2"]["log_beta"], 6.396)
        self.assertEqual(by_formula["H2Cit-"]["log_beta"], 4.761 + 6.396)
        self.assertEqual(
            by_formula["H3Cit"]["log_beta"], 3.128 + 4.761 + 6.396
        )


if __name__ == "__main__":
    unittest.main()
