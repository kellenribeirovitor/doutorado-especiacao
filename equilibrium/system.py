"""Montagem genérica do sistema de equilíbrio pela base de componentes."""

from __future__ import annotations

import math

import numpy as np


def build_component_system(database: dict, component_totals: dict[str, float]) -> dict:
    """Seleciona espécies diretamente pela composição e monta o problema numérico."""
    proton_components = [
        row
        for row in database["components"]
        if row["balance_mode"] == "electroneutrality"
    ]
    if len(proton_components) != 1:
        raise ValueError(
            "A base deve possuir exatamente um componente resolvido por eletroneutralidade."
        )
    proton_component_id = proton_components[0]["component_id"]

    mass_component_ids = {
        row["component_id"]
        for row in database["components"]
        if row["balance_mode"] == "mass_balance"
    }
    unexpected = set(component_totals) - mass_component_ids
    if unexpected:
        raise ValueError(f"Totais informados para componentes inválidos: {sorted(unexpected)}.")

    active_mass_components = sorted(
        component_id
        for component_id, total in component_totals.items()
        if total > 0
    )
    active_mass_set = set(active_mass_components)

    selected_species = []
    for species in database["species"]:
        species_composition = database["composition"][species["species_id"]]
        conserved_dependencies = set(species_composition) - {proton_component_id}
        if conserved_dependencies:
            include = conserved_dependencies.issubset(active_mass_set)
        else:
            include = proton_component_id in species_composition
        if include:
            selected_species.append(species)

    represented_components = {
        component_id
        for species in selected_species
        for component_id in database["composition"][species["species_id"]]
    }
    missing_components = active_mass_set - represented_components
    if missing_components:
        raise ValueError(
            "Nenhuma espécie representa os componentes ativos: "
            f"{sorted(missing_components)}."
        )

    variable_components = [proton_component_id, *active_mass_components]
    component_index = {
        component_id: index
        for index, component_id in enumerate(variable_components)
    }
    total_scale = max(
        sum(component_totals[component_id] for component_id in active_mass_components),
        1e-7,
    )

    return {
        "database": database,
        "proton_component_id": proton_component_id,
        "active_mass_components": active_mass_components,
        "variable_components": variable_components,
        "component_index": component_index,
        "component_totals": {
            component_id: float(component_totals[component_id])
            for component_id in active_mass_components
        },
        "selected_species": selected_species,
        "charge_scale": total_scale,
    }


def initial_log_concentrations(problem: dict) -> np.ndarray:
    """Gera um chute positivo em log10 das concentrações dos componentes-base."""
    values = []
    for component_id in problem["variable_components"]:
        if component_id == problem["proton_component_id"]:
            concentration = 1e-7
        else:
            concentration = max(problem["component_totals"][component_id], 1e-12)
        values.append(math.log10(concentration))
    return np.asarray(values, dtype=float)


def species_log_concentrations(
    problem: dict, log_component_concentrations: np.ndarray
) -> dict[str, float]:
    """Aplica diretamente log C_s = logβ_s + soma(nu_sj log C_j)."""
    values = np.asarray(log_component_concentrations, dtype=float)
    if values.shape != (len(problem["variable_components"]),):
        raise ValueError(
            "Vetor de componentes com dimensão incompatível: "
            f"{values.shape}, esperado {(len(problem['variable_components']),)}."
        )
    result: dict[str, float] = {}
    for species in problem["selected_species"]:
        log_concentration = species["log_beta"]
        for component_id, coefficient in problem["database"]["composition"][
            species["species_id"]
        ].items():
            log_concentration += (
                coefficient * values[problem["component_index"][component_id]]
            )
        result[species["species_id"]] = float(log_concentration)
    return result


def species_concentrations(
    problem: dict, log_component_concentrations: np.ndarray
) -> dict[str, float]:
    """Calcula todas as concentrações de espécies selecionadas."""
    log_values = species_log_concentrations(problem, log_component_concentrations)
    return {
        species_id: float(10.0 ** np.clip(log_value, -300.0, 100.0))
        for species_id, log_value in log_values.items()
    }


