(() => {
"use strict";
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const COL = {roundabout:"#29d8ff",circular:"#ffbf29",suspect:"#ff7a29",pt:"#ff2d2d"};
const ORDER = ["suspect_cw","suspect_ccw","roundabout_cw","roundabout_ccw","circular_cw","circular_ccw","mixed_cw","mixed_ccw","mixed_dir","not_closed"];
const NAMES = {suspect_cw:"🟠 Roundabout → possibly circular CW",suspect_ccw:"🟠 Roundabout → possibly circular CCW",roundabout_cw:"🔃 Roundabout CW",roundabout_ccw:"🔄 Roundabout CCW",circular_cw:"🔃 Circular CW",circular_ccw:"🔄 Circular CCW",mixed_cw:"🔃 Mixed CW",mixed_ccw:"🔄 Mixed CCW",mixed_dir:"🔄🔃 Mixed directions",not_closed:"◠ Not closed"};
const EX_HW = new Set(["motorway_junction"]);
const CATEGORY = Object.fromEntries(ORDER.map((k,i) => [k,i]));
const DEFAULT_SERVER = "https://overpass-api.de/api/";
const SERVER_KEY = "roundabout-circular-analyzer-overpass-url";
const q = $("#query"),st = $("#status"),bt = $("#run"),pr = $("#prev"),nx = $("#next"),ct = $("#counter"),ck = $("#byCluster");
const serverToggle = $("#settingsToggle"),serverPanel = $("#serverPanel"),serverUrl = $("#serverUrl"),serverSave = $("#serverSave"),serverReset = $("#serverReset");
const osm = (t,id) => `https://www.openstreetmap.org/${t}/${id}`;
const osme = (t,id) => `https://www.openstreetmap.org/edit?editor=id&${t}=${id}`;
const go = u => window.open(u,"_blank","noopener,noreferrer");
const esc = s => String(s).replace(/[&<>"']/g,c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const setS = (m,t="") => {st.textContent=m||"";st.title=t;};
const safeStore = (key,value) => {try {localStorage.setItem(key,value);} catch {}};
const safeRead = key => {try {return localStorage.getItem(key);} catch {return null;}};
const safeRemove = key => {try {localStorage.removeItem(key);} catch {}};
serverUrl.value=safeRead(SERVER_KEY)||DEFAULT_SERVER;
const showServer = show => {serverPanel.hidden=!show;serverToggle.setAttribute("aria-expanded",String(show));if(show) serverUrl.focus();};
serverToggle.addEventListener("click",() => showServer(serverPanel.hidden));
document.addEventListener("pointerdown",e => {if(!serverPanel.hidden&&!serverPanel.contains(e.target)&&!serverToggle.contains(e.target)) showServer(false);});
document.addEventListener("keydown",e => {if(e.key==="Escape") {showServer(false);closePopup();}});
const interpreter = value => {
  let u;
  try {u=new URL(value.trim());} catch {throw Error("Invalid Overpass server URL");}
  if(!["http:","https:"].includes(u.protocol)||!u.hostname||u.username||u.password||u.search||u.hash) throw Error("Invalid Overpass server URL");
  if(location.protocol==="https:"&&u.protocol==="http:") throw Error("This HTTP server cannot be used from an HTTPS page");
  let path=u.pathname.replace(/\/+$/,"");
  if(path.endsWith("/api")) path+="/interpreter";
  if(!path.endsWith("/interpreter")) throw Error("The Overpass URL must end in /api/ or /interpreter");
  u.pathname=path;
  return u.toString();
};
const saveServer = () => {const v=serverUrl.value.trim();interpreter(v);serverUrl.value=v;safeStore(SERVER_KEY,v);return v;};
serverSave.addEventListener("click",() => {try {saveServer();showServer(false);setS("Server saved");} catch(e) {setS("Server error",e.message);serverUrl.focus();}});
serverReset.addEventListener("click",() => {serverUrl.value=DEFAULT_SERVER;safeRemove(SERVER_KEY);showServer(false);setS("Default server restored");});
serverUrl.addEventListener("keydown",e => {if(e.key==="Enter") {e.preventDefault();serverSave.click();}});
if(!window.ol?.layer?.WebGLVector) {setS("Failed to load OpenLayers","Check your internet connection and the OpenLayers CDN");bt.disabled=true;return;}
const {ol}=window;
const roadsSource = new ol.source.Vector({wrapX:false});
const nodesSource = new ol.source.Vector({wrapX:false});
const highlightSource = new ol.source.Vector({wrapX:false});
const STYLES=[];
for(const [colorCode,color] of [[1,COL.roundabout],[2,COL.circular],[3,COL.suspect]]) {
  STYLES.push({filter:["all",["==",["get","category"],["var","activeCategory"]],["==",["get","colorCode"],colorCode],["==",["get","closed"],1]],style:{"stroke-color":color,"stroke-width":3,"stroke-line-cap":"round","stroke-line-join":"round"}});
  STYLES.push({filter:["all",["==",["get","category"],["var","activeCategory"]],["==",["get","colorCode"],colorCode],["==",["get","closed"],0]],style:{"stroke-color":color,"stroke-width":8,"stroke-line-dash":[4,4],"stroke-line-cap":"butt","stroke-line-join":"round"}});
}
const roadsLayer = new ol.layer.WebGLVector({source:roadsSource,variables:{activeCategory:-1},style:STYLES,disableHitDetection:false});
const nodeStyle = new ol.style.Style({image:new ol.style.Circle({radius:5,fill:new ol.style.Fill({color:COL.pt}),stroke:new ol.style.Stroke({color:"#fff",width:1})})});
let activeCategory=-1;
const nodesLayer = new ol.layer.Vector({source:nodesSource,style:f => f.get("category")===activeCategory?nodeStyle:null});
const highlightLayer = new ol.layer.Vector({source:highlightSource,style:f => new ol.style.Style({stroke:new ol.style.Stroke({color:f.get("color"),width:f.get("closed")?6:16,lineDash:f.get("closed")?undefined:[4,4]})}),renderBuffer:20});
const mp = new ol.Map({target:"map",layers:[new ol.layer.Tile({className:"dark-base-layer",source:new ol.source.OSM({referrerPolicy:"strict-origin-when-cross-origin"})}),roadsLayer,highlightLayer,nodesLayer],view:new ol.View({center:ol.proj.fromLonLat([2.17,41.4]),zoom:13,minZoom:5,maxZoom:19}),controls:new ol.Collection([new ol.control.Attribution(),new ol.control.Zoom({className:"ol-zoom"})])});
const popup = $("#popup");
const popupOverlay = new ol.Overlay({element:popup,positioning:"bottom-center",offset:[0,-13],stopEvent:true,autoPan:{animation:{duration:160}}});
mp.addOverlay(popupOverlay);
const closePopup = () => {popup.hidden=true;popupOverlay.setPosition(undefined);};
const openNodePopup = feature => {
  const id=feature.get("osmId"),hw=feature.get("highway");
  popup.innerHTML=`<div class="pop"><div class="head"><div class="t">highway=${esc(hw)}</div><button type="button" class="close" data-close="1" aria-label="Close popup">×</button></div><div class="kv"><div class="k">node</div><div class="v">${esc(id)}</div></div><div class="bar"><button type="button" class="pbtn" data-url="${osm("node",id)}" title="View on OSM" aria-label="View on OSM">🔍</button><button type="button" class="pbtn" data-url="${osme("node",id)}" title="Edit in iD" aria-label="Edit in iD">✏️</button></div></div>`;
  popup.hidden=false;
  popupOverlay.setPosition(feature.getGeometry().getCoordinates());
};
popup.addEventListener("click",e => {const btn=e.target.closest("button");if(!btn)return;if(btn.dataset.close)closePopup();else if(btn.dataset.url)go(btn.dataset.url);});
mp.on("click",e => {
  if(activeCategory<0) return;
  const hit=mp.forEachFeatureAtPixel(e.pixel,(f,layer) => f.get("category")===activeCategory?{feature:f,layer}:undefined,{layerFilter:layer => layer===nodesLayer||layer===roadsLayer});
  if(!hit) {closePopup();return;}
  if(hit.layer===nodesLayer) openNodePopup(hit.feature);
  else if(hit.layer===roadsLayer) {closePopup();go(hit.feature.get("url"));}
});
let cat=null,iSel=-1,box={},itm={},clusterExt={},busy=false,ac=null;
const ll=a => a?.at?.(-1);
const pts=g => Array.isArray(g)?g.map(p => [p.lat,p.lon]):[];
const boundsOf=f => f.getGeometry().getExtent();
const sel=() => itm[cat]?.[iSel];
const hasSel=() => !!sel();
const cInfo=() => {if(!hasSel())return {i:0,n:0};const cs=[...new Set(itm[cat].map(e => e.cluster))];return {i:cs.indexOf(sel().cluster)+1,n:cs.length};};
const jump=a => {if(!hasSel())return -1;const c=sel().cluster,A=itm[cat];for(let i=iSel+a;i>=0&&i<A.length;i+=a)if(A[i].cluster!==c)return i;return -1;};
const up=() => {const {i,n}=cInfo(),len=itm[cat]?.length||0;ct.textContent=cat?(ck.checked?`${i}/${n}`:`${Math.max(iSel+1,0)}/${len}`):"0/0";pr.disabled=!len||(!ck.checked?iSel<=0:jump(-1)<0);nx.disabled=!len||(!ck.checked?iSel>=len-1:jump(1)<0);};
const focus=n => {
  if(!itm[cat]?.[n])return;
  iSel=n;
  const o=sel(),f=o.feature;
  highlightSource.clear();
  highlightSource.addFeature(new ol.Feature({geometry:f.getGeometry().clone(),color:f.get("color"),closed:f.get("closed")}));
  closePopup();
  const view=mp.getView();
  if(ck.checked) {
    const ext=clusterExt[cat]?.get(o.cluster);
    if(ext) view.fit(ext.slice(),{size:mp.getSize(),padding:[35,35,35,35],maxZoom:18,duration:150});
  } else {
    const ext=boundsOf(f);
    view.fit(ext.slice(),{size:mp.getSize(),padding:[24,24,24,24],maxZoom:19,duration:0});
    view.setZoom(Math.max(5,(view.getZoom()||13)-2));
  }
  const list=$("#list");
  list.querySelector(".list-item.active")?.classList.remove("active");
  const row=list.querySelector(`[data-i="${iSel}"]`);
  row?.classList.add("active");
  row?.scrollIntoView({block:"nearest"});
  up();
};
const step=a => focus(ck.checked?jump(a):iSel+a);
pr.addEventListener("click",() => step(-1));
nx.addEventListener("click",() => step(1));
ck.addEventListener("change",up);
const clear=() => {
  roadsSource.clear();
  nodesSource.clear();
  highlightSource.clear();
  roadsLayer.updateStyleVariables({activeCategory:-1});
  activeCategory=-1;
  nodesLayer.changed();
  closePopup();
  cat=null;
  iSel=-1;
  box={};
  itm={};
  clusterExt={};
  $$(".box.active").forEach(el => el.classList.remove("active"));
  up();
};
const proc=d => {
  const stat=Object.fromEntries(ORDER.map(k => [k,0]));
  const cid=Object.fromEntries(ORDER.map(k => [k,1]));
  box=Object.fromEntries(ORDER.map(k => [k,[]]));
  itm=Object.fromEntries(ORDER.map(k => [k,[]]));
  const lines=[],nodes=[];
  const nMap=new Map(d.elements.filter(e => e.type==="node").map(n => [n.id,n.tags||{}]));
  const nPos=new Map(d.elements.filter(e => e.type==="node"&&typeof e.lat==="number"&&typeof e.lon==="number").map(n => [n.id,[n.lat,n.lon]]));
  const wayMap=new Map();
  const area=a => Array.isArray(a)&&a.length?a.reduce((s,p,j) => j?s+p.lon*a[j-1].lat-a[j-1].lon*p.lat:s,0)/2:0;
  const colorCode=color => color===COL.circular?2:color===COL.suspect?3:1;
  const make=(c,u,cl,co,k) => {
    const f=new ol.Feature({geometry:new ol.geom.LineString(c.map(p => ol.proj.fromLonLat([p[1],p[0]]))),url:u,category:CATEGORY[k],colorCode:colorCode(co),color:co,closed:cl?1:0});
    lines.push(f);
    return f;
  };
  const mkPt=(p,hw,id,k) => {
    const f=new ol.Feature({geometry:new ol.geom.Point(ol.proj.fromLonLat([p[1],p[0]])),category:CATEGORY[k],highway:hw,osmId:id});
    nodes.push(f);
    return f;
  };
  const add=(k,id,f,ps=[]) => {box[k].push(f,...ps);itm[k].push({id,feature:f,cluster:cid[k]});};
  const addWay=(k,w,cl=1,co=COL[w.tags?.junction]||COL.roundabout,u=osm("way",w.id),id=w.id) => add(k,id,make(pts(w.geometry),u,cl,co,k));
  const badNodes=w => Array.isArray(w?.nodes)?w.nodes.map(id => {const hw=nMap.get(id)?.highway,p=nPos.get(id);return hw&&!EX_HW.has(hw)&&p?{id,hw,p}:0;}).filter(Boolean):[];
  const isSus=w => w?.tags?.junction==="roundabout"&&badNodes(w).length;
  const mkBad=(ws,k) => {const seen=new Set(),result=[];ws.forEach(w => badNodes(w).forEach(({id,hw,p}) => {if(!seen.has(id)){seen.add(id);result.push(mkPt(p,hw,id,k));}}));return result;};
  const grp=ws => {
    const m=new Map(),v=new Set(),result=[];
    ws.forEach(w => [w.nodes?.[0],ll(w.nodes)].filter(Boolean).forEach(n => (m.get(n)||m.set(n,[]).get(n)).push(w)));
    ws.forEach(w => {
      if(v.has(w.id))return;
      const queue=[w],g=[];
      v.add(w.id);
      while(queue.length){const c=queue.pop();g.push(c);[c.nodes?.[0],ll(c.nodes)].filter(Boolean).forEach(n => (m.get(n)||[]).forEach(y => {if(!v.has(y.id)){v.add(y.id);queue.push(y);}}));}
      result.push(g);
    });
    return result;
  };
  d.elements.forEach(e => {if(e.type!=="way")return;const c=wayMap.get(e.id);if(c){if(!c.geometry&&e.geometry)wayMap.set(e.id,e);}else wayMap.set(e.id,e);});
  const ways=[...wayMap.values()].filter(e => ["roundabout","circular"].includes(e.tags?.junction)&&Array.isArray(e.geometry)&&e.geometry.length>1),openWays=[];
  ways.forEach(w => {
    const cl=w.nodes?.[0]===ll(w.nodes),sus=isSus(w),co=sus?COL.suspect:COL[w.tags.junction];
    if(!cl){openWays.push(w);return;}
    const dir=area(w.geometry)>0?"cw":"ccw",k=w.tags.junction==="roundabout"&&sus?`suspect_${dir}`:`${w.tags.junction}_${dir}`;
    stat[k]++;
    add(k,w.id,make(pts(w.geometry),osm("way",w.id),1,co,k),sus?mkBad([w],k):[]);
    cid[k]++;
  });
  grp(openWays).forEach(gp => {
    if(!gp?.[0]?.geometry?.length){stat.not_closed++;gp.forEach(w => addWay("not_closed",w,0));cid.not_closed++;return;}
    let co=[...gp[0].geometry],r=0,ok=1;
    for(let j=1;j<gp.length&&ok;j++){
      const g=gp[j].geometry,l=ll(co),e=ll(g);
      if(!g?.length||!l||!e){ok=0;break;}
      if(l.lat===g[0].lat&&l.lon===g[0].lon)co=co.concat(g.slice(1));
      else if(l.lat===e.lat&&l.lon===e.lon){co=co.concat(g.slice(0,-1).reverse());r++;}
      else ok=0;
    }
    const fid=gp[0].id,u=osm("way",fid),jn=gp[0].tags.junction;
    if(!ok){stat.not_closed++;gp.forEach(w => addWay("not_closed",w,0,COL[w.tags.junction]));cid.not_closed++;return;}
    if(co[0].lat!==ll(co).lat||co[0].lon!==ll(co).lon){stat.not_closed++;add("not_closed",fid,make(co.map(p => [p.lat,p.lon]),u,0,COL[jn],"not_closed"));cid.not_closed++;return;}
    const set=new Set(gp.map(w => w.tags.junction));
    if(set.size===1){
      const j=[...set][0],dir=area(co)>0?"cw":"ccw",sus=j==="roundabout"&&gp.some(isSus),k=j==="roundabout"&&sus?`suspect_${dir}`:`${j}_${dir}`;
      const f=make(co.map(p => [p.lat,p.lon]),u,1,sus?COL.suspect:COL[j],k);
      stat[k]++;
      add(k,fid,f,sus?mkBad(gp,k):[]);
      gp.forEach((w,i) => {if(i)itm[k].push({id:w.id,feature:f,cluster:cid[k]});});
      cid[k]++;
    }else{
      const k=r>0?"mixed_dir":area(co)>0?"mixed_cw":"mixed_ccw",c=cid[k];
      stat[k]++;
      gp.forEach(w => {const sus=isSus(w),f=make(pts(w.geometry),osm("way",w.id),1,sus?COL.suspect:COL[w.tags.junction],k);box[k].push(f);itm[k].push({id:w.id,feature:f,cluster:c});});
      cid[k]++;
    }
  });
  const extents={};
  ORDER.forEach(k => {const map=new Map();itm[k].forEach(({feature,cluster}) => {const ext=boundsOf(feature);if(map.has(cluster))ol.extent.extend(map.get(cluster),ext);else map.set(cluster,ext.slice());});extents[k]=map;});
  clusterExt=extents;
  roadsSource.addFeatures(lines);
  nodesSource.addFeatures(nodes);
  return {stat,ord:ORDER};
};
const list=k => {
  const target=$("#list"),frag=document.createDocumentFragment();
  target.replaceChildren();
  let cluster=0;
  itm[k].forEach(({id,cluster:c},i) => {
    if(c!==cluster){const h=document.createElement("div");h.className="list-cluster";h.textContent=`Cluster ${c}`;frag.appendChild(h);cluster=c;}
    const row=document.createElement("div");row.className="list-item";row.dataset.i=i;row.textContent=`way ${id}`;row.tabIndex=0;row.setAttribute("role","listitem");frag.appendChild(row);
  });
  target.appendChild(frag);
};
$("#list").addEventListener("click",e => {const row=e.target.closest(".list-item");if(row)focus(Number(row.dataset.i));});
$("#list").addEventListener("keydown",e => {if(e.key==="Enter"||e.key===" "){const row=e.target.closest(".list-item");if(row){e.preventDefault();focus(Number(row.dataset.i));}}});
const activate=k => {
  cat=k;
  iSel=-1;
  activeCategory=CATEGORY[k];
  roadsLayer.updateStyleVariables({activeCategory});
  nodesLayer.changed();
  highlightSource.clear();
  closePopup();
  $$(".box").forEach(b => b.classList.toggle("active",b.dataset.cat===k));
  list(k);
  if(itm[k]?.length)focus(0);else up();
  setS("Ready",`Layer ${k} (${box[k]?.length||0} geometries)`);
};
const stats=o => {
  const c=$("#stats"),frag=document.createDocumentFragment();
  c.replaceChildren();
  o.ord.forEach(k => {const div=document.createElement("div");div.className="box";div.dataset.cat=k;div.tabIndex=0;div.setAttribute("role","button");div.setAttribute("aria-label",`${NAMES[k]}: ${o.stat[k]}`);const name=document.createElement("span"),num=document.createElement("span");name.textContent=NAMES[k];num.textContent=o.stat[k]||0;div.append(name,num);frag.appendChild(div);});
  c.appendChild(frag);
};
$("#stats").addEventListener("click",e => {const row=e.target.closest(".box");if(row)activate(row.dataset.cat);});
$("#stats").addEventListener("keydown",e => {if(e.key==="Enter"||e.key===" "){const row=e.target.closest(".box");if(row){e.preventDefault();activate(row.dataset.cat);}}});
const httpMsg=(code,body="") => (({400:"Bad request",401:"Unauthorized",403:"Forbidden",404:"Not found",429:"Too many requests (rate limit)",500:"Server error",502:"Gateway error",503:"Service unavailable",504:"Gateway timeout"}[code]||`HTTP ${code}`)+(body?` — ${body.slice(0,220).replace(/\s+/g," ").trim()}`:""));
const sleep=ms => new Promise(r => setTimeout(r,ms));
const fetchJ=async(u,{ms=45000,tries=1,signal,headers}={}) => {
  for(let a=0;a<tries;a++){
    const controller=new AbortController();
    const timer=setTimeout(() => controller.abort(),ms);
    const onAbort=() => controller.abort();
    if(signal)signal.addEventListener("abort",onAbort,{once:true});
    try{
      if(signal?.aborted)throw Error("Request cancelled");
      const r=await fetch(u,{signal:controller.signal,headers:{Accept:"application/json,text/plain;q=0.9,*/*;q=0.8",...headers}});
      if(!r.ok){
        let body="";
        try{body=await r.text();}catch{}
        if([429,502,503,504].includes(r.status)&&a<tries-1){await sleep(500*(a+1));continue;}
        throw Error(httpMsg(r.status,body));
      }
      const contentType=r.headers.get("content-type")||"";
      if(contentType.includes("application/json")){try{return await r.json();}catch{throw Error("Invalid JSON response");}}
      let body="";
      try{body=await r.text();}catch{}
      throw Error("Non-JSON response"+(body?` — ${body.slice(0,220).replace(/\s+/g," ").trim()}`:""));
    }catch(e){
      if(signal?.aborted)throw Error("Request cancelled");
      if(controller.signal.aborted){if(a<tries-1){await sleep(500*(a+1));continue;}throw Error("Network timeout");}
      throw e instanceof Error?e:Error(String(e));
    }finally{clearTimeout(timer);if(signal)signal.removeEventListener("abort",onAbort);}
  }
};
const rid=async(t,signal) => {
  if(/^\d+$/.test(t))return t;
  setS("Searching for area…",`Nominatim: ${t}`);
  const d=await fetchJ("https://nominatim.openstreetmap.org/search?format=json&limit=5&q="+encodeURIComponent(t),{ms:20000,tries:2,signal,headers:{"Accept-Language":"en"}});
  if(!d?.length)throw Error("Nominatim: not found");
  const o=d.find(x => x.osm_type==="relation")||d[0];
  if(o.osm_type!=="relation")throw Error("Nominatim: no relation found");
  return o.osm_id;
};
const run=async() => {
  if(busy)return;
  const t=q.value.trim();
  if(!t){setS("Enter an area");q.focus();return;}
  let endpoint;
  try{endpoint=interpreter(saveServer());}catch(e){setS("Invalid server",e.message);showServer(true);return;}
  busy=true;
  bt.disabled=true;
  ac?.abort();
  ac=new AbortController();
  clear();
  $("#list").replaceChildren();
  $("#stats").replaceChildren();
  try{
    setS("Starting…",`Area: ${t}`);
    const id=await rid(t,ac.signal);
    const sql=`[out:json][timeout:60][maxsize:256Mi];rel(${id});map_to_area->.a;(way[junction~"^(roundabout|circular)$"](area.a);)->.w;.w out geom;(.w;>;);out body;`;
    setS("Querying Overpass…",`Relation ${id}`);
    const data=await fetchJ(endpoint+"?data="+encodeURIComponent(sql),{ms:70000,tries:3,signal:ac.signal});
    if(data?.remark)throw Error(`Overpass: ${String(data.remark).slice(0,260)}`);
    if(!Array.isArray(data?.elements))throw Error("Overpass: unexpected format");
    setS("Processing…",`Elements: ${data.elements.length}`);
    stats(proc(data));
    setS(`${data.elements.length} elements`, `OK (${data.elements.length} elements)`);
  }catch(e){
    const m=e?.message||String(e);
    setS(`Error: ${m}`,m);
    $("#stats").replaceChildren();
    $("#list").replaceChildren();
    clear();
  }finally{busy=false;bt.disabled=false;}
};
ck.checked=true;
up();
bt.addEventListener("click",run);
q.addEventListener("keydown",e => {if(e.key==="Enter")run();});
window.addEventListener("resize",() => mp.updateSize());
})();
