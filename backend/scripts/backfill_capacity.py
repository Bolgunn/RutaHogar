"""Retired historical-capacity backfill.

ALG-9 snapshots are evaluation-specific. Reconstructing them now would relabel
history with today's market inputs, so this command never reads or writes rows.
"""

import argparse
import sys

CLAVES_CAPACIDAD = ()


class FilaIncomprensible(Exception):
    pass


def procesar_fila(_financial_data):
    raise FilaIncomprensible("El backfill histórico está deshabilitado por la inmutabilidad de snapshots.")


def main():
    parser = argparse.ArgumentParser(description="Backfill histórico deshabilitado.")
    parser.add_argument("--apply", action="store_true", help="Siempre falla; no se mutan evaluaciones históricas.")
    parser.parse_args()
    sys.exit("El backfill histórico está deshabilitado: cree una nueva evaluación con un snapshot persistido.")


if __name__ == "__main__":
    main()