def calculated_component_totals(
    problem: dict, concentrations: dict[str, float]
) -> dict[str, float]:
    """Reconstrói os totais dos componentes conservados a partir das espécies."""
    calculated = {
        component_id: 0.0 for component_id in problem["active_mass_components"]
    }
    for species in problem["selected_species"]:
        species_id = species["species_id"]
        concentration = concentrations[species_id]
        for component_id, coefficient in problem["database"]["composition"][
            species_id
        ].items():
            if component_id in calculated:
                calculated[component_id] += coefficient * concentration
    return calculated


def charge_residual(problem: dict, concentrations: dict[str, float]) -> float:
    """Retorna soma(z_i C_i), que deve ser zero na eletroneutralidade."""
    return float(
        sum(
            species["charge"] * concentrations[species["species_id"]]
            for species in problem["selected_species"]
        )
    )


def system_residuals(
    problem: dict, log_component_concentrations: np.ndarray
) -> np.ndarray:
    """Combina balanços logarítmicos dos componentes e eletroneutralidade."""
    concentrations = species_concentrations(problem, log_component_concentrations)
    calculated_totals = calculated_component_totals(problem, concentrations)
    residuals = []

    for component_id in problem["active_mass_components"]:
        expected = problem["component_totals"][component_id]
        calculated = calculated_totals[component_id]
        if calculated <= 0:
            residuals.append(-300.0)
        else:
            residuals.append(math.log10(calculated / expected))

    residuals.append(charge_residual(problem, concentrations) / problem["charge_scale"])
    return np.asarray(residuals, dtype=float)


def equilibrium_diagnostics(
    problem: dict, log_component_concentrations: np.ndarray
) -> dict:
    concentrations = species_concentrations(problem, log_component_concentrations)
    calculated_totals = calculated_component_totals(problem, concentrations)
    mass_balance_errors = {
        component_id: calculated_totals[component_id]
        - problem["component_totals"][component_id]
        for component_id in problem["active_mass_components"]
    }
    residual_vector = system_residuals(problem, log_component_concentrations)
    return {
        "concentrations": concentrations,
        "calculated_totals": calculated_totals,
        "mass_balance_errors": mass_balance_errors,
        "charge_residual": charge_residual(problem, concentrations),
        "residual_vector": residual_vector,
        "max_abs_residual": float(np.max(np.abs(residual_vector))),
    }


def _log10_sum(log_values: list[float]) -> float:
    """Calcula log10(sum(10**x)) sem estouro ou perda por subfluxo."""
    if not log_values:
        raise ValueError("Uma família ácido-base ficou sem espécies.")
    maximum = max(log_values)
    return maximum + math.log10(
        sum(10.0 ** (value - maximum) for value in log_values)
    )


def _ideal_acid_base_families(problem: dict) -> dict[str, list[tuple[float, float]]]:
    """Agrupa os termos de distribuição de cada componente conservado."""
    proton_id = problem["proton_component_id"]
    active_components = set(problem["active_mass_components"])
    families: dict[str, list[tuple[float, float]]] = {
        component_id: [] for component_id in problem["active_mass_components"]
    }

    for species in problem["selected_species"]:
        composition = problem["database"]["composition"][species["species_id"]]
        mass_dependencies = [
            component_id
            for component_id in composition
            if component_id != proton_id
        ]
        if len(mass_dependencies) > 1:
            raise ValueError(
                "O solver ácido-base ideal não admite espécie formada por mais de "
                f"um componente conservado: {species['species_id']}."
            )
        if not mass_dependencies:
            continue

        component_id = mass_dependencies[0]
        coefficient = composition[component_id]
        if component_id not in active_components:
            continue
        if not math.isclose(coefficient, 1.0, rel_tol=0.0, abs_tol=1e-12):
            raise ValueError(
                "O solver ácido-base ideal exige coeficiente unitário do componente "
                f"conservado em {species['species_id']}."
            )
        families[component_id].append(
            (species["log_beta"], composition.get(proton_id, 0.0))
        )

    missing = [component_id for component_id, terms in families.items() if not terms]
    if missing:
        raise ValueError(
            "Componentes ativos sem família ácido-base: "
            f"{sorted(missing)}."
        )
    return families


