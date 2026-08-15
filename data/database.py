"""Leitura e validação da base química orientada a componentes."""

from __future__ import annotations

from pathlib import Path
import math
import re
import unicodedata

import pandas as pd


REQUIRED_SHEETS = {
    "components": {
        "component_id",
        "species_id",
        "formula",
        "name",
        "charge",
        "balance_mode",
    },
    "species": {
        "species_id",
        "formula",
        "name",
        "charge",
        "log_beta",
        "constant_convention",
        "source_equilibrium",
    },
    "composition": {"species_id", "component_id", "coefficient"},
    "materials": {"material_id", "formula", "name", "input_model"},
    "material_species": {"material_id", "species_id", "coefficient"},
}


def normalize_text(value: object) -> str:
    """Normaliza texto para comparação sem alterar o texto armazenado."""
    if value is None or pd.isna(value):
        return ""
    text = unicodedata.normalize("NFKC", str(value)).strip().casefold()
    return " ".join(text.split())


def _text(value: object) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def _component_id(value: object) -> str:
    raw = _text(value)
    if re.fullmatch(r"\d+(?:\.0+)?", raw):
        return f"{int(float(raw)):03d}"
    return raw


def _number(value: object, label: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Valor numérico inválido em {label}: {value!r}.") from exc
    if not math.isfinite(number):
        raise ValueError(f"Valor não finito em {label}: {value!r}.")
    return number


def _optional_number(value: object, label: str) -> float | None:
    if value is None or pd.isna(value) or _text(value) == "":
        return None
    return _number(value, label)


def _read_sheet(path: Path, sheet_name: str) -> pd.DataFrame:
    frame = pd.read_excel(path, sheet_name=sheet_name)
    frame.columns = frame.columns.astype(str).str.strip().str.lower()
    missing = REQUIRED_SHEETS[sheet_name] - set(frame.columns)
    if missing:
        raise ValueError(
            f"Aba {sheet_name!r} sem colunas obrigatórias: {sorted(missing)}."
        )
    return frame


def load_database(path: str | Path) -> dict:
    """Carrega a planilha em estruturas simples e valida invariantes químicas."""
    workbook_path = Path(path).resolve()
    if not workbook_path.is_file():
        raise FileNotFoundError(f"Base de dados não encontrada: {workbook_path}")

    frames = {
        sheet_name: _read_sheet(workbook_path, sheet_name)
        for sheet_name in REQUIRED_SHEETS
    }

    components = []
    for row_number, row in frames["components"].iterrows():
        components.append(
            {
                "component_id": _component_id(row["component_id"]),
                "species_id": _text(row["species_id"]),
                "formula": _text(row["formula"]),
                "name": _text(row["name"]),
                "charge": _number(row["charge"], f"components!charge linha {row_number + 2}"),
                "balance_mode": _text(row["balance_mode"]),
                "notes": _text(row.get("notes")),
            }
        )

    species = []
    for row_number, row in frames["species"].iterrows():
        species.append(
            {
                "species_id": _text(row["species_id"]),
                "formula": _text(row["formula"]),
                "name": _text(row["name"]),
                "charge": _number(row["charge"], f"species!charge linha {row_number + 2}"),
                "log_beta": _number(row["log_beta"], f"species!log_beta linha {row_number + 2}"),
                "constant_convention": _text(row.get("constant_convention")),
                "source_equilibrium": _text(row.get("source_equilibrium")),
                "source_logk": _optional_number(
                    row.get("source_logk"), f"species!source_logk linha {row_number + 2}"
                ),
                "notes": _text(row.get("notes")),
            }
        )

    composition: dict[str, dict[str, float]] = {}
    for row_number, row in frames["composition"].iterrows():
        species_id = _text(row["species_id"])
        component_id = _component_id(row["component_id"])
        coefficient = _number(
            row["coefficient"], f"composition!coefficient linha {row_number + 2}"
        )
        species_composition = composition.setdefault(species_id, {})
        if component_id in species_composition:
            raise ValueError(
                f"Composição duplicada para espécie {species_id} e componente {component_id}."
            )
        species_composition[component_id] = coefficient

    materials = []
    for row in frames["materials"].to_dict(orient="records"):
        materials.append(
            {
                "material_id": _text(row["material_id"]),
                "formula": _text(row["formula"]),
                "name": _text(row["name"]),
                "input_model": _text(row["input_model"]),
                "notes": _text(row.get("notes")),
            }
        )

    material_species: dict[str, dict[str, float]] = {}
    for row_number, row in frames["material_species"].iterrows():
        material_id = _text(row["material_id"])
        species_id = _text(row["species_id"])
        coefficient = _number(
            row["coefficient"],
            f"material_species!coefficient linha {row_number + 2}",
        )
        mapping = material_species.setdefault(material_id, {})
        if species_id in mapping:
            raise ValueError(
                f"Decomposição duplicada para material {material_id} e espécie {species_id}."
            )
        mapping[species_id] = coefficient

    database = {
        "path": workbook_path,
        "components": components,
        "species": species,
        "composition": composition,
        "materials": materials,
        "material_species": material_species,
    }
    _validate_database(database)

    database["material_composition"] = _derive_material_composition(database)

    database["component_by_id"] = {
        item["component_id"]: item for item in components
    }
    database["species_by_id"] = {item["species_id"]: item for item in species}
    database["material_by_id"] = {
        item["material_id"]: item for item in materials
    }
    return database


def _unique_index(rows: list[dict], key: str, label: str) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for row in rows:
        value = row[key]
        if not value:
            raise ValueError(f"{label} contém {key} vazio.")
        if value in index:
            raise ValueError(f"{label} contém {key} duplicado: {value}.")
        index[value] = row
    return index


def _validate_database(database: dict) -> None:
    components = database["components"]
    species = database["species"]
    materials = database["materials"]
    composition = database["composition"]
    material_species = database["material_species"]

    component_by_id = _unique_index(components, "component_id", "components")
    species_by_id = _unique_index(species, "species_id", "species")
    material_by_id = _unique_index(materials, "material_id", "materials")

    for label, rows in (
        ("components", components),
        ("species", species),
        ("materials", materials),
    ):
        for row in rows:
            if not row["formula"] or not row["name"]:
                raise ValueError(
                    f"{label} contém fórmula ou nome vazio no registro "
                    f"{row.get('component_id', row.get('species_id', row.get('material_id')))}."
                )

    for component_id, component in component_by_id.items():
        if not re.fullmatch(r"\d{3}", component_id):
            raise ValueError(
                f"component_id deve conter três algarismos: {component_id!r}."
            )
        if component["balance_mode"] not in {"mass_balance", "electroneutrality"}:
            raise ValueError(
                f"balance_mode inválido para componente {component_id}: "
                f"{component['balance_mode']!r}."
            )
        if component["species_id"] not in species_by_id:
            raise ValueError(
                f"Componente {component_id} referencia espécie inexistente: "
                f"{component['species_id']}."
            )

    for species_id, species_row in species_by_id.items():
        if species_id not in composition or not composition[species_id]:
            raise ValueError(f"Espécie sem composição: {species_id}.")
        calculated_charge = 0.0
        for component_id, coefficient in composition[species_id].items():
            if component_id not in component_by_id:
                raise ValueError(
                    f"Espécie {species_id} referencia componente inexistente: {component_id}."
                )
            calculated_charge += coefficient * component_by_id[component_id]["charge"]
        if not math.isclose(
            calculated_charge, species_row["charge"], rel_tol=0.0, abs_tol=1e-12
        ):
            raise ValueError(
                f"Carga inconsistente para {species_id}: tabela={species_row['charge']}, "
                f"composição={calculated_charge}."
            )
        if species_row["constant_convention"] != "log10(beta)":
            raise ValueError(
                f"Convenção de constante inválida para {species_id}: "
                f"{species_row['constant_convention']!r}."
            )
        if not species_row["source_equilibrium"]:
            raise ValueError(f"Espécie sem origem da constante: {species_id}.")

    unknown_compositions = set(composition) - set(species_by_id)
    if unknown_compositions:
        raise ValueError(
            "composition referencia espécies inexistentes: "
            f"{sorted(unknown_compositions)}."
        )
    for species_id, mapping in composition.items():
        for component_id, coefficient in mapping.items():
            if math.isclose(coefficient, 0.0, rel_tol=0.0, abs_tol=1e-15):
                raise ValueError(
                    f"Coeficiente nulo em composition: {species_id}/{component_id}."
                )

    for component_id, component in component_by_id.items():
        species_id = component["species_id"]
        if composition[species_id] != {component_id: 1.0}:
            raise ValueError(
                f"A espécie-base {species_id} deve ter composição unitária em {component_id}."
            )
        if not math.isclose(species_by_id[species_id]["log_beta"], 0.0, abs_tol=1e-12):
            raise ValueError(f"A espécie-base {species_id} deve ter log_beta = 0.")

    mass_component_ids = {
        row["component_id"]
        for row in components
        if row["balance_mode"] == "mass_balance"
    }
    for material_id in material_by_id:
        if material_by_id[material_id]["input_model"] not in {
            "analytical_total",
            "complete_dissociation",
        }:
            raise ValueError(
                f"input_model inválido para {material_id}: "
                f"{material_by_id[material_id]['input_model']!r}."
            )
        if material_id not in material_species or not material_species[material_id]:
            raise ValueError(f"Material sem decomposição em espécies: {material_id}.")
    for material_id, mapping in material_species.items():
        if material_id not in material_by_id:
            raise ValueError(
                f"material_species referencia material inexistente: {material_id}."
            )
        material = material_by_id[material_id]
        mapped_charge = 0.0
        for species_id, coefficient in mapping.items():
            if species_id not in species_by_id:
                raise ValueError(
                    f"Material {material_id} referencia espécie inexistente: {species_id}."
                )
            if coefficient <= 0:
                raise ValueError(
                    f"Coeficiente de material deve ser positivo: {material_id}/{species_id}."
                )
            mapped_charge += coefficient * species_by_id[species_id]["charge"]

        is_species_alias = (
            len(mapping) == 1
            and next(iter(mapping.values())) == 1.0
            and normalize_text(material["formula"])
            == normalize_text(species_by_id[next(iter(mapping))]["formula"])
        )
        if not is_species_alias and not math.isclose(
            mapped_charge, 0.0, rel_tol=0.0, abs_tol=1e-12
        ):
            raise ValueError(
                f"Decomposição do material {material_id} não conserva carga: "
                f"soma={mapped_charge:.12g}."
            )

        represented_mass_components = {
            component_id
            for species_id in mapping
            for component_id in composition[species_id]
            if component_id in mass_component_ids
        }
        if not represented_mass_components:
            raise ValueError(
                f"Material {material_id} não contribui para nenhum componente conservado."
            )


def _derive_material_composition(database: dict) -> dict[str, dict[str, float]]:
    """Deriva totais conservados a partir da decomposição formal em espécies."""
    mass_component_ids = {
        row["component_id"]
        for row in database["components"]
        if row["balance_mode"] == "mass_balance"
    }
    derived: dict[str, dict[str, float]] = {}
    for material_id, species_mapping in database["material_species"].items():
        totals: dict[str, float] = {}
        for species_id, material_coefficient in species_mapping.items():
            for component_id, species_coefficient in database["composition"][
                species_id
            ].items():
                if component_id in mass_component_ids:
                    totals[component_id] = totals.get(component_id, 0.0) + (
                        material_coefficient * species_coefficient
                    )
        derived[material_id] = totals
    return derived


def load_selected_components(path: str | Path) -> list[dict]:
    """Lê a entrada do usuário sem modificar a planilha."""
    input_path = Path(path).resolve()
    if not input_path.is_file():
        raise FileNotFoundError(f"Planilha de entrada não encontrada: {input_path}")
    frame = pd.read_excel(input_path)
    frame.columns = frame.columns.astype(str).str.strip().str.lower()
    required = {"componente", "concentracao"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(
            f"Planilha de entrada sem colunas obrigatórias: {sorted(missing)}."
        )

    entries = []
    for row_number, row in frame.iterrows():
        query = _text(row["componente"])
        concentration = _number(
            row["concentracao"], f"entrada!concentracao linha {row_number + 2}"
        )
        if not query:
            raise ValueError(f"Componente vazio na linha {row_number + 2} da entrada.")
        if concentration < 0:
            raise ValueError(
                f"Concentração negativa na linha {row_number + 2}: {concentration}."
            )
        entries.append({"query": query, "concentration": concentration})
    return entries


class ChargeBalanceError(ValueError):
    """Indica que uma entrada direta por espécies não é eletroneutra."""

    def __init__(self, residual: float, tolerance: float):
        self.residual = residual
        self.tolerance = tolerance
        excess = "positiva" if residual > 0 else "negativa"
        needed = "negativa" if residual > 0 else "positiva"
        magnitude = abs(residual)
        super().__init__(
            "A entrada por espécies não satisfaz a eletroneutralidade: "
            f"excesso de carga {excess} de {magnitude:.8g} eq/L. "
            f"Para neutralizar matematicamente, adicione {magnitude:.8g} mol/L "
            f"de uma espécie monovalente {needed}, {magnitude / 2:.8g} mol/L "
            f"de uma espécie divalente {needed}, ou ajuste as concentrações "
            "informadas. Confirme a compatibilidade química da correção."
        )


def _normalized_lookup(rows: list[dict], id_key: str, label: str) -> dict[str, dict]:
    lookup: dict[str, dict] = {}
    for row in rows:
        for candidate in (row[id_key], row["formula"], row["name"]):
            key = normalize_text(candidate)
            previous = lookup.get(key)
            if previous is not None and previous[id_key] != row[id_key]:
                raise ValueError(f"Identificador de {label} ambíguo na base: {candidate!r}.")
            lookup[key] = row
    return lookup


def initial_species_from_entries(
    database: dict, entries: list[dict]
) -> tuple[dict[str, float], list[dict]]:
    """Normaliza materiais ou espécies diretas em concentrações formais de espécies."""
    material_lookup = _normalized_lookup(
        database["materials"], "material_id", "material"
    )
    species_lookup = _normalized_lookup(database["species"], "species_id", "espécie")

    initial_species: dict[str, float] = {}
    resolved_entries: list[dict] = []
    missing: list[str] = []

    for entry in entries:
        raw_type = normalize_text(entry.get("entry_type", entry.get("kind", "")))
        entry_type = (
            "species"
            if raw_type in {"species", "specie", "espécie"}
            or (not raw_type and entry.get("species_id") is not None)
            else "material"
        )
        query = (
            entry.get("species_id", entry.get("query", entry.get("especie", "")))
            if entry_type == "species"
            else entry.get(
                "material_id", entry.get("query", entry.get("componente", ""))
            )
        )
        concentration_value = entry.get("concentration", entry.get("concentracao"))
        concentration = _number(concentration_value, f"concentração de {query!r}")
        if concentration < 0:
            raise ValueError(f"Concentração negativa para {query!r}: {concentration}.")

        if entry_type == "species":
            species = species_lookup.get(normalize_text(query))
            if species is None:
                missing.append(f"espécie {query!r}")
                continue
            mapping = {species["species_id"]: 1.0}
            resolved_entries.append(
                {
                    "entry_type": "species",
                    "query": str(query),
                    "species_id": species["species_id"],
                    "formula": species["formula"],
                    "concentration": concentration,
                    "decomposition": mapping,
                }
            )
        else:
            material = material_lookup.get(normalize_text(query))
            if material is None:
                missing.append(f"material {query!r}")
                continue
            mapping = database["material_species"][material["material_id"]]
            resolved_entries.append(
                {
                    "entry_type": "material",
                    "query": str(query),
                    "material_id": material["material_id"],
                    "formula": material["formula"],
                    "concentration": concentration,
                    "decomposition": dict(mapping),
                }
            )

        if concentration > 0:
            for species_id, coefficient in mapping.items():
                initial_species[species_id] = (
                    initial_species.get(species_id, 0.0)
                    + coefficient * concentration
                )

    if missing:
        raise ValueError(f"Entradas não encontradas na base: {missing}.")
    return initial_species, resolved_entries


def initial_charge_diagnostics(
    database: dict,
    initial_species: dict[str, float],
    *,
    absolute_tolerance: float = 1e-12,
    relative_tolerance: float = 1e-9,
) -> dict:
    """Calcula soma(zᵢCᵢ) e a tolerância da entrada por espécies."""
    residual = 0.0
    scale = 0.0
    for species_id, concentration in initial_species.items():
        species = database["species_by_id"][species_id]
        contribution = species["charge"] * concentration
        residual += contribution
        scale += abs(contribution)
    tolerance = absolute_tolerance + relative_tolerance * scale
    return {
        "residual": residual,
        "scale": scale,
        "tolerance": tolerance,
        "balanced": abs(residual) <= tolerance,
    }


def validate_initial_charge(
    database: dict, initial_species: dict[str, float]
) -> dict:
    diagnostics = initial_charge_diagnostics(database, initial_species)
    if not diagnostics["balanced"]:
        raise ChargeBalanceError(
            diagnostics["residual"], diagnostics["tolerance"]
        )
    return diagnostics


def component_totals_from_initial_species(
    database: dict, initial_species: dict[str, float]
) -> dict[str, float]:
    """Converte o vetor formal de espécies nos totais conservados do solver."""
    totals: dict[str, float] = {}
    for species_id, concentration in initial_species.items():
        for component_id, coefficient in database["composition"][species_id].items():
            if database["component_by_id"][component_id]["balance_mode"] == "mass_balance":
                totals[component_id] = (
                    totals.get(component_id, 0.0) + coefficient * concentration
                )
    return totals


def component_totals_from_entries(
    database: dict, entries: list[dict]
) -> tuple[dict[str, float], list[dict]]:
    """Normaliza a entrada, valida espécies diretas e obtém totais conservados."""
    initial_species, resolved_entries = initial_species_from_entries(database, entries)
    if any(entry["entry_type"] == "species" for entry in resolved_entries):
        validate_initial_charge(database, initial_species)
    totals = component_totals_from_initial_species(database, initial_species)
    return totals, resolved_entries
