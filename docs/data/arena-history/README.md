# Historique Arène — archive permanente commune

## Collecte et publication

Cloudflare démarre chaque campagne quotidienne à **16:01 UTC**, toute l’année.
La date de campagne et les fenêtres de reprise sont en UTC et ne dépendent pas
du fuseau français. La collecte réutilise les reçus Arène privés R2 existants;
elle ne relance pas Scopely pour l’archivage.

Dès que tous les reçus des alliances actuellement approuvées sont valides,
le Worker déclenche `.github/workflows/snapshot-arena.yml`. Une alliance
manquante maintient la campagne incomplète. Les déclenchements et la publication
sont idempotents. Le workflow valide la fraîcheur, la complétude et la provenance
avant d’écrire. Les erreurs temporaires de lecture et de push sont réessayées.

La route d’export Cloudflare ne publie que des identifiants joueur pseudonymisés,
les pseudos, les alliances, les rangs, les dates et la provenance. Elle n’exporte
ni reçus privés complets, ni jetons, ni roster, ni profils.

## Archives permanentes

- `index.json` référence chaque date.
- `snapshots/YYYY-MM-DD.json` contient le classement du jour.
- Les fichiers sont append-only : un relevé existant n’est ni supprimé ni
  remplacé par une relance.
- LoSP et alliances invitées partagent le même format, la même indexation et
  les mêmes règles de provenance.

À la première publication Cloudflare, les points encore présents dans les
historiques R2 existants sont importés dans l’archive commune en conservant
leurs dates et attributions réelles. Par exemple, un point rétrospectif issu de
la campagne `2026-11-01-am` garde son attribution
`backdated-from-first-next-day-collection`; il n’est pas présenté comme une
collecte Arène de 16:01 UTC. L’ancien workflow quotidien basé sur Infos ne
produit plus de nouveaux relevés.

## WebApp

La page Arène lit l’index et les snapshots GitHub Pages. Elle charge les deux
dates les plus récentes pour afficher le classement et le comparatif, puis
charge l’historique complet par groupes de huit fichiers quand l’utilisateur
ouvre les graphiques. Si le relevé complet du jour est déjà disponible dans
R2 mais que GitHub n’a pas encore publié le fichier, la page l’ajoute en mémoire
et l’écarte automatiquement dès que la même date entre dans l’archive.

La consultation des rangs publiés ne dépend pas d’une session Discord. Les
autorisations existantes des autres données privées restent inchangées.

## Validation locale

```sh
node --test tests/arena-page.test.mjs tests/arena-snapshot.test.mjs tests/arena-permanent-history.test.mjs
node --check scripts/snapshot-arena-cloudflare.mjs
```
