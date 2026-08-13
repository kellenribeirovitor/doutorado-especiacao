"""Executa a especiação ácido-base ideal orientada a componentes."""

from __future__ import annotations

import argparse
from pathlib import Path

from chemistry.acid_base import acid_base_diagnostics, validate_acid_base_database
from data.database import (
    component_totals_from_entries,
    load_database,
    load_selected_components,
)
from equilibrium.system import (
    build_component_system,
    equilibrium_diagnostics,
    initial_log_concentrations,
    system_residuals,
)
from solver.solver import solve_log_system


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATABASE = BASE_DIR / "data" / "base_componentes.xlsx"
DEFAULT_INPUT = BASE_DIR / "data" / "componentes_selecionados.xlsx"


def run_equilibrium(
    database_path: str | Path = DEFAULT_DATABASE,
    input_path: str | Path = DEFAULT_INPUT,
) -> dict:
    database = load_database(database_path)
    validate_acid_base_database(database)
    entries = load_selected_components(input_path)
    component_totals, resolved_entries = component_totals_from_entries(
        database, entries
    )
    problem = build_component_system(database, component_totals)
    initial_values = initial_log_concentrations(problem)
    numerical = solve_log_system(
        lambda values: system_residuals(problem, values),
        initial_values,
    )
    if not numerical["converged"]:
        raise RuntimeError(
            "O solver não convergiu: "
            f"{numerical['iterations']} iterações, "
            f"maior resíduo={numerical['residual_norm']:.3e}."
        )

    diagnostics = equilibrium_diagnostics(problem, numerical["values"])
    acid_base = acid_base_diagnostics(
        database, diagnostics["concentrations"]
    )
    return {
        "database": database,
        "entries": resolved_entries,
        "component_totals": component_totals,
        "problem": problem,
        "numerical": numerical,
        "diagnostics": diagnostics,
        "acid_base": acid_base,
    }


def print_report(result: dict) -> None:
    database = result["database"]
    print("\nMateriais introduzidos:")
    for entry in result["entries"]:
        print(
            f"  {entry['material_id']} | {entry['formula']} | "
            f"{entry['concentration']:.8g} mol/L"
        )

    print("\nTotais dos componentes-base:")
    for component_id in result["problem"]["active_mass_components"]:
        component = database["component_by_id"][component_id]
        total = result["component_totals"][component_id]
        print(f"  {component_id} | {component['formula']} | {total:.8g} mol/L")

    print("\nEspécies aquosas no equilíbrio:")
    concentrations = result["diagnostics"]["concentrations"]
    for species in result["problem"]["selected_species"]:
        value = concentrations[species["species_id"]]
        print(
            f"  {species['species_id']} | {species['formula']:<10} | "
            f"{value:.10e} mol/L"
        )

    acid_base = result["acid_base"]
    diagnostics = result["diagnostics"]
    print(f"\npH = {acid_base['pH']:.6f}")
    print(f"Kw calculado = {acid_base['calculated_kw']:.10e}")
    print(f"Resíduo de carga = {diagnostics['charge_residual']:.3e} mol/L")
    print(
        "Maior resíduo normalizado = "
        f"{diagnostics['max_abs_residual']:.3e}"
    )
    print(
        "Solver = convergiu em "
        f"{result['numerical']['iterations']} iterações"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Especiação ácido-base ideal por componentes-base."
    )
    parser.add_argument(
        "--database",
        type=Path,
        default=DEFAULT_DATABASE,
        help="Caminho para a base Excel orientada a componentes.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help="Caminho para componentes_selecionados.xlsx.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = run_equilibrium(args.database, args.input)
    print_report(result)


if __name__ == "__main__":
    main()
