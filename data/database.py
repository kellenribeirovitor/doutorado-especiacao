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
    },
    "composition": {"species_id", "component_id", "coefficient"},
    "materials": {"material_id", "formula", "name", "input_model"},
    "material_composition": {"material_id", "component_id", "coefficient"},
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

    material_composition: dict[str, dict[str, float]] = {}
    for row_number, row in frames["material_composition"].iterrows():
        material_id = _text(row["material_id"])
        component_id = _component_id(row["component_id"])
        coefficient = _number(
            row["coefficient"],
            f"material_composition!coefficient linha {row_number + 2}",
        )
        mapping = material_composition.setdefault(material_id, {})
        if component_id in mapping:
            raise ValueError(
                f"Composição duplicada para material {material_id} e componente {component_id}."
            )
        mapping[component_id] = coefficient

    database = {
        "path": workbook_path,
        "components": components,
        "species": species,
        "composition": composition,
        "materials": materials,
        "material_composition": material_composition,
    }
    _validate_database(database)

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
    material_composition = database["material_composition"]

    component_by_id = _unique_index(components, "component_id", "components")
    species_by_id = _unique_index(species, "species_id", "species")
    material_by_id = _unique_index(materials, "material_id", "materials")

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
        if material_id not in material_composition or not material_composition[material_id]:
            raise ValueError(f"Material sem composição analítica: {material_id}.")
    for material_id, mapping in material_composition.items():
        if material_id not in material_by_id:
            raise ValueError(
                f"material_composition referencia material inexistente: {material_id}."
            )
        for component_id, coefficient in mapping.items():
            if component_id not in mass_component_ids:
                raise ValueError(
                    f"Material {material_id} deve contribuir apenas para componentes com "
                    f"balanço de massa; encontrado {component_id}."
                )
            if coefficient <= 0:
                raise ValueError(
                    f"Coeficiente de material deve ser positivo: {material_id}/{component_id}."
                )


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


def component_totals_from_entries(
    database: dict, entries: list[dict]
) -> tuple[dict[str, float], list[dict]]:
    """Converte materiais introduzidos em totais dos componentes conservados."""
    lookup: dict[str, dict] = {}
    for material in database["materials"]:
        for candidate in (
            material["material_id"],
            material["formula"],
            material["name"],
        ):
            key = normalize_text(candidate)
            previous = lookup.get(key)
            if previous is not None and previous["material_id"] != material["material_id"]:
                raise ValueError(f"Identificador de material ambíguo na base: {candidate!r}.")
            lookup[key] = material

    totals: dict[str, float] = {}
    resolved_entries = []
    missing = []
    for entry in entries:
        query = entry.get("query", entry.get("componente", entry.get("material_id", "")))
        concentration_value = entry.get(
            "concentration", entry.get("concentracao")
        )
        concentration = _number(concentration_value, f"concentração de {query!r}")
        if concentration < 0:
            raise ValueError(f"Concentração negativa para {query!r}: {concentration}.")
        material = lookup.get(normalize_text(query))
        if material is None:
            missing.append(str(query))
            continue
        if concentration > 0:
            for component_id, coefficient in database["material_composition"][
                material["material_id"]
            ].items():
                totals[component_id] = (
                    totals.get(component_id, 0.0) + coefficient * concentration
                )
        resolved_entries.append(
            {
                "query": str(query),
                "material_id": material["material_id"],
                "formula": material["formula"],
                "concentration": concentration,
            }
        )

    if missing:
        raise ValueError(f"Materiais não encontrados na base: {missing}.")
    return totals, resolved_entries
