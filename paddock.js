"use strict";
let catalogCategory='gp', catalogSelection='brazil';
const gpCatalog=window.GP_CATALOG;
const otherCatalog=[{key:'malaysia',country:'Malaisie',name:'Sepang International Circuit',city:'Sepang',code:'MY',length:5543}];
const catalogItems=()=>catalogCategory==='gp'?gpCatalog:otherCatalog;
function menuMode(on){document.body.classList.toggle('menu-mode',on);}
function showCatalog(category) {
  catalogCategory=category||catalogCategory;
  if(!catalogItems().some(c=>c.key===catalogSelection))catalogSelection=catalogItems()[0].key;
  $('pdHome').hidden=true;$('pdCatalog').hidden=false;$('paddock').hidden=false;$('lobby').hidden=true;
  menuMode(true);$('pdCatalogLabel').textContent=catalogCategory==='gp'?'':'';
  $('pdCatalogTitle').textContent=catalogCategory==='gp'?'Grand Prix':'Autres circuits';
  $('pdSearch').value='';renderCatalog();renderCatalogDetail();
  $('paddock').scrollTop=0;
}
function showPaddockHome(){
  $('paddock').hidden=false;$('pdHome').hidden=false;$('pdCatalog').hidden=true;$('lobby').hidden=true;menuMode(true);
}
function renderCatalog(){
 const query=$('pdSearch').value.trim().toLocaleLowerCase('fr');
 const list=$('pdTrackList');list.replaceChildren();
 catalogItems().forEach((c,i)=>{
  if(query&&!`${c.country} ${c.name} ${c.city}`.toLocaleLowerCase('fr').includes(query))return;
  const btn=document.createElement('button');btn.className='pd-track';btn.type='button';btn.dataset.track=c.key;
  btn.setAttribute('aria-pressed',String(c.key===catalogSelection));
  const ix=document.createElement('span');ix.className='pd-index';ix.textContent=String(i+1).padStart(2,'0');
  const text=document.createElement('span'),name=document.createElement('span'),city=document.createElement('span');
  name.className='pd-track-name';name.textContent=c.country;city.className='pd-track-city';city.textContent=c.name;
  const code=document.createElement('span');code.className='pd-code';code.textContent=c.code;
  text.append(name,city);btn.append(ix,text,code);
  btn.onclick=()=>{
   catalogSelection=c.key;
   for(const other of list.querySelectorAll('.pd-track'))other.setAttribute('aria-pressed',String(other.dataset.track===c.key));
   renderCatalogDetail();
   if(innerWidth<=600)$('paddock').scrollTop=0;
  };list.append(btn);
 });
 if(!list.children.length){const p=document.createElement('p');p.className='pd-empty';p.textContent='Aucun circuit trouvé. Essaie un pays ou une ville.';list.append(p);}
}
function renderCatalogDetail(){
 const c=catalogItems().find(c=>c.key===catalogSelection),tr=TRACKS[c.key];
 $('pdCountry').textContent=c.country;$('pdName').textContent=c.name;
 $('pdCode').textContent=c.code;$('pdLength').textContent=(c.length/1000).toLocaleString('fr',{minimumFractionDigits:3,maximumFractionDigits:3})+' km';
 const range=tr.elev?Math.max(...tr.elev.map(p=>p[1]))-Math.min(...tr.elev.map(p=>p[1])):0;
 $('pdElevation').textContent=(range.toFixed(1).replace('.',','))+' m';
 $('pdElevationLabel').textContent='Dénivelé';
 $('pdPitSide').textContent=(tr.pit?.side||1)===-1?'Gauche':'Droite';
 $('pdPitLegend').hidden=!tr.pit?.mapped;
 $('pdFidelity').textContent='';
 
 $('pdReady').disabled=phase==='lobby'&&!isHost;
 requestAnimationFrame(drawCatalogMap);
}
function drawCatalogMap(){
 if($('pdCatalog').hidden)return;
 const el=$('pdTrackMap'), rect=el.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2);
 if(!rect.width||!rect.height)return;
 el.width=rect.width*dpr;el.height=rect.height*dpr;
 const g=el.getContext('2d');g.scale(dpr,dpr);g.clearRect(0,0,rect.width,rect.height);
 const tr=TRACKS[catalogSelection],pts=tr.ctrl;
 const xs=pts.map(p=>p[0]),zs=pts.map(p=>p[1]),x0=Math.min(...xs),z0=Math.min(...zs),x1=Math.max(...xs),z1=Math.max(...zs);
 const scale=Math.min((rect.width-24)/(x1-x0||1),(rect.height-24)/(z1-z0||1));
 const tx=(rect.width-(x1-x0)*scale)/2,tz=(rect.height-(z1-z0)*scale)/2;
 const xy=p=>[tx+(p[0]-x0)*scale,tz+(p[1]-z0)*scale];
 g.strokeStyle='#ffffff07';g.lineWidth=1;
 for(let x=0;x<rect.width;x+=28){g.beginPath();g.moveTo(x,0);g.lineTo(x,rect.height);g.stroke();}
 for(let y=0;y<rect.height;y+=28){g.beginPath();g.moveTo(0,y);g.lineTo(rect.width,y);g.stroke();}
 g.lineJoin='round';g.lineCap='round';g.beginPath();
 pts.forEach((p,i)=>{const q=xy(p);i?g.lineTo(...q):g.moveTo(...q);});g.closePath();
 g.strokeStyle='#f3f4f7';g.lineWidth=4;g.stroke();
 if(tr.pit?.ctrl){
  g.beginPath();tr.pit.ctrl.forEach((p,i)=>{const q=xy(p);i?g.lineTo(...q):g.moveTo(...q);});
  g.strokeStyle='#92b3c9';g.lineWidth=2;g.stroke();
 }
 const p=xy(pts[0]),next=xy(pts[1]),a=Math.atan2(next[1]-p[1],next[0]-p[0]);
 g.strokeStyle='#ff373c';g.lineWidth=3;g.beginPath();g.moveTo(p[0]-Math.sin(a)*7,p[1]+Math.cos(a)*7);g.lineTo(p[0]+Math.sin(a)*7,p[1]-Math.cos(a)*7);g.stroke();
}
function updateCatalogFromTrack(){
 catalogSelection=trackKey;catalogCategory=trackKey==='malaysia'?'other':'gp';
 const c=[...gpCatalog,...otherCatalog].find(c=>c.key===trackKey);
 if(c)$('lobbyTrackName').textContent=`${c.country} · ${c.name}`;
}
function prepareCircuit(){
 const btn=$('pdReady');btn.disabled=true;btn.textContent='Chargement…';
 // Let the UI paint before the synchronous Three.js rebuild.
 setTimeout(()=>{
  try{
   $('trackSel').value=catalogSelection;
   if(catalogSelection!==trackKey)setTrack(catalogSelection);
   if(!renderer&&!initGL())throw new Error(GL_ERR);
   GL_OK=!!renderer;
   updateCatalogFromTrack();
   if(phase==='lobby')publishRoomConfig();
   $('paddock').hidden=true;$('lobby').hidden=false;menuMode(true);
   if(phase==='menu')$('nameInput').focus();else $('startBtn').focus();
  }catch(e){$('pdFidelity').textContent='Impossible de préparer la 3D : '+e.message;}
  finally{btn.disabled=false;btn.innerHTML='Course <span aria-hidden="true">→</span>';}
 },40);
}
// Both groups remain in the native selector so guests can always receive a host's circuit.
$('trackSel').replaceChildren();
for(const [label,items] of [['Grand Prix',gpCatalog],['Autres circuits',otherCatalog]]){
 const group=document.createElement('optgroup');group.label=label;
 for(const c of items){const o=document.createElement('option');o.value=c.key;o.textContent=`${c.country} · ${c.name}`;group.append(o);}
 $('trackSel').append(group);
}
$('trackSel').value=trackKey;
$('pdGrandPrix').onclick=()=>showCatalog('gp');
$('pdOther').onclick=()=>showCatalog('other');
$('pdBack').onclick=showPaddockHome;
$('pdSearch').oninput=renderCatalog;
$('pdReady').onclick=prepareCircuit;
$('catalogReturn').onclick=()=>{if(phase==='lobby'&&!isHost)return;updateCatalogFromTrack();showCatalog(catalogCategory);};
$('trackSel').addEventListener('change',updateCatalogFromTrack);
$('pdSourcesOpen').onclick=()=>{$('pdSources').hidden=false;$('pdSourcesClose').focus();};
$('pdSourcesClose').onclick=()=>{$('pdSources').hidden=true;$('pdSourcesOpen').focus();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('pdSources').hidden)$('pdSourcesClose').click();});
new ResizeObserver(drawCatalogMap).observe($('pdTrackMap'));
updateCatalogFromTrack();showPaddockHome();
window.render_game_to_text=()=>JSON.stringify({
 phase,ui:!$('paddock').hidden?($('pdHome').hidden?'catalog':'paddock'):!$('lobby').hidden?'setup':phase,
 category:catalogCategory,selectedCircuit:catalogSelection,track:trackKey,
 availableGrandPrix:gpCatalog.map(c=>c.key),otherCircuits:['malaysia'],
 coordinates:'metres; x east / z south for imported geographic tracks, y height above simulation base',
 player:{x:+me.x.toFixed(2),z:+me.z.toFixed(2),speed:+me.speed.toFixed(2),lap:me.lap,pitMode:me.pitMode||0,trackIndex:me.idx},
 circuitLength:+TRACK_LEN.toFixed(2),pit:{side:PIT_SIDE,entry:PIT_ENTRY_REL,exit:PIT_EXIT_REL,length:PIT_TOTAL},
 bots:bots.length,webgl:!!renderer,error:GL_ERR||null
});
