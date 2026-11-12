(() => {
  "use strict";
  const rooms = [
    { id:"soute", name:"Soute", icon:"▣", position:3, range:"adjacent", color:"#77d8ff", effect:"Illustration : les attaquants voisins gagnent de la Barrière au début de leur tour." },
    { id:"hangar", name:"Hangar", icon:"✈", position:4, range:"adjacent", color:"#77bcff", effect:"Illustration : les alliés en défense voisins bénéficient d’une Barrière maximale accrue." },
    { id:"security", name:"Sécurité", icon:"⬡", position:5, range:"adjacent", color:"#7dffd0", effect:"Illustration : les ennemis qui apparaissent dans les salles voisines subissent un affaiblissement." },
    { id:"tech", name:"Labo technique", icon:"⌬", position:6, range:"adjacent", color:"#86f587", effect:"Illustration : les alliés en défense apparaissant dans les salles voisines gagnent de la Défense." },
    { id:"armory", name:"Armurerie", icon:"⫶", position:7, range:"adjacent", color:"#ff9f8b", effect:"Illustration : interaction d’effets pendant le tour dans les salles voisines." },
    { id:"infirmary", name:"Infirmerie", icon:"✚", position:8, range:"adjacent", color:"#ff8bd0", effect:"Illustration : une frappe réussie peut soutenir les défenseurs dans les salles voisines." },
    { id:"bridge", name:"Pont", icon:"◉", position:9, range:"room", color:"#d6acff", effect:"Illustration : à l’apparition, le Pont accorde des effets positifs aléatoires aux alliés en défense." },
    { id:"reactor", name:"Réacteur", icon:"☢", position:10, range:"room", color:"#ffcb72", effect:"Illustration : augmente la Barrière maximale des alliés en défense présents dans cette salle." },
    { id:"barracks", name:"Caserne", icon:"✣", position:11, range:"global", color:"#ffe27c", effect:"Illustration : à l’apparition, tous les personnages concernés reçoivent un bonus offensif." }
  ];
  const flightDecks = [
    {name:"Pont d’envol 1",position:0},{name:"Pont d’envol 2",position:1},{name:"Pont d’envol 3",position:2}
  ];
  const allPositions = [...flightDecks.map(x=>x.position),...rooms.map(x=>x.position)];
  const byPosition = new Map(rooms.map(room=>[room.position,room]));
  const board = document.getElementById("intelBoard");
  const detail = document.getElementById("intelDetail");
  const svg = document.getElementById("intelConnections");
  let mode = "overview";
  let selected = 11;

  function adjacent(position) {
    const row = Math.floor(position / 3), col = position % 3;
    return allPositions.filter(target => {
      const targetRow = Math.floor(target / 3), targetCol = target % 3;
      return Math.abs(row-targetRow) + Math.abs(col-targetCol) === 1;
    });
  }
  function emittedTargets(room) {
    if (room.range === "global") return allPositions;
    if (room.range === "room") return [room.position];
    return adjacent(room.position);
  }
  function receivedSources(position) {
    return rooms.filter(room => emittedTargets(room).includes(position));
  }
  function currentTargets() {
    const room = byPosition.get(selected);
    if (mode === "emitted") return room ? emittedTargets(room) : [];
    if (mode === "received") return receivedSources(selected).map(room=>room.position);
    return [];
  }
  function svgLine(from, to) {
    const boardRect = board.getBoundingClientRect();
    const source = board.querySelector(`[data-cell="${from}"]`).getBoundingClientRect();
    const target = board.querySelector(`[data-cell="${to}"]`).getBoundingClientRect();
    const line = document.createElementNS("http://www.w3.org/2000/svg","line");
    line.setAttribute("x1", String(source.left + source.width/2 - boardRect.left));
    line.setAttribute("y1", String(source.top + source.height/2 - boardRect.top));
    line.setAttribute("x2", String(target.left + target.width/2 - boardRect.left));
    line.setAttribute("y2", String(target.top + target.height/2 - boardRect.top));
    line.setAttribute("class","intelConnectionLine");
    return line;
  }
  function drawConnections(targets) {
    const rect = board.getBoundingClientRect();
    svg.setAttribute("viewBox",`0 0 ${rect.width} ${rect.height}`);
    svg.replaceChildren();
    if(mode === "emitted" && byPosition.get(selected)?.range === "adjacent") {
      targets.forEach(position=>svg.append(svgLine(selected,position)));
    }
    if(mode === "received") {
      targets.forEach(position=>{
        const room = byPosition.get(position);
        if(room?.range === "adjacent") svg.append(svgLine(position,selected));
      });
    }
  }
  function renderDetail() {
    const room = byPosition.get(selected);
    const flight = flightDecks.find(item=>item.position===selected);
    const targetName = room?.name || flight?.name || "Emplacement";
    let label = "SÉLECTION TACTIQUE";
    let copy = room?.effect || "Les Ponts d’envol n’émettent aucun bonus propre. Ils peuvent recevoir les effets globaux.";
    let meta = [];
    if (mode === "emitted") {
      label = "BONUS ÉMIS PAR CETTE SALLE";
      if (!room) copy = "Un Pont d’envol ne génère aucun bonus. Il peut toutefois recevoir un effet global.";
      const targets = room ? emittedTargets(room) : [];
      meta = [room?.range === "global" ? `Portée : ${targets.length} emplacements` : room?.range === "room" ? "Portée : salle uniquement" : `Portée : ${targets.length} voisins orthogonaux`];
    } else if (mode === "received") {
      label = "BONUS REÇUS PAR CET EMPLACEMENT";
      const sources = receivedSources(selected);
      copy = sources.length ? sources.map(source=>`${source.name} · ${source.range === "global" ? "global" : source.range === "room" ? "salle" : "adjacent"}`).join("  /  ") : "Aucun bonus d’exemple ne cible cet emplacement.";
      meta = [flight ? "Emplacement fixe · aucun bonus émis" : `Portée propre : ${room?.range || "—"}`];
    } else {
      meta = [flight ? "Pont d’envol · fixe" : `Portée illustrative : ${room?.range || "—"}`, "Sélectionne une salle pour explorer ses interactions"];
    }
    const style = `--room-color:${room?.color || "#8edfff"}`;
    detail.innerHTML = `<div class="intelDetailLead" style="${style}"><span class="intelDetailIcon" aria-hidden="true">${room?.icon || "⌁"}</span><div><span class="intelDetailLabel">${label}</span><h3>${targetName}</h3></div></div><p class="intelDetailBody">${copy}</p><div class="intelDetailMeta">${meta.map(item=>`<span>${item}</span>`).join("")}</div><p class="intelDetailCaution">Exemples d’effet issus du visuel fourni · portée et ciblage à confirmer avant toute exploitation tactique.</p>`;
  }
  function render() {
    const targets = currentTargets();
    board.dataset.mode = mode;
    board.querySelectorAll(".intelCell").forEach(cell=>{
      const position = Number(cell.dataset.cell);
      cell.classList.toggle("is-selected",position===selected);
      cell.classList.toggle("is-target",position!==selected && targets.includes(position));
      cell.classList.toggle("is-muted",mode!=="overview" && position!==selected && !targets.includes(position));
      const button = cell.querySelector("button");
      button.setAttribute("aria-pressed",String(position===selected));
    });
    drawConnections(targets);
    renderDetail();
  }
  board.addEventListener("click",event=>{
    const button=event.target.closest("button[data-position]");
    if(!button)return;
    selected=Number(button.dataset.position);
    render();
  });
  document.querySelectorAll(".intelMode").forEach(button=>button.addEventListener("click",()=>{
    mode=button.dataset.mode;
    document.querySelectorAll(".intelMode").forEach(item=>{
      const active=item===button;
      item.classList.toggle("is-active",active);
      item.setAttribute("aria-pressed",String(active));
    });
    render();
  }));
  window.addEventListener("resize",()=>drawConnections(currentTargets()),{passive:true});
  window.addEventListener("pageshow",()=>drawConnections(currentTargets()));
  render();
})();
