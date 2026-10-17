"""Conservative health redistribution interpretation; never a combat simulation.

Reviewed signatures are corroborated by official ability descriptions in
docs/audits/health-redistribute-deep-audit-10.5.0.md. Confirmed results describe
only the behavior family. No formula, implicit multiplier, actor identity or
percentage basis is inferred. The separately fingerprinted Oath 10.6.3 variant
is documented in docs/audits/health-redistribute-deep-audit-10.6.3.md; its
resource version remains explicitly unverified.
"""
from __future__ import annotations

import copy
import json
from typing import Any

REVIEWED_SIGNATURES = {'/Data/Apocalypse/special/actions/5': {'drain_pct': 100,
                                        'from': {'limit': 10,
                                                 'relation': 'ally',
                                                 'type': 'random'}},
 '/Data/Kahhori/special/actions/7': {'drain_pct': 100,
                                     'from': {'filter': {'traits': {'has_any': ['AbsoluteAForce']}},
                                              'limit': 10,
                                              'relation': 'ally',
                                              'type': 'random'}},
 '/Data/LokiTeen/ultimate/actions/1': {'drain_pct': 100,
                                       'target': {'relation': 'ally'},
                                       'from': {'filter': {'traits': {'has_any': ['Bifrost']}},
                                                'limit': 10,
                                                'relation': 'ally',
                                                'type': 'random'}},
 '/Data/Mantis/ultimate/actions/0': {'drain_pct': 100,
                                     'from': {'filter': {'not': {'target': {'states': ['Spawned']}}},
                                              'limit': 2,
                                              'primary_selection': 'include_as_target',
                                              'relation': 'ally',
                                              'type': 'by_least_health'}},
 '/Data/MrSinister/passive/2/actions/0': {'drain_pct': 10,
                                          'from': {'relation': 'ally'},
                                          'to': {'attacker_as_primary': False,
                                                 'filter': {'traits': {'has_any': ['Marauders']}},
                                                 'primary_selection': 'exclude_from_pool',
                                                 'relation': 'ally'}},
 '/Data/Phoenix/special/actions/2': {'drain_pct': [25],
                                     'target': {'type': 'primary'},
                                     'from': {'relation': 'ally'},
                                     'to': {'limit': 10,
                                            'primary_selection': 'exclude_from_pool',
                                            'relation': 'ally',
                                            'type': 'random'}},
 '/Data/PvE_DDInvisibleWoman/special/actions/0': {'drain_pct': 100,
                                                  'from': {'limit': 10,
                                                           'relation': 'ally',
                                                           'type': 'random'}},
 '/Data/Ronin/passive/2/actions/2': {'drain_pct': 100,
                                     'from': {'filter': {'or': [{'character': ['BlackWidow']},
                                                                {'character': ['Ronin']}]},
                                              'limit': 10,
                                              'relation': 'ally',
                                              'type': 'random'}},
 '/Data/ScarletWitch/special/actions/4': {'drain_pct': 100,
                                          'from': {'limit': 10,
                                                   'relation': 'ally',
                                                   'type': 'random'}},
 '/Data/SymbioteQuicksilver/passive/2/actions/1': {'drain_pct': 100,
                                                   'target': {},
                                                   'from': {'limit': 10,
                                                            'relation': 'ally',
                                                            'type': 'random'}}}

