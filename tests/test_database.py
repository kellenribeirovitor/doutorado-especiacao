from pathlib import Path
from copy import deepcopy
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
        self.assertEqual(ids, [f"{number:03d}" for number in range(1, len(ids) + 1)])
        self.assertTrue(all(re.fullmatch(r"\d{3}", item) for item in ids))

    def test_priority_polyprotic_families_are_present(self):
        formulas = {row["formula"] for row in self.database["species"]}
        self.assertTrue({"CO3-2", "HCO3-", "H2CO3"} <= formulas)
        self.assertTrue({"PO4-3", "HPO4-2", "H2PO4-", "H3PO4"} <= formulas)

    def test_formal_material_decomposition_is_explicit(self):
        self.assertEqual(
            self.database["material_species"]["M001"],
            {"S001": 1.0, "S003": 1.0},
        )
        self.assertEqual(
            self.database["material_species"]["M009"],
            {"S001": 1.0, "S012": 1.0},
        )
        self.assertEqual(
            self.database["material_species"]["M008"],
            {"S007": 1.0, "S002": 1.0},
        )

    def test_hbr_and_bromide_are_available(self):
        species_formulas = {row["formula"] for row in self.database["species"]}
        material_formulas = {row["formula"] for row in self.database["materials"]}
        self.assertIn("Br-", species_formulas)
        self.assertIn("HBr", material_formulas)

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

    def test_ideal_acid_base_model_rejects_cross_component_species(self):
        invalid = deepcopy(self.database)
        invalid["composition"]["S013"]["006"] = 1.0
        with self.assertRaisesRegex(ValueError, "mais de um componente conservado"):
            validate_acid_base_database(invalid)


if __name__ == "__main__":
    unittest.main()
