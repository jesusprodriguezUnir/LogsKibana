#!/usr/bin/env python3
"""
run_tests.py — Wrapper de pytest para la skill run-tests.

Uso:
    python .github/skills/run-tests/scripts/run_tests.py [opciones]

Opciones:
    --coverage          Genera reporte de cobertura (requiere pytest-cov)
    --filter <texto>    Filtra tests cuyo nombre de archivo contenga <texto>
    --failfast          Para en el primer fallo (-x en pytest)
    --no-header         Suprime el encabezado de resumen

Ejemplos:
    python .github/skills/run-tests/scripts/run_tests.py
    python .github/skills/run-tests/scripts/run_tests.py --coverage
    python .github/skills/run-tests/scripts/run_tests.py --filter handlers
    python .github/skills/run-tests/scripts/run_tests.py --filter azure_api --failfast
"""

import argparse
import subprocess
import sys
import os
from pathlib import Path

# Directorio raíz del proyecto (4 niveles arriba de este script)
# scripts/ -> run-tests/ -> skills/ -> .github/ -> PROJECT_ROOT
PROJECT_ROOT = Path(__file__).resolve().parents[4]
TESTS_DIR = PROJECT_ROOT / "tests"


def build_pytest_args(args: argparse.Namespace) -> list[str]:
    """Construye la lista de argumentos para pytest."""
    cmd = [sys.executable, "-m", "pytest"]

    # Directorio de tests, con filtro opcional
    if args.filter:
        # Busca archivos que contengan el texto del filtro
        matching = [
            str(f) for f in TESTS_DIR.glob(f"*{args.filter}*.py")
            if not f.name.endswith("_manual.py")
        ]
        if not matching:
            print(f"[run-tests] No se encontraron tests que coincidan con '{args.filter}'")
            print(f"            Buscando en: {TESTS_DIR}")
            sys.exit(1)
        cmd.extend(matching)
    else:
        # Excluye tests manuales de la suite normal
        cmd.extend([
            str(TESTS_DIR),
            "--ignore-glob=*_manual.py",
        ])

    # Verbosidad
    cmd.append("-v")

    # Parar en el primer fallo
    if args.failfast:
        cmd.append("-x")

    # Cobertura
    if args.coverage:
        cmd.extend([
            "--cov=core",
            "--cov=gui",
            "--cov-report=term-missing",
        ])

    return cmd


def print_header(args: argparse.Namespace) -> None:
    if args.no_header:
        return
    print("=" * 60)
    print("  TaskAzureDevops — Suite de Tests")
    print(f"  Proyecto: {PROJECT_ROOT.name}")
    if args.filter:
        print(f"  Filtro:   *{args.filter}*")
    if args.coverage:
        print("  Modo:     con cobertura (core/ + gui/)")
    print("=" * 60)
    print()


def print_summary(returncode: int) -> None:
    print()
    print("=" * 60)
    if returncode == 0:
        print("  RESULTADO: [OK] Todos los tests pasaron")
    else:
        print(f"  RESULTADO: [FAIL] Hay fallos (codigo de salida: {returncode})")
        print()
        print("  Proximos pasos:")
        print("  1. Revisa el traceback arriba para identificar el fallo")
        print("  2. Corre un test concreto: pytest tests/test_X.py::test_fn -v")
        print("  3. Consulta .github/skills/run-tests/references/test-categories.md")
    print("=" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ejecuta la suite de tests de TaskAzureDevops con pytest"
    )
    parser.add_argument(
        "--coverage", action="store_true",
        help="Genera reporte de cobertura (requiere pytest-cov)"
    )
    parser.add_argument(
        "--filter", metavar="TEXTO",
        help="Filtra archivos de test cuyo nombre contenga TEXTO"
    )
    parser.add_argument(
        "--failfast", action="store_true",
        help="Para en el primer fallo (-x)"
    )
    parser.add_argument(
        "--no-header", action="store_true",
        help="Suprime el encabezado de resumen"
    )
    args = parser.parse_args()

    # Cambiar al directorio raíz para que pytest encuentre todo correctamente
    os.chdir(PROJECT_ROOT)

    print_header(args)

    cmd = build_pytest_args(args)

    # Mostrar el comando que se va a ejecutar
    if not args.no_header:
        print(f"$ {' '.join(cmd)}\n")

    result = subprocess.run(cmd)

    print_summary(result.returncode)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
