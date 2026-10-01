const http = require("http");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT) || 10000;
const MAX_PLAYERS = 25;
const SNAPSHOT_MS = 150;
const rooms = new Map();

function cleanRoomCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
function cleanName(value) {
  return String(value || "Pilote").trim().slice(0, 14) || "Pilote";
}
function cleanColor(value) {
  const v = String(value || "");
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#e10600";
}
function send(ws, message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify(message)); } catch (_) {}
}
function getRoom(ws) {
  return ws.roomCode ? rooms.get(ws.roomCode) : null;
}
function snapshotPlayers(room) {
  return [...room.players.values()].map(p => ({
    id:p.id,name:p.name,color:p.color,num:p.num||0,joinedAt:p.joinedAt,
    roomConfig:p.roomConfig||null,voice:!!p.voice
  }));
}
function broadcastRoom(room, message, except) {
  for (const p of room.players.values()) if (p.ws !== except) send(p.ws,message);
}
function broadcastPlayers(room) {
  const message={type:"players",players:snapshotPlayers(room),hostId:room.hostId,config:room.config};
  for(const p of room.players.values()) send(p.ws,message);
}
function electHost(room) {
  const list=[...room.players.values()].sort((a,b)=>a.joinedAt-b.joinedAt);
  room.hostId=list.length?list[0].id:null;
}
function ensureRoom(code) {
  let room=rooms.get(code);
  if(!room){room={code,players:new Map(),states:new Map(),hostId:null,
    config:{trk:"monaco",laps:3,bots:5,lvl:.95},racePayload:null,raceActive:false};rooms.set(code,room);}
  return room;
}
function removePlayer(ws) {
  const room=getRoom(ws); if(!room) return;
  room.players.delete(ws.playerId); room.states.delete(ws.playerId);
  if(room.hostId===ws.playerId) electHost(room);
  if(room.players.size===0) rooms.delete(room.code); else broadcastPlayers(room);
  ws.roomCode=null; ws.playerId=null;
}
function handleMessage(ws,raw){
  let msg; try{msg=JSON.parse(raw.toString());}catch(_){return;}
  if(msg.type==="join"){
    const code=cleanRoomCode(msg.room), id=String(msg.id||"").slice(0,32);
    if(!code||!id){send(ws,{type:"error",message:"Salle ou identifiant invalide."});return;}
    const room=ensureRoom(code);
    const old=room.players.get(id);
    if(old&&old.ws!==ws){try{old.ws.close(4001,"reconnexion");}catch(_){} room.players.delete(id);room.states.delete(id);}
    if(!room.players.has(id)&&room.players.size>=MAX_PLAYERS){
      send(ws,{type:"error",message:"Cette salle est pleine (25 joueurs maximum)."});
      try{ws.close(4003,"room full");}catch(_){} return;
    }
    const p=msg.profile||{};
    const player={ws,id,name:cleanName(p.name),color:cleanColor(p.color),
      num:Math.max(0,Math.min(99,Number(p.num)||0)),
      joinedAt:Number.isFinite(Number(p.joinedAt))?Number(p.joinedAt):Date.now()+Math.random(),
      roomConfig:p.roomConfig||null,voice:!!p.voice};
    room.players.set(id,player); ws.roomCode=code; ws.playerId=id;
    if(!room.hostId) room.hostId=id;
    if(room.hostId===id&&player.roomConfig) room.config={...room.config,...player.roomConfig};
    send(ws,{type:"welcome",room:code,maxPlayers:MAX_PLAYERS,hostId:room.hostId});
    broadcastPlayers(room);
    if(room.raceActive&&room.racePayload) send(ws,{type:"start",payload:room.racePayload});
    return;
  }
  const room=getRoom(ws); if(!room||!ws.playerId)return;
  const player=room.players.get(ws.playerId); if(!player)return;
  if(msg.type==="profile"){
    const p=msg.payload||{};
    player.name=cleanName(p.name);player.color=cleanColor(p.color);
    player.num=Math.max(0,Math.min(99,Number(p.num)||0));player.voice=!!p.voice;
    player.roomConfig=p.roomConfig||player.roomConfig;
    if(room.hostId===player.id&&player.roomConfig)room.config={...room.config,...player.roomConfig};
    broadcastPlayers(room); return;
  }
  if(msg.type==="state"){
    const p=msg.payload;
    if(!p||p.i!==ws.playerId)return;
    room.states.set(ws.playerId,p); return;
  }
  if(msg.type==="start"){
    if(room.hostId!==ws.playerId||room.raceActive)return;
    const requested=msg.payload||{};
    const order=Array.isArray(requested.order)?requested.order.filter(id=>room.players.has(id)).slice(0,MAX_PLAYERS):[...room.players.keys()];
    if(!order.includes(ws.playerId))order.unshift(ws.playerId);
    const uniqueOrder=[...new Set(order)].slice(0,MAX_PLAYERS);
    const nb=Math.max(0,Math.min(Number(requested.nb)||0,MAX_PLAYERS-uniqueOrder.length));
    room.config={trk:requested.trk||room.config.trk,laps:Number(requested.laps)||room.config.laps,bots:nb,lvl:Number(requested.lvl)||room.config.lvl};
    room.racePayload={order:uniqueOrder,laps:room.config.laps,rid:Number(requested.rid)||Date.now(),host:room.hostId,nb,lvl:room.config.lvl,trk:room.config.trk};
    room.raceActive=true;room.states.clear();
    broadcastRoom(room,{type:"start",payload:room.racePayload},ws);send(ws,{type:"start",payload:room.racePayload});broadcastPlayers(room);return;
  }
  if(msg.type==="lobby"){
    room.raceActive=false;room.racePayload=null;room.states.clear();
    broadcastRoom(room,{type:"lobby",payload:msg.payload||{}});broadcastPlayers(room);return;
  }
  if(msg.type==="voice"){
    const now=Date.now();player.voiceTimes=(player.voiceTimes||[]).filter(t=>now-t<1000);
    if(player.voiceTimes.length>=8)return;
    const payload=msg.payload;
    if(!payload||typeof payload.audio!=="string"||payload.audio.length>20000)return;
    player.voiceTimes.push(now);broadcastRoom(room,{type:"voice",payload},ws);
  }
}
const snapshotTimer=setInterval(()=>{
  for(const room of rooms.values()){
    if(!room.raceActive||room.players.size===0)continue;
    const states=[...room.players.values()].map(p=>room.states.get(p.id)).filter(Boolean);
    if(!states.length)continue;
    const message=JSON.stringify({type:"snapshot",states});
    for(const p of room.players.values())if(p.ws.readyState===WebSocket.OPEN)try{p.ws.send(message);}catch(_){}
  }
},SNAPSHOT_MS);

