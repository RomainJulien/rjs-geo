#!/usr/bin/env python3
"""Pont de compatibilité : l'ancien outil rjs.py est remplacé par le CLI Node (rjs-geo, dist/cli.js).

Les tâches planifiées qui lancent encore `python3 ops/rjs.py <commande> …` (avec RJS_REGISTRY)
continuent de marcher : ce fichier compile le CLI si besoin (npm install) puis lui passe la main.
"""
import os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
CLI = os.path.join(ROOT, "dist", "cli.js")

if not os.path.exists(CLI):
    r = subprocess.run(["npm", "install", "--no-audit", "--no-fund"], cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(CLI):
        sys.exit(f"❌ Compilation du CLI rjs-geo impossible (npm install) : {(r.stderr or r.stdout).strip()[-400:]}")

args = sys.argv[1:]
reg = os.environ.get("RJS_REGISTRY")
if reg and args and "--registry" not in args and args[0] in ("check", "list", "indexnow", "versions", "conseils", "sync", "newkey", "launch", "status"):
    args = [args[0], "--registry", reg] + args[1:]
os.execvp("node", ["node", CLI] + args)
