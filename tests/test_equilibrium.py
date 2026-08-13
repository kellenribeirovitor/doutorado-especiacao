from pathlib import Path
import math
import unittest

from chemistry.acid_base import acid_base_diagnostics
from data.database import component_totals_from_entries, load_database
from equilibrium.system import (
    build_component_system,
    equilibrium_diagnostics,
    initial_log_concentrations,
    system_residuals,
)
from main import run_equilibrium
from solver.solver import solve_log_system


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
        solution = solve_log_system(
            lambda values: system_residuals(problem, values),
            initial_log_concentrations(problem),
        )
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


if __name__ == "__main__":
    unittest.main()