const server=http.createServer((req,res)=>{
  if(req.url==="/"||req.url==="/health"){
    res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});
    res.end(JSON.stringify({ok:true,service:"paulogames-server",rooms:rooms.size,maxPlayersPerRoom:MAX_PLAYERS}));return;
  }
  res.writeHead(404);res.end("Not found");
});
const wss=new WebSocket.Server({server,path:"/ws"});
wss.on("connection",ws=>{
  ws.isAlive=true;ws.on("pong",()=>ws.isAlive=true);
  ws.on("error",err=>console.warn("WebSocket:",err.message));
  ws.on("message",message=>handleMessage(ws,message));
  ws.on("close",()=>removePlayer(ws));
});
const heartbeat=setInterval(()=>{
  for(const ws of wss.clients){if(ws.isAlive===false){try{ws.terminate();}catch(_){}continue;}ws.isAlive=false;try{ws.ping();}catch(_){}}
},30000);
function shutdown(){clearInterval(heartbeat);clearInterval(snapshotTimer);for(const ws of wss.clients)try{ws.close(1012,"serveur en redémarrage");}catch(_){}server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),25000).unref();}
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
server.listen(PORT,"0.0.0.0",()=>console.log("Paulogames server lancé sur le port "+PORT+" | WebSocket /ws | 25 joueurs max"));