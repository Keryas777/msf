import json, glob, os, re, collections

RAW='data/msf-capabilities/raw/characters.json'
data=json.load(open(RAW,encoding='utf-8'))
D=data.get('Data',data)
rows=[]

def walk_actions(cid, ability, obj, pointer=''):
    if isinstance(obj,dict):
        if obj.get('action') in ('barrier','barrier_remove'):
            rows.append({'cid':cid,'ability':ability,'pointer':pointer,'obj':obj})
        for k,v in obj.items():
            walk_actions(cid,ability,v,pointer+'/'+str(k).replace('~','~0').replace('/','~1'))
    elif isinstance(obj,list):
        for i,v in enumerate(obj): walk_actions(cid,ability,v,pointer+'/'+str(i))

for cid,c in D.items():
    if not isinstance(c,dict): continue
    for ability in ('basic','special','ultimate','passive'):
        a=c.get(ability)
        if isinstance(a,(dict,list)):
            walk_actions(cid,ability,a,f'/Data/{cid}/{ability}')

print('RAW_TOTAL',len(rows),collections.Counter(r['obj']['action'] for r in rows))

# Load latest generated character payloads and build ability official-text map.
gens=glob.glob('docs/data/msf-capabilities-explorer/generations/sha256-*')
latest=max(gens,key=os.path.getmtime)
text_map={}
gen_barrier_ptrs=set()

def official_text_from(value):
    if isinstance(value,str): return value
    if isinstance(value,dict):
        for k in ('text','value','fr','officialText'):
            v=value.get(k)
            if isinstance(v,str): return v
        seg=value.get('segments')
        if isinstance(seg,list):
            vals=[]
            for s in seg:
                if isinstance(s,str): vals.append(s)
                elif isinstance(s,dict):
                    for k in ('text','value'):
                        if isinstance(s.get(k),str): vals.append(s[k]); break
            if vals: return ' '.join(vals)
    return ''

for f in glob.glob(latest+'/characters/*.json'):
    try: root=json.load(open(f,encoding='utf-8'))
    except Exception: continue
    stack=[root]
    while stack:
        x=stack.pop()
        if isinstance(x,dict):
            cid=x.get('characterId')
            typ=x.get('type') or x.get('baseType') or x.get('abilityType')
            if cid and typ in ('basic','special','ultimate','passive'):
                txt=official_text_from(x.get('officialText'))
                if txt: text_map.setdefault((cid,typ),txt)
            st=x.get('sourceActionType') or x.get('sourceType')
            if st in ('barrier','barrier_remove'):
                src=x.get('source')
                if isinstance(src,dict) and isinstance(src.get('pointer'),str): gen_barrier_ptrs.add(src['pointer'])
                sp=x.get('sourcePointer')
                if isinstance(sp,str): gen_barrier_ptrs.add(sp)
            stack.extend(x.values())
        elif isinstance(x,list): stack.extend(x)

raw_ptrs={r['pointer'] for r in rows}
print('GENERATED_POINTERS',len(gen_barrier_ptrs))
print('RAW_NOT_GENERATED',len(raw_ptrs-gen_barrier_ptrs))
for p in sorted(raw_ptrs-gen_barrier_ptrs):
    r=next(r for r in rows if r['pointer']==p)
    print('RAW_ONLY',p,r['cid'],r['ability'],json.dumps(r['obj'],ensure_ascii=False,sort_keys=True))
print('GENERATED_NOT_RAW',len(gen_barrier_ptrs-raw_ptrs))
for p in sorted(gen_barrier_ptrs-raw_ptrs)[:20]: print('GEN_ONLY',p)

no_amnt=[r for r in rows if r['obj']['action']=='barrier_remove' and 'amnt' not in r['obj']]
print('REMOVE_NO_AMNT',len(no_amnt))
for r in no_amnt:
    txt=text_map.get((r['cid'],r['ability']),'')
    print('NO_AMNT',r['cid'],r['ability'],r['pointer'],'SRC',json.dumps(r['obj'],ensure_ascii=False,sort_keys=True),'OFFICIAL',json.dumps(txt,ensure_ascii=False))

# Addition samples where official text contains barrier and a percentage.
print('APPLY_SEMANTIC_SAMPLES')
seen=set(); n=0
for r in rows:
    if r['obj']['action']!='barrier': continue
    key=(r['cid'],r['ability'])
    if key in seen: continue
    txt=text_map.get(key,'')
    if txt and re.search(r'barri',txt,re.I):
        seen.add(key)
        print('APPLY_TEXT',r['cid'],r['ability'],'HEALTH_PCT',json.dumps(r['obj'].get('health_pct')),'TARGET',json.dumps(r['obj'].get('target'),ensure_ascii=False,sort_keys=True),'OFFICIAL',json.dumps(txt,ensure_ascii=False))
        n+=1
        if n>=50: break
