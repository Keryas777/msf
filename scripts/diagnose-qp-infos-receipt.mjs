#!/usr/bin/env node
// Read-only, single-campaign timing diagnostic. Never logs private R2 keys,
// fingerprints, member records, tokens, or approval registry contents.
import fs from "node:fs/promises";
import {createPrivateR2Reader} from "./lib/private-r2-read.mjs";
import {GUEST_APPROVAL_KEY,approvedGuestSources} from "./lib/guest-player-directory.mjs";

const key="questionable-propriety";
const campaign="2026-11-09-am";
const start=Date.parse("2026-11-09T02:00:00Z");
const end=Date.parse("2026-11-09T04:00:00Z");
const safeTimestamp=value=>
  typeof value==="string"&&value.length<=40&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)&&
  Number.isFinite(Date.parse(value))?value:"[missing/invalid]";

const reader=createPrivateR2Reader();
const approval=await reader.getJSON(GUEST_APPROVAL_KEY,200000);
if(!approval)throw Error("Guest approval registry unavailable");
const registry=JSON.parse(await fs.readFile("docs/data/alliances.json","utf8"));
const fp=approvedGuestSources(registry,approval).approved.get(key);
if(!fp)throw Error("QP not approved/bound; no private object read");
const receipt=await reader.getJSON(
  "roster-batches/v1/"+fp+"/campaigns/"+campaign+"-infos.json",200000);
if(!receipt){
  console.log("QP Info receipt: missing for "+campaign);
}else{
  const captured=safeTimestamp(receipt.capturedAt);
  const expires=safeTimestamp(receipt.expiresAt);
  const observed=Date.parse(captured);
  const expiry=Date.parse(expires);
  console.log("QP Info receipt timing (metadata only):");
  console.log("campaign: "+(receipt.campaign===campaign?campaign:"[unexpected/invalid]"));
  console.log("capturedAt: "+captured);
  console.log("expiresAt: "+expires);
  console.log("expected capturedAt: [2026-11-09T02:00:00Z, 2026-11-09T04:00:00Z)");
  console.log("capturedAt in window: "+(Number.isFinite(observed)&&observed>=start&&observed<end));
  console.log("expiresAt after capturedAt: "+(Number.isFinite(expiry)&&Number.isFinite(observed)&&expiry>observed));
  console.log("expiresAt in future: "+(Number.isFinite(expiry)&&expiry>Date.now()));
}
