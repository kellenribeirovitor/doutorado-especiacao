from itertools import combinations
from pathlib import Path
import math
import unittest

import pandas as pd

from chemistry.acid_base import acid_base_diagnostics
from data.database import component_totals_from_entries, load_database
from equilibrium.system import (
    build_component_system,
    equilibrium_diagnostics,
    solve_ideal_acid_base,
)


ROOT = Path(__file__).resolve().parents[1]
DATABASE_PATH = ROOT / "data" / "base_componentes.xlsx"


class PriorityCaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.database = load_database(DATABASE_PATH)
        cls.cases = pd.read_excel(DATABASE_PATH, sheet_name="test_cases")
        cls.inputs = pd.read_excel(DATABASE_PATH, sheet_name="test_inputs")

    def solve_entries(self, entries):
        totals, _ = component_totals_from_entries(self.database, entries)
        problem = build_component_system(self.database, totals)
        solution = solve_ideal_acid_base(problem)
        self.assertTrue(solution["converged"], solution)
        diagnostics = equilibrium_diagnostics(problem, solution["values"])
        acid_base = acid_base_diagnostics(
            self.database, diagnostics["concentrations"]
        )
        return solution, diagnostics, acid_base

    def entries_for(self, test_id):
        rows = self.inputs[self.inputs["test_id"] == test_id].sort_values(
            "input_order"
        )
        return [
            {
                "query": row.material_id,
                "concentration": float(row.analytical_concentration_mol_l),
            }
            for row in rows.itertuples(index=False)
        ]

    def test_explicit_priority_cases_match_spreadsheet_oracles(self):
        active = self.cases[
            (self.cases["active"] == True)  # noqa: E712 - valor vindo do Excel
            & (self.cases["execution_mode"] == "explicit")
        ]
        self.assertEqual(len(active), 17)

        for case in active.itertuples(index=False):
            with self.subTest(test_id=case.test_id, name=case.name):
                solution, diagnostics, acid_base = self.solve_entries(
                    self.entries_for(case.test_id)
                )
                max_mass_error = max(
                    (abs(value) for value in diagnostics["mass_balance_errors"].values()),
                    default=0.0,
                )
                self.assertLessEqual(solution["residual_norm"], 1e-9)
                self.assertLessEqual(abs(diagnostics["charge_residual"]), 1e-9)
                self.assertLessEqual(max_mass_error, 1e-9)
                self.assertLessEqual(abs(acid_base["kw_error"]), 1e-24)

                tolerance = float(case.absolute_tolerance)
                expected = float(case.expected_value)
                if case.expected_metric == "pH":
                    self.assertLessEqual(abs(acid_base["pH"] - expected), tolerance)
                elif case.expected_metric == "converged_and_balances":
                    self.assertEqual(expected, 1.0)
                elif case.expected_metric == "max_balance_residual":
                    observed = max(
                        abs(diagnostics["charge_residual"]),
                        max_mass_error,
                        abs(acid_base["kw_error"]),
                    )
                    self.assertLessEqual(observed, tolerance)
                else:
                    self.fail(f"Métrica explícita desconhecida: {case.expected_metric}")

    def test_generated_pairwise_priority_case_converges(self):
        generated = self.cases[
            (self.cases["active"] == True)  # noqa: E712 - valor vindo do Excel
            & (self.cases["execution_mode"] == "generated_pairwise")
        ]
        self.assertEqual(generated["test_id"].tolist(), ["T018"])

        concentration_pairs = ((1e-12, 1.0), (1.0, 1e-12), (1e-4, 1.0))
        for first, second in combinations(self.database["materials"], 2):
            for first_concentration, second_concentration in concentration_pairs:
                case = (
                    (first["material_id"], first_concentration),
                    (second["material_id"], second_concentration),
                )
                with self.subTest(case=case):
                    solution, diagnostics, acid_base = self.solve_entries(
                        [
                            {"query": item, "concentration": concentration}
                            for item, concentration in case
                        ]
                    )
                    self.assertLessEqual(solution["residual_norm"], 1e-9)
                    self.assertTrue(math.isfinite(acid_base["pH"]))
                    self.assertLessEqual(abs(diagnostics["charge_residual"]), 1e-9)