def _ideal_acid_base_values(
    problem: dict,
    families: dict[str, list[tuple[float, float]]],
    log_hydrogen: float,
) -> np.ndarray:
    """Obtém as concentrações livres a partir de H+ e dos balanços analíticos."""
    values = [log_hydrogen]
    for component_id in problem["active_mass_components"]:
        log_distribution = _log10_sum(
            [
                log_beta + proton_coefficient * log_hydrogen
                for log_beta, proton_coefficient in families[component_id]
            ]
        )
        values.append(
            math.log10(problem["component_totals"][component_id])
            - log_distribution
        )
    return np.asarray(values, dtype=float)


def solve_ideal_acid_base(
    problem: dict,
    *,
    tolerance: float = 1e-12,
    log_hydrogen_tolerance: float = 1e-12,
    max_iterations: int = 256,
    min_log_hydrogen: float = -100.0,
    max_log_hydrogen: float = 100.0,
) -> dict:
    """Resolve o equilíbrio ideal por bisseção monotônica em log10([H+]).

    Em um sistema exclusivamente ácido-base, cada espécie contém no máximo um
    componente conservado. Fixado H+, o balanço de cada família fornece
    diretamente a concentração do componente livre; resta somente a equação de
    eletroneutralidade. A redução evita a má condição numérica do Newton
    multidimensional quando coexistem componentes em escalas muito diferentes.
    """
    if tolerance <= 0 or not math.isfinite(tolerance):
        raise ValueError("A tolerância deve ser positiva e finita.")
    if log_hydrogen_tolerance <= 0 or not math.isfinite(log_hydrogen_tolerance):
        raise ValueError("A tolerância de log10([H+]) deve ser positiva e finita.")
    if max_iterations <= 0:
        raise ValueError("O número máximo de iterações deve ser positivo.")
    if not min_log_hydrogen < max_log_hydrogen:
        raise ValueError("Os limites de log10([H+]) são inválidos.")

    families = _ideal_acid_base_families(problem)

    def evaluate(log_hydrogen: float) -> tuple[np.ndarray, np.ndarray]:
        values = _ideal_acid_base_values(problem, families, log_hydrogen)
        return values, system_residuals(problem, values)

    lower = float(min_log_hydrogen)
    upper = float(max_log_hydrogen)
    lower_values, lower_residuals = evaluate(lower)
    upper_values, upper_residuals = evaluate(upper)
    lower_charge = float(lower_residuals[-1])
    upper_charge = float(upper_residuals[-1])

    if lower_charge == 0.0:
        residual_norm = float(np.linalg.norm(lower_residuals, ord=np.inf))
        return {
            "converged": residual_norm <= tolerance,
            "values": lower_values,
            "iterations": 0,
            "residuals": lower_residuals,
            "residual_norm": residual_norm,
        }
    if upper_charge == 0.0:
        residual_norm = float(np.linalg.norm(upper_residuals, ord=np.inf))
        return {
            "converged": residual_norm <= tolerance,
            "values": upper_values,
            "iterations": 0,
            "residuals": upper_residuals,
            "residual_norm": residual_norm,
        }
    if lower_charge > 0.0 or upper_charge < 0.0:
        raise ValueError(
            "Não foi possível delimitar a raiz de eletroneutralidade no intervalo "
            f"{min_log_hydrogen:g} ≤ log10([H+]) ≤ {max_log_hydrogen:g}."
        )

    values = lower_values
    residuals = lower_residuals
    for iteration in range(1, max_iterations + 1):
        midpoint = (lower + upper) / 2.0
        values, residuals = evaluate(midpoint)
        residual_norm = float(np.linalg.norm(residuals, ord=np.inf))
        if (
            residual_norm <= tolerance
            and upper - lower <= log_hydrogen_tolerance
        ):
            return {
                "converged": True,
                "values": values,
                "iterations": iteration,
                "residuals": residuals,
                "residual_norm": residual_norm,
            }

        if residuals[-1] > 0.0:
            upper = midpoint
        else:
            lower = midpoint

    return {
        "converged": False,
        "values": values,
        "iterations": max_iterations,
        "residuals": residuals,
        "residual_norm": float(np.linalg.norm(residuals, ord=np.inf)),
    }
