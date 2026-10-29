"""Report presentation gaps for playable characters without inventing values."""
from __future__ import annotations
from datetime import datetime, timezone
import json, os, re, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/"docs/data/msf-characters.json"
SOURCE=ROOT/"data/msf-capabilities/raw/msf-character-abilities-fr.json"
EXPLORER=ROOT/"docs/data/msf-capabilities-explorer"
TYPES=("basic","special","ultimate","passive")
SAFE=re.compile(r"^[A-Za-z0-9_-]+$")

class AuditError(RuntimeError): pass

def load(path):
    try: return json.loads(path.read_text(encoding="utf-8"))
    except (OSError,json.JSONDecodeError) as e: raise AuditError(f"{path}: {e}") from e

def source_gaps(record, kind):
    if not isinstance(record,dict): return None,["ability"]
    kit=record.get("abilityKit")
    ability=kit.get(kind) if isinstance(kit,dict) else None
    if not isinstance(ability,dict): return None,["ability"]
    missing=[]
    for key in ("name","icon"):
        if not isinstance(ability.get(key),str) or not ability[key].strip(): missing.append(key)
    levels=ability.get("levels")
    numeric=[(int(k),v) for k,v in levels.items() if str(k).isdigit() and isinstance(v,dict)] if isinstance(levels,dict) else []
    if not numeric: missing.extend(("maxLevel","officialText"))
    elif not isinstance(max(numeric,key=lambda x:x[0])[1].get("description"),str) or not max(numeric,key=lambda x:x[0])[1]["description"].strip():
        missing.append("officialText")
    return ability,missing

def audit(roster, source_records, published, checked_at):
    src={r.get("id"):r for r in source_records if isinstance(r,dict)}
    chars=[]; counts={"complete":0,"source_absent":0,"source_incomplete":0,"integration_incomplete":0}
    for person in roster:
        if not isinstance(person,dict) or person.get("player_Character") is not True: continue
        cid=person.get("id")
        if not isinstance(cid,str) or not SAFE.fullmatch(cid): raise AuditError(f"invalid character ID: {cid!r}")
        source=src.get(cid); shard=published.get(cid)
        meta=shard.get("character",{}) if isinstance(shard,dict) else {}
        pub_abilities=shard.get("abilities",[]) if isinstance(shard,dict) else []
        abilities=[]
        for kind in TYPES:
            src_ability,src_missing=source_gaps(source,kind)
            found=[a for a in pub_abilities if isinstance(a,dict) and (a.get("baseType") or a.get("type"))==kind and not a.get("isEmpowered",False)]
            pub=found[0] if len(found)==1 else {}
            pub_missing=[] if len(found)==1 else ["ability"]
            for field in ("name","iconUrl","maxLevel","officialText"):
                value=pub.get(field)
                if not isinstance(value,(str,int,float)) or not str(value).strip(): pub_missing.append(field)
            if source is None or src_ability is None:
                status="source_absent"; cause="source record or core ability absent"
            elif src_missing:
                status="source_incomplete"; cause="source presentation missing: "+", ".join(src_missing)
            elif pub_missing or meta.get("playable") is not True:
                status="integration_incomplete"; cause="source available but published fields or playable flag are incomplete"
            else:
                status="complete"; cause=None
            counts[status]+=1
            abilities.append({"type":kind,"abilityId":pub.get("id"),
              "source":{"file":"data/msf-capabilities/raw/msf-character-abilities-fr.json","recordPresent":source is not None,"abilityPresent":src_ability is not None,"missingFields":src_missing or []},
              "publication":{"characterPresent":shard is not None,"playable":meta.get("playable"),"missingFields":pub_missing},
              "status":status,"cause":cause})
        chars.append({"id":cid,"name":person.get("nameFr") or person.get("nameKey") or cid,"playable":True,"publishedPlayable":meta.get("playable"),"abilities":abilities,"status":"complete" if all(a["status"]=="complete" for a in abilities) else "incomplete"})
    return {"schemaVersion":"1.0.0","checkedAt":checked_at,"sources":{"roster":"docs/data/msf-characters.json","presentations":"data/msf-capabilities/raw/msf-character-abilities-fr.json","publication":"current Explorer generation"},"summary":{"playableCharacters":len(chars),"completeAbilities":counts["complete"],"sourceAbsentAbilities":counts["source_absent"],"sourceIncompleteAbilities":counts["source_incomplete"],"publicationIncompleteAbilities":counts["integration_incomplete"]},"characters":chars}

def published_shards():
    manifest=load(EXPLORER/"manifest.json"); current=manifest.get("currentPath")
    if not isinstance(current,str) or current.startswith("/") or ".." in Path(current).parts: raise AuditError("invalid currentPath")
    root=EXPLORER/current/"characters"
    if not root.is_dir(): raise AuditError(f"missing current generation: {root}")
    result={}
    for path in root.glob("*.json"):
        shard=load(path); meta=shard.get("character",{})
        if isinstance(meta,dict) and isinstance(meta.get("id"),str): result[meta["id"]]=shard
    return result

def main():
    try:
        report=audit(load(CATALOG),load(SOURCE),published_shards(),datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z"))
        print(json.dumps(report,ensure_ascii=False,indent=2))
        summary=os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            s=report["summary"]
            rows=["### Présentations des personnages jouables","",f"Contrôle {report['checkedAt']} — {s['playableCharacters']} personnages; {s['completeAbilities']} complètes; {s['sourceAbsentAbilities']} absentes de la source FR; {s['sourceIncompleteAbilities']} incomplètes dans la source; {s['publicationIncompleteAbilities']} défauts d’intégration.","","| Personnage | ID | Capacité | Statut | Cause |","|---|---|---|---|---|"]
            for c in report["characters"]:
                for a in c["abilities"]:
                    if a["status"]!="complete": rows.append(f"| {c['name']} | `{c['id']}` | {a['type']} | {a['status']} | {a['cause']} |")
            if len(rows)==6: rows.append("| — | — | — | Complètes | — |")
            with open(summary,"a",encoding="utf-8") as f: f.write("\n".join(rows)+"\n")
        return 0
    except (AuditError,OSError,ValueError,TypeError) as e:
        print(f"presentation audit failed: {e}",file=sys.stderr); return 1

if __name__=="__main__": raise SystemExit(main())
