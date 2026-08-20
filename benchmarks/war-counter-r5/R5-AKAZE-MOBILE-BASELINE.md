# R5 — Baseline AKAZE mobile validée

Date de validation : 2026-08-20

## Périmètre

Baseline issue du laboratoire `war-counter-lab.html`, exécutée sur iPhone avec le runtime OpenCV.js minimal single-file et le Web Worker AKAZE.

- 5 captures réelles de guerre
- 50 slots/personnages validés manuellement
- 450 références locales
- 93 263 descripteurs AKAZE
- 0 appel Groq

La vérité terrain source est versionnée dans :

`docs/data/war-counter-vision/akaze-r5-validation-baseline-2026-08-20.json`

Chaque capture est identifiée par son SHA-256 afin que le corpus reste reproductible indépendamment du nom de fichier.

## Résultats observés

- Top 1 : **50/50 (100 %) **
- Top 3 : **50/50 (100 %) **
- Top 5 : **50/50 (100 %) **
- Top 10 : **50/50 (100 %) **
- Rang moyen : **1,00**
- Portraits barrés : **41/41 Top 1 (100 %) **
- Portraits non barrés : **9/9 Top 1 (100 %) **

Temps mesuré pour les 5 captures :

- calcul AKAZE + matching : **17 996 ms**
- total UI : **18 205 ms**
- moyenne : environ **3,64 s par capture de 10 slots**

## Statut

Cette baseline devient la référence de non-régression R5 pour le moteur AKAZE local. Toute future optimisation du matching, du crop, des descripteurs ou du runtime doit conserver les 50 vérités terrain et être comparée à ce corpus avant validation.

Le score de 100 % sur ce corpus ne constitue pas une garantie de 100 % sur toutes les captures possibles. La suite du chantier doit chercher volontairement des cas d'échec sur des captures indépendantes supplémentaires.
