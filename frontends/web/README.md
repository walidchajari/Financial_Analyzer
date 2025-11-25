# Financial Analyzer – Frontend Next.js

Interface moderne (Next.js 15 + Tailwind) pour piloter l’assistant d’analyse fondamentale exposé via l’API FastAPI (`backend/api.py`).  
Le formulaire alimente `/api/analyze`, une route Next qui proxy vers `http://127.0.0.1:8000/analyze` et restitue le JSON complet (données clés, multiples, DCF, scoring, verdict, recommandation).

## Prérequis

- Node.js 18+ et npm.
- API backend démarrée localement (`uvicorn backend.api:app --host 127.0.0.1 --port 8000`).
- Python 3 + dépendances du backend (`pip install -r backend/requirements.txt`).

## Installation

```bash
cd frontends/web
npm install
```

## Lancement en local

```bash
# depuis frontends/web/
BACKEND_API_BASE=http://127.0.0.1:8000 npm run dev -- --hostname 127.0.0.1 --port 3002
```

Ensuite ouvrez http://127.0.0.1:3002. L’API backend doit être accessible sur `http://127.0.0.1:8000`.

## Utilisation

1. Saisissez un ticker Yahoo Finance (AAPL, MSFT, TSLA, …).
2. Ajustez WACC/croissance terminale (les champs reçoivent des pourcentages – 8 → 8 %).
3. (Optionnel) Fournissez un secteur ou des overrides manuels (prix, EPS, FCF, etc.). Les overrides de taux se font aussi en pourcentage.
4. Cliquez sur « Lancer l’analyse ». Le dashboard affiche :
   - les trois scénarios DCF (bear/base/bull) + pondération personnalisable et Monte Carlo,
   - les ratios avancés (ROIC, FCF yield, marges, Piotroski, Z-Score),
   - la gestion du portefeuille virtuel et des alertes personnalisées.
5. Utilisez le bouton « Copier le JSON brut » pour réexploiter les données côté backend ou BI.

## Fonctionnement interne

- `app/api/analyze/route.ts` sérialise la requête et appelle `process.env.BACKEND_API_BASE` (`/analyze`, `/portfolio`, `/alerts`).
- L’API FastAPI (`backend/api.py`) exécute `run_analysis_pipeline`, met en cache les résultats et expose également le portefeuille/alertes en mémoire.
- Les helpers UI se trouvent dans `app/page.tsx`, `lib/format.ts` et `types/analyzer.ts`.

## Personnalisation

- Ajoutez vos propres champs dans `OVERRIDE_CONFIG` (front) et `ALLOWED_OVERRIDES` (backend) si vous exposez d’autres données.
- Pour déployer, veillez à exécuter la partie Python à proximité du frontend (même machine ou API FastAPI équivalente) et configurez `BACKEND_API_BASE` en conséquence.