# Exact 10.5.0 source signatures whose French ability text explicitly says that
# life is stolen and returned/redistributed. These mappings establish only that
# behavior family; percentage basis, cap application, actor accounting, and order
# of operations remain unresolved. Any raw-action change fails closed.
REVIEWED_OFFICIAL_TEXT_SIGNATURES = {
    "/Data/Blade/ultimate/actions/2": {
        "sha256": "79e18a2d17874a01096fd14e3c637ca583ce3c402e06f0a8f27561ca9422965d",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Blastaar/special/actions/1": {
        "sha256": "b438d8fc7c099bf045796e1ac9e1292fa4ec4593eafe3fba836b28fa93bb3c35",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Cloak/passive/0/actions/0": {
        "sha256": "9ca791c38c6018f1b927c3ce5bf90a86d5aae839db62a7752e91a1a5853f932c",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Cloak/passive/0/actions/1": {
        "sha256": "9b60af7c8d6d3989c491cc00ec288e31331ae8597f6ff9f748dfd268bc530807",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Cloak/passive/0/actions/2": {
        "sha256": "941a2cfd1c82721917718f636a5f4faa9e06659856f3bb1afc4d42416f3bccde",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Cloak/passive/0/actions/3": {
        "sha256": "a11d03c5b5064ebdf5b3ec8fff4048033ab14b7e439da8f1a5e3e8a35c974b72",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Darkstar/special/actions/2": {
        "sha256": "b33d71c916d22390c56be17ad3d65e32e0ff3f06a4f76666d80b7148e9de40c5",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Darkstar/special/actions/5": {
        "sha256": "62a047c9a22a42041e382b7f4ad37b253a0f5887320f74b7252d677d7705432e",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Deathpool/special/actions/4": {
        "sha256": "fe106c5a49e669cd77dfc963d17f5b76897c760ed9f0f71a71b4d4b535b6df97",
        "behavior": "health_steal_redistribute"
    },
    "/Data/EbonyMaw/ultimate/actions/0": {
        "sha256": "f695fee18ac2eb5e4c2553b021db7679a8a453d4e9acda8d21ab809d89f558c3",
        "behavior": "health_steal_redistribute"
    },
    "/Data/EbonyMaw/ultimate/actions/2": {
        "sha256": "b0ed625eef757cde44aee4b7a3ed67b3cc1bc053dd8f0f9d42d5da7206927731",
        "behavior": "health_steal_redistribute"
    },
    "/Data/EbonyMaw/ultimate/actions/4": {
        "sha256": "bb6219ad7c1a3d621dd66f29df2961ccea8ef5745fdbe5db41d3ae5492cc10dd",
        "behavior": "health_steal_redistribute"
    },
    "/Data/EbonyMaw/ultimate/actions/6": {
        "sha256": "1f3bd12d1b50b359e967d840ec8fd1c25e3220f86e46b6b3f3090d5d85f465dd",
        "behavior": "health_steal_redistribute"
    },
    "/Data/EbonyMaw/ultimate/actions/8": {
        "sha256": "f578c91f9a8b0496d7a8d0f1b9243549e813e60950961dea706e7681681491d3",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Ghost/ultimate/actions/1": {
        "sha256": "96fa9d3a644013ef1c6b3a557227d2a632dd234469ab69c39b712916e76324a2",
        "behavior": "health_steal_redistribute"
    },
    "/Data/HighEvolutionary/passive/1/actions/1": {
        "sha256": "c346d0543c740f22f4338e9cfb50728a0c6fa5406931c41337785d5b959ebe8f",
        "behavior": "health_steal_redistribute"
    },
    "/Data/MagnetoPhoenixForce/passive/2/actions/0": {
        "sha256": "ec6c5f04bc5b9f9c2f0bfe2a28d580c3db975a6eca3b6b3283d94c0f9c77657e",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Minerva/ultimate/actions/0": {
        "sha256": "b0e35fa02556eded5988dd4c03628bc786f8eb0fa649d6d5ba972e2fa3d783d5",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Minerva/ultimate/actions/1": {
        "sha256": "e418c2547305c0653463003912b51119da9280ba46b105db8fbdba7d008b46db",
        "behavior": "health_steal_redistribute"
    },
    "/Data/MorganLeFay/basic/actions/3": {
        "sha256": "86727f85f78e4b7f142bac9806cf6e81014f51be71e8b60126906f2ddf94e9b4",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Nemesis/basic/actions/1": {
        "sha256": "9ce3080271256cae94328063a5825b18d0d0a74ee9e289c50ad3129fb4fbee55",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Nemesis/special/actions/1": {
        "sha256": "766c2cd6815994f2efabb98d249d0a31d42672a6e116777449c52c5090edb0c2",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Nemesis/ultimate/actions/1": {
        "sha256": "46ef08aefe4e0e38d1ff19bf9871cf55587e237019021d51be6ca70f5c0d1037",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Oath/special/actions/0": {
        "sha256": "13e95c7a2360b9c2737a539cee06f9b5138ff4fad2b0390738ad897eebf20125",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Oath/special/actions/1": {
        "sha256": "b4f3046a27bd4f27cf91d7bb8042a67f0cea20fd3a4acedaf214e36a2fcaf560",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Odin/basic/actions/1": {
        "sha256": "633dc10e66741037988c3e6d6f7adff13da773dc62cf4579facb9d037cfc3774",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Odin/ultimate/actions/4": {
        "sha256": "26b3ce8d37d4837b5bb5f1d2f2944c92455d2de0482e4102d2cab1e50bf675a9",
        "behavior": "health_steal_redistribute"
    },
    "/Data/OmegaRed/basic/actions/1": {
        "sha256": "664293c6aa39064820cbe28122137268ea72b963ac85d73d2b63f3a19c37cbe9",
        "behavior": "health_steal_redistribute"
    },
    "/Data/OmegaRed/passive/0/actions/1": {
        "sha256": "14c3862457eef9d4156b8302abe84decd82f7ef556fbbea1579e85d5412834e4",
        "behavior": "health_steal_redistribute"
    },
    "/Data/OmegaRed/special/actions/4": {
        "sha256": "db7fcb5cf1849f7798a9f438910255ddd6d599dd6c929ccfa35ff8c43e12dcfd",
        "behavior": "health_steal_redistribute"
    },
    "/Data/OmegaRed/ultimate/actions/10": {
        "sha256": "55578b2cbd6d35cdc1fae27e8639122704284d96711eee68155cbc2e900f3034",
        "behavior": "health_steal_redistribute"
    },
    "/Data/OmegaRedPhoenix/passive/2/actions/0": {
        "sha256": "0c8076fef95e9f9ae29c09e9d85cb2b716e099963aaf2169c2b772b48cff7c6e",
        "behavior": "health_steal_redistribute"
    },
    "/Data/OmegaRedPhoenix/ultimate/actions/3": {
        "sha256": "f55aedafc0ce859d8d757480a6bb0b9a43f953282e23a602865286becefd3306",
        "behavior": "health_steal_redistribute"
    },
    "/Data/RavagerSupport_Heal/special/actions/0": {
        "sha256": "f19af235dfd82dc926c8fa453a23fc768ce1044d720fa8e7a932425e2ab30630",
        "behavior": "health_steal_redistribute"
    },
    "/Data/RavagerSupport_Heal/special/actions/3": {
        "sha256": "f19af235dfd82dc926c8fa453a23fc768ce1044d720fa8e7a932425e2ab30630",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Satana/basic/actions/1": {
        "sha256": "cfd6d0b5922194946754a5b6cad91dde1287631253e76bd56536c057be10c225",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Satana/ultimate/actions/0": {
        "sha256": "2f57d94f3f82e0dfcc0aafc430bbd71172c1ebd217feb7ce0e5ef3a9479b2795",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Satana/ultimate/actions/3": {
        "sha256": "f68f4c3a5a501804f3c383552c3701fbe1afca271ac5f694eed093cc3e28ea1c",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Satana/ultimate/actions/6": {
        "sha256": "ebee7a395fd8cb3ae0fc471f52c4a80f580318fef98013c1042fcb4a70d03566",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Satana/ultimate/actions/9": {
        "sha256": "9daaedbe4a442bae8186758e6a5c9ce1584139ed67e2fe5e012e5d26109f7202",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Satana/ultimate/actions/12": {
        "sha256": "c2bd91c41d06c5b2a80af62422969d2b6048654ff7ddca970f58a965a994596f",
        "behavior": "health_steal_redistribute"
    },
    "/Data/ShadowKing/passive/2/actions/2": {
        "sha256": "5438d74aba498b89710fa894b503a73ea27026bde29c14350cfaa14e1153f7c6",
        "behavior": "health_steal_redistribute"
    },
    "/Data/ShadowKing/passive/3/actions/2": {
        "sha256": "5438d74aba498b89710fa894b503a73ea27026bde29c14350cfaa14e1153f7c6",
        "behavior": "health_steal_redistribute"
    },
    "/Data/ShadowKing/passive/5/actions/2": {
        "sha256": "5438d74aba498b89710fa894b503a73ea27026bde29c14350cfaa14e1153f7c6",
        "behavior": "health_steal_redistribute"
    },
    "/Data/SymbioteQuicksilver/basic/actions/1": {
        "sha256": "9fd9d87305ce8aa6fa778f4276c53c8af2752559bc49c1b6f71d8ae0dd2aabd9",
        "behavior": "health_steal_redistribute"
    },
    "/Data/SymbioteQuicksilver/ultimate/actions/4": {
        "sha256": "ebf9548c85b9ee6a4060c6a40f76915248440fca40cf3d3942269e7e4b810874",
        "behavior": "health_steal_redistribute"
    },
    "/Data/SymbioteQuicksilver/ultimate/actions/12": {
        "sha256": "edaf1fe9bb89d43dc6a3f4c22db56f7a89afc62d14b1ea559c11acd0ea560c11",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Thunderstrike/passive/2/actions/1": {
        "sha256": "e7928080931d45079b897df51913a339df4b58dbf1cbd6d510caeedc88d267f8",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Thunderstrike/special/actions/3": {
        "sha256": "23c1aa509c2be1d9daf91013ecdf560bce376fff6137f41a557f4c6bdc4a0ec8",
        "behavior": "health_steal_redistribute"
    },
    "/Data/Thunderstrike/ultimate/actions/5": {
        "sha256": "29a7921a701e49fbace5aa9b114a00ddf3adac0e6875fc16f91bd063c6fa09be",
        "behavior": "health_steal_redistribute"
    }
}

