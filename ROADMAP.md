# Roadmap fonctionnalités avancées

Ce document recense les grandes idées à implémenter pour transformer l’application en véritable plateforme d’analyse financière intégrée, selon les thèmes évoqués.

## 1. Données & couverture

- **Sources externes** : intégrer des APIs macro (FRED, ECB), sentiment social (Twitter/StockTwits), flux Bloomberg-like ou données fournisseurs ESG.
- **Scores ESG** : calcul des scores agrégés (en normalisant les métriques environnementales, sociales et de gouvernance) + suivi des controverses.
- **Smart Beta & facteurs** : calculer les expositions Value/Growth/Momentum/Quality/Low Vol pour chaque titre/portefeuille.

## 2. Analytique avancée

- **Backtests factoriels** : moteur paramétrable (période, fréquence, contraintes) avec métriques type CAGR, Sharpe, drawdown.
- **Stress tests** : scénarios macro/sectoriels appliqués aux valorisations (DCF) et portefeuilles pour visualiser l’impact.
- **Monte Carlo DCF** : distributions probabilistes des valeurs intrinsèques en tirant croissance, marges et WACC.
- **Corrélations dynamiques** : matrices glissantes et graphes de contagion pour identifier les risques systémiques.

## 3. Productivité & workflow

- **Notes collaboratives** : espace partagé avec versioning, tagging et commentaires sur chaque dossier d’investissement.
- **Alertes multi-canaux** : e-mails, Slack, push mobile avec logs/historique pour chaque signal déclenché.
- **API & connecteurs** : exposer l’analyse via REST/GraphQL + plugins Excel/PowerBI.
- **Génération Slides** : produire automatiquement des présentations PowerPoint/Google Slides à partir du JSON d’analyse.

## 4. Expérience utilisateur

- **Chatbot expert** : Q&A contextuel (“pourquoi PEG > 1 ?”, “quelles hypothèses dans ce DCF ?”).
- **Mode coach** : missions pédagogiques, feedback et progression gamifiée pour accompagner les investisseurs novices.
- **Personnalisation avancée** : thèmes, widgets drag-and-drop, dashboards sauvegardables.
- **Mobile/offline** : PWA ou appli native avec synchronisation différée.

## Suivi

- Prioriser chaque lot en fonction de la valeur client.
- Décomposer en user stories / issues GitHub et estimer la charge.
- Prévoir un backlog technique (sécurité, monitoring, coûts data) pour soutenir ces évolutions.
