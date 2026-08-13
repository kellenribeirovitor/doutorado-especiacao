"""Exporta a base Excel e a consulta padrão para a interface estática."""

from __future__ import annotations

import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from data.database import load_database


DATABASE_PATH = ROOT / "data" / "base_componentes.xlsx"
WEB_DATA_DIR = ROOT / "web" / "data"


def build_web_database() -> dict:
    """Converte a base validada em uma estrutura própria para o navegador."""
    database = load_database(DATABASE_PATH)
    return {
        "schemaVersion": 1,
        "components": database["components"],
        "species": database["species"],
        "composition": database["composition"],
        "materials": database["materials"],
        "materialComposition": database["material_composition"],
    }


def write_web_payloads() -> None:
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = WEB_DATA_DIR / "chemistry-database.json"
    path.write_text(
        json.dumps(build_web_database(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Gerado: {path.relative_to(ROOT)}")


if __name__ == "__main__":
    write_web_payloads()