# This 10.5.0 action changed only its mode/count condition in the unverified
# 10.6.3 resource set. The current French ability text still explicitly says
# that life is stolen and redistributed to Oath, so the family-level claim is
# revalidated for this exact raw signature. The engine formula remains unknown.
REVIEWED_OFFICIAL_TEXT_SIGNATURE_VARIANTS = {
    "/Data/Oath/special/actions/0": {
        "sha256": "1364e5130ca4b99d8d2469bfeff4bbbb0c99ba7cc66dbde41e261d48a33d974e",
        "sourceGameVersion": "10_6_3",
        "sourceVersionVerified": False,
        "assertion": "La description FR confirme le vol de vie à la cible principale et sa redistribution à soi.",
    },
}

# Review decision for two unchanged Quasar actions. The official French text
# establishes life steal, while restitution to self is project-owner validated,
# not an observed engine formula or an explicit recipient in the source text.
# Keep separate from the independent drain/lifesteal stat_modifier mechanic.
REVIEWED_USER_VALIDATED_SIGNATURES = {
    "/Data/Quasar/basic/actions/3": {
        "sha256": "b0db01272f5d939b2b38c06cbacf35342a7f39c5c819df09ba4f1f21f50d051a",
        "assertion": "La description officielle confirme le vol de vie sur cible cosmique ; la restitution à Quasar est validée par le responsable du projet, non démontrée par la formule moteur.",
    },
    "/Data/Quasar/passive/4/actions/1": {
        "sha256": "89c5561a46eca13e2288a421c8ff54232e90fecc52bb6001867a741dd3440efb",
        "assertion": "La description officielle confirme le vol de vie sur ennemi Exposé ; la restitution à Quasar est validée par le responsable du projet, non démontrée par la formule moteur.",
    },
}

