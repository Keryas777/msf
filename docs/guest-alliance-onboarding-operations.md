# Accueillir une alliance invitée dans la WebApp

Le registre `docs/data/alliances.json` reste la **source de vérité** ; `docs/data/access-groups.json` définit l'accès Discord. Ne jamais ajouter de nouvelles alliances en dur dans les scripts de classement ou de collecte.

## Nouvelle alliance (future)

1. Créer un rôle Discord indépendant et copier son identifiant numérique.
2. Attendre qu'un membre de l'alliance ait connecté Scopely OAuth via `/captain` (pour découvrir l'alliance sur le Roster Service).
3. Depuis `/admin#rosters`, dans « Alliances connectées », utiliser **Préparer la PR WebApp**. Renseigner le nom, la clé, l'ID du rôle et la couleur ; le service déclenche la GitHub Action `register-guest-alliance.yml`. Alternative sans la console admin : exécuter directement cette Action via **Run workflow**.
4. Examiner et fusionner la PR générée : seuls les deux registres sont modifiés. Le pipeline existant redéploie le Worker d'authentification Discord après fusion.
5. Depuis `/admin#rosters`, cliquer **Autoriser la collecte invitée** puis **Associer à la WebApp** si la liaison n'a pas été enregistrée automatiquement. Vérifier la clé dans R2, pas seulement le préremplissage.
6. Vérifier les collectes du Roster Service : rosters partagés (et roster personnel du titulaire OAuth), Infos enrichies, trophées, Guerre/Raid, Arène, Évolution. Les pages lisent les sources invitée signées ; aucune donnée privée d'alliance invitée ne doit être rendue publique en JSON sur GitHub Pages.
7. Pour les associations Discord↔MSF, vérifier/mettre à jour les liens dans l'administration après le premier annuaire disponible.

**Attention :** ni le workflow ni l'OAuth ne déclenchent l'approbation de collecte. Une autorisation invitée est volontaire et la lecture des rosters d'autres membres dépend de `rosterShare`. Les données manquantes ne sont jamais simulées. Le Roster Service n'a pas besoin de nouveaux collecteurs ni d'un nouvel horaire Cron pour chaque alliance.

## Cas Questionable Propriety (QP)

- Nom MSF : **Questionable Propriety**.
- Clé d'alliance et groupe d'accès : `questionable-propriety`.
- Rôle Discord : `1568752859137318963`.
- Couleur affichée et couleur du nom : **`#FFFFFF`**.
- Intégration préparée dans les registres par la PR #545.

**Transfert du titulaire OAuth depuis ENDGAME rouge :** retirer le rôle Discord ENDGAME et ne laisser que QP (les rôles invités de groupes différents sont exclusifs). Lui faire actualiser son alliance dans `/captain/coverage`. Conserver l'approbation ENDGAME rouge si un successeur y maintient une connexion Scopely valide et que sa collecte reste souhaitée.

Ne jamais approuver QP dans R2 avant de disposer d'une session Scopely qui confirme son adhésion réelle.
