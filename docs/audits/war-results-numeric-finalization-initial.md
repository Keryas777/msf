# War Results Vision — moteur numérique : audit initial (19 novembre 2026)

## Périmètre
Audit de démarrage sur `main`, sans modification de la reconnaissance de production. Les conclusions ci-dessous sont issues des fichiers consultés et de l'historique des PR, non d'une nouvelle campagne OCR.

## Fichiers examinés
- `docs/war-results-vision.html`
- `docs/war-results-digit-reader.js`
- `docs/war-results-trophy-locator-experiment.js`
- `docs/war-results-locator-comparison-store.js`
- `docs/war-results-vision-engine.js`

## État observé
- Le comparateur expose cinq variantes : adaptive, vertical-recovery, vertical-recovery-edge-safe, vertical-recovery-icon-aware, vertical-recovery-combined.
- Marges proposées : 0, 18 et 30 %.
- La page décrit le mode normal comme adaptatif avec reprise verticale à 18 %. Le moteur appelle `locateWithVerticalRecovery` pour les trophées, avec repli sur la zone existante si la segmentation n'est pas nette.
- Le moteur charge Tesseract.js 5.0.0 et son worker depuis jsDelivr.
- La page propose copie JSON, téléchargement et conservation temporaire des mesures A/B.
- Les scores et trophées ont respectivement des longueurs attendues de 6 et 4 chiffres dans le moteur.

## Données historiques à ne pas fusionner
- PR #697 : Tesseract CLI Linux 20/36 contre 27/36 sur 36 trophées ; mesures exploratoires non indépendantes.
- Autre campagne rapportée : 9/18 contre 14/18 ; ne pas additionner.
- PR #700 : cinquième variante combinée, sans certification Safari iOS.

## Points non encore certifiés
- Audit exhaustif des tests, PR ouvertes et rapports.
- Exactitude des scores séparément des trophées sur corpus représentatif.
- Régressions par image/champ/variante/marge.
- Durées et stabilité sur iPhone Safari réel.
- Vérification réelle de la reprise après rechargement.
- Choix d'une variante de production.

## Prochaine étape
Reprendre les tests synthétiques existants, vérifier le stockage et l'export, puis comparer les erreurs sur captures réelles disponibles localement, sans jamais committer images, découpes ou données identifiables. Toute modification du moteur sera motivée par une erreur observée et mesurée.