# English ability descriptions explicitly identify the recipient ("to self").
# Source claims are separately attributed: Scopely for Morbius/Yellowjacket,
# and a published ability-description mirror for Kang. This proves only the
# behavior family and named recipient, not the combat calculation.
REVIEWED_PUBLISHED_SELF_SIGNATURES = {
    "/Data/KangTheConqueror/passive/0/actions/3": {
        "sha256": "1adb175c549658341ca042bdf2e7198e31c3b10d57bcfa2718bbf9a222a55cfd",
        "assertion": "Le texte anglais de Time Warlord précise le vol de 3 % de vie à tous les ennemis et sa redistribution à Kang lui-même.",
        "recipientEvidence": "published_english_ability_description",
        "sourceUrl": "https://www.msfbase.com/characters/KangTheConqueror/",
    },
    "/Data/Morbius/basic/actions/1": {
        "sha256": "fc2904eb821ce0aa7c5382d7299642e70ac2baaa26956c98e6e39b72c177bd88",
        "assertion": "La description anglaise officielle de Sanguine Slash précise le vol de vie conditionné par Saignement et la redistribution à Morbius lui-même.",
        "recipientEvidence": "official_english_ability_description",
        "sourceUrl": "https://marvelstrikeforce.com/en/updates/blog-update-10-13-26",
    },
    "/Data/Yellowjacket/special/actions/0": {
        "sha256": "0d6c0541fc93abea0abd20cc215a94d4570f9a00155614e5771d9163651acce2",
        "assertion": "La description anglaise officielle de Spiteful Sting précise le vol de vie à la cible principale et sa redistribution à Yellowjacket lui-même.",
        "recipientEvidence": "official_english_ability_description",
        "sourceUrl": "https://marvelstrikeforce.com/en/characters/Yellowjacket/abilities",
    },
}

