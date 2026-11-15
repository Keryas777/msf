// Consecutive sections are derived from the published official requirements.
export function progressSections(nodes = []) {
  const sections = [];
  for (const node of [...nodes].sort((a,b)=>(a.order||0)-(b.order||0))) {
    const signature = JSON.stringify(node.requirement ?? null);
    const last = sections[sections.length-1];
    if (last && last.signature === signature) last.count++;
    else sections.push({signature,count:1});
  }
  return sections.map(({count})=>count);
}

export function progressFills(sectionSizes, consecutive, completed = false) {
  let remaining = completed ? sectionSizes.reduce((a,b)=>a+b,0) : Math.max(0,Number(consecutive)||0);
  return sectionSizes.map(size=>{
    const filled = Math.min(size,remaining);
    remaining = Math.max(0,remaining-size);
    return size ? Math.round(filled/size*10000)/100 : 0;
  });
}
