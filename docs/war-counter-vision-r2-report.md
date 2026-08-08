# MSF War Counter Vision — Phase R2

## Décisions
- Le layout `war-result-ultrawide-v1` accepte les ratios réels 2310×583 et 2410×600.
- Les coordonnées R1 ont été vérifiées visuellement sur les deux captures : elles isolent correctement les dix portraits. Elles restent proportionnelles et non liées à un appareil.
- `full_capture` sera la première stratégie benchmarkée. Les variantes `grouped_wide_crops`, `grouped_tight_crops` et `individual_crop` restent disponibles.
- Le catalogue public `docs/data/msf-characters.json` reste la source de vérité. Les alias sont normalisés localement, les hallucinations restent explicitement invalides.
- Le Worker dédié contient le client Groq Vision, mais la route refuse tout appel réel pendant R2 sauf mode mock local explicite.

## Sécurité
- Secret futur : `GROQ_API_KEY`, Worker uniquement.
- Modèle futur configurable : `GROQ_VISION_MODEL`, défaut documenté `qwen/qwen3.6-27b`.
- Aucun appel Gemini ou Groq réel pendant R2.
- Aucun code partagé avec le Worker de débrief.
