"use strict";
const http = require("http");
const crypto = require("crypto");
const { promisify } = require("util");
const WebSocket = require("ws");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT) || 10000;
const MAX_PLAYERS = 25;
const SNAPSHOT_MS = 150;
const SESSION_DAYS = 30;
const rooms = new Map();
const scryptAsync = promisify(crypto.scrypt);
const DATABASE_URL = process.env.DATABASE_URL || "";
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "*").split(",").map(x => x.trim()).filter(Boolean);
const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) || process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  max: 8,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
}) : null;
if (pool) pool.on("error", e => console.error("PostgreSQL connection error:", e.message));
let schemaReady = false;
let schemaPromise = null;
const requestBuckets = new Map();

const STORE = {
  pit1:{id:"pit1",price:250000,type:"upgrade",key:"pit",level:1},
  pit2:{id:"pit2",price:750000,type:"upgrade",key:"pit",level:2,requires:1},
  tires1:{id:"tires1",price:150000,type:"upgrade",key:"tires",level:1},
  tires2:{id:"tires2",price:450000,type:"upgrade",key:"tires",level:2,requires:1},
  brakes1:{id:"brakes1",price:200000,type:"upgrade",key:"brakes",level:1},
  brakes2:{id:"brakes2",price:500000,type:"upgrade",key:"brakes",level:2,requires:1},
  handling1:{id:"handling1",price:200000,type:"upgrade",key:"handling",level:1},
  handling2:{id:"handling2",price:450000,type:"upgrade",key:"handling",level:2,requires:1},
  engine1:{id:"engine1",price:300000,type:"upgrade",key:"engine",level:1},
  engine2:{id:"engine2",price:800000,type:"upgrade",key:"engine",level:2,requires:1},
  aero1:{id:"aero1",price:550000,type:"upgrade",key:"aero",level:1},
  logo_pg:{id:"logo_pg",price:50000,type:"logo",logo:"pg"},
  logo_bolt:{id:"logo_bolt",price:80000,type:"logo",logo:"bolt"},
  logo_crown:{id:"logo_crown",price:125000,type:"logo",logo:"crown"},
  logo_apex:{id:"logo_apex",price:175000,type:"logo",logo:"apex"}
};

