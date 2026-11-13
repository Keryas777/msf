(() => {
  "use strict";
  const API="https://msf-cosmic-defenses.deliriousfan7.workers.dev/api/war-intelligence";
  const OWNER_ID="300305626926415874";
  const DRAFT_KEY="losp-war-intel-draft-v1";
  const SIGNED=/^v1\.[A-Za-z0-9_-]{12,4096}\.[A-Za-z0-9_-]{40,80}$/;
  const $=id=>document.getElementById(id);
  const status=$("intelAdminStatus"), app=$("intelAdminApp"), allianceSelect=$("intelAlliance"),
    search=$("intelAllianceSearch"), newAlliance=$("intelNewAlliance"), dateInput=$("intelDate"),
    classicName=$("intelClassicName"),
    historySelect=$("intelHistory"), picker=$("intelRoomPicker"), choice=$("intelRoomChoice"),
    positionLabel=$("intelPositionLabel"), publishButton=$("intelPublish"), deleteButton=$("intelDelete");
  const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  let data={alliances:[],observations:[]},layout=Array(9).fill(null),selectedPosition=null,selectedHistory=null;
  let busy=false;
  function setStatus(message,state="info"){status.textContent=message;status.dataset.state=state;}
  function signedToken(){try{return localStorage.getItem("losp_session")||"";}catch{return "";}}
  function realSession(){return window.LoSP_REAL_SESSION||window.LoSP_SESSION||null;}
  function ownerAllowed(){const session=realSession();return session?.ok===true&&session.role==="admin"&&String(session.id||"")===OWNER_ID;}
  function showLoginHelp(message){
    setStatus(message,"error");
    const actions=document.createElement("span");actions.className="intelAdminStatusActions";
    const login=document.createElement("a");login.href="https://losp-auth.deliriousfan7.workers.dev/login?next=admin-renseignements-guerre.html";login.textContent="Se reconnecter avec Discord";
    const home=document.createElement("a");home.href="./home.html";home.textContent="Accueil LoSP";
    actions.append(login,home);status.append(actions);
  }
  async function api(action,payload={}){
    const token=signedToken();
    if(!SIGNED.test(token))throw Error("Reconnecte-toi à Discord pour obtenir une session signée.");
    const response=await fetch(API,{method:"POST",mode:"cors",cache:"no-store",credentials:"omit",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({action,...payload})});
    const result=await response.json().catch(()=>null);
    if(!response.ok||result?.ok!==true)throw Error(result?.message||"Opération impossible. Réessaie.");
    return result;
  }
  function saveDraft(){
    try{localStorage.setItem(DRAFT_KEY,JSON.stringify({schemaVersion:1,allianceId:allianceSelect.value,date:dateInput.value,layout,observationId:selectedHistory?.id||null,savedAt:new Date().toISOString()}));setStatus("Brouillon enregistré sur cet appareil.","ok");}
    catch{setStatus("Le navigateur n’a pas pu enregistrer le brouillon local.","error");}
  }
  function fillAllianceSelect(keep=allianceSelect.value){
    const query=search.value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    allianceSelect.replaceChildren();
    const matches=data.alliances.filter(item=>!query||item.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().includes(query));
    matches.sort((a,b)=>a.name.localeCompare(b.name,"fr"));
    for(const alliance of matches){const option=document.createElement("option");option.value=alliance.id;option.textContent=alliance.name;allianceSelect.append(option);}
    if(matches.some(item=>item.id===keep))allianceSelect.value=keep;
    classicName.value=currentAlliance()?.name||"";
    renderHistory();
  }
  function currentAlliance(){return data.alliances.find(item=>item.id===allianceSelect.value)||null;}
  function renderHistory(){
    const rows=data.observations.filter(row=>row.allianceId===allianceSelect.value).sort((a,b)=>
      b.date.localeCompare(a.date));
    historySelect.replaceChildren();
    const blank=document.createElement("option");blank.value="";blank.textContent=rows.length?"Choisir un relevé":"Aucun relevé publié";historySelect.append(blank);
    for(const row of rows){const option=document.createElement("option");option.value=row.id;option.textContent=new Date(row.date+"T12:00:00Z").toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});historySelect.append(option);}
    historySelect.disabled=!rows.length;
    if(selectedHistory&&!rows.some(item=>item.id===selectedHistory.id))selectedHistory=null;
    deleteButton.hidden=!selectedHistory;
  }
  function preview(){
    if(!window.LoSPWarIntel)return;
    window.LoSPWarIntel.setPreview({id:selectedHistory?.id||"draft-preview",allianceId:allianceSelect.value,date:dateInput.value||today(),layout:[...layout]});
  }
  function setLayout(next){layout=[...next];preview();}
  function clearDraft(){selectedHistory=null;historySelect.value="";dateInput.value=today();setLayout(Array(9).fill(null));deleteButton.hidden=true;}
  function validateLayout(){
    const used=new Map();
    layout.forEach((room,index)=>{if(!room)return;if(used.has(room))throw Error("« "+(window.LoSPWarIntel.getRooms().find(item=>item.id===room)?.name||room)+" » est déjà placé en position "+(used.get(room)+1)+".");used.set(room,index);});
    if(!layout.some(Boolean))throw Error("Ajoute au moins une salle avant la publication.");
    if(layout.length!==9||!/^\d{4}-\d{2}-\d{2}$/.test(dateInput.value))throw Error("Vérifie la date et les neuf emplacements.");
  }
  function populateRoomChoices(){
    choice.replaceChildren();
    const unknown=document.createElement("option");unknown.value="";unknown.textContent="Salle inconnue / emplacement vide";choice.append(unknown);
    for(const room of window.LoSPWarIntel.getRooms()){const option=document.createElement("option");option.value=room.id;option.textContent=room.name;choice.append(option);}
  }
  async function reload(keepAlliance=allianceSelect.value){
    const loaded=await window.LoSPWarIntel.refresh();data=loaded;fillAllianceSelect(keepAlliance);renderHistory();
    if(selectedHistory){selectedHistory=data.observations.find(row=>row.id===selectedHistory.id)||null;}
  }
  function bind(){
    search.addEventListener("input",()=>fillAllianceSelect());
    allianceSelect.addEventListener("change",()=>{selectedHistory=null;classicName.value=currentAlliance()?.name||"";renderHistory();clearDraft();});
    dateInput.addEventListener("change",preview);
    historySelect.addEventListener("change",()=>{
      selectedHistory=data.observations.find(row=>row.id===historySelect.value)||null;
      if(selectedHistory){dateInput.value=selectedHistory.date;setLayout(selectedHistory.layout);deleteButton.hidden=false;setStatus("Relevé chargé. Une publication à cette date remplacera ce relevé.");}
      else{deleteButton.hidden=true;}
    });
    $("intelBlank").addEventListener("click",()=>{clearDraft();setStatus("Carte vide prête à être renseignée.");});
    $("intelDuplicate").addEventListener("click",()=>{
      const row=selectedHistory||data.observations.filter(item=>item.allianceId===allianceSelect.value).sort((a,b)=>b.date.localeCompare(a.date))[0];
      if(!row){setStatus("Aucun relevé à dupliquer pour cette alliance.","error");return;}
      selectedHistory=null;historySelect.value="";dateInput.value=today();setLayout(row.layout);setStatus("Relevé dupliqué. Modifie la date ou les salles, puis publie.","ok");
    });
    $("intelSaveDraft").addEventListener("click",saveDraft);
    $("intelCreateAlliance").addEventListener("click",async()=>{
      const name=newAlliance.value.trim();if(!name){setStatus("Saisis le nom classique de l’alliance.","error");return;}
      await runBusy(async()=>{const result=await api("createAlliance",{name});newAlliance.value="";search.value="";await reload(result.allianceId);allianceSelect.value=result.allianceId;classicName.value=currentAlliance()?.name||"";clearDraft();setStatus("Alliance créée et sélectionnée. Choisis la date, puis touche une salle sur la carte pour la renseigner.","ok");});
    });
    $("intelSaveAllianceName").addEventListener("click",()=>runBusy(async()=>{
      if(!currentAlliance())throw Error("Sélectionne une alliance.");
      const name=classicName.value.trim();if(!name)throw Error("Le nom classique ne peut pas être vide.");
      const id=allianceSelect.value;await api("updateAlliance",{allianceId:id,name});search.value="";await reload(id);
      setStatus("Nom classique mis à jour. Les relevés gardent leur identifiant d’alliance.","ok");
    }));
    window.LoSPWarIntel.setEditHandler((position,current)=>{
      selectedPosition=position;positionLabel.textContent=String(position-2);choice.value=current||"";picker.hidden=false;
      choice.focus({preventScroll:true});
      setStatus("Emplacement "+(position-2)+" sélectionné : choisis une salle dans la liste qui vient de s’ouvrir.","info");
    });
    $("intelClosePicker").addEventListener("click",()=>{picker.hidden=true;selectedPosition=null;});
    picker.addEventListener("click",event=>{if(event.target===picker){picker.hidden=true;selectedPosition=null;}});
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!picker.hidden){picker.hidden=true;selectedPosition=null;}});
    choice.addEventListener("change",()=>{
      if(selectedPosition==null)return;const room=choice.value||null;const index=selectedPosition-3;
      if(room&&layout.some((item,i)=>i!==index&&item===room)){setStatus("Cette salle est déjà présente sur la carte.","error");return;}
      layout[index]=room;picker.hidden=true;selectedPosition=null;preview();setStatus("Position "+(index+1)+" mise à jour. Continue à placer les salles, puis valide le plan complet.","ok");
    });
    publishButton.addEventListener("click",()=>runBusy(async()=>{
      validateLayout();if(!currentAlliance())throw Error("Sélectionne ou crée une alliance.");
      const result=await api("publish",{observation:{allianceId:allianceSelect.value,date:dateInput.value,layout:[...layout]}});
      localStorage.removeItem(DRAFT_KEY);selectedHistory={id:result.observationId,allianceId:allianceSelect.value,date:dateInput.value,layout:[...layout],status:"published"};
      await reload(allianceSelect.value);historySelect.value=result.observationId;
      setStatus(result.created?"Nouveau relevé publié.":"Relevé de cette date mis à jour.","ok");
    }));
    deleteButton.addEventListener("click",()=>{
      if(!selectedHistory)return;
      const date=selectedHistory.date;
      if(!window.confirm("Supprimer définitivement le relevé du "+new Date(date+"T12:00:00Z").toLocaleDateString("fr-FR")+" ? Cette action est irréversible."))return;
      runBusy(async()=>{await api("delete",{observationId:selectedHistory.id});selectedHistory=null;await reload(allianceSelect.value);clearDraft();setStatus("Relevé supprimé définitivement. Les autres dates sont conservées.","ok");});
    });
  }
  async function runBusy(work){if(busy)return;busy=true;for(const button of app.querySelectorAll("button"))button.disabled=true;try{await work();}catch(error){setStatus(error?.message||"Opération impossible.","error");}finally{busy=false;for(const button of app.querySelectorAll("button"))button.disabled=false;}}
  async function boot(){
    const auth=await (window.LoSP_AUTH_READY||Promise.resolve(window.LoSP_SESSION));
    document.documentElement.classList.remove("authChecking");
    const session=realSession();
    if(!ownerAllowed()){
      if(session?.ok===true) setStatus("Accès refusé : seul le compte Discord du propriétaire peut administrer les plans adverses.","error");
      else showLoginHelp("Session Discord absente ou expirée. Connecte-toi pour accéder à cette administration.");
      return;
    }
    if(!SIGNED.test(signedToken())){
      showLoginHelp("Ton compte administrateur est reconnu, mais ce navigateur ne possède pas de session Discord signée pour publier. Reconnecte-toi avec Discord.");
      return;
    }
    try{
      const rooms=await window.LoSPWarIntel;
      if(!rooms)throw Error("La carte tactique n’est pas chargée.");
      await reload();populateRoomChoices();app.hidden=false;dateInput.value=today();bind();clearDraft();
      try{const saved=JSON.parse(localStorage.getItem(DRAFT_KEY)||"null");if(saved?.schemaVersion===1&&Array.isArray(saved.layout)&&saved.layout.length===9){allianceSelect.value=data.alliances.some(item=>item.id===saved.allianceId)?saved.allianceId:allianceSelect.value;renderHistory();dateInput.value=saved.date||today();setLayout(saved.layout);}}
      catch{}
      setStatus("Session propriétaire vérifiée. Les brouillons enregistrés sont propres à cet appareil.","ok");
    }catch(error){setStatus(error?.message||"Impossible de charger les relevés.","error");}
  }
  boot();
})();
