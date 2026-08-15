"""Exporta a base Excel e a consulta padrão para a interface estática."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from data.database import load_database


DATABASE_PATH = ROOT / "data" / "base_componentes.xlsx"
WEB_DATA_DIR = ROOT / "web" / "data"


def build_web_database(database_path: str | Path = DATABASE_PATH) -> dict:
    """Converte a base validada em uma estrutura própria para o navegador."""
    database = load_database(database_path)
    return {
        "schemaVersion": 2,
        "components": database["components"],
        "species": database["species"],
        "composition": database["composition"],
        "materials": database["materials"],
        "materialSpecies": database["material_species"],
    }


def write_web_payloads(database_path: str | Path = DATABASE_PATH) -> None:
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = WEB_DATA_DIR / "chemistry-database.json"
    path.write_text(
        json.dumps(build_web_database(database_path), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Gerado: {path.relative_to(ROOT)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Exporta a base química para a interface web.")
    parser.add_argument(
        "--database",
        type=Path,
        default=DATABASE_PATH,
        help="Planilha química validada que será exportada.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    write_web_payloads(args.database)