# Exact-source review of the remaining playable actions, after comparing
# MSF Base's published ability texts with the Codex raw-action ledger.
# For Shadow King, the recipient statement is also available from Scopely.
# "technical_correlated" establishes only the behavior family: the parser
# keeps safety/passive_visuals as distinct technical contexts. No game
# execution, formula, percentage basis, or recipient allocation is asserted.
REVIEWED_COMPARATIVE_REFERENCES = {
    "shadow": {"url": "https://marvelstrikeforce.com/en/characters/ShadowKing/abilities", "source": "official_ability_text",
        "assertion": "La passive du Roi d’Ombre vole 5 % de vie maximale à l’ennemi le plus blessé et la redistribue au personnage possédé."},
    "Gilgamesh": {"url": "https://www.msfbase.com/characters/Gilgamesh/", "source": "published_ability_text",
        "assertion": "Le basique vole de la vie à la cible principale et la restitue à Gilgamesh ; son Drain est distinct."},
    "Quasar": {"url": "https://www.msfbase.com/characters/Quasar/", "source": "published_ability_text",
        "assertion": "Le basique vole de la vie, y compris contre une cible non Cosmique en attaque de guerre au niveau requis."},
    "Thena": {"url": "https://www.msfbase.com/characters/Thena/", "source": "published_ability_text",
        "assertion": "L’ultime vole de la vie aux cibles principales et secondaires, la restitue à Thena et affiche un plafond."},
    "Morbius": {"url": "https://www.msfbase.com/characters/Morbius/", "source": "published_ability_text",
        "assertion": "La basique et sa variante de contre/assistance volent de la vie en présence de Saignement."},
    "MorganLeFay": {"url": "https://www.msfbase.com/characters/MorganLeFay/", "source": "published_ability_text",
        "assertion": "La variante de contre/assistance de la basique vole jusqu’à 10 % de vie et la restitue à Morgan."},
    "Nemesis": {"url": "https://www.msfbase.com/characters/Nemesis/", "source": "published_ability_text",
        "assertion": "La variante de contre/assistance du basique vole de la vie et la redistribue aux alliés Deathseed."},
    "Odin": {"url": "https://www.msfbase.com/characters/Odin/", "source": "published_ability_text",
        "assertion": "La basique d’Odin vole 3 % de vie aux ennemis et la restitue à Odin ; des déclenchements techniques la réutilisent."},
    "OmegaRed": {"url": "https://www.msfbase.com/characters/OmegaRed/", "source": "published_ability_text",
        "assertion": "La variante contre/assistance vole de la vie à sa cible à hauteur de 3 ou 7 % selon le niveau."},
    "Satana": {"url": "https://www.msfbase.com/characters/Satana/", "source": "published_ability_text",
        "assertion": "La variante contre/assistance contient un vol de 7 % de vie, avec sélecteur brut pour les alliés Accursed."},
    "SymbioteQuicksilver": {"url": "https://www.msfbase.com/characters/SymbioteQuicksilver/", "source": "published_ability_text",
        "assertion": "La variante contre/assistance de la basique conserve le vol de vie conditionnel."},
    "Yellowjacket": {"url": "https://www.msfbase.com/characters/Yellowjacket/", "source": "published_ability_text",
        "assertion": "En défense de guerre avec Spider-Man Big Time, l’ultime reprend explicitement les effets de la spéciale, dont le vol de vie à soi."},
}
REVIEWED_COMPARATIVE_SIGNATURES = {
    "/Data/AncientOne/passive/1/actions/2": {"sha256": "caa5e7cc5d27495659ed21cb6c23c98015758e771026cbc0772401054a6f287c", "ref": "shadow", "recipient": "possessed_character", "tier": "direct", "context": "direct"},
    "/Data/AncientOne/passive/10/actions/2": {"sha256": "caa5e7cc5d27495659ed21cb6c23c98015758e771026cbc0772401054a6f287c", "ref": "shadow", "recipient": "possessed_character", "tier": "direct", "context": "direct"},
    "/Data/AncientOne/passive/8/actions/2": {"sha256": "caa5e7cc5d27495659ed21cb6c23c98015758e771026cbc0772401054a6f287c", "ref": "shadow", "recipient": "possessed_character", "tier": "direct", "context": "direct"},
    "/Data/DoctorStrange/passive/11/actions/2": {"sha256": "caa5e7cc5d27495659ed21cb6c23c98015758e771026cbc0772401054a6f287c", "ref": "shadow", "recipient": "possessed_character", "tier": "direct", "context": "direct"},
    "/Data/DoctorStrange/passive/7/actions/2": {"sha256": "caa5e7cc5d27495659ed21cb6c23c98015758e771026cbc0772401054a6f287c", "ref": "shadow", "recipient": "possessed_character", "tier": "direct", "context": "direct"},
    "/Data/DoctorStrange/passive/9/actions/2": {"sha256": "caa5e7cc5d27495659ed21cb6c23c98015758e771026cbc0772401054a6f287c", "ref": "shadow", "recipient": "possessed_character", "tier": "direct", "context": "direct"},
    "/Data/EmmaFrostXMen/passive/3/actions/2": {"sha256": "caa5e7cc5d27495659ed21cb6c23c98015758e771026cbc0772401054a6f287c", "ref": "shadow", "recipient": "possessed_character", "tier": "direct", "context": "direct"},
    "/Data/EmmaFrostXMen/passive/5/actions/2": {"sha256": "caa5e7cc5d27495659ed21cb6c23c98015758e771026cbc0772401054a6f287c", "ref": "shadow", "recipient": "possessed_character", "tier": "direct", "context": "direct"},
    "/Data/EmmaFrostXMen/passive/7/actions/2": {"sha256": "caa5e7cc5d27495659ed21cb6c23c98015758e771026cbc0772401054a6f287c", "ref": "shadow", "recipient": "possessed_character", "tier": "direct", "context": "direct"},
    "/Data/Gilgamesh/basic/actions/2": {"sha256": "91a4e0f3ae567aa0f9d533f0753d30bcdda078f1abf35fb8a9ff18171d6ec9c4", "ref": "Gilgamesh", "recipient": "self", "tier": "direct", "context": "direct"},
    "/Data/Gilgamesh/safety/actions/2": {"sha256": "d3df0e63d129c641dfc7105091a1960a6d883addf69648f4540a234da6b593fc", "ref": "Gilgamesh", "recipient": "self", "tier": "technical_correlated", "context": "safety_assist_counter"},
    "/Data/Moondragon/passive/1/actions/2": {"sha256": "caa5e7cc5d27495659ed21cb6c23c98015758e771026cbc0772401054a6f287c", "ref": "shadow", "recipient": "possessed_character", "tier": "direct", "context": "direct"},
    "/Data/Moondragon/passive/4/actions/2": {"sha256": "caa5e7cc5d27495659ed21cb6c23c98015758e771026cbc0772401054a6f287c", "ref": "shadow", "recipient": "possessed_character", "tier": "direct", "context": "direct"},
    "/Data/Moondragon/passive/6/actions/2": {"sha256": "caa5e7cc5d27495659ed21cb6c23c98015758e771026cbc0772401054a6f287c", "ref": "shadow", "recipient": "possessed_character", "tier": "direct", "context": "direct"},
    "/Data/Morbius/safety/actions/1": {"sha256": "fc2904eb821ce0aa7c5382d7299642e70ac2baaa26956c98e6e39b72c177bd88", "ref": "Morbius", "recipient": "self", "tier": "technical_correlated", "context": "safety_assist_counter"},
    "/Data/MorganLeFay/safety/actions/3": {"sha256": "66c4d2b77c3bb39d19d075d3c1b9792ba9a705d9e39679442d333cb77e0de387", "ref": "MorganLeFay", "recipient": "self", "tier": "technical_correlated", "context": "safety_assist_counter"},
    "/Data/Nemesis/safety/actions/1": {"sha256": "33133c8683e57dcd4ab5c5af476d2d5270b5ab946e58f1550580f45296effadb", "ref": "Nemesis", "recipient": "self_and_deathseed_allies", "tier": "technical_correlated", "context": "safety_assist_counter"},
    "/Data/Odin/passive_visuals/0/actions/16": {"sha256": "a7565cad762c0e807de689c4e2eba61f3f8f3adb7af91864208136a91b9b48e9", "ref": "Odin", "recipient": "self", "tier": "technical_correlated", "context": "passive_visuals"},
    "/Data/Odin/safety/actions/2": {"sha256": "4cfe2d170c4c4d4730cd481f3460bcf130c8a58b8774a1f2485074b4781a9838", "ref": "Odin", "recipient": "self", "tier": "technical_correlated", "context": "safety_assist_counter"},
    "/Data/OmegaRed/safety/actions/1": {"sha256": "711bc47d2b77f9aff16b441b2f0adce511ea4ae85a2464043349cc3a0f624759", "ref": "OmegaRed", "recipient": "self", "tier": "technical_correlated", "context": "safety_assist_counter"},
    "/Data/Quasar/basic/actions/4": {"sha256": "3841b18be7d2e7da1e5cb04dcf81f23c908672d473d9264754532c18e552fba3", "ref": "Quasar", "recipient": "self", "tier": "direct", "context": "direct"},
    "/Data/Quasar/safety/actions/3": {"sha256": "b0db01272f5d939b2b38c06cbacf35342a7f39c5c819df09ba4f1f21f50d051a", "ref": "Quasar", "recipient": "self", "tier": "technical_correlated", "context": "safety_assist_counter"},
    "/Data/Quasar/safety/actions/4": {"sha256": "928f6b0006b8eb477fe6b4f77fc08d3943de1ffbbeed1a5a2e685b3cc28e2496", "ref": "Quasar", "recipient": "self", "tier": "technical_correlated", "context": "safety_assist_counter"},
    "/Data/Satana/safety/actions/1": {"sha256": "ee8aade6b55fab466f7bfec10e1693e655a9958876264d36e107e2b6cd5f1cfb", "ref": "Satana", "recipient": "self_and_accursed_allies", "tier": "technical_correlated", "context": "safety_assist_counter"},
    "/Data/SymbioteQuicksilver/safety/actions/2": {"sha256": "0c450808cf5631960175e259ebc7ef8ce1fefd1146e1238330f0bcf8ef81e475", "ref": "SymbioteQuicksilver", "recipient": "self", "tier": "technical_correlated", "context": "safety_assist_counter"},
    "/Data/Thena/ultimate/actions/1": {"sha256": "100a64d38314570f52da444b4ca863526cbfb87c26d1d894184569feb5fc795e", "ref": "Thena", "recipient": "self", "tier": "direct", "context": "direct"},
    "/Data/Thena/ultimate/actions/4": {"sha256": "e835a77eace3e98c54c6f70bf66cc8f11da1464720a633f52c827f6941d27067", "ref": "Thena", "recipient": "self", "tier": "direct", "context": "direct"},
    "/Data/Thena/ultimate/actions/6": {"sha256": "0b65706ec5f90cf73786d6488084b27c010023ef69edca8adea4f8c9fecc6ab6", "ref": "Thena", "recipient": "self", "tier": "direct", "context": "direct"},
    "/Data/Thena/ultimate/actions/9": {"sha256": "1e8e6d3834ae5e20eff9d6136ed61834c9244e215ee144bd661325676f591ade", "ref": "Thena", "recipient": "self", "tier": "direct", "context": "direct"},
    "/Data/Yellowjacket/ultimate/actions/8": {"sha256": "e6248bc04c78788703b2208cf9cc5c8c0952cac004cd66dcda4ef21f54d26e0d", "ref": "Yellowjacket", "recipient": "self", "tier": "technical_correlated", "context": "cross_ability_ultimate"},
}

