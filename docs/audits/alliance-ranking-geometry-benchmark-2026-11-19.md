# Localisateur de lignes — mesure initiale

## Corpus et confidentialité

Le contrôle a utilisé les dix captures de classement transmises dans la conversation, dans leur ordre d’envoi. Chaque image fait 1536 × 710 pixels et montre quatre rangs complets. Les captures et toutes les découpes sont restées dans l’environnement de travail; aucune image, vignette, découpe, puissance, nom d’alliance ou nom de fichier n’est incluse dans le dépôt.

## Méthode

Le module `docs/alliance-ranking-geometry.js` travaille sur les pixels du navigateur. Il ne lit aucun texte.

1. Il mesure la présence de pixels bleus proches des traits de bord, dans une fenêtre horizontale et verticale exprimée en fractions de l’image.
2. Il regroupe les traits horizontaux qui couvrent au moins 64 % de la fenêtre, puis cherche une séquence régulière de quatre rectangles : hauteur comprise entre 11 et 16 % de l’image, séparations entre 0,3 et 1,8 %.
3. Il estime l’étendue horizontale à partir du support des traits retenus. Si cette mesure est incomplète, il utilise une fenêtre de mise en page proportionnelle à l’image.
4. Les trois découpes sont calculées relativement au rectangle de ligne. La zone de nom commence après l’emblème et garde une marge verticale de 4,5 % de la ligne.

La page permet de corriger X, Y, largeur et hauteur par curseurs tactiles. Les prévisualisations sont tirées du canevas source sans les rectangles de diagnostic. L’export JSON ne contient que des coordonnées normalisées, des dimensions et des diagnostics. L’interface ne transmet pas les captures. Le benchmark a été exécuté localement; les fichiers temporaires et planches de contrôle sont hors du dépôt. Le contrat `LoSPAllianceNameCrop` remet plus tard un `Blob` PNG natif au moteur Identité, sans appel OCR ni envoi réseau.

## Résultats sur les dix captures

Les numéros de rang ont été vérifiés visuellement sur les captures; les zones des trois champs ont été inspectées dans des planches temporaires locales. Aucune reconnaissance de texte n’a été exécutée.

| Capture | Rangs attendus | Lignes détectées | Faux positifs | Manquées | Noms tronqués | Emblème/ligne voisine dans le nom |
|---:|:---:|---:|---:|---:|---:|---:|
| 1 | 1–4 | 4/4 | 0 | 0 | 0 | 0 |
| 2 | 5–8 | 4/4 | 0 | 0 | 0 | 0 |
| 3 | 9–12 | 4/4 | 0 | 0 | 0 | 0 |
| 4 | 13–16 | 4/4 | 0 | 0 | 0 | 0 |
| 5 | 17–20 | 4/4 | 0 | 0 | 0 | 0 |
| 6 | 21–24 | 4/4 | 0 | 0 | 0 | 0 |
| 7 | 25–28 | 4/4 | 0 | 0 | 0 | 0 |
| 8 | 29–32 | 4/4 | 0 | 0 | 0 | 0 |
| 9 | 33–36 | 4/4 | 0 | 0 | 0 | 0 |
| 10 | 37–40 | 4/4 | 0 | 0 | 0 | 0 |
| **Total** | **1–40** | **40/40** | **0** | **0** | **0** | **0** |

Selon la capture, deux ou trois groupes de bord supplémentaires ont été écartés comme bandeau fixe ou frontière isolée/partielle. Ils ne produisent pas de rectangle de ligne supplémentaire. La première capture utilise le repli horizontal proportionnel; les neuf autres ont fourni des traits suffisants pour mesurer la largeur du cadre.

## Portée de cette mesure

Le résultat 40/40 décrit uniquement ces dix captures et cette présentation de classement. Des tests synthétiques couvrent les résolutions à 0,5×, 1× et 1,5×; ils ne remplacent pas un corpus réel présentant d’autres mises en page. Safari iOS et Android Chrome ne sont pas disponibles pour un essai sur appareil dans cet environnement. Une évolution de l’interface MSF, du bandeau fixe ou de la mise en page exigera une nouvelle mesure.
