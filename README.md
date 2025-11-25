# Analyste financier – Monorepo

Plateforme complète d'analyse fondamentale :

- **Backend Python (`backend/`)** : récupération Yahoo Finance, calculs de multiples, DCF multi-scénarios (bear/base/bull + Monte Carlo), ratios avancés (ROIC, FCF yield, marges, Piotroski, Z-Score) et API FastAPI (analyses, portefeuille virtuel, alertes).
- **Frontend Next.js (`frontends/web/`)** : interface moderne (React/Tailwind) avec sliders de scénarios, visualisation des métriques avancées, gestion simple du portefeuille et des alertes.

## Structure

```
backend/
  app.py                 # logique principale (analyse, DCF, ratios)
  server/                # FastAPI modulaire (routers + stores)
    app.py               # création de l'application et middlewares
    routes/              # /analyze, /portfolio, /alerts
    settings.py          # configuration (TTL cache, CORS, etc.)
    stores.py            # caches/stores en mémoire
  api.py                 # point d'entrée uvicorn (importe server.app)
  requirements.txt
frontends/
  web/                   # Application Next.js 16
README.md
ROADMAP.md
```

## Mise en place

1. **Créer l'environnement Python**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r backend/requirements.txt
   ```

2. **Démarrer l'API FastAPI**
   ```bash
   uvicorn backend.api:app --reload --host 127.0.0.1 --port 8000
   ```

3. **Installer les dépendances Next.js (facultatif, pour le frontend web)**
   ```bash
   cd frontends/web
   npm install
   ```

## Backend CLI

Exécuter une analyse depuis le terminal :

```bash
curl -X POST http://127.0.0.1:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL", "wacc": 0.08, "terminalGrowth": 0.025}'
```

Le JSON renvoyé contient désormais :

1. `key_data`, `multiples_analysis`, `dcf` (scénario de base).
2. `dcf_scenarios` (bear/base/bull + valeur pondérée) et `monte_carlo`.
3. `advanced_metrics` (ROIC, FCF yield, marge, Piotroski, Z-Score).
4. `scoring`, `verdict_final`, `resume_investisseur`, `recommandation`.

Endpoints supplémentaires :

- `GET/POST/DELETE /portfolio` : gestion d’un petit portefeuille virtuel (store en mémoire côté API).
- `GET/POST/DELETE /alerts` : configuration d’alertes (store en mémoire côté API).

## Frontend Web (Next.js)

```bash
cd frontends/web
npm run dev -- --hostname 127.0.0.1 --port 3002
```

- Route `/api/analyze` → contacte l'API FastAPI (`http://127.0.0.1:8000/analyze`).
- Dashboard moderne : hero CTA, timeline d’analyse, cartes de métriques, table des multiples, scoring radial, bloc DCF, verdict & recommandations, copier le JSON brut.
- Configurez `PYTHON_BIN` si `python3` n’est pas disponible dans le PATH.

## Notes

- Le frontend consomme la même logique (`backend/app.py`). Maintenez vos évolutions dans ce module pour qu’elles se propagent partout.
- Les données sont récupérées via `yfinance`, donc un accès réseau vers Yahoo Finance est nécessaire. En mode offline, fournissez les overrides (prix, EPS, FCF, etc.).
- ROADMAP.md recense les futures idées (données macro/ESG, backtests, stress tests, API publique, etc.).
- Les modules Portefeuille/Alertes sont maintenant persistés sur disque (`./storage/portfolio.json`, `./storage/alerts.json`). Modifiez `ANALYZER_DATA_DIR` pour changer l’emplacement ou montez un volume persistant en production.
