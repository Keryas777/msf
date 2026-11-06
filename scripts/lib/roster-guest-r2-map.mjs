// Private GitHub Actions roster importer: only currently approved, explicitly
// WebApp-bound guests. No provider identities or private R2 keys enter Git.
const FP=/^[a-f0-9]{64}$/;
const SLUG=/^[a-z][a-z0-9-]{1,63}$/;
export function guestRosterFingerprint(registry,approved,key,lospFingerprintMap={}){
  if(!SLUG.test(key||"")||!Array.isArray(registry)||
     registry.filter(a=>a?.key===key&&a.active!==false&&
       a.group&&a.group!=="losp").length!==1)
    throw Error("Invalid or inactive guest alliance");
  if(!approved||approved.version!==1||!Array.isArray(approved.alliances))
    throw Error("No valid private guest approval registry");
  const seenKeys=new Set(),seenFp=new Set();
  let fingerprint=null;
  for(const row of approved.alliances){
    if(!row||!FP.test(row.fingerprint)||seenFp.has(row.fingerprint)||
       (row.allianceKey!==undefined&&
        (!SLUG.test(row.allianceKey)||seenKeys.has(row.allianceKey))))
      throw Error("Invalid or ambiguous private guest approvals");
    seenFp.add(row.fingerprint);
    if(row.allianceKey){
      seenKeys.add(row.allianceKey);
      if(row.allianceKey===key)fingerprint=row.fingerprint;
    }
  }
  if(!fingerprint)throw Error("Guest alliance is not approved and WebApp-bound");
  if(Object.values(lospFingerprintMap).includes(fingerprint))
    throw Error("LoSP fingerprint cannot publish as a guest");
  return fingerprint;
}