class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
function cleanRoomCode(value) { return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); }
function cleanName(value) { return String(value || "Pilote").trim().slice(0, 14) || "Pilote"; }
function cleanColor(value) { const v = String(value || ""); return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#e10600"; }
function send(ws, message) { if (!ws || ws.readyState !== WebSocket.OPEN) return; try { ws.send(JSON.stringify(message)); } catch (_) {} }
function getRoom(ws) { return ws.roomCode ? rooms.get(ws.roomCode) : null; }
function snapshotPlayers(room) { return [...room.players.values()].map(p => ({ id:p.id,name:p.name,color:p.color,num:p.num||0,joinedAt:p.joinedAt,roomConfig:p.roomConfig||null,voice:!!p.voice })); }
function broadcastRoom(room, message, except) { for (const p of room.players.values()) if (p.ws !== except) send(p.ws, message); }
function broadcastPlayers(room) { const message={type:"players",players:snapshotPlayers(room),hostId:room.hostId,config:room.config}; for(const p of room.players.values()) send(p.ws,message); }
function electHost(room) { const list=[...room.players.values()].sort((a,b)=>a.joinedAt-b.joinedAt); room.hostId=list.length?list[0].id:null; }
function ensureRoom(code) { let room=rooms.get(code); if(!room){room={code,players:new Map(),states:new Map(),hostId:null,config:{trk:"monaco",laps:3,bots:5,lvl:.95},racePayload:null,raceActive:false};rooms.set(code,room);}return room; }
function removePlayer(ws) { const room=getRoom(ws);if(!room)return;room.players.delete(ws.playerId);room.states.delete(ws.playerId);if(room.hostId===ws.playerId)electHost(room);if(room.players.size===0)rooms.delete(room.code);else broadcastPlayers(room);ws.roomCode=null;ws.playerId=null; }
function handleMessage(ws,raw){
  let msg;try{msg=JSON.parse(raw.toString());}catch(_){return;}
  if(msg.type==="join"){
    const code=cleanRoomCode(msg.room),id=String(msg.id||"").slice(0,32);if(!code||!id){send(ws,{type:"error",message:"Salle ou identifiant invalide."});return;}
    const room=ensureRoom(code),old=room.players.get(id);if(old&&old.ws!==ws){try{old.ws.close(4001,"reconnexion");}catch(_){}room.players.delete(id);room.states.delete(id);}
    if(!room.players.has(id)&&room.players.size>=MAX_PLAYERS){send(ws,{type:"error",message:"Cette salle est pleine (25 joueurs maximum)."});try{ws.close(4003,"room full");}catch(_){}return;}
    const p=msg.profile||{};const player={ws,id,name:cleanName(p.name),color:cleanColor(p.color),num:Math.max(0,Math.min(99,Number(p.num)||0)),joinedAt:Number.isFinite(Number(p.joinedAt))?Number(p.joinedAt):Date.now()+Math.random(),roomConfig:p.roomConfig||null,voice:!!p.voice};
    room.players.set(id,player);ws.roomCode=code;ws.playerId=id;if(!room.hostId)room.hostId=id;if(room.hostId===id&&player.roomConfig)room.config={...room.config,...player.roomConfig};
    send(ws,{type:"welcome",room:code,maxPlayers:MAX_PLAYERS,hostId:room.hostId});broadcastPlayers(room);if(room.raceActive&&room.racePayload)send(ws,{type:"start",payload:room.racePayload});return;
  }
  const room=getRoom(ws);if(!room||!ws.playerId)return;const player=room.players.get(ws.playerId);if(!player)return;
  if(msg.type==="profile"){const p=msg.payload||{};player.name=cleanName(p.name);player.color=cleanColor(p.color);player.num=Math.max(0,Math.min(99,Number(p.num)||0));player.voice=!!p.voice;player.roomConfig=p.roomConfig||player.roomConfig;if(room.hostId===player.id&&player.roomConfig)room.config={...room.config,...player.roomConfig};broadcastPlayers(room);return;}
  if(msg.type==="state"){const p=msg.payload;if(!p||p.i!==ws.playerId)return;room.states.set(ws.playerId,p);return;}
  if(msg.type==="start"){if(room.hostId!==ws.playerId||room.raceActive)return;const requested=msg.payload||{};const order=Array.isArray(requested.order)?requested.order.filter(id=>room.players.has(id)).slice(0,MAX_PLAYERS):[...room.players.keys()];if(!order.includes(ws.playerId))order.unshift(ws.playerId);const uniqueOrder=[...new Set(order)].slice(0,MAX_PLAYERS);const nb=Math.max(0,Math.min(Number(requested.nb)||0,MAX_PLAYERS-uniqueOrder.length));room.config={trk:requested.trk||room.config.trk,laps:Number(requested.laps)||room.config.laps,bots:nb,lvl:Number(requested.lvl)||room.config.lvl};room.racePayload={order:uniqueOrder,laps:room.config.laps,rid:Number(requested.rid)||Date.now(),host:room.hostId,nb,lvl:room.config.lvl,trk:room.config.trk};room.raceActive=true;room.states.clear();broadcastRoom(room,{type:"start",payload:room.racePayload},ws);send(ws,{type:"start",payload:room.racePayload});broadcastPlayers(room);return;}
  if(msg.type==="lobby"){room.raceActive=false;room.racePayload=null;room.states.clear();broadcastRoom(room,{type:"lobby",payload:msg.payload||{}});broadcastPlayers(room);return;}
  if(msg.type==="voice"){const now=Date.now();player.voiceTimes=(player.voiceTimes||[]).filter(t=>now-t<1000);if(player.voiceTimes.length>=8)return;const payload=msg.payload;if(!payload||typeof payload.audio!=="string"||payload.audio.length>20000)return;player.voiceTimes.push(now);broadcastRoom(room,{type:"voice",payload},ws);}
}

async function ensureDb(){
  if(!pool)throw new ApiError(503,"La base de données du serveur n’est pas configurée. Ajoute DATABASE_URL dans les variables Render, puis redémarre le service.");
  if(schemaReady)return;
  if(!schemaPromise){schemaPromise=(async()=>{
    await pool.query(`CREATE TABLE IF NOT EXISTS career_users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(20) NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      name VARCHAR(14) NOT NULL DEFAULT 'Pilote',
      color CHAR(7) NOT NULL DEFAULT '#e10600',
      num SMALLINT NOT NULL DEFAULT 0 CHECK (num BETWEEN 0 AND 99),
      cash BIGINT NOT NULL DEFAULT 0 CHECK (cash >= 0),
      upgrades JSONB NOT NULL DEFAULT '{}'::jsonb,
      logo TEXT NOT NULL DEFAULT 'none',
      owned_logos JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS career_sessions (
      token_hash CHAR(64) PRIMARY KEY,
      user_id BIGINT NULL REFERENCES career_users(id) ON DELETE CASCADE,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )`);
    await pool.query("CREATE INDEX IF NOT EXISTS career_sessions_expiry_idx ON career_sessions(expires_at)");
    await pool.query(`CREATE TABLE IF NOT EXISTS career_race_rewards (
      user_id BIGINT NOT NULL REFERENCES career_users(id) ON DELETE CASCADE,
      run_id VARCHAR(120) NOT NULL,
      position SMALLINT NOT NULL,
      amount BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, run_id)
    )`);
    schemaReady=true;
  })().catch(e=>{schemaReady=false;throw e;}).finally(()=>{schemaPromise=null;});}
  await schemaPromise;
}
function json(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Length":Buffer.byteLength(body)});res.end(body);}
function setCors(req,res){const origin=req.headers.origin;const allowed=CORS_ORIGINS.includes("*")||(origin&&CORS_ORIGINS.includes(origin));if(allowed)res.setHeader("Access-Control-Allow-Origin",CORS_ORIGINS.includes("*")?"*":origin);res.setHeader("Vary","Origin");res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");res.setHeader("Access-Control-Allow-Methods","GET, POST, PUT, PATCH, OPTIONS");res.setHeader("Access-Control-Max-Age","86400");return !!allowed;}
async function readBody(req){let body="";for await(const chunk of req){body+=chunk;if(body.length>20000)throw new ApiError(413,"Requête trop volumineuse.");}if(!body)return {};try{return JSON.parse(body);}catch(_){throw new ApiError(400,"Corps JSON invalide.");}}
function sha256(text){return crypto.createHash("sha256").update(String(text)).digest("hex");}
function tokenHash(token){return sha256(token);}
async function hashPassword(password,salt){const derived=await scryptAsync(password,salt,64,{N:65536,r:8,p:1,maxmem:128*1024*1024});return derived.toString("hex");}
function safeEqualHex(a,b){try{const aa=Buffer.from(String(a),"hex"),bb=Buffer.from(String(b),"hex");return aa.length===bb.length&&aa.length>0&&crypto.timingSafeEqual(aa,bb);}catch(_){return false;}}
function cleanUser(row){if(!row)return null;return {username:row.username,name:row.name,color:row.color,num:Number(row.num)||0,cash:Number(row.cash)||0,upgrades:row.upgrades||{},logo:row.logo||"none",ownedLogos:row.owned_logos||[],createdAt:row.created_at,isAdmin:false};}
function bearer(req){const m=String(req.headers.authorization||"").match(/^Bearer\s+([a-f0-9]{64})$/i);return m?m[1]:null;}
async function auth(req,adminRequired=false,allowAdmin=false){await ensureDb();const token=bearer(req);if(!token)throw new ApiError(401,"Connecte-toi pour continuer.");const {rows}=await pool.query(`SELECT s.user_id,s.is_admin,s.expires_at,u.id,u.username,u.name,u.color,u.num,u.cash,u.upgrades,u.logo,u.owned_logos,u.created_at FROM career_sessions s LEFT JOIN career_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()`,[tokenHash(token)]);const row=rows[0];if(!row)throw new ApiError(401,"Session expirée. Reconnecte-toi.");if(adminRequired&&!row.is_admin)throw new ApiError(403,"Accès administrateur refusé.");if(!adminRequired&&!allowAdmin&&row.is_admin)throw new ApiError(403,"Connecte-toi avec un compte pilote pour cet achat.");return {tokenHash:tokenHash(token),isAdmin:!!row.is_admin,userId:row.user_id?Number(row.user_id):null,user:row.is_admin?{username:ADMIN_USERNAME,isAdmin:true}:cleanUser(row)};}
async function issueSession(userId,isAdmin=false){const token=crypto.randomBytes(32).toString("hex");await pool.query("INSERT INTO career_sessions(token_hash,user_id,is_admin,expires_at) VALUES($1,$2,$3,NOW()+($4 || ' days')::interval)",[tokenHash(token),userId,isAdmin,String(SESSION_DAYS)]);return token;}
function limitRequest(req,path){const ip=String(req.headers["x-forwarded-for"]||req.socket.remoteAddress||"unknown").split(",")[0].trim();const key=ip+"|"+path;const now=Date.now();let b=requestBuckets.get(key);if(!b||now-b.start>10*60*1000)b={start:now,count:0};b.count++;requestBuckets.set(key,b);for(const [k,v] of requestBuckets)if(now-v.start>20*60*1000)requestBuckets.delete(k);if(b.count>12)throw new ApiError(429,"Trop de tentatives. Attends quelques minutes avant de réessayer.");}
async function userById(id){const {rows}=await pool.query("SELECT * FROM career_users WHERE id=$1",[id]);return cleanUser(rows[0]);}
async function routeApi(req,res,path){
  if(path==="/api/health"&&req.method==="GET"){
    let ready=false,error=null;try{await ensureDb();ready=true;}catch(e){error=e.message;}
    return json(res,200,{ok:true,service:"paulogames-server",databaseConfigured:!!pool,databaseReady:ready,databaseMessage:error});
  }
  if(path==="/api/register"&&req.method==="POST"){
    limitRequest(req,path);await ensureDb();const body=await readBody(req);const username=String(body.username||"").trim().toLowerCase(),password=String(body.password||"");
    if(!/^[a-z0-9_.-]{3,20}$/.test(username))throw new ApiError(400,"Identifiant invalide : 3 à 20 caractères alphanumériques, point, tiret ou souligné.");
    if(username===ADMIN_USERNAME||username==="admin")throw new ApiError(400,"Cet identifiant est réservé à l’administrateur du serveur.");
    if(password.length<8||Buffer.byteLength(password,"utf8")>128)throw new ApiError(400,"Le mot de passe doit contenir 8 à 128 caractères.");
    const salt=crypto.randomBytes(16).toString("hex"),passwordHash=await hashPassword(password,salt),name=cleanName(body.name),color=cleanColor(body.color),num=Math.max(0,Math.min(99,Math.floor(Number(body.num)||0)));
    let row;try{const result=await pool.query("INSERT INTO career_users(username,password_salt,password_hash,name,color,num) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[username,salt,passwordHash,name,color,num]);row=result.rows[0];}catch(e){if(e.code==="23505")throw new ApiError(409,"Cet identifiant est déjà utilisé. Choisis-en un autre.");throw e;}
    const token=await issueSession(row.id,false);return json(res,201,{token,user:cleanUser(row)});
  }
  if(path==="/api/login"&&req.method==="POST"){
    limitRequest(req,path);await ensureDb();const body=await readBody(req);const username=String(body.username||"").trim().toLowerCase(),password=String(body.password||"");
    if(username===ADMIN_USERNAME||username==="admin"){
      if(!ADMIN_PASSWORD)throw new ApiError(503,"Le mot de passe administrateur n’est pas configuré. Définis ADMIN_PASSWORD dans Render.");
      const ok=safeEqualHex(sha256(password),sha256(ADMIN_PASSWORD));if(!ok)throw new ApiError(401,"Identifiant ou mot de passe incorrect.");
      const token=await issueSession(null,true);return json(res,200,{token,user:{username:ADMIN_USERNAME,isAdmin:true}});
    }
    const {rows}=await pool.query("SELECT * FROM career_users WHERE username=$1",[username]);const row=rows[0];if(!row)throw new ApiError(401,"Identifiant ou mot de passe incorrect.");
    const check=await hashPassword(password,row.password_salt);if(!safeEqualHex(check,row.password_hash))throw new ApiError(401,"Identifiant ou mot de passe incorrect.");
    const token=await issueSession(row.id,false);return json(res,200,{token,user:cleanUser(row)});
  }
  if(path==="/api/me"&&req.method==="GET"){
    const session=await auth(req,false,true);if(session.isAdmin)return json(res,200,{user:{username:ADMIN_USERNAME,isAdmin:true}});return json(res,200,{user:await userById(session.userId)});
  }
  if(path==="/api/logout"&&req.method==="POST"){
    const token=bearer(req);if(token&&pool){try{await ensureDb();await pool.query("DELETE FROM career_sessions WHERE token_hash=$1",[tokenHash(token)]);}catch(_){}}return json(res,200,{ok:true});
  }
  if(path==="/api/profile"&&req.method==="PUT"){
    const session=await auth(req,false),body=await readBody(req),name=cleanName(body.name),color=cleanColor(body.color),num=Math.max(0,Math.min(99,Math.floor(Number(body.num)||0)));
    const {rows}=await pool.query("UPDATE career_users SET name=$2,color=$3,num=$4 WHERE id=$1 RETURNING *",[session.userId,name,color,num]);return json(res,200,{user:cleanUser(rows[0]),message:"Profil enregistré sur le serveur."});
  }
  if(path==="/api/shop/purchase"&&req.method==="POST"){
    const session=await auth(req,false),body=await readBody(req),item=STORE[String(body.itemId||"")];if(!item)throw new ApiError(400,"Article inconnu.");
    const client=await pool.connect();try{
      await client.query("BEGIN");const selected=await client.query("SELECT * FROM career_users WHERE id=$1 FOR UPDATE",[session.userId]);const row=selected.rows[0];if(!row)throw new ApiError(401,"Compte introuvable.");
      const upgrades=row.upgrades||{},ownedLogos=Array.isArray(row.owned_logos)?row.owned_logos:[];let cash=Number(row.cash)||0,logo=row.logo||"none",message="";
      if(item.type==="upgrade"){
        if((Number(upgrades[item.key])||0)>=item.level)throw new ApiError(409,"Cette amélioration est déjà achetée.");
        if(item.requires&&(Number(upgrades[item.key])||0)<item.requires)throw new ApiError(400,"Prérequis manquant : achète d’abord le niveau précédent.");
      }else if(item.type==="logo"&&ownedLogos.includes(item.logo)){
        logo=item.logo;await client.query("UPDATE career_users SET logo=$2 WHERE id=$1",[session.userId,logo]);await client.query("COMMIT");return json(res,200,{user:await userById(session.userId),message:"Logo équipé gratuitement : il est maintenant appliqué à ta monoplace."});
      }
      if(cash<item.price)throw new ApiError(400,"Fonds insuffisants : il te manque "+(item.price-cash).toLocaleString("fr-FR")+" €.");cash-=item.price;
      if(item.type==="upgrade")upgrades[item.key]=item.level;if(item.type==="logo"){logo=item.logo;if(!ownedLogos.includes(item.logo))ownedLogos.push(item.logo);}
      await client.query("UPDATE career_users SET cash=$2,upgrades=$3::jsonb,logo=$4,owned_logos=$5::jsonb WHERE id=$1",[session.userId,cash,JSON.stringify(upgrades),logo,JSON.stringify(ownedLogos)]);
      await client.query("COMMIT");message="Achat confirmé : l’argent a été débité et l’amélioration est sauvegardée sur le serveur.";return json(res,200,{user:await userById(session.userId),message});
    }catch(e){try{await client.query("ROLLBACK");}catch(_){}throw e;}finally{client.release();}
  }
  if(path==="/api/shop/equip-logo"&&req.method==="POST"){
    const session=await auth(req,false),body=await readBody(req),logo=String(body.logo||"");if(!["pg","bolt","crown","apex"].includes(logo))throw new ApiError(400,"Logo inconnu.");
    const {rows}=await pool.query("UPDATE career_users SET logo=$2 WHERE id=$1 AND owned_logos ? $2 RETURNING *",[session.userId,logo]);if(!rows[0])throw new ApiError(403,"Tu ne possèdes pas ce logo.");return json(res,200,{user:cleanUser(rows[0]),message:"Logo équipé gratuitement et sauvegardé sur le serveur."});
  }
  if(path==="/api/rewards"&&req.method==="POST"){
    const session=await auth(req,false),body=await readBody(req),runId=String(body.runId||"").slice(0,120),position=Math.floor(Number(body.position)||0),dq=body.disqualified===true;
    if(!runId)throw new ApiError(400,"Identifiant de course manquant.");if(position<1||position>99)throw new ApiError(400,"Position de course invalide.");
    const amount=dq?0:(position===1?1000000:position===2?500000:position===3?100000:0);const client=await pool.connect();try{await client.query("BEGIN");const inserted=await client.query("INSERT INTO career_race_rewards(user_id,run_id,position,amount) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,run_id) DO NOTHING RETURNING amount",[session.userId,runId,position,amount]);let reward=0,message;if(inserted.rows.length){if(amount>0)await client.query("UPDATE career_users SET cash=cash+$2 WHERE id=$1",[session.userId,amount]);reward=amount;message=amount>0?"Récompense de podium créditée et sauvegardée sur le serveur.":"Course enregistrée : aucune récompense financière pour cette position.";}else{message="Cette course a déjà été enregistrée pour ce compte.";}await client.query("COMMIT");return json(res,200,{user:await userById(session.userId),reward,message});}catch(e){try{await client.query("ROLLBACK");}catch(_){}throw e;}finally{client.release();}
  }
  if(path==="/api/admin/accounts"&&req.method==="GET"){
    await auth(req,true);const {rows}=await pool.query("SELECT username,name,color,num,cash,upgrades,logo,owned_logos,created_at FROM career_users ORDER BY created_at DESC");return json(res,200,{accounts:rows.map(r=>({...cleanUser(r),createdAt:r.created_at}))});
  }
  const cashMatch=path.match(/^\/api\/admin\/accounts\/([a-z0-9_.-]{3,20})\/cash$/);
  if(cashMatch&&req.method==="PATCH"){
    await auth(req,true);const body=await readBody(req),cash=Number(body.cash);if(!Number.isSafeInteger(cash)||cash<0||cash>9000000000000000)throw new ApiError(400,"Le solde doit être un nombre entier positif valide.");const {rows}=await pool.query("UPDATE career_users SET cash=$2 WHERE username=$1 RETURNING *",[cashMatch[1],cash]);if(!rows[0])throw new ApiError(404,"Compte introuvable.");return json(res,200,{user:cleanUser(rows[0]),message:"Solde administrateur mis à jour."});
  }
  throw new ApiError(404,"Route API introuvable.");
}
async function handleHttp(req,res){
  const url=new URL(req.url,"http://localhost"),path=url.pathname;
  if(path.startsWith("/api/")){
    const allowed=setCors(req,res);if(req.method==="OPTIONS"){res.writeHead(allowed?204:403);res.end();return;}
    if(req.headers.origin&&!allowed){json(res,403,{error:"Origine non autorisée."});return;}
    try{await routeApi(req,res,path);}catch(e){if(e.status){json(res,e.status,{error:e.message});}else{console.error("API error:",e.message);json(res,500,{error:"Erreur interne du serveur. Réessaie dans un instant."});}}
    return;
  }
  if(req.url==="/"||path==="/health"){
    let dbMessage=null;try{await ensureDb();}catch(e){dbMessage=e.message;}
    res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify({ok:true,service:"paulogames-server",rooms:rooms.size,maxPlayersPerRoom:MAX_PLAYERS,databaseConfigured:!!pool,databaseReady:schemaReady,databaseMessage:dbMessage}));return;
  }
  res.writeHead(404);res.end("Not found");
}
const snapshotTimer=setInterval(()=>{for(const room of rooms.values()){if(!room.raceActive||room.players.size===0)continue;const states=[...room.players.values()].map(p=>room.states.get(p.id)).filter(Boolean);if(!states.length)continue;const message=JSON.stringify({type:"snapshot",states});for(const p of room.players.values())if(p.ws.readyState===WebSocket.OPEN)try{p.ws.send(message);}catch(_){}}},SNAPSHOT_MS);
const server=http.createServer((req,res)=>{void handleHttp(req,res);});
const wss=new WebSocket.Server({server,path:"/ws"});
wss.on("connection",ws=>{ws.isAlive=true;ws.on("pong",()=>ws.isAlive=true);ws.on("error",err=>console.warn("WebSocket:",err.message));ws.on("message",message=>handleMessage(ws,message));ws.on("close",()=>removePlayer(ws));});
const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(ws.isAlive===false){try{ws.terminate();}catch(_){}continue;}ws.isAlive=false;try{ws.ping();}catch(_){}}},30000);
function shutdown(){clearInterval(heartbeat);clearInterval(snapshotTimer);for(const ws of wss.clients)try{ws.close(1012,"serveur en redémarrage");}catch(_){}server.close(()=>process.exit(0));if(pool)pool.end().catch(()=>{});setTimeout(()=>process.exit(0),25000).unref();}
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
server.listen(PORT,"0.0.0.0",()=>console.log("Paulogames server lancé sur le port "+PORT+" | WebSocket /ws | API carrière | 25 joueurs max"));
