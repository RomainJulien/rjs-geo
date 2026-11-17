# ops/

`rjs.py` n'est plus qu'un pont vers le CLI Node `rjs-geo` (`dist/cli.js`), pour les
tâches planifiées qui lancent encore `python3 ops/rjs.py check all --quiet` avec
`RJS_REGISTRY`. Il compile le CLI si besoin puis lui passe la main. Pour tout nouvel
usage, appeler directement `node dist/cli.js …` (voir le README du package).
