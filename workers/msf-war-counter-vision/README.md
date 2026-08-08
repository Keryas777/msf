# MSF War Counter Vision Worker

Worker Cloudflare dédié au laboratoire visuel War Counter Vision. Il ne partage aucun code avec le système de débrief de guerre.

Phase R1 : route `POST /api/war-counter-vision/analyze`, validation multipart/layout/stratégie et réponse mock stricte uniquement. Aucun appel Groq réel n'est autorisé.

Variables futures : `GROQ_API_KEY` (secret Cloudflare) et `GROQ_VISION_MODEL`, valeur prévue `qwen/qwen3.6-27b`.
