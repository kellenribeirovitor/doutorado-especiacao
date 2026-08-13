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
