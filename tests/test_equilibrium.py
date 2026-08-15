from pathlib import Path
import math
import unittest

from chemistry.acid_base import acid_base_diagnostics
from data.database import (
    ChargeBalanceError,
    component_totals_from_entries,
    initial_species_from_entries,
    load_database,
)
from equilibrium.system import (
    build_component_system,
    equilibrium_diagnostics,
    solve_ideal_acid_base,
)
from main import run_equilibrium


ROOT = Path(__file__).resolve().parents[1]
DATABASE_PATH = ROOT / "data" / "base_componentes.xlsx"
INPUT_PATH = ROOT / "data" / "componentes_selecionados.xlsx"


class EquilibriumTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.database = load_database(DATABASE_PATH)

    def solve_entries(self, entries):
        totals, _ = component_totals_from_entries(self.database, entries)
        problem = build_component_system(self.database, totals)
        solution = solve_ideal_acid_base(problem)
        self.assertTrue(solution["converged"], solution)
        diagnostics = equilibrium_diagnostics(problem, solution["values"])
        acid_base = acid_base_diagnostics(
            self.database, diagnostics["concentrations"]
        )
        return problem, solution, diagnostics, acid_base

    def test_selected_acetic_and_citric_acids(self):
        result = run_equilibrium(DATABASE_PATH, INPUT_PATH)
        self.assertAlmostEqual(result["acid_base"]["pH"], 3.033672202678, places=8)
        concentrations = result["diagnostics"]["concentrations"]
        by_formula = {
            species["formula"]: concentrations[species["species_id"]]
            for species in result["problem"]["selected_species"]
        }
        expected = {
            "H+": 9.25396382224830e-4,
            "OH-": 1.08061801321917e-11,
            "CH3COOH": 2.45334018893788e-2,
            "CH3COO-": 4.66598110621172e-4,
            "H3Cit": 5.49494220421956e-4,
            "H2Cit-": 4.42216895684115e-4,
            "HCit-2": 8.28528656842388e-6,
            "Cit-3": 3.59732550546548e-9,
        }
        for formula, value in expected.items():
            self.assertTrue(
                math.isclose(by_formula[formula], value, rel_tol=2e-8, abs_tol=1e-14),
                (formula, by_formula[formula], value),
            )
        self.assertLess(abs(result["diagnostics"]["charge_residual"]), 1e-12)
        self.assertLess(result["diagnostics"]["max_abs_residual"], 1e-9)

    def test_strong_acid_and_strong_base_limits(self):
        _, _, _, acid = self.solve_entries(
            [{"query": "HCl", "concentration": 0.1}]
        )
        self.assertAlmostEqual(acid["pH"], 1.0, places=10)

        _, _, _, base = self.solve_entries(
            [{"query": "NaOH", "concentration": 0.1}]
        )
        self.assertAlmostEqual(base["pH"], 13.0, places=10)

        _, _, _, hydrobromic = self.solve_entries(
            [{"query": "HBr", "concentration": 0.1}]
        )
        self.assertAlmostEqual(hydrobromic["pH"], 1.0, places=10)

    def test_materials_are_normalized_to_formal_species(self):
        initial, _ = initial_species_from_entries(
            self.database,
            [
                {"query": "HF", "concentration": 0.1},
                {"query": "CH3COOH", "concentration": 0.2},
                {"query": "NH3", "concentration": 0.3},
            ],
        )
        expected = {
            "S001": 0.3,
            "S003": 0.1,
            "S012": 0.2,
            "S007": 0.3,
            "S002": 0.3,
        }
        self.assertEqual(set(initial), set(expected))
        for species_id, concentration in expected.items():
            self.assertTrue(
                math.isclose(initial[species_id], concentration, abs_tol=1e-15)
            )

    def test_balanced_direct_species_continue_to_equilibrium(self):
        _, _, diagnostics, acid_base = self.solve_entries(
            [
                {
                    "entry_type": "species",
                    "species_id": "S001",
                    "concentration": 0.1,
                },
                {
                    "entry_type": "species",
                    "species_id": "S005",
                    "concentration": 0.1,
                },
            ]
        )
        self.assertAlmostEqual(acid_base["pH"], 1.0, places=10)
        self.assertLess(abs(diagnostics["charge_residual"]), 1e-12)

    def test_unbalanced_direct_species_are_rejected_with_correction(self):
        with self.assertRaisesRegex(
            ChargeBalanceError,
            "excesso de carga negativa.*monovalente positiva",
        ):
            component_totals_from_entries(
                self.database,
                [
                    {
                        "entry_type": "species",
                        "species_id": "S007",
                        "concentration": 0.1,
                    },
                    {
                        "entry_type": "species",
                        "species_id": "S010",
                        "concentration": 0.1,
                    },
                ],
            )

    def test_equimolar_strong_acid_and_base_return_to_neutrality(self):
        _, _, diagnostics, acid_base = self.solve_entries(
            [
                {"query": "HCl", "concentration": 0.1},
                {"query": "NaOH", "concentration": 0.1},
            ]
        )
        self.assertAlmostEqual(acid_base["pH"], 7.0, places=10)
        self.assertLess(abs(diagnostics["charge_residual"]), 1e-12)

    def test_half_neutralized_acetic_acid_matches_pka(self):
        _, _, _, acid_base = self.solve_entries(
            [
                {"query": "CH3COOH", "concentration": 0.01},
                {"query": "NaOH", "concentration": 0.005},
            ]
        )
        self.assertLess(abs(acid_base["pH"] - 4.754487), 0.005)

    def test_pure_water(self):
        problem, _, diagnostics, acid_base = self.solve_entries([])
        self.assertEqual(problem["active_mass_components"], [])
        self.assertAlmostEqual(acid_base["pH"], 7.0, places=12)
        self.assertLess(abs(diagnostics["charge_residual"]), 1e-15)
        self.assertLess(abs(acid_base["kw_error"]), 1e-25)

    def test_mass_action_mass_balance_charge_and_kw(self):
        problem, _, diagnostics, acid_base = self.solve_entries(
            [{"query": "HF", "concentration": 0.01}]
        )
        concentrations = diagnostics["concentrations"]
        by_formula = {
            species["formula"]: concentrations[species["species_id"]]
            for species in problem["selected_species"]
        }
        beta_hf = 10.0 ** 3.167491
        calculated_beta = by_formula["HF"] / (by_formula["H+"] * by_formula["F-"])
        self.assertTrue(math.isclose(calculated_beta, beta_hf, rel_tol=1e-12))
        self.assertTrue(
            math.isclose(
                by_formula["H+"] * by_formula["OH-"],
                1e-14,
                rel_tol=1e-12,
            )
        )
        self.assertLess(max(abs(v) for v in diagnostics["mass_balance_errors"].values()), 1e-12)
        self.assertLess(abs(diagnostics["charge_residual"]), 1e-12)
        self.assertLess(abs(acid_base["kw_error"]), 1e-25)

    def test_every_supported_input_material_converges(self):
        for material in self.database["materials"]:
            with self.subTest(material=material["formula"]):
                _, solution, diagnostics, acid_base = self.solve_entries(
                    [{"query": material["formula"], "concentration": 0.01}]
                )
                self.assertLess(solution["residual_norm"], 1e-9)
                self.assertLess(abs(diagnostics["charge_residual"]), 1e-9)
                self.assertLess(
                    max(abs(value) for value in diagnostics["mass_balance_errors"].values()),
                    1e-9,
                )
                self.assertLess(abs(acid_base["kw_error"]), 1e-24)

    def test_trace_components_remain_stable_with_concentrated_background(self):
        cases = (
            (("HF", 1e-14), ("HCl", 1.0)),
            (("HF", 1e-4), ("NaCl", 1.0)),
            (("HF", 1e-2), ("H3Cit", 1e-14)),
            (("NH4NO3", 10.0),),
        )
        for case in cases:
            with self.subTest(case=case):
                entries = [
                    {"query": material, "concentration": concentration}
                    for material, concentration in case
                ]
                _, solution, diagnostics, acid_base = self.solve_entries(entries)
                self.assertLess(solution["residual_norm"], 1e-10)
                self.assertLess(abs(diagnostics["charge_residual"]), 1e-9)
                self.assertTrue(math.isfinite(acid_base["pH"]))

    def test_pairwise_materials_converge_across_concentration_scales(self):
        materials = self.database["materials"]
        concentration_pairs = (
            (1e-12, 1.0),
            (1.0, 1e-12),
            (1e-4, 1.0),
        )
        for first_index, first in enumerate(materials):
            for second in materials[first_index + 1:]:
                for first_concentration, second_concentration in concentration_pairs:
                    case = (
                        (first["formula"], first_concentration),
                        (second["formula"], second_concentration),
                    )
                    with self.subTest(case=case):
                        _, solution, _, _ = self.solve_entries(
                            [
                                {
                                    "query": first["material_id"],
                                    "concentration": first_concentration,
                                },
                                {
                                    "query": second["material_id"],
                                    "concentration": second_concentration,
                                },
                            ]
                        )
                        self.assertLess(solution["residual_norm"], 1e-10)

    def test_zero_concentration_is_equivalent_to_no_addition(self):
        _, _, _, acid_base = self.solve_entries(
            [{"query": "HCl", "concentration": 0.0}]
        )
        self.assertAlmostEqual(acid_base["pH"], 7.0, places=12)


if __name__ == "__main__":
    unittest.main()