# Retain the partial interpretation hook for future ambiguous source actions.
PARTIAL_OFFICIAL_TEXT_SIGNATURES = {}

def _raw_fingerprint(raw: dict[str, Any]) -> str:
    encoded = json.dumps(raw, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    import hashlib
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

NUMERIC_UNITS = {
    "drain_pct": "source_percent_unknown_basis",
    "heal_multi": "multiplier_hundredths",
    "max_drain_pct": "source_percent_cap_unknown_application",
    "extra_heal": "health_points",
    "action_pct": "percent_chance",
}
FLAG_FIELDS = (
    "trigger_below_health", "trigger_deathproof", "victim_cant_revive",
    "ignore_health_redistribute_immunity", "include_previous_dead",
)


def _field(raw: dict[str, Any], key: str) -> dict[str, Any]:
    if key not in raw:
        return {"present": False}
    value = raw[key]
    return {"present": True, "raw": copy.deepcopy(value),
            "sourceShape": "array" if isinstance(value, list) else "scalar"}


def _numbers(raw: dict[str, Any], key: str) -> list[int | float]:
    value = raw.get(key)
    values = value if isinstance(value, list) else [value]
    return values if values and all(type(v) in (int, float) for v in values) else []


def normalize_health_redistribute(action: dict[str, Any]) -> dict[str, Any]:
    raw = action["raw"]
    pointer = action.get("source", {}).get("pointer")
    drain = _numbers(raw, "drain_pct")
    heal = _numbers(raw, "heal_multi")
    extra_heal = _numbers(raw, "extra_heal")
    no_extra_heal = "extra_heal" not in raw or (extra_heal and all(v == 0 for v in extra_heal))
    donor, receiver = raw.get("from"), raw.get("to")
    behavior, rule, proof = "detected", "unresolved", "structure_only"
    signature = REVIEWED_SIGNATURES.get(pointer)
    reviewed = (
        signature is not None
        and ("target" in raw) == ("target" in signature)
        and all(k in raw and raw[k] == v for k, v in signature.items())
    )
    if (drain and all(v >= 0 for v in drain) and any(v > 0 for v in drain)
            and heal and all(v == 0 for v in heal) and no_extra_heal):
        behavior, rule, proof = "health_loss", "explicit_zero_restitution", "explicit_parameters"
    elif reviewed and "to" not in signature and "to" not in raw and all(
        k not in raw for k in ("heal_multi", "max_drain_pct", "extra_heal")
    ):
        behavior, rule = "health_equalize", "reviewed_equalization_shape"
        proof = "corroborated_shape" if action.get("characterId") == "PvE_DDInvisibleWoman" else "parameters_and_official_text"
    elif reviewed and "to" in signature and "heal_multi" not in raw:
        behavior, rule, proof = "health_transfer_allies", "reviewed_allied_transfer", "parameters_and_official_text"
    elif (isinstance(donor, dict) and donor.get("relation") == "enemy"
          and isinstance(receiver, dict) and receiver.get("relation") == "ally"
          and drain and all(v > 0 for v in drain) and heal and all(v > 0 for v in heal)):
        behavior, rule, proof = "health_steal_redistribute", "explicit_enemy_to_ally_positive_restitution", "explicit_parameters"
    # Apply reviewed official-text conclusions only to byte-for-byte-equivalent
    # source actions from the 10.5.0 audit. This is a family classification, not
    # a combat formula or proof of percentage basis.
    reviewed_text = REVIEWED_OFFICIAL_TEXT_SIGNATURES.get(pointer)
    verified_review = None
    if reviewed_text and _raw_fingerprint(raw) == reviewed_text["sha256"]:
        verified_review = {
            "sourceGameVersion": "10_5_0",
            # Preserve the historical corpus label without claiming a fresh
            # provenance verification in this migration.
            "sourceVersionVerified": None,
            "assertion": "L’action et le texte officiel FR établissent le vol de vie puis sa redistribution ou son retour.",
        }
    variant = REVIEWED_OFFICIAL_TEXT_SIGNATURE_VARIANTS.get(pointer)
    if variant and _raw_fingerprint(raw) == variant["sha256"]:
        verified_review = variant
    user_review = REVIEWED_USER_VALIDATED_SIGNATURES.get(pointer)
    user_review_confirmed = bool(user_review and _raw_fingerprint(raw) == user_review["sha256"])
    if user_review_confirmed:
        verified_review = {
            "sourceGameVersion": "10_6_3",
            "sourceVersionVerified": False,
            "assertion": user_review["assertion"],
            "recipient": "self",
            "recipientEvidence": "project_owner_validation",
        }
    published_review = REVIEWED_PUBLISHED_SELF_SIGNATURES.get(pointer)
    published_review_confirmed = bool(
        published_review and _raw_fingerprint(raw) == published_review["sha256"]
    )
    if published_review_confirmed:
        verified_review = {
            "sourceGameVersion": "10_6_3",
            "sourceVersionVerified": False,
            "assertion": published_review["assertion"],
            "recipient": "self",
            "recipientEvidence": published_review["recipientEvidence"],
            "sourceUrl": published_review["sourceUrl"],
        }
    comparison = REVIEWED_COMPARATIVE_SIGNATURES.get(pointer)
    comparison_confirmed = bool(
        comparison and _raw_fingerprint(raw) == comparison["sha256"]
    )
    if comparison_confirmed:
        reference = REVIEWED_COMPARATIVE_REFERENCES[comparison["ref"]]
        verified_review = {
            "sourceGameVersion": "10_6_3",
            "sourceVersionVerified": False,
            "assertion": reference["assertion"],
            "recipient": comparison["recipient"],
            "recipientEvidence": (
                "official_possession_description" if comparison["ref"] == "shadow"
                else "published_ability_text_and_technical_context"
                if comparison["tier"] == "technical_correlated"
                else "published_ability_text"
            ),
            "sourceUrl": reference["url"],
            "sourceType": reference["source"],
            "context": comparison["context"],
            "proofLevel": "corroborated" if comparison["tier"] == "technical_correlated" else "confirmed",
        }
    if verified_review:
        behavior, rule, proof = (
            "health_steal_redistribute",
            "reviewed_comparative_technical_context" if comparison_confirmed and comparison["tier"] == "technical_correlated"
            else "reviewed_comparative_direct_description" if comparison_confirmed
            else "reviewed_published_english_self_restitution" if published_review_confirmed
            else "reviewed_user_validated_self_restitution" if user_review_confirmed
            else "reviewed_official_text_steal_and_redistribution",
            "matched_technical_action_and_published_description" if comparison_confirmed and comparison["tier"] == "technical_correlated"
            else "matched_official_or_published_description" if comparison_confirmed
            else "published_english_ability_text_and_exact_source_signature"
            if published_review_confirmed
            else "official_text_and_user_validation" if user_review_confirmed
            else "official_ability_text_and_exact_source_signature",
        )
    partial_text = PARTIAL_OFFICIAL_TEXT_SIGNATURES.get(pointer)
    if partial_text and _raw_fingerprint(raw) == partial_text["sha256"]:
        proof = "partial_official_ability_text"

    numeric = {}
    for key, unit in NUMERIC_UNITS.items():
        record = _field(raw, key)
        if record["present"]:
            record["unit"] = unit
            record["values"] = copy.deepcopy(raw[key] if isinstance(raw[key], list) else [raw[key]])
        numeric[key] = record
    return {
        "behavior": behavior, "resolved": behavior != "detected",
        "evidence": {"basis": proof, "rule": rule, "sourcePointer": pointer,
                     **({"proofLevel": verified_review.get("proofLevel", "confirmed"),
                         "scope": "behavior_family_only",
                         "sourceGameVersion": verified_review["sourceGameVersion"],
                         "sourceVersionVerified": verified_review["sourceVersionVerified"],
                         "assertion": verified_review["assertion"],
                         **({"recipient": verified_review["recipient"],
                             "recipientEvidence": verified_review["recipientEvidence"],
                             **({"sourceUrl": verified_review["sourceUrl"]}
                                if "sourceUrl" in verified_review else {}),
                             **({"sourceType": verified_review["sourceType"],
                                 "technicalContext": verified_review["context"]}
                                if comparison_confirmed else {})}
                            if user_review_confirmed or published_review_confirmed or comparison_confirmed else {}),
                         "limits": ["percentage_basis", "engine_formula", "recipient_allocation", "operation_order"]}
                        if verified_review else {}),
                     **({"proofLevel": "partially_confirmed",
                         "sourceGameVersion": "10_5_0",
                         "assertion": partial_text["assertion"]}
                        if partial_text and _raw_fingerprint(raw) == partial_text["sha256"] else {})},
        "selectors": {key: _field(raw, key) for key in ("from", "to", "target")},
        "numeric": numeric,
        "properties": {key: _field(raw, key) for key in FLAG_FIELDS},
        "percentageBasis": "unresolved", "engineFormula": "unresolved",
        # Lossless source includes residual fields, nested modifiers, conditions
        # and dependencies. Index and Explorer must carry it without coercion.
        "rawAction": copy.deepcopy(raw),
    }
