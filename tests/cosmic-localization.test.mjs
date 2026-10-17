import test from "node:test";
import assert from "node:assert/strict";
import { validateCosmicLocalization, RULE_IDS } from "../scripts/cosmic-localization.mjs";

const en = "https://marvelstrikeforce.com/en/updates/rules";
const fr = "https://marvelstrikeforce.com/fr/updates/rules";
const original = { url:en, contentLanguage:"en", authority:"official", contentVerified:true };
const french = { url:fr, contentLanguage:"fr", authority:"official", contentVerified:true };
const rule = () => ({
  frenchOfficialChecked:true,
  frenchTerminologyChecked:true,
  sources:[original],
  selectedSourceUrl:en,
  fallbackExplanation:"Texte français indisponible après vérification, terminologie du jeu revue."
});
const config = () => ({
  localizationReview:{
    policy:"fr-first", status:"reviewed",
    rules:Object.fromEntries(RULE_IDS.map(key=>[key,rule()]))
  }
});

test("règle globale et six salles contrôlées",()=>{
  assert.equal(validateCosmicLocalization(config()),true);
  const x=config();delete x.localizationReview.rules["room-6"];
  assert.throws(()=>validateCosmicLocalization(x),/règle globale et les six salles/);
});

test("une source française officielle confirmée prévaut sur l'anglaise",()=>{
  const x=config();
  const room=x.localizationReview.rules["room-2"];
  room.sources.push(french);
  assert.throws(()=>validateCosmicLocalization(x),/source française officielle doit être prioritaire/);
  room.selectedSourceUrl=fr;
  assert.equal(validateCosmicLocalization(x),true);
});

test("l'URL /fr/ ne suffit pas : vérifier la langue réellement publiée",()=>{
  const x=config();
  x.localizationReview.rules.global.sources.push({ ...french, contentVerified:false });
  assert.throws(()=>validateCosmicLocalization(x),/langue du contenu non vérifiée/);
});

test("les 7 revues documentent le contrôle français et le repli anglais",()=>{
  const x=config();
  x.localizationReview.rules["room-3"].frenchTerminologyChecked=false;
  assert.throws(()=>validateCosmicLocalization(x),/terminologie françaises non revues/);
  x.localizationReview.rules["room-3"]=rule();
  x.localizationReview.rules["room-3"].fallbackExplanation="";
  assert.throws(()=>validateCosmicLocalization(x),/justifier le recours à la source anglaise/);
});

test("sources externes ou non officielles rejetées pour la mécanique",()=>{
  const x=config();
  x.localizationReview.rules["room-5"].sources=[
    { ...original, url:"https://example.com/translation" }
  ];
  x.localizationReview.rules["room-5"].selectedSourceUrl="https://example.com/translation";
  assert.throws(()=>validateCosmicLocalization(x),/source officielle/);
});

test("la saison suivante ne peut être activée sans revue éditoriale",()=>{
  const x=config();
  x.localizationReview.status="pending";
  assert.throws(()=>validateCosmicLocalization(x),/non validée/);
});
