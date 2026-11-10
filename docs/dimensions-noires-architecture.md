# Classement Dimensions noires (DD9)

Page autonome : `/msf/dimensions-noires.html`. Elle réutilise `LoSPRosterLoader`, `LoSPAlliances` et `LoSPAccess.isAllianceAllowed`; aucun roster invité brut n’est lu directement.

Le catalogue publié `docs/data/msf-characters.json` relie l’identifiant officiel du personnage à sa clé de roster. La convention Annihilus n’est appliquée qu’à un roster autorisé effectivement chargé.

La carte dérive de la réponse archivée `/game/v1/dds/dd_id_insanity_event_card_info_09` (16 salles de combat, grille 5×9 et passages). Les traits de connexion reprennent uniquement la capture ; ils ne sont pas utilisés pour établir des déverrouillages.

Les réponses individuelles `/game/v1/dds/{ddId}/{roomId}` et `nodeReqs` n’étaient pas présentes dans l’archive R2 consultée. Les exigences DD9 restent donc explicitement nulles. Les joueurs sans Annihilus sont indéterminés et sans rang numérique. Aucun score n’est simulé.

Tests : `node --test tests/dd-ranking-engine.test.mjs`.
