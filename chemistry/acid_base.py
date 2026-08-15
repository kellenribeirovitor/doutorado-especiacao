"""Regras específicas do equilíbrio ácido-base ideal."""

from __future__ import annotations

import math

from data.database import normalize_text


def validate_acid_base_database(database: dict) -> dict:
    """Confirma a representação de H+, OH- e da autoionização da água."""
    proton_components = [
        row
        for row in database["components"]
        if row["balance_mode"] == "electroneutrality"
    ]
    if len(proton_components) != 1:
        raise ValueError(
            "A base ácido-base deve ter exatamente um componente de eletroneutralidade."
        )
    proton_component = proton_components[0]
    if normalize_text(proton_component["formula"]) != "h+":
        raise ValueError("O componente de eletroneutralidade deve ser H+.")
    if not math.isclose(proton_component["charge"], 1.0, abs_tol=1e-12):
        raise ValueError("O componente H+ deve ter carga +1.")

    hydrogen_species = [
        row for row in database["species"] if normalize_text(row["formula"]) == "h+"
    ]
    hydroxide_species = [
        row for row in database["species"] if normalize_text(row["formula"]) == "oh-"
    ]
    if len(hydrogen_species) != 1 or len(hydroxide_species) != 1:
        raise ValueError("A base deve conter exatamente uma espécie H+ e uma espécie OH-.")

    hydrogen = hydrogen_species[0]
    hydroxide = hydroxide_species[0]
    proton_id = proton_component["component_id"]
    if database["composition"][hydrogen["species_id"]] != {proton_id: 1.0}:
        raise ValueError("A composição de H+ deve ser 1 × componente próton.")
    if database["composition"][hydroxide["species_id"]] != {proton_id: -1.0}:
        raise ValueError("A composição de OH- deve ser -1 × componente próton.")
    if hydroxide["log_beta"] >= 0:
        raise ValueError("A espécie OH- deve armazenar log_beta = log10(Kw) < 0.")

    proton_id = proton_component["component_id"]
    mass_component_ids = {
        row["component_id"]
        for row in database["components"]
        if row["balance_mode"] == "mass_balance"
    }
    proton_only_species = {
        hydrogen["species_id"],
        hydroxide["species_id"],
    }
    for species in database["species"]:
        composition = database["composition"][species["species_id"]]
        mass_dependencies = set(composition) & mass_component_ids
        if len(mass_dependencies) > 1:
            raise ValueError(
                "Uma espécie do modelo ácido-base ideal não pode combinar mais de "
                f"um componente conservado: {species['species_id']}."
            )
        if not mass_dependencies and species["species_id"] not in proton_only_species:
            raise ValueError(
                "Espécie sem componente conservado não reconhecida no modelo ácido-base: "
                f"{species['species_id']}."
            )
        for component_id in mass_dependencies:
            if not math.isclose(
                composition[component_id], 1.0, rel_tol=0.0, abs_tol=1e-12
            ):
                raise ValueError(
                    "A composição ácido-base deve usar uma unidade do componente "
                    f"conservado em {species['species_id']}."
                )
        proton_coefficient = composition.get(proton_id, 0.0)
        if not math.isclose(
            proton_coefficient, round(proton_coefficient), rel_tol=0.0, abs_tol=1e-12
        ):
            raise ValueError(
                "O coeficiente de H+ deve ser inteiro no modelo ácido-base: "
                f"{species['species_id']}."
            )

    return {
        "proton_component_id": proton_id,
        "hydrogen_species_id": hydrogen["species_id"],
        "hydroxide_species_id": hydroxide["species_id"],
        "log_kw": hydroxide["log_beta"],
        "kw": 10.0 ** hydroxide["log_beta"],
    }


def calculate_ph(database: dict, concentrations: dict[str, float]) -> float:
    acid_base = validate_acid_base_database(database)
    hydrogen = concentrations.get(acid_base["hydrogen_species_id"])
    if hydrogen is None or hydrogen <= 0:
        raise ValueError("Concentração de H+ ausente ou não positiva.")
    return -math.log10(hydrogen)


def acid_base_diagnostics(database: dict, concentrations: dict[str, float]) -> dict:
    acid_base = validate_acid_base_database(database)
    hydrogen = concentrations[acid_base["hydrogen_species_id"]]
    hydroxide = concentrations[acid_base["hydroxide_species_id"]]
    calculated_kw = hydrogen * hydroxide
    return {
        "pH": -math.log10(hydrogen),
        "hydrogen_concentration": hydrogen,
        "hydroxide_concentration": hydroxide,
        "expected_kw": acid_base["kw"],
        "calculated_kw": calculated_kw,
        "kw_error": calculated_kw - acid_base["kw"],
    }
