/* Skiffo — carte réelle d'un domaine (OpenStreetMap) + itinéraire sur le vrai réseau pistes / remontées.
   Données : www/data/graphs/<domaine>.json produites par collector/graphs.js (© contributeurs OpenStreetMap, ODbL). */
(function(){
  var R={id:null,name:'',d:null,g:null,net:null,loading:false,err:'',from:null,to:null,crit:'rapide',level:'int',style:'plan',map:null,L:{},me:null,route:null,pt:{},watch:null,msg:''};
  try{var sv=JSON.parse(localStorage.getItem('skiffo.real')||'{}');['crit','level','style'].forEach(function(k){if(sv[k])R[k]=sv[k]});}catch(e){}
  function save(){try{localStorage.setItem('skiffo.real',JSON.stringify({crit:R.crit,level:R.level,style:R.style}))}catch(e){}}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function slug(s){return String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
  var DIFFLBL={vert:'verte',bleu:'bleue',rouge:'rouge',noir:'noire'},COL={vert:'#2fa84f',bleu:'#2f6df6',rouge:'#e5393b',noir:'#1c1c22','':'#8a8f98'};
  var RANK={vert:1,bleu:2,rouge:3,noir:4},CAP={deb:2,int:3,exp:4};
  var PSPD={vert:5,bleu:7,rouge:8,noir:7},LSPD={gondola:5,cable_car:6,chair_lift:3,mixed_lift:4,drag_lift:2.2,'t-bar':2.2,'j-bar':2.2,platter:2.2,magic_carpet:.8,rope_tow:1.5,funicular:6};
  var LWAIT={gondola:90,cable_car:180,chair_lift:150,mixed_lift:120,funicular:120},LLBL={gondola:'télécabine',cable_car:'téléphérique',chair_lift:'télésiège',mixed_lift:'télécabine/télésiège',drag_lift:'téléski','t-bar':'téléski','j-bar':'téléski',platter:'téléski',magic_carpet:'tapis',rope_tow:'fil neige',funicular:'funiculaire'};
  var CRITS={rapide:'Le plus rapide',remontees:'Le moins de remontées',facile:'Le plus facile'},LEVELS={deb:'Débutant',int:'Intermédiaire',exp:'Expert'};
  var STYLES={plan:['Plan','https://tile.openstreetmap.org/{z}/{x}/{y}.png','© OpenStreetMap'],satellite:['Satellite','https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}','Imagerie © Esri'],relief:['Relief','https://tile.opentopomap.org/{z}/{x}/{y}.png','© OpenTopoMap']};
  var haversine=function(a,b){var r=Math.PI/180,dl=(b[0]-a[0])*r,dn=(b[1]-a[1])*r,x=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dn/2)*Math.sin(dn/2);return 12742000*Math.asin(Math.sqrt(x))};

  /* ---- réseau routable ---- */
  function buildNet(g){
    var adj={},ids=Object.keys(g.nodes),have={};
    function add(a,b,c,e){(adj[a]||(adj[a]=[])).push({to:b,c:c,e:e});have[a+'>'+b]=1}
    g.edges.forEach(function(e){
      var c;
      if(e.k==='l')c=e.len/(LSPD[e.t]||3)+(LWAIT[e.t]||60);
      else c=e.len/(PSPD[e.d]||6);
      e.cost=c;add(e.a,e.z,c,e);
      if(e.k==='p'&&e.up)add(e.z,e.a,c*1.8,e);
    });
    var liftEnd={};g.edges.forEach(function(e){if(e.k==='l'){liftEnd[e.a]=1;liftEnd[e.z]=1}});
    var cell=.0007,grid={};
    ids.forEach(function(i){var p=g.nodes[i],k=Math.floor(p[0]/cell)+':'+Math.floor(p[1]/cell);(grid[k]||(grid[k]=[])).push(i)});
    ids.forEach(function(i){
      var p=g.nodes[i],cx=Math.floor(p[0]/cell),cy=Math.floor(p[1]/cell);
      for(var x=-1;x<=1;x++)for(var y=-1;y<=1;y++){(grid[(cx+x)+':'+(cy+y)]||[]).forEach(function(j){
        if(j===i||have[i+'>'+j])return;
        var d=haversine(p,g.nodes[j]),lim=(liftEnd[i]||liftEnd[j])?70:22;
        if(d<=lim)add(i,j,d/1.6+25,{k:'w',len:d});
      })}
    });
    return {adj:adj,ids:ids,grid:grid,cell:cell};
  }
  function nearest(ll,maxM){
    var g=R.g,best=null,bd=Infinity;
    R.net.ids.forEach(function(i){var d=haversine(ll,g.nodes[i]);if(d<bd){bd=d;best=i}});
    return best&&bd<=(maxM||1e9)?{id:best,d:bd}:null;
  }
  function Heap(){this.a=[]}
  Heap.prototype.push=function(k,v){var a=this.a;a.push([k,v]);var i=a.length-1;while(i>0){var p=(i-1)>>1;if(a[p][0]<=a[i][0])break;var t=a[p];a[p]=a[i];a[i]=t;i=p}};
  Heap.prototype.pop=function(){var a=this.a,top=a[0],last=a.pop();if(a.length){a[0]=last;var i=0;for(;;){var l=2*i+1,r=l+1,m=i;if(l<a.length&&a[l][0]<a[m][0])m=l;if(r<a.length&&a[r][0]<a[m][0])m=r;if(m===i)break;var t=a[m];a[m]=a[i];a[i]=t;i=m}}return top};
  function edgeCost(e,c){
    var x=c;
    if(e.k==='l'&&R.crit==='remontees')x+=900;
    if(e.k==='p'&&R.crit==='facile')x+=e.len*(Math.max(0,(RANK[e.d]||2)-1))*.45;
    return x;
  }
  function ok(e){return e.k!=='p'||(RANK[e.d]||2)<=CAP[R.level]}
  function solve(a,b){
    if(a===b)return [];
    var adj=R.net.adj,dist={},prev={},h=new Heap();dist[a]=0;h.push(0,a);
    while(h.a.length){
      var t=h.pop(),d=t[0],u=t[1];if(d>dist[u])continue;if(u===b)break;
      (adj[u]||[]).forEach(function(x){
        if(!ok(x.e))return;var nd=d+edgeCost(x.e,x.c);
        if(dist[x.to]===undefined||nd<dist[x.to]){dist[x.to]=nd;prev[x.to]={u:u,x:x};h.push(nd,x.to)}
      });
    }
    if(dist[b]===undefined)return null;
    var path=[],c=b;while(c!==a){var p=prev[c];path.unshift(p.x);c=p.u}
    return path;
  }
  function steps(path){
    var out=[];
    path.forEach(function(x){
      var e=x.e;if(e.k==='w'){var l=out[out.length-1];if(l)l.sec+=x.c;return}
      var last=out[out.length-1],nm=e.n||null;
      if(last&&last.k===e.k&&last.n===nm&&nm&&last.d===e.d&&last.t===e.t){last.sec+=x.c;last.len+=e.len;last.g=last.g.concat(e.g);return}
      out.push({k:e.k,n:nm,d:e.d,t:e.t,sec:x.c,len:e.len,g:e.g.slice()});
    });
    return out;
  }
  /* ---- point de départ / arrivée ---- */
  function ptNode(v){
    if(!v)return null;
    if(v==='gps'){return R.me?nearest(R.me,5000):null}
    if(v.indexOf('n:')===0)return R.g.nodes[v.slice(2)]?{id:v.slice(2),d:0}:null;
    if(v==='map'&&R.pt.map)return nearest(R.pt.map,800);
    return null;
  }
  function compute(){
    R.route=null;R.msg='';
    var a=ptNode(R.from),b=ptNode(R.to);
    if(!a||!b){if(R.from==='gps'&&!R.me)R.msg='Position GPS indisponible : choisis un départ dans la liste.';return}
    var p=solve(a.id,b.id);
    if(p===null){R.route={none:true};return}
    var st=steps(p),sec=0,km=0,lifts=0,pistes=0;
    st.forEach(function(s){sec+=s.sec;if(s.k==='l')lifts++;else{pistes++;km+=s.len/1000}});
    R.route={steps:st,sec:sec,km:km,lifts:lifts,pistes:pistes};
  }
  /* ---- vue ---- */
  function optionsHtml(sel,isFrom){
    var g=R.g,seen={},lifts=[],pistes=[];
    g.edges.forEach(function(e){
      if(!e.n)return;
      if(e.k==='l'){var k1='l'+e.n+e.a;if(!seen[k1]){seen[k1]=1;lifts.push([(isFrom?'Départ · ':'Haut de ')+e.n,'n:'+(isFrom?e.a:e.z)])}}
      else{var k2='p'+e.n+(isFrom?e.a:e.z);if(!seen[k2]){seen[k2]=1;pistes.push([(isFrom?'Haut de la piste ':'Bas de la piste ')+e.n,'n:'+(isFrom?e.a:e.z)])}}
    });
    var srt=function(a,b){return a[0].localeCompare(b[0],'fr')},o=function(l){return l.map(function(x){return '<option value="'+esc(x[1])+'"'+(sel===x[1]?' selected':'')+'>'+esc(x[0])+'</option>'}).join('')};
    return '<option value=""'+(!sel?' selected':'')+'>'+(isFrom?'Choisir le départ…':'Choisir l\'arrivée…')+'</option><option value="gps"'+(sel==='gps'?' selected':'')+'>📍 Ma position</option>'+(R.pt.map?'<option value="map"'+(sel==='map'?' selected':'')+'>📌 Point touché sur la carte</option>':'')+
      '<optgroup label="Remontées">'+o(lifts.sort(srt))+'</optgroup><optgroup label="Pistes">'+o(pistes.sort(srt))+'</optgroup>';
  }
  function fmtMin(s){var m=Math.max(1,Math.round(s/60));return m>=60?Math.floor(m/60)+' h '+('0'+m%60).slice(-2):m+' min'}
  function panelHtml(){
    if(R.loading||(!R.g&&!R.err))return '<div class="rr-card"><b>Chargement des pistes de '+esc(R.name)+'…</b></div>';
    if(R.err)return '<div class="rr-card"><b>'+esc(R.err)+'</b><p class="rr-note">Les pistes de cette station ne sont pas encore dans l\'appli. Choisis-en une autre dans l\'onglet Domaines.</p></div>';
    var g=R.g,s=g.stats,h='<div class="rr-card"><div class="rr-title"><b>'+esc(R.name)+'</b><span>'+s.pistes+' pistes · '+Math.round(s.pisteKm)+' km · '+s.lifts+' remontées</span></div>';
    h+='<label class="rr-f"><i class="a"></i><span>Départ</span><select id="rr-from">'+optionsHtml(R.from,true)+'</select></label>'+
       '<label class="rr-f"><i class="b"></i><span>Arrivée</span><select id="rr-to">'+optionsHtml(R.to,false)+'</select></label>'+
       '<p class="rr-note" style="margin:6px 0 10px">Ou touche la carte pour fixer l\'arrivée.<button type="button" class="rr-sw" data-rr-swap>⇅ Inverser</button></p>';
    h+='<div class="rr-lbl">Optimiser</div><div class="rr-seg">'+Object.keys(CRITS).map(function(c){return '<button type="button" class="chip" data-rr-crit="'+c+'" aria-pressed="'+(R.crit===c)+'">'+CRITS[c]+'</button>'}).join('')+'</div>';
    h+='<div class="rr-lbl">Mon niveau</div><div class="rr-seg">'+Object.keys(LEVELS).map(function(c){return '<button type="button" class="chip" data-rr-level="'+c+'" aria-pressed="'+(R.level===c)+'">'+LEVELS[c]+'</button>'}).join('')+'</div></div>';
    h+='<div class="rr-card">';
    if(R.msg)h+='<p class="rr-note">'+esc(R.msg)+'</p>';
    else if(!R.route)h+='<p class="rr-note"><b>Choisis un départ et une arrivée</b> pour calculer ton itinéraire sur les vraies pistes et remontées.</p>';
    else if(R.route.none)h+='<p class="rr-note"><b>Aucun itinéraire trouvé.</b> Essaie un niveau au-dessus, ou une autre arrivée : certaines liaisons ne sont pas reliées dans les données OpenStreetMap.</p>';
    else{
      var r=R.route;
      h+='<div class="rr-sum"><div class="rr-big">'+fmtMin(r.sec)+'</div><div class="rr-meta"><b>'+r.lifts+'</b> remontée'+(r.lifts>1?'s':'')+'<br><b>'+r.pistes+'</b> piste'+(r.pistes>1?'s':'')+' · '+r.km.toFixed(1).replace('.',',')+' km</div></div><ol class="rr-steps">';
      r.steps.forEach(function(s){
        if(s.k==='l')h+='<li><span class="rr-ic lift">⤴</span><div><b>Prends '+esc(s.n||'une remontée')+'</b><small>'+(LLBL[s.t]||'remontée')+' · '+fmtMin(s.sec)+'</small></div></li>';
        else h+='<li><span class="rr-ic" style="background:'+COL[s.d||'']+'"></span><div><b>Descends '+esc(s.n||'la piste')+'</b><small>'+(s.d?'Piste '+DIFFLBL[s.d]:'Piste')+' · '+(s.len/1000).toFixed(1).replace('.',',')+' km · '+fmtMin(s.sec)+'</small></div></li>';
      });
      h+='</ol>';
    }
    h+='<p class="rr-note rr-fine">Temps estimés d\'après la longueur des pistes et le type de remontée. L\'état d\'ouverture en direct n\'est pas encore branché : l\'itinéraire suppose tout ouvert.</p></div>';
    h+='<p class="rr-note rr-fine" style="padding:0 4px">Pistes et remontées : © contributeurs OpenStreetMap (ODbL), mis à jour le '+new Date(g.generatedAt).toLocaleDateString('fr-FR')+'.</p>';
    return h;
  }
  function view(d){
    return '<div class="rr"><div class="rr-map"><div id="rrmap"></div><div class="rr-ctl">'+Object.keys(STYLES).map(function(k){return '<button type="button" data-rr-style="'+k+'" aria-pressed="'+(R.style===k)+'">'+STYLES[k][0]+'</button>'}).join('')+'<button type="button" data-rr-me aria-label="Ma position">📍</button></div></div><div id="rrpanel">'+panelHtml()+'</div></div>';
  }
  /* ---- carte ---- */
  var tile=null;
  function setTiles(){
    if(!R.map)return;
    if(tile)R.map.removeLayer(tile);
    var s=STYLES[R.style]||STYLES.plan;
    tile=L.tileLayer(s[1],{maxZoom:R.style==='relief'?17:19,attribution:s[2]}).addTo(R.map);tile.bringToBack();
  }
  function drawNet(){
    var g=R.g,m=R.map;if(!m||!g)return;
    var order=['','vert','bleu','rouge','noir'];
    var pl=L.layerGroup().addTo(m);
    order.forEach(function(dd){g.edges.forEach(function(e){if(e.k==='p'&&(e.d||'')===dd)L.polyline(e.g,{color:COL[dd],weight:dd==='noir'?3.2:3,opacity:.92,interactive:false}).addTo(pl)})});
    var ll=L.layerGroup().addTo(m);
    g.edges.forEach(function(e){if(e.k==='l'){L.polyline(e.g,{color:'#fff',weight:5,opacity:.9,interactive:false}).addTo(ll);L.polyline(e.g,{color:'#7b1fa2',weight:2.4,dashArray:'7 6',interactive:false}).addTo(ll)}});
    var lb=L.layerGroup();
    g.edges.forEach(function(e){if(e.k==='l'&&e.n&&e.len>350){var p=e.g[Math.floor(e.g.length/2)];L.marker(p,{interactive:false,icon:L.divIcon({className:'rr-lbl-ic',html:'<span>'+esc(e.n)+'</span>',iconSize:[0,0]})}).addTo(lb)}});
    R.L.labels=lb;
    function lab(){if(m.getZoom()>=14)lb.addTo(m);else m.removeLayer(lb)}
    m.on('zoomend',lab);lab();
    R.L.route=L.layerGroup().addTo(m);R.L.pts=L.layerGroup().addTo(m);
  }
  function drawOverlay(){
    if(!R.map)return;
    R.L.route.clearLayers();R.L.pts.clearLayers();
    if(R.route&&R.route.steps){
      var all=[];R.route.steps.forEach(function(s){all=all.concat(s.g)});
      L.polyline(all,{color:'#fff',weight:11,opacity:.95,interactive:false}).addTo(R.L.route);
      L.polyline(all,{color:'#ffb300',weight:6,opacity:1,interactive:false}).addTo(R.L.route);
      R.route.steps.forEach(function(s){L.polyline(s.g,{color:s.k==='l'?'#7b1fa2':COL[s.d||''],weight:2.6,dashArray:s.k==='l'?'6 5':null,interactive:false}).addTo(R.L.route)});
    }
    var a=ptNode(R.from),b=ptNode(R.to),g=R.g;
    function dot(n,c){if(n)L.circleMarker(g.nodes[n.id],{radius:9,color:'#fff',weight:3,fillColor:c,fillOpacity:1,interactive:false}).addTo(R.L.pts)}
    dot(a,'#2fa84f');dot(b,'#e5393b');
    if(R.me){L.circleMarker(R.me,{radius:14,color:'#2f6df6',weight:0,fillColor:'#2f6df6',fillOpacity:.2,interactive:false}).addTo(R.L.pts);L.circleMarker(R.me,{radius:7,color:'#fff',weight:3,fillColor:'#2f6df6',fillOpacity:1,interactive:false}).addTo(R.L.pts)}
  }
  function refresh(){compute();var p=document.getElementById('rrpanel');if(p)p.innerHTML=panelHtml();drawOverlay()}
  function locate(){
    if(!navigator.geolocation){R.msg='Géolocalisation indisponible.';refresh();return}
    navigator.geolocation.getCurrentPosition(function(p){
      R.me=[p.coords.latitude,p.coords.longitude];
      var near=haversine(R.me,[R.d.lat,R.d.lon])<25000;
      if(near){if(!R.from)R.from='gps';if(R.map)R.map.setView(R.me,15)}else R.msg='Tu n\'es pas sur ce domaine : choisis un départ dans la liste.';
      refresh();
    },function(){R.msg='Position indisponible : autorise la localisation puis réessaie.';refresh()},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
  }
  function mount(d){
    var el=document.getElementById('rrmap');if(!el||!window.L)return;
    var id=slug(d.name);
    if(R.map){try{R.map.remove()}catch(e){}R.map=null}
    if(R.id!==id){
      R.id=id;R.name=d.name;R.d=d;R.g=null;R.net=null;R.err='';R.loading=true;R.from=null;R.to=null;R.route=null;R.pt={};R.msg='';
      fetch('data/graphs/'+id+'.json').then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(g){
        if(R.id!==id)return;R.g=g;R.net=buildNet(g);R.loading=false;
        var best=null,bd=1e9;g.edges.forEach(function(e){if(e.k==='l'&&e.n){var dd=haversine(g.nodes[e.a],[d.lat,d.lon]);if(dd<bd){bd=dd;best=e}}});
        if(best)R.from='n:'+best.a;
        if(document.getElementById('rrmap'))mount(d);
      }).catch(function(){if(R.id!==id)return;R.loading=false;R.err='Pas encore de données de pistes pour '+d.name;var p=document.getElementById('rrpanel');if(p)p.innerHTML=panelHtml()});
    }
    var b=R.g&&R.g.bbox,c=[d.lat,d.lon];
    R.map=L.map(el,{zoomControl:true,attributionControl:true,preferCanvas:true,maxZoom:19}).setView(c,13);
    setTiles();
    if(R.g){
      drawNet();
      var pts=[];R.g.edges.forEach(function(e){if(e.k==='l')pts.push(e.g[0],e.g[e.g.length-1])});
      if(pts.length)R.map.fitBounds(L.latLngBounds(pts).pad(.08));
      R.map.on('click',function(ev){
        var n=nearest([ev.latlng.lat,ev.latlng.lng],700);
        if(!n){R.msg='Touche plus près d\'une piste ou d\'une remontée.';refresh();return}
        R.pt.map=[R.g.nodes[n.id][0],R.g.nodes[n.id][1]];R.to='map';R.msg='';refresh();
      });
      refresh();
    }
    setTimeout(function(){if(R.map)R.map.invalidateSize()},60);
  }
  document.addEventListener('click',function(ev){
    var t=ev.target.closest&&ev.target.closest('[data-rr-crit],[data-rr-level],[data-rr-style],[data-rr-me],[data-rr-swap]');if(!t)return;
    if(t.hasAttribute('data-rr-crit')){R.crit=t.getAttribute('data-rr-crit');save();refresh();return}
    if(t.hasAttribute('data-rr-level')){R.level=t.getAttribute('data-rr-level');save();refresh();return}
    if(t.hasAttribute('data-rr-style')){R.style=t.getAttribute('data-rr-style');save();setTiles();[].forEach.call(document.querySelectorAll('[data-rr-style]'),function(b){b.setAttribute('aria-pressed',b.getAttribute('data-rr-style')===R.style)});return}
    if(t.hasAttribute('data-rr-me')){locate();return}
    if(t.hasAttribute('data-rr-swap')){var f=R.from;R.from=R.to==='map'?'map':R.to;R.to=f==='gps'||!f?f:f;refresh();return}
  });
  document.addEventListener('change',function(ev){
    if(ev.target.id==='rr-from'){R.from=ev.target.value||null;if(R.from==='gps'&&!R.me){locate();return}refresh()}
    if(ev.target.id==='rr-to'){R.to=ev.target.value||null;if(R.to==='gps'&&!R.me){locate();return}refresh()}
  });
  window.SkiReal={view:view,mount:mount,slug:slug,_R:R,_buildNet:buildNet,_solve:solve};
  var st=document.createElement('style');st.textContent=
  '.rr-map{position:relative;border-radius:14px;overflow:hidden;margin-bottom:12px;border:1px solid var(--line,#ddd)}#rrmap{height:min(56vh,520px);min-height:320px;background:#dfe6ea}'+
  '.rr-ctl{position:absolute;z-index:500;right:8px;top:8px;display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:70%}.rr-ctl button{border:0;border-radius:999px;background:rgba(255,255,255,.94);color:#222;font:600 .78rem system-ui,sans-serif;padding:6px 10px;box-shadow:0 1px 4px rgba(0,0,0,.3)}.rr-ctl button[aria-pressed=true]{background:#1b2a41;color:#fff}'+
  '.rr-card{background:var(--surface,#fff);border:1px solid var(--line,#ddd);border-radius:14px;padding:14px;margin-bottom:12px}.rr-title{display:flex;flex-direction:column;gap:2px;margin-bottom:10px}.rr-title span{color:var(--muted,#667);font-size:.82rem}'+
  '.rr-f{display:flex;align-items:center;gap:8px;margin-bottom:8px}.rr-f span{width:54px;font-size:.8rem;color:var(--muted,#667)}.rr-f select{flex:1;min-width:0;padding:10px;border-radius:10px;border:1px solid var(--line,#ccc);background:var(--surface2,var(--surface,#fff));color:inherit;font:inherit}.rr-f i{width:12px;height:12px;border-radius:50%;flex:none}.rr-f i.a{background:#2fa84f}.rr-f i.b{background:#e5393b}'+
  '.rr-lbl{font-size:.78rem;color:var(--muted,#667);margin:10px 0 6px;font-weight:700}.rr-seg{display:flex;flex-wrap:wrap;gap:6px}.rr-note{color:var(--muted,#667);font-size:.85rem;margin:0}.rr-fine{font-size:.74rem;margin-top:10px}.rr-sw{border:0;background:none;color:var(--accent,#2f6df6);font:inherit;font-weight:700;float:right}'+
  '.rr-sum{display:flex;align-items:center;gap:14px;margin-bottom:10px}.rr-big{font-size:2rem;font-weight:800}.rr-meta{font-size:.85rem;color:var(--muted,#667)}.rr-meta b{color:inherit}'+
  '.rr-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}.rr-steps li{display:flex;gap:10px;align-items:flex-start}.rr-steps small{display:block;color:var(--muted,#667);font-size:.78rem}.rr-ic{flex:none;width:22px;height:22px;border-radius:50%;margin-top:1px;display:inline-flex;align-items:center;justify-content:center;font-size:.8rem;color:#fff}.rr-ic.lift{background:#7b1fa2}'+
  '.rr-lbl-ic span{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font:700 10px system-ui,sans-serif;color:#4a148c;background:rgba(255,255,255,.85);padding:1px 5px;border-radius:6px}';
  document.head.appendChild(st);
})();
