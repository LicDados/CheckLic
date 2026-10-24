'use strict';

// ════════════════════════════════════════
//  SEGURANÇA — escape de HTML para dados não confiáveis
//  (nomes de arquivos enviados, atributos de feições KML/SHP/WMS, etc.)
// ════════════════════════════════════════
function escHtml(v){
  if(v===null||v===undefined) return '';
  return String(v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ════════════════════════════════════════
//  COPIAR COORDENADA (clipboard) — usado nos botões ao lado de Lat/Lon
// ════════════════════════════════════════
function copyCoord(value, btn){
  const text = String(value);
  const done = ok => {
    if(!btn) return;
    const original = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = ok ? '✓' : '✕';
    btn.title = ok ? 'Copiado!' : 'Falha ao copiar';
    setTimeout(()=>{ btn.innerHTML = original; btn.classList.remove('copied'); btn.title='Copiar'; }, 1200);
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(()=>done(true)).catch(()=>fallbackCopy(text,done));
  } else {
    fallbackCopy(text, done);
  }
}
function fallbackCopy(text, done){
  try{
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    done(ok);
  }catch(e){ done(false); }
}

// Monta o HTML de uma célula de coordenada com botão de copiar à direita.
// Célula de valor UTM (texto já formatado) com botão de copiar
function utmCell(txt){
  const t=escHtml(txt);
  return `<span class="coord-cell"><span class="coord-val">${t}</span>`
       + `<button type="button" class="copy-coord-btn" title="Copiar" `
       + `onclick="event.stopPropagation();copyCoord('${t}', this)" aria-label="Copiar coordenada">⧉</button></span>`;
}
function coordCell(valueNum){
  const display = valueNum.toFixed(6);
  return `<span class="coord-cell"><span class="coord-val">${display}°</span>`
       + `<button type="button" class="copy-coord-btn" title="Copiar" `
       + `onclick="event.stopPropagation();copyCoord('${display}', this)" aria-label="Copiar coordenada">⧉</button></span>`;
}


// ════════════════════════════════════════
//  MAPAS — declarados antes do tema (applyTheme usa maps)
// ════════════════════════════════════════
const maps = {ext:null, conv:null, inf:null};

// ════════════════════════════════════════
//  FORMATO DAS COORDENADAS (rodapé + popup de clique no mapa)
// ════════════════════════════════════════
// Um único formato vale para as três telas, para manter coerência entre o
// campo "Coordenadas" do rodapé, o popup exibido ao clicar no mapa e o código
// EPSG do rodapé. Padrão: UTM (SIRGAS 2000). A escolha fica salva no navegador.
const COORD_FMT_KEY = 'checklic-coord-fmt';
let coordFmt = 'utm';
try{ const v=localStorage.getItem(COORD_FMT_KEY); if(v==='utm'||v==='geo') coordFmt=v; }catch(e){}
const _lastCoordLL = {conv:null, ext:null, inf:null};

// Código EPSG do SIRGAS 2000 / UTM para o fuso (null se não houver código)
function epsgSirgasUTM(zone, south){
  if(south && zone>=17 && zone<=25) return 31960+zone;      // 31977 (17S) … 31985 (25S)
  if(!south && zone>=11 && zone<=22) return 31954+zone;     // 31965 (11N) … 31976 (22N)
  if(!south && zone===23) return 6210;
  if(!south && zone===24) return 6211;
  return null;
}
function _utmInfo(lat, lon){
  const u=geoToUTM(lat, lon), south=lat<0;
  return {...u, south, epsg:epsgSirgasUTM(u.zone, south)};
}
function fmtFooterCoord(lat, lon){
  if(coordFmt==='geo') return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  const u=geoToUTM(lat, lon);
  return `${u.zone}${u.letter} ${Math.round(u.E)} E ${Math.round(u.N)} N`;
}
// Atualiza o campo de coordenadas e o código EPSG do rodapé de uma tela
function showFooterCoord(key, latlng){
  if(!latlng) return;
  _lastCoordLL[key]=latlng;
  const el=document.getElementById('coord-'+key);
  if(el && el!==document.activeElement) el.value=fmtFooterCoord(latlng.lat, latlng.lng);
  updateEpsgLabel(key, latlng);
}
function updateEpsgLabel(key, latlng){
  const el=document.getElementById('epsgcode-'+key); if(!el) return;
  let txt='EPSG:4326';
  if(coordFmt==='utm' && latlng){
    const u=_utmInfo(latlng.lat, latlng.lng);
    txt = u.epsg ? `EPSG:${u.epsg}` : `UTM ${u.zone}${u.south?'S':'N'}`;
  }
  if(el.textContent!==txt) el.textContent=txt;
}
// Linhas do popup "📍 Coordenadas" conforme o formato escolhido
function coordPopupRows(latlng){
  if(coordFmt==='geo') return [
    ['Latitude',  latlng.lat.toFixed(6)+'°'],
    ['Longitude', latlng.lng.toFixed(6)+'°'],
  ];
  const u=_utmInfo(latlng.lat, latlng.lng);
  const dec=v=>v.toFixed(2).replace('.',',');
  return [
    ['Zona UTM', `${u.zone}${u.letter}`],
    ['E (m)', dec(u.E)],
    ['N (m)', dec(u.N)],
    ['Referência', `SIRGAS 2000 / UTM ${u.zone}${u.south?'S':'N'}${u.epsg?' · EPSG:'+u.epsg:''}`],
  ];
}
// Interpreta o texto digitado no rodapé: UTM ("23K 193110 E 8251130 N",
// "23 193110 8251130") ou lat/long ("-15.79, -47.88"). Retorna {lat,lon}|null.
function parseCoordInput(txt){
  const t=String(txt||'').trim().toUpperCase().replace(/°/g,'');
  if(!t) return null;
  const num=s=>parseFloat(String(s).replace(',','.'));
  const zm=t.match(/^(\d{1,2})\s*([C-HJ-NP-X])(?![A-Z])/);
  const resto = zm ? t.slice(zm[0].length) : t;
  const nums=(resto.match(/-?\d+(?:[.,]\d+)?/g)||[]);
  let zone=null, letter=null, E=NaN, N=NaN;
  if(zm && nums.length>=2){ zone=+zm[1]; letter=zm[2]; E=num(nums[0]); N=num(nums[1]); }
  else if(!zm && nums.length>=3 && Math.abs(num(nums[1]))>1000){ zone=+nums[0]; letter='K'; E=num(nums[1]); N=num(nums[2]); }
  if(zone!==null){
    // sem letra, assume hemisfério Sul (maior parte do Brasil)
    if(!(zone>=1&&zone<=60) || !(E>=100000&&E<=900000) || !(N>=0&&N<=10000000)) return null;
    const g=utmToGeo(E, N, zone, letter);
    return g && isFinite(g.lat) && isFinite(g.lon) ? {lat:g.lat, lon:g.lon} : null;
  }
  if(nums.length<2) return null;
  const lat=num(nums[0]), lon=num(nums[1]);
  if(!isFinite(lat)||!isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) return null;
  return {lat, lon};
}
function _coordFmtTag(){ return coordFmt==='utm' ? 'UTM' : 'Lat/Long'; }
function _coordPlaceholder(){ return coordFmt==='utm' ? '23L 193110 E 8251130 N' : 'lat, lon'; }
function applyCoordFmtUI(){
  document.querySelectorAll('[data-coordfmt-tag]').forEach(t=>t.textContent=_coordFmtTag());
  ['conv','ext','inf'].forEach(k=>{
    const el=document.getElementById('coord-'+k);
    if(el) el.placeholder=_coordPlaceholder();
    if(_lastCoordLL[k]) showFooterCoord(k, _lastCoordLL[k]); else updateEpsgLabel(k, null);
  });
}
function setCoordFmt(fmt){
  if(fmt!=='utm' && fmt!=='geo') return;
  coordFmt=fmt;
  try{ localStorage.setItem(COORD_FMT_KEY, fmt); }catch(e){}
  applyCoordFmtUI();
  // Popup de coordenadas aberto: refaz no novo formato
  Object.values(maps).forEach(m=>{
    const cp=m && m._coordPopup;
    if(cp && cp.popup && m.hasLayer(cp.popup) && typeof m._openCoordPopup==='function') m._openCoordPopup(cp.latlng);
  });
  closeCoordFmtMenu();
}
function closeCoordFmtMenu(){
  const menu=document.getElementById('coordfmt-menu');
  if(menu){
    const btn=document.getElementById('coordFmtBtn-'+menu.dataset.key);
    if(btn) btn.setAttribute('aria-expanded','false');
    menu.remove();
  }
  document.removeEventListener('mousedown', _coordFmtOutside, true);
  document.removeEventListener('keydown', _coordFmtKey, true);
}
function _coordFmtOutside(e){
  const menu=document.getElementById('coordfmt-menu');
  if(!menu) return;
  if(menu.contains(e.target) || (e.target.closest && e.target.closest('.mf-coord-fmt'))) return;
  closeCoordFmtMenu();
}
function _coordFmtKey(e){ if(e.key==='Escape'){ e.stopPropagation(); closeCoordFmtMenu(); } }
function toggleCoordFmtMenu(ev, key){
  if(ev) ev.stopPropagation();
  const aberto=document.getElementById('coordfmt-menu');
  if(aberto){ const mesmo=aberto.dataset.key===key; closeCoordFmtMenu(); if(mesmo) return; }
  const btn=document.getElementById('coordFmtBtn-'+key);
  const host=document.getElementById('footer-'+key)?.parentElement;
  if(!btn || !host) return;
  const menu=document.createElement('div');
  menu.id='coordfmt-menu'; menu.className='coordfmt-menu'; menu.dataset.key=key;
  menu.setAttribute('role','menu');
  const opt=(v,ic,tit,sub)=>`<button type="button" role="menuitemradio" aria-checked="${coordFmt===v}" class="${coordFmt===v?'on':''}" onclick="setCoordFmt('${v}')"><span class="cfm-ic">${ic}</span><span class="cfm-txt"><b>${tit}</b><small>${sub}</small></span><span class="cfm-chk">${coordFmt===v?'✓':''}</span></button>`;
  menu.innerHTML=`<div class="cfm-hdr">Exibir coordenadas em</div>`
    + opt('utm','📐','UTM (E, N)','SIRGAS 2000 · metros · fuso automático')
    + opt('geo','🌐','Latitude / Longitude','Graus decimais')
    + `<div class="cfm-note">Vale para o rodapé e para o popup ao clicar no mapa.</div>`;
  host.appendChild(menu);
  L.DomEvent.disableClickPropagation(menu); L.DomEvent.disableScrollPropagation(menu);
  const hb=host.getBoundingClientRect(), bb=btn.getBoundingClientRect();
  menu.style.left=Math.max(6, bb.left-hb.left)+'px';
  menu.style.bottom=(hb.bottom-bb.top+6)+'px';
  btn.setAttribute('aria-expanded','true');
  setTimeout(()=>{
    document.addEventListener('mousedown', _coordFmtOutside, true);
    document.addEventListener('keydown', _coordFmtKey, true);
    menu.querySelector('button.on')?.focus();
  },0);
}

// Emendas entre blocos (tiles) do mapa: em telas com escala de exibição
// fracionária (125%, 150%, zoom do navegador ≠ 100%) o navegador arredonda a
// posição de cada bloco e surgem linhas finas formando uma "grade" sobre o
// mapa. Cada bloco é ampliado em 1 px para sobrepor o vizinho e fechar a fresta.
(function(){
  if(typeof L==='undefined' || !L.GridLayer || L.GridLayer._semEmendas) return;
  const initTileOrig = L.GridLayer.prototype._initTile;
  L.GridLayer.include({
    _initTile(tile){
      initTileOrig.call(this, tile);
      const ts = this.getTileSize();
      tile.style.width  = (ts.x + 1) + 'px';
      tile.style.height = (ts.y + 1) + 'px';
    }
  });
  L.GridLayer._semEmendas = true;
})();
const mkrs = {ext:[], conv:[], inf:[]};

// ════════════════════════════════════════
//  TEMA CLARO / ESCURO + CORES
// ════════════════════════════════════════
const THEME_KEY = 'geotools-theme';
const ACCENT_KEY = 'geotools-accent';
const BG_KEY = 'geotools-bg';

const ACCENT_OPTIONS = [
  {id:'default',      label:'Padrão'},
  {id:'azul-ceu',     label:'Azul céu'},
  {id:'verde-salvia', label:'Verde sálvia'},
  {id:'lavanda',      label:'Lavanda'},
  {id:'terracota',    label:'Terracota'},
  {id:'rosa-suave',   label:'Rosa suave'},
  {id:'areia',        label:'Areia'},
];
const BG_OPTIONS = [
  {id:'padrao', label:'Padrão', color:'#f7f8fa'},
  {id:'suave',  label:'Cinza suave', color:'#f3f5f8'},
  {id:'creme',  label:'Creme', color:'#faf8f3'},
  {id:'branco', label:'Branco puro', color:'#ffffff'},
];

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = theme === 'dark' ? '☀️' : '🌙';
  ['themeBtn','themeBtn0','themeBtn2','themeBtn3'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.textContent = icon;
  });
  ['colorBtn0','colorBtn1','colorBtn2','colorBtn3'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.style.display = theme==='dark' ? 'none' : '';
  });
  if(theme==='dark'){
    document.querySelectorAll('.color-panel').forEach(p=>p.classList.remove('open'));
  }
  localStorage.setItem(THEME_KEY, theme);
  Object.values(maps).forEach(m => { if (m) m.invalidateSize(); });
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

function applyAccent(accent){
  document.documentElement.setAttribute('data-accent', accent);
  localStorage.setItem(ACCENT_KEY, accent);
  document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active', s.dataset.accent===accent));
}
function applyBg(bg){
  document.documentElement.setAttribute('data-bg', bg);
  localStorage.setItem(BG_KEY, bg);
  document.querySelectorAll('.bg-swatch').forEach(s=>s.classList.toggle('active', s.dataset.bg===bg));
}

function buildColorPanel(panel){
  if(!panel || panel.dataset.built) return;
  panel.dataset.built='1';
  const curAccent = localStorage.getItem(ACCENT_KEY) || 'default';
  const curBg = localStorage.getItem(BG_KEY) || 'padrao';
  let html = '<div class="color-panel-section"><div class="color-panel-lbl">Cor de destaque</div><div class="swatch-row">';
  ACCENT_OPTIONS.forEach(a=>{
    html += `<div class="swatch${a.id===curAccent?' active':''}" data-accent="${a.id}" title="${a.label}" onclick="applyAccent('${a.id}')"></div>`;
  });
  html += '</div></div>';
  html += '<div class="color-panel-section"><div class="color-panel-lbl">Plano de fundo</div>';
  BG_OPTIONS.forEach(b=>{
    html += `<div class="bg-swatch${b.id===curBg?' active':''}" data-bg="${b.id}" onclick="applyBg('${b.id}')"><span class="bg-dot" style="background:${b.color}"></span>${b.label}</div>`;
  });
  html += '</div>';
  panel.innerHTML = html;
}

function toggleColorPanel(id){
  const panel = document.getElementById(id);
  buildColorPanel(panel);
  const wasOpen = panel.classList.contains('open');
  document.querySelectorAll('.color-panel').forEach(p=>p.classList.remove('open'));
  if(!wasOpen) panel.classList.add('open');
}
document.addEventListener('click', e=>{
  if(!e.target.closest('.color-panel') && !e.target.closest('[id^="colorBtn"]')){
    document.querySelectorAll('.color-panel').forEach(p=>p.classList.remove('open'));
  }
});

// Carrega preferências salvas
(function(){
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);
  const accent = localStorage.getItem(ACCENT_KEY) || 'default';
  document.documentElement.setAttribute('data-accent', accent);
  const bg = localStorage.getItem(BG_KEY) || 'padrao';
  document.documentElement.setAttribute('data-bg', bg);
})();

// ════════════════════════════════════════
//  PROJ4 / SIRGAS2000
// ════════════════════════════════════════
function utmProj(zone, south) {
  return `+proj=utm +zone=${zone} ${south?'+south':''} +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs`;
}
const geoProj = '+proj=longlat +ellps=GRS80 +towgs84=0,0,0 +no_defs';

function utmToGeo(E, N, zone, letter) {
  const south = 'CDEFGHJKLM'.includes((letter||'K').toUpperCase());
  try { const [lon,lat] = proj4(utmProj(zone,south), geoProj, [E,N]); return {lat:+lat.toFixed(8),lon:+lon.toFixed(8)}; }
  catch { return null; }
}
function geoToUTM(lat, lon) {
  const zone = Math.floor((lon+180)/6)+1, south = lat<0;
  const [E,N] = proj4(geoProj, utmProj(zone,south), [lon,lat]);
  return {E:+E.toFixed(2), N:+N.toFixed(2), zone, letter:utmLetter(lat)};
}
function utmLetter(lat) {
  const b='CDEFGHJKLMNPQRSTUVWX';
  if(lat<-80||lat>84)return'?';
  return b[Math.min(Math.floor((lat+80)/8),19)];
}
const LETRAS = ['C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X'];
function letraOpts(){ return LETRAS.map(l=>`<option value="${l}">${l}</option>`).join(''); }

// ════════════════════════════════════════
//  MAPAS — três instâncias independentes
// ════════════════════════════════════════

// ┌─────────────────────────────────────────────────────────────────────┐
// │  CONFIGURAÇÃO DE APIS — ALTERE AQUI PARA TESTAR NOVAS FONTES       │
// │                                                                     │
// │  URL_ESTADOS  → GeoJSON com os 27 estados do Brasil (UFs)          │
// │  URL_MUNICIPIOS → GeoJSON com os 5.570 municípios                  │
// │  URL_LOCALIDADES → JSON com nome, sigla e região de cada estado    │
// │                                                                     │
// │  Como testar uma nova API:                                          │
// │  1. Abra o VSCode e edite este arquivo (index.html)                │
// │  2. Troque a URL abaixo pela nova que deseja testar                │
// │  3. Salve → o Live Server recarrega automaticamente                │
// │  4. Abra o DevTools (F12) → Console para ver erros ou o log       │
// │     "GeoJSON estados recebido: X features" que imprime             │
// │     quantas features chegaram e quais properties cada uma tem      │
// └─────────────────────────────────────────────────────────────────────┘
const URL_ESTADOS     = 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF';
const URL_MUNICIPIOS  = 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio';
const URL_LOCALIDADES     = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome';
const URL_LOCALIDADES_MUN = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome';

function buildMap(divId, key) {
  if (maps[key]) { setTimeout(()=>maps[key].invalidateSize(), 150); return; }

  const m = L.map(divId, {zoomControl:true, maxZoom:22}).setView([-15.5,-47.9], 5);
  maps[key] = m;

  // ── Bases ──
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:22, maxNativeZoom:19, attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(m);

  const sat = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom:22, maxNativeZoom:19, attribution:'Tiles © Esri' }
  );

  // ── OpenTopoMap: mapa topográfico com CURVAS DE NÍVEL (cotas de altitude)
  //    e relevo sombreado embutidos no próprio tile raster (SRTM). ──
  const topo = L.tileLayer(
    'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    { maxZoom:22, maxNativeZoom:17, subdomains:'abc',
      attribution:'© <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA) | dados © OpenStreetMap, SRTM' }
  );

  // ── Esri World Hillshade: relevo sombreado (hipsometria visual) global,
  //    tiles raster pré-processados pela Esri — leve, sem chave de API. ──
  const hillshade = L.tileLayer(
    'https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
    { maxZoom:22, maxNativeZoom:16, attribution:'Hillshade © Esri' }
  );

  // Fundo vetorial em branco (sem tiles, apenas cor de fundo do mapa)
  const blank = L.layerGroup();
  blank.on('add', ()=>{ m.getContainer().style.background = 'var(--bg)'; });
  blank.on('remove', ()=>{ m.getContainer().style.background = ''; });

  // ── Grupos declarados ANTES dos fetches (evita ReferenceError) ──
  const estadoGroup    = L.layerGroup();
  const munGroup       = L.layerGroup();
  const topoGroup      = L.layerGroup();

  // Cores configuráveis pelo usuário para as camadas padrão (persistidas).
  // As escolhas ficam salvas no navegador (localStorage) e têm precedência
  // sobre os padrões abaixo. A chave de versão força UMA redefinição para os
  // padrões atuais (laranja/azul) em navegadores que guardaram cores antigas
  // de sessões anteriores; depois disso, as personalizações voltam a persistir
  // normalmente.
  const LAYER_COLORS_VERSION = '2';
  try{
    if(localStorage.getItem('geotools-layer-colors-v') !== LAYER_COLORS_VERSION){
      localStorage.removeItem('geotools-layer-colors');
      localStorage.setItem('geotools-layer-colors-v', LAYER_COLORS_VERSION);
    }
  }catch(e){ /* localStorage indisponível: segue com os padrões */ }
  const layerColors = JSON.parse(localStorage.getItem('geotools-layer-colors')||'{}');
  const LAYER_COLOR_DEFAULTS = { estado:'#f0a050', municipio:'#5b8af0' };
  function getLayerColor(name){ return layerColors[name] || LAYER_COLOR_DEFAULTS[name]; }
  function setLayerColor(name, color){
    layerColors[name] = color;
    localStorage.setItem('geotools-layer-colors', JSON.stringify(layerColors));
    if(name==='estado'){
      estadoGroup.eachLayer(l=>{
        l._baseColor = color;
        l.setStyle({color, fillColor:color});
      });
    } else if(name==='municipio'){
      munGroup.eachLayer(l=>{
        l._baseColor = color;
        l.setStyle({color, fillColor:color});
      });
    }
  }
  const estTopoMarkers = [];
  const munTopoMarkers = [];

  // ── Popup rico ──
  function openInfoPopup(latlng, titulo, campos) {
    m.closePopup();
    // Filtro global de campos técnicos: aplica-se a QUALQUER caminho que gere
    // o popup (REST identify, HTML GetFeatureInfo, WFS), removendo colunas de
    // uso interno do servidor ArcGIS/GeoServer que não interessam ao usuário.
    const isTech = key => {
      const n = String(key).toLowerCase().replace(/[\s._()]/g,'');
      return (
        n === 'objectid' || n === 'fid' || n === 'id' || n === 'gid' ||
        n === 'shape' || n === 'globalid' || n === 'geom' || n === 'the_geom' ||
        n.startsWith('shapest') ||            // shape.starea(), shape.stlength()
        n === 'shapearea' || n === 'shapelength' ||
        n === 'starea' || n === 'stlength' ||
        n === 'versaoatual' || n === 'versãoatual'
      );
    };
    campos = (campos || []).filter(([k]) => k === 'Camada' || !isTech(k));
    const rows = campos.map(([k,v]) =>
      `<tr>
        <td style="color:var(--muted);padding:3px 10px 3px 0;font-size:12px;overflow-wrap:anywhere;word-break:break-word;max-width:170px;vertical-align:top">${escHtml(k)}</td>
        <td style="font-weight:500;padding:3px 0;font-size:12px;overflow-wrap:anywhere;word-break:break-word">${v!==undefined&&v!==null&&v!==''?escHtml(v):'—'}</td>
      </tr>`
    ).join('');
    L.popup({maxWidth:360, className:'rich-popup', closeButton:true, autoClose:true})
      .setLatLng(latlng)
      .setContent(`<div style="min-width:200px">
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:14px;
             margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border)">${titulo}</div>
        <div class="rich-popup-scroll"><table style="border-collapse:collapse;width:100%">${rows}</table></div>
      </div>`)
      .openOn(m);
  }

  // ── Ícone de texto para Toponímias ──
  function makeTopoIcon(nome, fs, fw, shadowPx, color) {
    return L.divIcon({
      className:'',
      html:`<div style="font-size:${fs};font-weight:${fw};font-family:'DM Sans',sans-serif;` +
           `color:${color};` +
           `text-shadow:0 0 4px #000,0 0 ${shadowPx} rgba(0,0,0,.95),` +
           `1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000;` +
           `white-space:nowrap;pointer-events:none;` +
           `transform:translate(-50%,-50%);letter-spacing:.04em;line-height:1">${nome}</div>`,
      iconSize:[0,0], iconAnchor:[0,0]
    });
  }

  // ── Atualiza visibilidade dos labels de Toponímias ──
  function updateTopoVisibility() {
    const z = m.getZoom();
    const showEst = (z >= 4 && z < 9);
    const showMun = (z >= 10); // zoom 10+ para não poluir o mapa
    const estFs = z >= 7 ? '22px' : z >= 6 ? '19px' : '16px';
    const munFs = z >= 13 ? '16px' : z >= 11 ? '15px' : z >= 9 ? '14px' : '13px';
    const munFw = z >= 11 ? '700' : '600';

    estTopoMarkers.forEach(({marker, nome}) => {
      if (showEst) {
        if (!topoGroup.hasLayer(marker)) topoGroup.addLayer(marker);
        marker.setIcon(makeTopoIcon(nome, estFs, '700', '10px', '#ffd080'));
      } else {
        if (topoGroup.hasLayer(marker)) topoGroup.removeLayer(marker);
      }
    });

    munTopoMarkers.forEach(({marker, nome}) => {
      if (showMun) {
        if (!topoGroup.hasLayer(marker)) topoGroup.addLayer(marker);
        marker.setIcon(makeTopoIcon(nome, munFs, munFw, '7px', '#ffffff'));
      } else {
        if (topoGroup.hasLayer(marker)) topoGroup.removeLayer(marker);
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // FETCH ESTADOS
  // Estratégia: primeiro busca a lista de localidades (nome+sigla),
  // depois busca o GeoJSON e cruza pelo código IBGE da feature.
  // O código da feature vem em feat.properties.codarea (v3 API).
  // Log no console mostra as properties reais para debug.
  // ══════════════════════════════════════════════════════════════════
  Promise.all([
    fetch(URL_LOCALIDADES).then(r=>r.json()),
    fetch(URL_ESTADOS).then(r=>r.json())
  ])
  .then(([localidades, geojson]) => {
    // Mapa codIBGE → {nome, sigla, regiao}
    const estMap = {};
    localidades.forEach(e => {
      estMap[String(e.id)] = {
        nome:  e.nome,
        sigla: e.sigla,
        regiao:(e.regiao && e.regiao.nome) || ''
      };
    });

    // Log de diagnóstico — veja no DevTools (F12 → Console)
    console.log('[GeoTools] Estados GeoJSON recebido:', geojson.features?.length, 'features');
    if (geojson.features?.length > 0) {
      console.log('[GeoTools] Exemplo de properties da 1ª feature:', geojson.features[0].properties);
    }

    L.geoJSON(geojson, {
      style:{ color:getLayerColor('estado'), weight:2.5, fillOpacity:0.03, fillColor:getLayerColor('estado'), opacity:0.9 },
      onEachFeature(feat, layer) {
        layer._baseColor = getLayerColor('estado');
        // O código da UF vem em feat.properties.codarea na API v3
        const cod   = String(feat.properties?.codarea || feat.id || '');
        const info  = estMap[cod] || {};
        const nome  = info.nome  || feat.properties?.nome || cod || 'Estado';
        const sigla = info.sigla || '';
        const reg   = info.regiao || '';

        layer.on('mouseover', function(){
          this.setStyle({color:'#ffc87a', weight:3.5, opacity:1, fillOpacity:0.08});
        });
        layer.on('mouseout', function(){
          this.setStyle({color:this._baseColor, weight:2.5, opacity:0.9, fillOpacity:0.03, fillColor:this._baseColor});
        });
        layer.on('click', function(e){
          if(measureState[key] && measureState[key].active) return; // medição ativa: deixa o clique chegar ao mapa
          openInfoPopup(e.latlng, '🗺️ ' + nome, [
            ['Camada',    'Limites Estaduais'],
            ['Estado',    nome],
            ['Sigla',     sigla],
            ['Região',    reg],
            ['Cód. IBGE', cod],
          ]);
        });

        // Centroide para Toponímias (usa sigla se disponível)
        try {
          const c = layer.getBounds().getCenter();
          const mk = L.marker(c, {
            icon: L.divIcon({className:'',html:'',iconSize:[0,0],iconAnchor:[0,0]}),
            interactive:false, zIndexOffset:-50
          });
          estTopoMarkers.push({marker:mk, nome: sigla || nome});
        } catch(e){}

        layer.addTo(estadoGroup);
      }
    });

    if (m.hasLayer(topoGroup)) updateTopoVisibility();
    bringUploadedLayersToFront(key);
  })
  .catch(err => {
    console.warn('[GeoTools] Limites estaduais indisponíveis:', err);
    showLayerWarning(key, 'A camada "Limites Estaduais" está indisponível no momento (serviço fora do ar).');
  });

  // ══════════════════════════════════════════════════════════════════
  // FETCH MUNICÍPIOS — GeoJSON + lookup de nomes/siglas via localidades
  // Popup rico igual ao de estados: nome, UF, código IBGE, região, lat/lon
  // Nomes exibidos como Toponímias apenas em zoom >= 10 (evita poluição)
  // ══════════════════════════════════════════════════════════════════
  Promise.all([
    fetch(URL_LOCALIDADES_MUN).then(r => r.json()),
    fetch(URL_MUNICIPIOS).then(r => { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
  ])
  .then(([localidades, geojson]) => {
    // Mapa codIBGE(6 dígitos) → {nome, uf, regiao, coduf}
    const munMap = {};
    localidades.forEach(mun => {
      munMap[String(mun.id)] = {
        nome:   mun.nome,
        uf:     (mun['microrregiao']?.['mesorregiao']?.['UF']?.['sigla']) ||
                (mun['regiao-imediata']?.['regiao-intermediaria']?.['UF']?.['sigla']) || '',
        regiao: (mun['microrregiao']?.['mesorregiao']?.['UF']?.['regiao']?.['nome']) ||
                (mun['regiao-imediata']?.['regiao-intermediaria']?.['UF']?.['regiao']?.['nome']) || '',
        coduf:  String((mun['microrregiao']?.['mesorregiao']?.['UF']?.['id']) ||
                (mun['regiao-imediata']?.['regiao-intermediaria']?.['UF']?.['id']) || '')
      };
    });

    console.log('[GeoTools] Municípios GeoJSON recebido:', geojson.features?.length, 'features');

    L.geoJSON(geojson, {
      style:{ color:getLayerColor('municipio'), weight:1.0, fillOpacity:0.02, fillColor:getLayerColor('municipio'), opacity:0.65 },
      onEachFeature(feat, layer) {
        layer._baseColor = getLayerColor('municipio');
        const cod  = String(feat.properties?.codarea || feat.id || '');
        const info = munMap[cod] || {};
        const nome = info.nome || feat.properties?.nome || feat.properties?.name || cod || 'Município';
        const uf   = info.uf     || '—';
        const reg  = info.regiao || '—';

        layer.on('mouseover', function(){
          this.setStyle({color:'#7ea8f8', weight:2, opacity:1, fillOpacity:0.06});
        });
        layer.on('mouseout', function(){
          this.setStyle({color:this._baseColor, weight:1.0, opacity:0.65, fillOpacity:0.02, fillColor:this._baseColor});
        });

        layer.on('click', function(e){
          if(measureState[key] && measureState[key].active) return; // medição ativa: deixa o clique chegar ao mapa
          const c = this.getBounds().getCenter();
          openInfoPopup(e.latlng, '🏙️ ' + nome, [
            ['Camada',    'Limites Municipais'],
            ['Município', nome],
            ['UF',        uf],
            ['Região',    reg],
            ['Cód. IBGE', cod],
            ['Lat',       c.lat.toFixed(5)+'°'],
            ['Lon',       c.lng.toFixed(5)+'°'],
          ]);
        });

        // Centroide para Toponímias — exibido apenas em zoom >= 10
        try {
          const c = layer.getBounds().getCenter();
          const mk = L.marker(c, {
            icon: L.divIcon({className:'',html:'',iconSize:[0,0],iconAnchor:[0,0]}),
            interactive:false, zIndexOffset:-100
          });
          munTopoMarkers.push({marker:mk, nome});
        } catch(e){}

        layer.addTo(munGroup);
      }
    });

    if (m.hasLayer(topoGroup)) updateTopoVisibility();
    bringUploadedLayersToFront(key);
  })
  .catch(err => {
    console.warn('[GeoTools] Limites municipais indisponíveis:', err);
    showLayerWarning(key, 'A camada "Limites Municipais" está indisponível no momento (serviço fora do ar).');
  });

  // ══════════════════════════════════════════════════════════════════
  // CAMADAS WMS EXTERNAS (IPHAN, FUNAI, IBGE, SNIRH)
  //
  // ► PARA ADICIONAR UMA NOVA CAMADA WMS, siga o passo a passo:
  //   1. Copie a URL de "GetMap" fornecida pelo geoserver (ex: a que
  //      contém "service=WMS&request=GetMap&layers=...").
  //   2. Identifique na URL os valores de "BASE" (tudo antes de "?"),
  //      "layers" (nome da camada) e "srs"/"version" se diferentes do padrão.
  //   3. Adicione uma nova entrada no array WMS_LAYERS_PRIMARY (camadas
  //      normais) ou WMS_LAYERS_BACKGROUND (camadas que devem ficar
  //      "atrás"/em segundo plano de outras camadas).
  //   4. Cada entrada é um objeto: { nome: 'Texto exibido no painel',
  //      url: 'BASE_DA_URL', layer: 'workspace:nome_da_camada',
  //      version: '1.1.0' (opcional), srs: 'EPSG:4326' (opcional) }.
  //   5. Pronto — a camada aparecerá automaticamente no painel de seleção
  //      de camadas padrão (lado direito do mapa), dentro do grupo
  //      correspondente.
  // ══════════════════════════════════════════════════════════════════

  const WMS_LAYERS_PRIMARY = [
    {nome:'IPHAN - ADA (SAIP)',                                              url:'https://geoserver.iphan.gov.br/geoserver/fca/wms',  layer:'fca:ada_saip_teste', tipo:'poligono', corsBlocked:true, version:'1.1.0', gfiSrs:'EPSG:4674', wfsFallback:{url:'https://geoserver.iphan.gov.br/geoserver/fca/ows', typeName:'fca:ada_saip_teste', srsName:'EPSG:4674'}},
    {nome:'IPHAN - FCA (Empreendimentos cadastrados)',                      url:'https://geoserver.iphan.gov.br/geoserver/fca/wms',  layer:'fca:fca', tipo:'poligono', corsBlocked:true, wfsFallback:{url:'https://geoserver.iphan.gov.br/geoserver/fca/ows', typeName:'fca:fca'}},
    {nome:'IPHAN - Sítios Arqueológicos (SICG)',            url:'https://geoserver.iphan.gov.br/geoserver/SICG/wms', layer:'SICG:sitios', tipo:'ponto', corsBlocked:true, wfsFallback:{url:'https://geoserver.iphan.gov.br/geoserver/SICG/ows', typeName:'SICG:sitios'}},
    {nome:'IPHAN - Polígonos de Sítios Arqueológicos (SICG)',  url:'https://geoserver.iphan.gov.br/geoserver/SICG/wms', layer:'SICG:sitios_pol', tipo:'poligono', corsBlocked:true, wfsFallback:{url:'https://geoserver.iphan.gov.br/geoserver/SICG/ows', typeName:'SICG:sitios_pol'}},
    {nome:'IPHAN - Bens Materiais (SICG)',url:'https://geoserver.iphan.gov.br/geoserver/SICG/wms', layer:'SICG:tg_bem_classificacao', tipo:'ponto', corsBlocked:true, wfsFallback:{url:'https://geoserver.iphan.gov.br/geoserver/SICG/ows', typeName:'SICG:tg_bem_classificacao'}},
    {nome:'IPHAN - Bens Imateriais (SICG)',   url:'https://geoserver.iphan.gov.br/geoserver/SICG/wms', layer:'SICG:tg_bem_imaterial', tipo:'ponto', corsBlocked:true, wfsFallback:{url:'https://geoserver.iphan.gov.br/geoserver/SICG/ows', typeName:'SICG:tg_bem_imaterial'}},
    {nome:'ANA - Hidrografia (SNIRH)',                  url:'https://www.snirh.gov.br/arcgis/services/INDE/Camadas/MapServer/WMSServer', layer:'106', clickTolerance:8, dpi:180, noJsonp:true, tipo:'linear'},
    {nome:'IBGE - Hidrografia',               url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CCAR:BC250_2025_hid', tipo:'linear'},
    {nome:'IBGE - Localidades Indígenas (Censo 2022)',      url:'https://geoservicoscenso2022.ibge.gov.br/geoserver/censo2022/ows', layer:'cete_BR_LIs_CD2022_02062025', tipo:'poligono'},
    {nome:'IBGE - Locais de Concentração de Pessoas Indígenas (Censo 2022)',url:'https://geoservicoscenso2022.ibge.gov.br/geoserver/censo2022/ows', layer:'cete_BR_LCPIs_CD2022_02062025', tipo:'ponto'},
    {nome:'IBGE - Localidades Quilombolas (Censo 2022)',      url:'https://geoservicoscenso2022.ibge.gov.br/geoserver/censo2022/ows', layer:'cete_BR_LQs_22_pt', tipo:'ponto'},    
    {nome:'IBGE - Localidades Projeto de Assentamento',      url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CGEO:APL_Localidades_Projeto_De_Assentamento', tipo:'ponto'},
    {nome:'IBGE - Territórios Quilombolas',   url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CGMAT:qg_2022_620_territorioquilombola__v02', tipo:'poligono'},   
    {nome:'IBGE - Geomorfologia (Linear)',    url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CREN:Geomorfologia_simbLinear_Brasil', tipo:'linear'},        
    {nome:'IBGE - Trecho Ferroviário',        url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CCAR:BC250_2025_fer_trecho_ferroviario_l', tipo:'linear'},
    {nome:'IBGE - Curvas de Nível',           url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CCAR:BCIM_Curva_Nivel_L', tipo:'linear'},    
    {nome:'EB/DSG - Curvas de Nível', tipo:'ponto', url:'https://bdgex.eb.mil.br/mapcache3857', layer:[
      'curva_nivel25','curva_nivel50','curva_nivel100','curva_nivel250',
    ].join(',')},
    {nome:'VALEC - Trecho Ferroviário', url:'https://geoservicos.inde.gov.br/geoserver/VALEC/ows', layer:'trecho_ferroviario_infrasa', tipo:'linear'},
    {nome:'DNIT - Rodovias',      url:'https://geoservicos.inde.gov.br/geoserver/DNIT/ows', layer:'cide_2024_25,snv_202507a', tipo:'linear'},
    {nome:'ICMBio - Cavidades Naturais Subterrâneas', url:'https://geoservicos.inde.gov.br/geoserver/ICMBio/ows', layer:'canie_052026_p', tipo:'ponto'},
    {nome:'ICMBio - UCs Federais',  url:'https://geoservicos.inde.gov.br/geoserver/ICMBio/ows', layer:'limiteucsfederais_a', tipo:'poligono'},
    {nome:'FUNAI - Aldeias Indígenas',         url:'https://geoserver.funai.gov.br/geoserver/Funai/wms', layer:'Funai:aldeias_pontos', tipo:'ponto', corsBlocked:true, wfsFallback:{url:'https://geoserver.funai.gov.br/geoserver/Funai/ows', typeName:'Funai:aldeias_pontos'}},    
    {nome:'FUNAI - Terras Indígenas', url:'https://geoserver.funai.gov.br/geoserver/Funai/wms', layer:'Funai:tis_poligonais', tipo:'poligono', corsBlocked:true, wfsFallback:{url:'https://geoserver.funai.gov.br/geoserver/Funai/ows', typeName:'Funai:tis_poligonais'}},
    {nome:'SNIF/SFB - Diversos/2024 (INCRA/FUNAI/ICMBio/Órgãos estaduais)',  url:'https://sistemas.florestal.gov.br/geoserver/snif/wms', layer:'snif:cnfp_2024', tipo:'poligono', corsBlocked:true, gfiSrs:'EPSG:4674',
      wfsFallback:{url:'https://sistemas.florestal.gov.br/geoserver/snif/ows', typeName:'snif:cnfp_2024', srsName:'EPSG:4674'}},
    // Camada combinada: naufrágios (DPHDM) — todas as camadas estaduais
    // agrupadas em uma única entrada via lista separada por vírgulas (GeoServer)
    // suporta múltiplas camadas no parâmetro "layers" de um GetMap).
    {nome:'DPHDM/Marinha - Naufrágios', tipo:'ponto', url:'https://geoservicos.inde.gov.br/geoserver/DPHDM/ows', layer:[
      'DPHDM:ba_naufragios','DPHDM:pb_naufragios','DPHDM:al_naufragios','DPHDM:pe_naufragios',
      'DPHDM:sc_principal_2','DPHDM:sp_naufragios','DPHDM:se_naufragios','DPHDM:ap_naufragios',
      'DPHDM:ce_naufragios','DPHDM:es_naufragios','DPHDM:ma_naufragios','DPHDM:pa_naufragios',
      'DPHDM:pr_principal_shp','DPHDM:rj_naufragios','DPHDM:rn_naufragios','DPHDM:pi_naufragioscorreto',
      'DPHDM:fernando_de_noronha_naufragios','DPHDM:ar_naufragios','DPHDM:ilha_da_trindade_naufragios',
      'DPHDM:rs_principal_shp',
    ].join(',')},
    {nome:'ANM - Mineração (SIGMINE)', url:'https://geo.anm.gov.br/arcgis/services/SIGMINE/dados_anm/MapServer/WMSServer', layer:'0,1,2,3,4', tipo:'poligono', corsBlocked:true, noJsonp:true, htmlOnly:true, version:'1.1.1', gfiSrs:'EPSG:4326', arcgisRest:'https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer', arcgisLayers:'0,1,2,3,4', clickTolerance:5},
    {nome:'ANEEL - Energia (SIGEL)',   url:'https://sigel.aneel.gov.br/arcgis/services/PORTAL/WFS/MapServer/WMSServer', layer:'1,2,3,6,7,8,9,10,12,13,14,15', tipo:'misto', corsBlocked:true, noJsonp:true, htmlOnly:true, version:'1.1.1', gfiSrs:'EPSG:4326', clickTolerance:6, arcgisRest:'https://sigel.aneel.gov.br/arcgis/rest/services/PORTAL/WFS/MapServer', arcgisLayers:'0,1,2,3,5,6,7,8,9,12,13,14', excludeNames:'atua\u00e7\u00e3o das distribuidoras|distribuidora por|reservat\u00f3rio na', layerNames:{0:'Aerogeradores',1:'Central Geradora E\u00f3lica',2:'Central Geradora Solar Fotovoltaica',3:'Usina Termel\u00e9trica',5:'Usina Termonuclear',6:'Central Geradora Hidrel\u00e9trica',7:'Pequena Central Hidrel\u00e9trica',8:'Usina Hidrel\u00e9trica',9:'Linha de Transmiss\u00e3o de EOL',12:'Parque E\u00f3lico',13:'Arranjo Geral da AHE',14:'Declara\u00e7\u00e3o de Utilidade P\u00fablica'}},
  ];
  // Camadas que devem ficar em segundo plano (renderizadas "abaixo" das
  // demais camadas quando ativas simultaneamente). São polígonos preenchidos
  // normais (não em modo circunscrito).
  const WMS_LAYERS_BACKGROUND = [
    {nome:'EB/DSG - Modelo Digital de Superfície (MDS)', tipo:'poligono', url:'https://bdgex.eb.mil.br/mapcache3857', layer:[
      'mds25','mds50','mds250',
    ].join(',')},
    {nome:'EB/DSG - Cartas Topográficas (CTM)', tipo:'poligono', url:'https://bdgex.eb.mil.br/mapcache3857', layer:[
      'ctm25','ctm50','ctm100','ctm250',
    ].join(',')},
    {nome:'IBGE - Hipsometria 2022', url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CGEO:andb2022_021801', tipo:'poligono'},          
    {nome:'IBGE - Geologia', url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CREN:Geologia_area_Brasil', tipo:'poligono'},
    {nome:'IBGE - Relevo', url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CREN:geomorfologia_5000', tipo:'poligono'},    
    {nome:'IBGE - Vegetação', url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CREN:vegetacao_area_brasil', tipo:'poligono'},     
  ];

  // Panes por tipologia — garantem que camadas do tipo LINHA sempre fiquem
  // visualmente acima de camadas do tipo POLÍGONO, independentemente da
  // ordem em que forem ativadas pelo usuário. Ordem de z-index (do mais
  // baixo para o mais alto): fundo < polígono < linha < ponto.
  if(!m.getPane('wmsBackgroundPane')){
    m.createPane('wmsBackgroundPane');
    m.getPane('wmsBackgroundPane').style.zIndex = 250;
  }
  if(!m.getPane('wmsPolygonPane')){
    m.createPane('wmsPolygonPane');
    m.getPane('wmsPolygonPane').style.zIndex = 350;
  }
  if(!m.getPane('wmsLinePane')){
    m.createPane('wmsLinePane');
    m.getPane('wmsLinePane').style.zIndex = 380;
  }
  if(!m.getPane('wmsPointPane')){
    m.createPane('wmsPointPane');
    m.getPane('wmsPointPane').style.zIndex = 390;
  }
  // Panes para camadas IMPORTADAS (acima das WMS). Ordem de empilhamento e de
  // prioridade de clique: polígono (mais baixo) < linha < ponto (mais alto).
  // Isso garante que, ao clicar sobre um ponto ou linha que esteja dentro de um
  // polígono, o popup exibido seja o da feição correta — e não o do polígono.
  if(!m.getPane('impPolygonPane')){
    m.createPane('impPolygonPane');
    m.getPane('impPolygonPane').style.zIndex = 410;
    // As feições importadas são tratadas pelo handler central de clique do mapa
    // (são interactive:false). Por isso, o pane NÃO deve capturar eventos de
    // ponteiro — caso contrário, o <canvas>/<svg> que cobre todo o mapa
    // bloquearia os cliques nas camadas abaixo (ex.: Limites Estaduais/
    // Municipais), impedindo seus popups de abrir.
    m.getPane('impPolygonPane').style.pointerEvents = 'none';
  }
  if(!m.getPane('impLinePane')){
    m.createPane('impLinePane');
    m.getPane('impLinePane').style.zIndex = 420;
    m.getPane('impLinePane').style.pointerEvents = 'none';
  }
  if(!m.getPane('impPointPane')){
    m.createPane('impPointPane');
    m.getPane('impPointPane').style.zIndex = 430;
    m.getPane('impPointPane').style.pointerEvents = 'none';
  }
  // Renderizadores por pane. Polígonos usam CANVAS (muito mais rápido para
  // muitas/grandes poligonais — evita travamentos e "tremor" no pan/zoom).
  // Linhas e pontos usam SVG (melhor nitidez e interação para feições finas).
  if(!m._impRenderers){
    m._impRenderers = {
      impPolygonPane: L.canvas({pane:'impPolygonPane', padding:0.5}).addTo(m),
      impLinePane:    L.svg({pane:'impLinePane'}).addTo(m),
      impPointPane:   L.svg({pane:'impPointPane'}).addTo(m),
    };
  }
  function paneForTipo(tipo, isBackground){
    if(isBackground) return 'wmsBackgroundPane';
    if(tipo==='linear') return 'wmsLinePane';
    if(tipo==='ponto') return 'wmsPointPane';
    return 'wmsPolygonPane';
  }

  function makeWmsLayer(def, pane){
    const opts = {
      layers: def.layer,
      format: 'image/png',
      transparent: true,
      version: def.version || '1.1.1',
      maxZoom: 22,
      // Sem 'attribution': o campo de copyright do mapa deve exibir apenas as
      // camadas BASE (OpenStreetMap / Esri), não as camadas WMS sobrepostas.
    };
    if(pane) opts.pane = pane;
    // Para serviços ArcGIS Server (ex: SNIRH), aumentar o DPI faz o servidor
    // renderizar símbolos/linhas proporcionalmente mais espessos, facilitando
    // o clique sobre linhas finas.
    if(def.dpi) opts.dpi = def.dpi;
    const tl = L.tileLayer.wms(def.url, opts);
    tl._gfiDef = def; // guarda definição para consultas GetFeatureInfo
    let errorCount = 0, loadCount = 0, warned = false;
    tl.on('tileerror', err=>{
      errorCount++;
      console.warn('[GeoTools] Erro ao carregar tile WMS:', def.nome, err && err.error);
      if(errorCount>=2 && loadCount===0 && !warned){
        warned = true;
        console.warn(`[GeoTools] A camada "${def.nome}" pode estar indisponível ou bloqueando requisições (CORS/servidor). Verifique a aba Network do DevTools.`);
        showLayerWarning(key, `A camada "${def.nome}" não respondeu corretamente. O servidor pode estar indisponível ou bloqueando o acesso.`);
      }
    });
    tl.on('tileload', ()=>{ loadCount++; });
    wmsRegistry.push(tl);
    return tl;
  }

  const wmsRegistry = [];
  const wmsOverlaysPrimary = {};
  WMS_LAYERS_PRIMARY.forEach(def => { wmsOverlaysPrimary[def.nome] = makeWmsLayer(def, paneForTipo(def.tipo, false)); });

  const wmsOverlaysBackground = {};
  WMS_LAYERS_BACKGROUND.forEach(def => { wmsOverlaysBackground[def.nome] = makeWmsLayer(def, 'wmsBackgroundPane'); });

  // ── Controle de camadas ──
  const layersControl = L.control.layers(
    { 'OpenStreetMap': osm, 'Satélite (Esri)': sat, 'OpenTopoMap': topo, 'World Hillshade (Esri)': hillshade, 'Vetorial puro': blank },
    {
      'Limites Estaduais': estadoGroup,
      'Limites Municipais': munGroup,
      'Toponímias': topoGroup,
      ...wmsOverlaysPrimary,
      ...wmsOverlaysBackground,
    },
    { position:'topright', collapsed:false }
  ).addTo(m);

  // ── Agrupamento das camadas padrão por INSTITUIÇÃO (similar ao "grupo" do
  //    QGIS): instituições com mais de uma camada ganham grupo próprio; as de
  //    camada única ficam em "Outros". Cada grupo abre/fecha ao ser clicado,
  //    revelando as subcamadas. Dentro do grupo, as camadas renderizadas em
  //    SEGUNDO PLANO ficam nas últimas posições, separadas por uma divisória.
  //    As camadas "Limites Estaduais/Municipais" e "Toponímias" permanecem
  //    soltas no topo, fora de grupos. ──
  const STD_LAYER_GROUPS = [
    { nome:'IPHAN',  re:/^IPHAN\b/i },
    { nome:'IBGE',   re:/^IBGE\b/i },
    { nome:'ICMBio', re:/^ICMBio\b/i },
    { nome:'FUNAI',  re:/^FUNAI\b/i },
    { nome:'EB/DSG', re:/^EB\/DSG\b/i },
    { nome:'Outros', re:/^(ANA|VALEC|DNIT|SNIF\/SFB|DPHDM\/Marinha|ANM|ANEEL)\b/i },
  ];
  function groupStdOverlays(){
    const container = layersControl.getContainer();
    const overlaysList = container && container.querySelector('.leaflet-control-layers-overlays');
    if(!overlaysList) return;
    const bgNames = WMS_LAYERS_BACKGROUND.map(d=>d.nome);
    // Item de lista correspondente a cada <label> (o Leaflet envolve cada
    // camada em uma <div>, mas versões diferentes podem variar).
    const itemOf = label => (label.parentElement && label.parentElement !== overlaysList)
      ? label.parentElement : label;
    const labels = [...overlaysList.querySelectorAll('label')];
    const grupos = new Map(); // nome do grupo → { body, count }

    labels.forEach(label=>{
      const txt = label.textContent.trim();
      const g = STD_LAYER_GROUPS.find(x=>x.re.test(txt));
      if(!g) return; // camada solta (Limites/Toponímias): permanece no topo
      if(!grupos.has(g.nome)){
        const wrap = document.createElement('div');
        wrap.className = 'lc-group';
        wrap.innerHTML = `<div class="lc-group-head" role="button" tabindex="0">
            <span class="lc-group-arrow">▸</span>
            <span class="lc-group-name">${escHtml(g.nome)}</span>
            <span class="lc-group-count">0</span>
          </div><div class="lc-group-body"></div>`;
        overlaysList.appendChild(wrap);
        const head = wrap.querySelector('.lc-group-head');
        const body = wrap.querySelector('.lc-group-body');
        const toggle = ()=>{
          const aberto = wrap.classList.toggle('open');
          wrap.querySelector('.lc-group-arrow').textContent = aberto ? '▾' : '▸';
          // o conteúdo mudou de altura: reavalia o limite do painel
          try{ adjustLayersMaxHeight(); }catch(e){}
        };
        head.addEventListener('click', toggle);
        head.addEventListener('keydown', ev=>{
          if(ev.key==='Enter'||ev.key===' '){ ev.preventDefault(); toggle(); }
        });
        // Marca o grupo quando houver alguma subcamada ligada
        body.addEventListener('change', ()=>{
          const ativos = body.querySelectorAll('input[type="checkbox"]:checked').length;
          wrap.classList.toggle('has-active', ativos>0);
          wrap.querySelector('.lc-group-count').textContent =
            ativos ? `${ativos}/${body.querySelectorAll('label').length}` : body.querySelectorAll('label').length;
        });
        grupos.set(g.nome, {wrap, body});
      }
      const {body} = grupos.get(g.nome);
      // Divisória antes da primeira camada de segundo plano do grupo
      const isBg = bgNames.some(n=>txt.startsWith(n));
      if(isBg && !body.querySelector('.lc-group-bg-sep') && body.children.length){
        const hr = document.createElement('hr');
        hr.className = 'leaflet-control-layers-separator lc-group-bg-sep';
        body.appendChild(hr);
      }
      body.appendChild(itemOf(label));
    });

    // Reordena os grupos conforme STD_LAYER_GROUPS e atualiza as contagens
    STD_LAYER_GROUPS.forEach(g=>{
      const info = grupos.get(g.nome);
      if(!info) return;
      overlaysList.appendChild(info.wrap);
      info.wrap.querySelector('.lc-group-count').textContent =
        info.body.querySelectorAll('label').length;
    });
  }
  groupStdOverlays();

  // ── Botão "Limpar" global: desmarca TODAS as camadas ativas do painel ──
  // Usa o próprio fluxo de clique do Leaflet (_onInputClick), que processa o
  // estado de todas as caixas de uma vez sem reconstruir a lista — assim os
  // grupos montados acima são preservados.
  const stdClearBtn = document.createElement('button');
  stdClearBtn.type = 'button';
  stdClearBtn.className = 'std-layers-clear';
  stdClearBtn.textContent = '🧹 Limpar camadas ativas';
  stdClearBtn.title = 'Desmarca todas as camadas ativas do painel';
  function stdActiveInputs(){
    const c = layersControl.getContainer();
    const ov = c && c.querySelector('.leaflet-control-layers-overlays');
    return ov ? [...ov.querySelectorAll('input[type="checkbox"]:checked')] : [];
  }
  function refreshStdClearBtn(){
    const n = stdActiveInputs().length;
    stdClearBtn.disabled = n === 0;
    stdClearBtn.textContent = n ? `🧹 Limpar camadas ativas (${n})` : '🧹 Limpar camadas ativas';
  }
  stdClearBtn.addEventListener('click', ev=>{
    ev.preventDefault(); ev.stopPropagation();
    const ativos = stdActiveInputs();
    if(!ativos.length) return;
    ativos.forEach(i=>{ i.checked = false; });
    try{ layersControl._onInputClick(); }
    catch(e){ // reserva: remove as camadas diretamente
      ativos.forEach(i=>{ const o = layersControl._getLayer && layersControl._getLayer(i.layerId);
        if(o && o.layer && m.hasLayer(o.layer)) m.removeLayer(o.layer); });
    }
    // Atualiza os destaques/contadores dos grupos
    lcContainerRefreshGroups();
    refreshStdClearBtn();
  });
  function lcContainerRefreshGroups(){
    const c = layersControl.getContainer();
    if(!c) return;
    c.querySelectorAll('.lc-group').forEach(g=>{
      const body = g.querySelector('.lc-group-body');
      if(!body) return;
      const total = body.querySelectorAll('label').length;
      const ativos = body.querySelectorAll('input[type="checkbox"]:checked').length;
      g.classList.toggle('has-active', ativos>0);
      const cnt = g.querySelector('.lc-group-count');
      if(cnt) cnt.textContent = ativos ? `${ativos}/${total}` : total;
    });
  }
  // Mantém o botão sincronizado com ligar/desligar de camadas
  m.on('overlayadd overlayremove', ()=>{ refreshStdClearBtn(); lcContainerRefreshGroups(); });
  layersControl.getContainer().appendChild(stdClearBtn);
  refreshStdClearBtn();

  // Se o Leaflet reconstruir a lista (ex.: camada adicionada dinamicamente),
  // reaplica o agrupamento e reposiciona o botão Limpar.
  const _lcUpdateOriginal = layersControl._update.bind(layersControl);
  layersControl._update = function(){
    _lcUpdateOriginal();
    try{
      groupStdOverlays();
      layersControl.getContainer().appendChild(stdClearBtn);
      lcContainerRefreshGroups();
      refreshStdClearBtn();
    }catch(e){ console.warn('[GeoTools] falha ao reagrupar camadas', e); }
  };

  // ── Escala gráfica (barra): alterna automaticamente entre km e m conforme
  //    o zoom (como na INDE). Canto inferior esquerdo, na mesma linha do
  //    copyright (elevada acima da faixa do rodapé via CSS). ──
  L.control.scale({ position:'bottomleft', metric:true, imperial:false, maxWidth:140 }).addTo(m);

  // Barra de rolagem caso a lista de camadas exceda a altura da tela
  const lcContainer = layersControl.getContainer();
  lcContainer.style.overflow = 'hidden'; // o scroll fica apenas na lista interna
  lcContainer.classList.add('std-layers-control');
  const lcList = lcContainer.querySelector('.leaflet-control-layers-list');

  // Ajusta a altura máxima do painel de camadas para nunca invadir o rodapé
  // (coordenadas/escala/medir). O espaço ocupado por tudo que NÃO é a lista
  // (botão "Minimizar", botão "Limpar camadas ativas", paddings e bordas) é
  // medido dinamicamente, para que a ALTURA TOTAL do painel respeite o limite
  // mesmo com elementos adicionados ao seu rodapé. Recalcula ao redimensionar
  // o mapa e ao abrir/fechar grupos.
  const FOOTER_CLEARANCE = 58; // altura do rodapé + folga
  function adjustLayersMaxHeight(){
    if(lcContainer.classList.contains('collapsed-manual')) return;
    const mapH = m.getSize().y;
    const top = 10;     // distância do topo do mapa ao controle
    let chrome = 44;    // reserva inicial (antes do primeiro layout)
    if(lcList && lcContainer.offsetHeight && lcList.offsetHeight){
      chrome = Math.max(chrome, lcContainer.offsetHeight - lcList.offsetHeight);
    }
    const h = Math.max(100, mapH - top - FOOTER_CLEARANCE - chrome);
    if(lcList){ lcList.style.maxHeight = h + 'px'; lcList.style.overflowY = 'auto'; }
  }
  adjustLayersMaxHeight();
  m.on('resize', adjustLayersMaxHeight);

  // ── Botão "Minimizar" para o painel de camadas padrão ──
  const stdMinBtn = document.createElement('div');
  stdMinBtn.className = 'std-layers-toggle';
  stdMinBtn.textContent = '▾ Minimizar';
  stdMinBtn.addEventListener('click', ()=>{
    const collapsed = lcContainer.classList.toggle('collapsed-manual');
    stdMinBtn.textContent = collapsed ? '▾ Minimizar' : '▾ Minimizar';
    stdRestoreBtnEl.classList.toggle('show', collapsed);
  });
  lcContainer.insertBefore(stdMinBtn, lcContainer.firstChild);

  // Botão flutuante para restaurar o painel quando minimizado
  const StdRestoreControl = L.Control.extend({
    options:{position:'topright'},
    onAdd(){
      const a = L.DomUtil.create('a','restore-layers-btn');
      a.href = '#'; a.title = 'Mostrar camadas padrão'; a.innerHTML = '🗂️';
      L.DomEvent.on(a,'click', e=>{
        L.DomEvent.preventDefault(e);
        lcContainer.classList.remove('collapsed-manual');
        a.classList.remove('show');
      });
      L.DomEvent.disableClickPropagation(a);
      return a;
    }
  });
  const stdRestoreControl = new StdRestoreControl().addTo(m);
  const stdRestoreBtnEl = stdRestoreControl.getContainer();

  // ── Seletores de cor para camadas padrão (Limites Estaduais/Municipais) ──
  function addColorPickerToLabel(labelText, colorKey){
    const labels = lcContainer.querySelectorAll('.leaflet-control-layers-overlays label');
    labels.forEach(label=>{
      const span = label.querySelector('span');
      if(!span || !span.textContent.includes(labelText)) return;
      if(label.querySelector('.layer-color-input')) return;
      const input = document.createElement('input');
      input.type = 'color';
      input.className = 'layer-color-input';
      input.value = getLayerColor(colorKey);
      input.title = 'Cor da camada';
      input.addEventListener('input', e=>setLayerColor(colorKey, e.target.value));
      input.addEventListener('click', e=>e.stopPropagation());
      label.appendChild(input);
    });
  }
  addColorPickerToLabel('Limites Estaduais', 'estado');
  addColorPickerToLabel('Limites Municipais', 'municipio');

  // ── Consulta GetFeatureInfo ao clicar com camadas WMS ativas ──
  // Quando uma ou mais camadas WMS estiverem ligadas e o clique não for
  // tratado por uma camada vetorial (estado/município/importada), consulta
  // o(s) serviço(s) WMS ativo(s) e exibe os atributos da feição clicada.
  async function queryWmsFeatureInfo(latlng, point){
    const active = wmsRegistry.filter(tl => m.hasLayer(tl));
    if(!active.length) return false;

    const size = m.getSize();
    const bounds = m.getBounds();
    const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
    let foundAny = false;

    for(const tl of active){
      const def = tl._gfiDef;
      const version = def.version || '1.3.0';
      const isV13 = version.startsWith('1.3');
      const params = new URLSearchParams({
        service:'WMS', version, request:'GetFeatureInfo',
        layers: def.layer, query_layers: def.layer,
        info_format: def.infoFormat || 'application/json',
        feature_count:'10',
        width: size.x, height: size.y,
        [isV13?'i':'x']: Math.round(point.x),
        [isV13?'j':'y']: Math.round(point.y),
      });
      // Tolerância de clique (BUFFER em pixels) — amplia a área de acerto do
      // GetFeatureInfo. Pontos (sítios, naufrágios) exigiriam clique exato no
      // pixel do símbolo; o buffer torna o clique muito mais fácil, sobretudo
      // em áreas sem outras referências visuais (ex: mar territorial).
      let tol = def.clickTolerance;
      if(tol === undefined){
        tol = (def.tipo === 'ponto') ? 12 : (def.tipo === 'linear' ? 6 : 8);
      }
      params.set('buffer', String(tol));
      // Algumas camadas (ex: SNIF) só estão configuradas para um CRS
      // específico (ex: EPSG:4674/SIRGAS2000) e rejeitam/ignoram consultas
      // em EPSG:4326/3857. Numericamente lat/lon são equivalentes entre
      // 4326 e 4674, então reaproveitamos o mesmo bbox apenas trocando o CRS.
      const srs = def.gfiSrs || 'EPSG:4326';
      if(isV13){
        params.set('crs', srs);
        params.set('bbox', `${sw.lat},${sw.lng},${ne.lat},${ne.lng}`);
      } else {
        params.set('srs', srs);
        params.set('bbox', `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`);
      }
      try{
        let data;
        const reqUrl = def.url + '?' + params.toString();
        // Caminho PRIMÁRIO para servidores ArcGIS (ex.: ANM): consulta REST
        // "identify", que retorna JSON nativo e confiável.
        if(def.arcgisRest){
          const rowsRest = await arcgisIdentify(def, latlng);
          console.info(`[GeoTools] ${def.nome}: tentativa ArcGIS REST`, rowsRest ? `retornou ${rowsRest.length} campos` : 'sem retorno');
          if(rowsRest && rowsRest.length){
            openInfoPopup(latlng, `🗺️ ${def.nome}`, rowsRest);
            foundAny = true;
            break;
          }
        }
        // Para serviços que devolvem HTML de forma mais confiável que JSON
        // (ArcGIS Server, ex.: ANM), pulamos a tentativa JSON e vamos direto
        // ao fluxo HTML/WFS abaixo.
        let resp = def.htmlOnly ? null : await fetchWithCorsFallback(reqUrl, def.corsBlocked);
        if(resp && resp.ok){
          try{ data = await resp.json(); }
          catch(parseErr){ data = null; } // resposta não é JSON válido (ex: HTML/erro)
        }
        if(!data && !def.noJsonp && !def.htmlOnly){
          // Tenta JSONP (suportado pelo GeoServer via
          // info_format=text/javascript&format_options=callback:NOME)
          data = await jsonpGetFeatureInfo(def.url, params);
          console.info(`[GeoTools] ${def.nome}: tentativa JSONP`, data ? 'retornou dados' : 'sem retorno/timeout');
        }

        if(!data || !data.features || !data.features.length){
          // Fallback 1: tenta info_format=text/html e extrai a primeira tabela
          const rowsFromHtml = await htmlGetFeatureInfo(def.url, params, def.corsBlocked, def.layerNames ? Object.values(def.layerNames) : null, def.inferLayer);
          console.info(`[GeoTools] ${def.nome}: tentativa HTML`, rowsFromHtml ? `retornou ${rowsFromHtml.length} linhas` : 'sem retorno');
          if(rowsFromHtml && rowsFromHtml.length){
            openInfoPopup(latlng, `🗺️ ${def.nome}`, rowsFromHtml);
            foundAny = true;
            break;
          }
          // Fallback 2: consulta WFS espacial (bbox pequeno em torno do clique) —
          // leve, pois retorna apenas as feições próximas ao ponto clicado.
          if(def.wfsFallback){
            const rowsFromWfs = await wfsSpatialQuery(def.wfsFallback, latlng, def.corsBlocked);
            console.info(`[GeoTools] ${def.nome}: tentativa WFS`, rowsFromWfs ? `retornou ${rowsFromWfs.length} linhas` : 'sem retorno');
            if(rowsFromWfs && rowsFromWfs.length){
              openInfoPopup(latlng, `🗺️ ${def.nome}`, rowsFromWfs);
              foundAny = true;
              break;
            }
          }
          continue;
        }

        const feat = data.features[0];
        const props = feat.properties || {};
        const rows = Object.entries(props).slice(0,10).map(([k,v])=>[k, v??'—']);
        if(rows.length){
          openInfoPopup(latlng, `🗺️ ${def.nome}`, rows);
          foundAny = true;
          break; // mostra a primeira camada com resultado
        }
      }catch(err){
        if(err instanceof TypeError){
          console.info(`[GeoTools] ${def.nome}: GetFeatureInfo bloqueado (provável CORS do servidor).`);
        } else {
          console.warn('[GeoTools] GetFeatureInfo falhou para', def.nome, err);
        }
      }
    }
    return foundAny;
  }

  // ── Fallback JSONP para GetFeatureInfo quando o servidor bloqueia CORS ──
  // Suportado por instâncias GeoServer (IPHAN, FUNAI, IBGE, VALEC) via
  // info_format=text/javascript & format_options=callback:<nome>.
  let jsonpCounter = 0;
  function jsonpGetFeatureInfo(url, params){
    return new Promise(resolve=>{
      const cbName = `__geotoolsJsonp${jsonpCounter++}`;
      const p = new URLSearchParams(params);
      p.set('info_format','text/javascript');
      p.set('format_options', `callback:${cbName}`);
      const script = document.createElement('script');
      const timeout = setTimeout(()=>{ cleanup(); resolve(null); }, 6000);
      function cleanup(){
        clearTimeout(timeout);
        delete window[cbName];
        script.remove();
      }
      window[cbName] = data => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); resolve(null); };
      script.src = url + '?' + p.toString();
      document.head.appendChild(script);
    });
  }

  // Fallback final: info_format=text/html — extrai a primeira tabela de
  // atributos retornada pelo GeoServer (útil quando JSON/JSONP não estão
  // disponíveis para a camada).
  async function htmlGetFeatureInfo(url, params, skipDirect, knownNames, infer){
    try{
      const p = new URLSearchParams(params);
      p.set('info_format','text/html');
      const resp = await fetchWithCorsFallback(url + '?' + p.toString(), skipDirect);
      if(!resp || !resp.ok) return null;
      const html = await resp.text();
      if(!html || !/<table/i.test(html)) return null;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const tables = [...doc.querySelectorAll('table')];
      if(!tables.length) return null;

      // Tenta descobrir o NOME DA CAMADA no HTML do ArcGIS Server. O servidor
      // costuma inserir o nome da camada como um cabeçalho (caption/th com
      // colspan, ou um <b>/<font> antes da tabela). Procuramos por um texto que
      // corresponda a um dos nomes conhecidos (def.layerNames), se fornecido.
      let detectedLayer = null;
      if(knownNames && knownNames.length){
        const fullText = doc.body ? doc.body.textContent : html;
        for(const nm of knownNames){
          if(fullText && fullText.toLowerCase().includes(nm.toLowerCase())){ detectedLayer = nm; break; }
        }
      }
      const withLayer = rows => {
        // Se não achou o nome no texto, tenta INFERIR pela assinatura de campos
        // (o HTML do ArcGIS não inclui o nome da camada no corpo da resposta).
        let layer = detectedLayer;
        if(!layer && infer){
          const keys = rows.map(r=>String(r[0]).toLowerCase());
          const has = re => keys.some(k=>re.test(k));
          layer = infer(keys, has, rows);
        }
        if(layer) return [['Camada', layer], ...rows];
        return rows;
      };

      // Formato 1 (GeoServer): tabela "campo | valor" (2 colunas por linha).
      for(const table of tables){
        const rows = [];
        table.querySelectorAll('tr').forEach(tr=>{
          const cells = [...tr.querySelectorAll('th,td')].map(c=>c.textContent.trim());
          if(cells.length===2 && cells[0]) rows.push([cells[0], cells[1]||'—']);
        });
        if(rows.length >= 2) return withLayer(rows.slice(0,20));
      }

      // Formato 2 (ArcGIS Server): tabela "larga" — 1ª linha = cabeçalhos
      // (campos), 2ª linha = valores. Transpõe para pares campo/valor.
      for(const table of tables){
        const trs = [...table.querySelectorAll('tr')];
        if(trs.length < 2) continue;
        const headers = [...trs[0].querySelectorAll('th,td')].map(c=>c.textContent.trim());
        const values  = [...trs[1].querySelectorAll('th,td')].map(c=>c.textContent.trim());
        if(headers.length >= 2 && headers.length === values.length){
          const rows = [];
          for(let i=0;i<headers.length;i++){
            if(headers[i]) rows.push([headers[i], values[i] || '—']);
          }
          if(rows.length) return withLayer(rows.slice(0,20));
        }
      }
      return null;
    }catch(e){
      return null; // CORS ou outro erro — ignora silenciosamente
    }
  }

  const CUSTOM_CORS_PROXY = 'https://checklic-proxy.licenciamento-dados.workers.dev/?url='; // ex.: 'https://checklic-proxy.SEU-USUARIO.workers.dev/?url='
  const CORS_PROXIES = [
    ...(CUSTOM_CORS_PROXY ? [u => CUSTOM_CORS_PROXY + encodeURIComponent(u)] : []),
    u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
    u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    u => 'https://thingproxy.freeboard.io/fetch/' + u,
  ];
  async function fetchWithCorsFallback(url, skipDirect){
    // 1ª tentativa: requisição direta (funciona se o servidor enviar CORS).
    // Para servidores que SABIDAMENTE não enviam o cabeçalho CORS
    // (IPHAN, FUNAI, SNIF/SFB), pulamos esta tentativa para evitar o erro
    // de CORS no console — que é emitido pelo próprio navegador e não pode
    // ser silenciado por JavaScript. Vamos direto à cascata de proxies.
    if(!skipDirect){
      try{
        const r = await fetch(url);
        if(r && r.ok) return r;
      }catch(err){
        if(!(err instanceof TypeError)) throw err;
      }
    }
    // 2ª: cascata de proxies CORS
    for(const make of CORS_PROXIES){
      try{
        const r = await fetch(make(url));
        if(r && r.ok) return r;
      }catch(e){ /* tenta o próximo */ }
    }
    return null;
  }

  // Consulta via API REST do ArcGIS (operação "identify" do MapServer). É o
  // método NATIVO dos servidores ArcGIS (ex.: ANM/SIGMINE) — retorna JSON
  // limpo com todos os campos, sem depender dos templates HTML/GeoJSON do WMS
  // (que muitas vezes não estão habilitados). O 'def.arcgisRest' aponta para o
  // MapServer (…/MapServer) e 'def.arcgisLayers' lista os IDs consultados.
  async function arcgisIdentify(def, latlng){
    try{
      const b = m.getBounds(), size = m.getSize();
      const sw = b.getSouthWest(), ne = b.getNorthEast();
      const wanted = String(def.arcgisLayers || def.layer);
      const wantedIds = wanted.split(',').map(s=>parseInt(s,10));
      const params = new URLSearchParams({
        f:'json', geometryType:'esriGeometryPoint',
        geometry: `${latlng.lng},${latlng.lat}`,
        sr:'4326',
        layers: 'top:' + wanted,
        tolerance: String(def.clickTolerance || 5),
        mapExtent: `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`,
        imageDisplay: `${size.x},${size.y},96`,
        returnGeometry:'false',
      });
      const url = def.arcgisRest.replace(/\/$/,'') + '/identify?' + params.toString();
      const resp = await fetchWithCorsFallback(url, def.corsBlocked);
      if(!resp || !resp.ok){ console.info(`[GeoTools] ${def.nome}: identify sem resposta HTTP`); return null; }
      let data; try{ data = await resp.json(); }catch(e){ console.info(`[GeoTools] ${def.nome}: identify resposta não-JSON`); return null; }
      if(!data || !data.results || !data.results.length){ console.info(`[GeoTools] ${def.nome}: identify 0 resultados`); return null; }
      console.info(`[GeoTools] ${def.nome}: identify retornou`, data.results.map(r=>`${r.layerId}:${r.layerName||'(sem nome)'}`).join(', '));

      // FILTRAGEM NO CLIENTE (rede de segurança): o servidor da ANEEL às vezes
      // devolve camadas fora da lista pedida (ex.: a camada de fundo "Área de
      // atuação das distribuidoras"). A numeração REST pode diferir da WMS, por
      // isso filtramos preferencialmente por NOME (includeNames), que é estável.
      const excludeRe = def.excludeNames ? new RegExp(def.excludeNames, 'i') : null;
      const includeRe = def.includeNames ? new RegExp(def.includeNames, 'i') : null;
      let results;
      if(includeRe){
        // aceita apenas resultados cujo layerName casa com a lista de nomes
        // desejados (e nunca os excluídos)
        results = data.results.filter(r=>{
          const nm = r.layerName || '';
          if(excludeRe && excludeRe.test(nm)) return false;
          return includeRe.test(nm);
        });
      } else {
        results = data.results.filter(r=>{
          if(excludeRe && r.layerName && excludeRe.test(r.layerName)) return false;
          return wantedIds.includes(r.layerId);
        });
        if(!results.length && excludeRe){
          results = data.results.filter(r=> !(r.layerName && excludeRe.test(r.layerName)));
        }
      }
      if(!results.length){ console.info(`[GeoTools] ${def.nome}: identify sem camada válida após filtro`); return null; }

      // Prioriza a camada de MENOR índice na lista (mais ao topo): garante que
      // pontos/linhas (ex.: Arranjo Geral de AHE) venham antes de grandes
      // polígonos de fundo que coincidam no clique.
      const rank = id => { const i = wantedIds.indexOf(id); return i < 0 ? 999 : i; };
      const sorted = results.sort((a,b)=> rank(a.layerId) - rank(b.layerId));
      const r0 = sorted[0];
      const rows = [];
      // Nome da camada: usa o layerName do servidor; se vier vazio, resolve
      // pelo mapa id→nome (def.layerNames) informado na definição da camada.
      let layerName = r0.layerName;
      if((!layerName || !layerName.trim()) && def.layerNames){
        layerName = def.layerNames[r0.layerId] || null;
      }
      if(layerName) rows.push(['Camada', layerName]);

      // Campos técnicos a ocultar (comparação normalizada, sem depender de
      // grafia exata de maiúsculas/pontuação): OBJECTID, FID, ID, Shape e
      // variantes Shape.STArea()/STLength(), Shape_Area/Length, "Versão atual".
      const isTechnical = key => {
        const n = String(key).toLowerCase().replace(/[\s._()]/g,'');
        return (
          n === 'objectid' || n === 'fid' || n === 'id' ||
          n === 'shape' || n === 'globalid' ||
          n.startsWith('shapest') ||          // shape.starea(), shape.stlength()
          n === 'shapearea' || n === 'shapelength' ||
          n === 'versaoatual' || n === 'versãoatual'
        );
      };
      const attrs = r0.attributes || {};
      for(const k in attrs){
        const v = attrs[k];
        if(v === null || v === undefined || v === '' || v === 'Null') continue;
        if(isTechnical(k)) continue;
        rows.push([k, String(v)]);
      }
      return rows.length ? rows.slice(0,25) : null;
    }catch(e){ return null; }
  }

  async function wfsSpatialQuery(wfsDef, latlng, skipDirect){
    const d = 0.0008; // ~80-90m em graus, suficiente para um clique
    const srs = wfsDef.srsName || 'EPSG:4326';
    const bbox = `${latlng.lng-d},${latlng.lat-d},${latlng.lng+d},${latlng.lat+d},${srs}`;
    const params = new URLSearchParams({
      service:'WFS', version:'1.0.0', request:'GetFeature',
      typeName: wfsDef.typeName,
      outputFormat:'application/json',
      maxFeatures:'5',
      srsName: srs,
      BBOX: bbox,
    });
    try{
      const resp = await fetchWithCorsFallback(wfsDef.url + '?' + params.toString(), skipDirect);
      if(!resp || !resp.ok) return null;
      const data = await resp.json();
      if(!data.features || !data.features.length) return null;
      const props = data.features[0].properties || {};
      return Object.entries(props).slice(0,10).map(([k,v])=>[k, v??'—']);
    }catch(e){
      return null; // CORS ou serviço indisponível — ignora silenciosamente
    }
  }

  // ── Painel separado (canto superior esquerdo) para camadas enviadas pelo usuário (KML/KMZ/SHP) ──
  const uploadLayersControl = L.control.layers(
    null, {},
    { position:'topleft', collapsed:false }
  ).addTo(m);
  uploadLayersControl.getContainer().classList.add('upload-layers-control');
  uploadLayersControl.getContainer().style.display = 'none';

  // ── Botão para restaurar o painel de camadas importadas quando minimizado ──
  const RestoreLayersControl = L.Control.extend({
    options:{position:'topleft'},
    onAdd(){
      const a = L.DomUtil.create('a','restore-layers-btn');
      a.href = '#'; a.title = 'Mostrar camadas importadas'; a.innerHTML = '📁';
      L.DomEvent.on(a,'click', e=>{
        L.DomEvent.preventDefault(e);
        toggleUploadLayersPanel(false);
      });
      L.DomEvent.disableClickPropagation(a);
      return a;
    }
  });
  const restoreLayersControl = new RestoreLayersControl().addTo(m);
  const restoreBtnEl = restoreLayersControl.getContainer();

  function toggleUploadLayersPanel(collapse){
    const c = uploadLayersControl.getContainer();
    c.classList.toggle('collapsed-manual', collapse);
    restoreBtnEl.classList.toggle('show', collapse);
  }
  uploadLayersControl._toggleFn = toggleUploadLayersPanel;
  m._uploadLayersControl = uploadLayersControl; // referência para limpeza posterior
  m._restoreLayersBtn = restoreLayersControl;

  m.on('zoomend moveend', () => {
    if (m.hasLayer(topoGroup)) updateTopoVisibility();
    updateScale(key);
  });
  m.on('overlayadd', e => {
    if (e.name === 'Toponímias') updateTopoVisibility();
    showLayerLoading(key);

    const layer = e.layer;
    let resolved = false;
    const finish = () => {
      if(resolved) return;
      resolved = true;
      hideLayerLoading(key);
      bringUploadedLayersToFront(key);
    };

    if(layer instanceof L.TileLayer){
      // Camadas WMS/tile: aguarda o evento "load" (todos os tiles visíveis
      // carregados) antes de ocultar o indicador. "loading" reseta caso o
      // usuário arraste/zoom durante o carregamento.
      const onLoad = () => { layer.off('load', onLoad); layer.off('tileerror', onErr); finish(); };
      const onErr  = () => { layer.off('load', onLoad); layer.off('tileerror', onErr); finish(); };
      layer.on('load', onLoad);
      layer.on('tileerror', onErr);
      // Segurança: nunca deixa o indicador travado indefinidamente
      setTimeout(finish, 15000);
    } else {
      // Camadas vetoriais (limites/toponímias/importadas) já estão carregadas
      // via fetch; o "carregamento" reflete apenas a renderização no mapa.
      // Para camadas IMPORTADAS re-marcadas, força um redraw dos renderizadores
      // (evita o efeito de "só aparecer após o zoom" ao reexibir).
      const isUploaded = (uploadedLayers[key]||[]).some(l => l.layer === layer);
      if(isUploaded){
        setTimeout(()=>{
          try{
            const R = m._impRenderers || {};
            Object.values(R).forEach(r=>{ try{ if(r._reset) r._reset(); else if(r._update) r._update(); }catch(_){} });
          }catch(_){}
        }, 60);
      }
      setTimeout(finish, 600);
    }
  });
  m.on('overlayremove', e => {
    if (e.name === 'Toponímias') {
      [...estTopoMarkers, ...munTopoMarkers].forEach(({marker}) => {
        if (topoGroup.hasLayer(marker)) topoGroup.removeLayer(marker);
      });
    }
    // Se a camada removida é uma camada importada, fecha qualquer popup aberto
    // (evita que o popup de uma feição importada continue visível após ela ser
    // desmarcada no painel "Camadas Enviadas").
    const isUploaded = (uploadedLayers[key]||[]).some(l => l.layer === e.layer);
    if(isUploaded) m.closePopup();
  });

  // ── Rodapé: coordenadas do mouse ──
  m.on('mousemove', e => {
    const el = document.getElementById('coord-'+key);
    if(!el) return;
    if(el === document.activeElement) return; // usuário digitando: não sobrescreve
    // Sobre a faixa do rodapé: não atualiza, mas MANTÉM a última coordenada
    const footer = document.getElementById('footer-'+key);
    if(footer){
      const fr = footer.getBoundingClientRect();
      const oe = e.originalEvent;
      if(oe && oe.clientY >= fr.top && oe.clientX >= fr.left && oe.clientX <= fr.right){
        return; // preserva o último valor exibido
      }
    }
    showFooterCoord(key, e.latlng);
  });
  // Ao sair do mapa, mantém a ÚLTIMA coordenada exibida (não reseta),
  // permitindo que o usuário edite a partir dela.

  // ── Rodapé: escala (mostra apenas o denominador; o "1 :" é fixo no HTML) ──
  function updateScale(k){
    const el = document.getElementById('scale-'+k);
    if(!el) return;
    if(el === document.activeElement) return; // usuário digitando: não sobrescreve
    const center = m.getCenter();
    const zoom = m.getZoom();
    const metersPerPixel = 156543.03392 * Math.cos(center.lat*Math.PI/180) / Math.pow(2, zoom);
    let scaleDenom = Math.round(metersPerPixel / 0.00028); // 0.00028m = pixel padrão (96dpi)
    el.value = scaleDenom.toLocaleString('pt-BR');
  }
  m.on('zoomend moveend load', () => updateScale(key));

  // Inicializa o campo de coordenadas com o CENTRO do mapa, para que exiba uma
  // coordenada válida antes de qualquer movimento do cursor.
  function initCoordDisplay(){
    const el = document.getElementById('coord-'+key);
    if(el){
      el.placeholder = _coordPlaceholder();
      document.querySelectorAll('[data-coordfmt-tag]').forEach(t=>t.textContent=_coordFmtTag());
    }
    if(el && el !== document.activeElement && !el.value) showFooterCoord(key, m.getCenter());
  }
  m.on('load', initCoordDisplay);
  setTimeout(initCoordDisplay, 300);

  // ── Rodapé editável: clicar em Coordenadas ou Escala permite digitar um
  //    valor e reposicionar o mapa. ──
  function setupEditableFooter(){
    const coordEl = document.getElementById('coord-'+key);
    const scaleEl = document.getElementById('scale-'+key);

    // Reposiciona o mapa a partir de "lat, lon" digitado
    function applyCoord(txt){
      // aceita UTM ("23K 193110 E 8251130 N", "23 193110 8251130") e
      // lat/long ("-15.79, -47.88", "-15.79°, -47.88°", "-15.79 -47.88")
      const p = parseCoordInput(txt);
      if(!p) return false;
      const lat = p.lat, lon = p.lon;
      const z = Math.max(m.getZoom(), 14);
      m.setView([lat,lon], z);
      // marcador temporário para indicar o ponto
      if(m._gotoMarker){ try{ m.removeLayer(m._gotoMarker); }catch(e){} }
      m._gotoMarker = L.circleMarker([lat,lon], {radius:8, color:'#ff5b5b', weight:2, fillColor:'#ff5b5b', fillOpacity:0.5}).addTo(m);
      setTimeout(()=>{ if(m._gotoMarker){ try{ m.removeLayer(m._gotoMarker); }catch(e){} m._gotoMarker=null; } }, 4000);
      return true;
    }

    // Ajusta o zoom a partir de uma escala "1 : N" (ou só "N") digitada
    function applyScale(txt){
      const m2 = (txt||'').replace(/\./g,'').replace(/\s/g,'').match(/(\d+)\s*$/);
      const denom = m2 ? parseInt(m2[1],10) : NaN;
      if(!isFinite(denom) || denom < 1) return false;
      const center = m.getCenter();
      // inverte a fórmula da escala para obter o zoom
      const metersPerPixel = denom * 0.00028;
      const zoom = Math.log2(156543.03392 * Math.cos(center.lat*Math.PI/180) / metersPerPixel);
      const clamped = Math.min(Math.max(zoom, m.getMinZoom()||0), m.getMaxZoom()||22);
      m.setZoom(clamped);
      return true;
    }

    // ── Coordenadas (esquema QGIS): input persistente que mostra a coordenada
    //    sob o cursor ao vivo. O usuário pode clicar e digitar "lat, lon"; o
    //    mapa só é reposicionado ao teclar ENTER. Ao mover o cursor novamente,
    //    a exibição ao vivo é retomada. ──
    if(coordEl){
      const commitCoord = ()=>{
        const ok = applyCoord(coordEl.value);
        if(ok){
          coordEl.classList.remove('mf-invalid');
          coordEl.classList.add('mf-flash');
          setTimeout(()=>coordEl.classList.remove('mf-flash'), 500);
          coordEl.blur();
          // reexibe no formato escolhido a coordenada digitada
          setTimeout(()=>{ const p=parseCoordInput(coordEl.value); if(p) showFooterCoord(key, L.latLng(p.lat,p.lon)); }, 0);
        } else {
          coordEl.classList.add('mf-invalid');
        }
      };
      coordEl.addEventListener('keydown', e=>{
        e.stopPropagation();
        if(e.key==='Enter'){ e.preventDefault(); commitCoord(); }
        else if(e.key==='Escape'){ coordEl.classList.remove('mf-invalid'); coordEl.blur(); }
        else { coordEl.classList.remove('mf-invalid'); }
      });
    }

    // ── Escala (esquema QGIS): input persistente com denominador. O usuário
    //    digita o valor e o mapa ajusta o zoom ao teclar ENTER. ──
    if(scaleEl){
      const commitScale = ()=>{
        const ok = applyScale(scaleEl.value);
        if(ok){
          scaleEl.classList.remove('mf-invalid');
          scaleEl.blur();
          updateScale(key);
        } else {
          scaleEl.classList.add('mf-invalid');
        }
      };
      scaleEl.addEventListener('keydown', e=>{
        e.stopPropagation();
        if(e.key==='Enter'){ e.preventDefault(); commitScale(); }
        else if(e.key==='Escape'){ scaleEl.classList.remove('mf-invalid'); updateScale(key); scaleEl.blur(); }
        else { scaleEl.classList.remove('mf-invalid'); }
      });
      // ao sair sem Enter, restaura o valor atual (não reposiciona)
      scaleEl.addEventListener('blur', ()=>{ setTimeout(()=>updateScale(key), 10); });
    }

    // ── Campo de Zoom (lupa) — exibido em PORCENTAGEM (0% = zoom mínimo,
    //    100% = zoom máximo). ──
    const zoomEl = document.getElementById('zoom-'+key);
    if(zoomEl){
      let editingZoom = false;
      const zMin = ()=> m.getMinZoom()||0;
      const zMax = ()=> m.getMaxZoom()||22;
      const zoomToPct = z => Math.round(((z - zMin())/(zMax() - zMin()))*100);
      const pctToZoom = p => zMin() + (p/100)*(zMax() - zMin());
      // Sincroniza o campo (%) com o zoom atual do mapa
      const syncZoom = ()=>{
        if(editingZoom) return; // não sobrescreve durante edição
        zoomEl.value = zoomToPct(m.getZoom());
      };
      m.on('zoomend load', syncZoom);
      syncZoom();
      // Aplica a porcentagem digitada/ajustada pelas setas, convertendo em zoom
      const applyZoom = ()=>{
        let p = parseInt(zoomEl.value, 10);
        if(!isFinite(p)) { syncZoom(); return; }
        p = Math.min(Math.max(p, 0), 100);
        m.setZoom(pctToZoom(p));
      };
      zoomEl.addEventListener('focus', ()=>{ editingZoom = true; });
      zoomEl.addEventListener('blur', ()=>{ editingZoom = false; applyZoom(); });
      zoomEl.addEventListener('change', applyZoom); // setas ↑↓ disparam change
      zoomEl.addEventListener('keydown', e=>{
        e.stopPropagation();
        if(e.key==='Enter'){ applyZoom(); zoomEl.blur(); }
      });
    }
  }
  setupEditableFooter();

  // ── Botão "Histórico de imagens" (Esri Wayback): visível apenas em escala
  //    GRANDE (zoom alto), quando faz sentido consultar o histórico local. ──
  const WAYBACK_MIN_ZOOM = 15; // ~1:18.000 ou maior
  function updateWaybackButton(){
    const btn = document.getElementById('waybackBtn-'+key);
    if(!btn) return;
    // Duas condições: escala grande (zoom alto) E camada base Satélite (Esri)
    // ativa — o histórico do Wayback refere-se à imagem Esri World Imagery.
    const satActive = m.hasLayer(sat);
    const vis = (satActive && m.getZoom() >= WAYBACK_MIN_ZOOM) ? '' : 'none';
    if(btn.style.display !== vis){ btn.style.display = vis; fitMapFooter(key); }
  }
  m.on('zoomend load baselayerchange', updateWaybackButton);
  updateWaybackButton();

  // Rodapé adaptável: encurta os rótulos dos botões (e, se preciso, deixa só
  // os ícones) conforme o espaço disponível — inclusive quando o botão
  // "Histórico de imagens" aparece ou a divisória do painel é arrastada.
  const footerFitEl = document.getElementById('footer-'+key);
  if(footerFitEl && 'ResizeObserver' in window && !footerFitEl._fitObs){
    footerFitEl._fitObs = new ResizeObserver(()=>fitMapFooter(key));
    footerFitEl._fitObs.observe(footerFitEl);
  }
  fitMapFooter(key);

  // ── Clique no mapa: se Limites Estaduais/Municipais não estiverem
  //    ativos e o clique não atingir outra camada, exibe coordenadas ──
  m.on('click', async e => {
    if (measureState[key] && measureState[key].active) return; // ferramenta de medição em uso
    // Ignora cliques sobre a faixa do RODAPÉ: como ela tem pointer-events:none,
    // o clique "atravessa" até o mapa — mas não deve acionar consultas nem o
    // popup de coordenadas.
    const footerEl = document.getElementById('footer-'+key);
    if(footerEl && e.originalEvent){
      const fr = footerEl.getBoundingClientRect();
      const oe = e.originalEvent;
      if(oe.clientY >= fr.top && oe.clientX >= fr.left && oe.clientX <= fr.right) return;
    }
    // PRIORIDADE 1: ponto ou linha importado (feições pequenas e específicas)
    if (uploadedPointOrLineHit(key, e.latlng)) return;
    // PRIORIDADE 2: polígono importado — tem prioridade sobre as camadas WMS,
    // pois é uma feição que o usuário adicionou intencionalmente. Ao clicar
    // dentro de um polígono importado, mostra suas propriedades (e não as da
    // camada WMS de fundo, como IBGE Geologia/Relevo/Vegetação).
    if (uploadedPolygonHit(key, e.latlng)) return;
    // PRIORIDADE 3: camadas WMS ativas (GetFeatureInfo)
    const handled = await queryWmsFeatureInfo(e.latlng, e.containerPoint);
    if (handled) return;
    const hasEstado = m.hasLayer(estadoGroup);
    const hasMun = m.hasLayer(munGroup);
    if (hasEstado || hasMun) return; // outras camadas tratam seus próprios cliques
    m._openCoordPopup(e.latlng);
  });
  // Popup de coordenadas do clique — segue o formato escolhido no rodapé
  m._openCoordPopup = latlng => {
    openInfoPopup(latlng, '📍 Coordenadas', coordPopupRows(latlng));
    m._coordPopup = {latlng, popup: m._popup};
  };

  // ── Impede que cliques no rodapé (botão Medir, etc.) cheguem ao mapa ──
  const footerEl = document.getElementById('footer-'+key);
  if(footerEl) L.DomEvent.disableClickPropagation(footerEl);
  const measurePanelEl = document.getElementById('measure-'+key);
  if(measurePanelEl) L.DomEvent.disableClickPropagation(measurePanelEl);
  const areaPanelEl = document.getElementById('area-'+key);
  if(areaPanelEl) L.DomEvent.disableClickPropagation(areaPanelEl);
  const vtxPanelEl = document.getElementById('vtx-'+key);
  if(vtxPanelEl){ L.DomEvent.disableClickPropagation(vtxPanelEl); L.DomEvent.disableScrollPropagation(vtxPanelEl); }
  const distPanelEl = document.getElementById('dist-'+key);
  if(distPanelEl){ L.DomEvent.disableClickPropagation(distPanelEl); L.DomEvent.disableScrollPropagation(distPanelEl); }

  if(!measureState[key]) measureState[key] = {points:[], line:null, rubberLine:null, vertexLayer:null, active:false, unit:'m', handlers:{}};
  ensureMeasureHandlers(key);

  setTimeout(() => { m.invalidateSize(); updateScale(key); adjustLayersMaxHeight(); }, 200);

  // Divisória ajustável entre a tabela/camadas (pane-left) e o mapa (pane-right)
  setupResizableDivider(key, m);

  // Inicializa painel de upload de arquivos geoespaciais
  initGeoUploadPanel(key, m, uploadLayersControl);
}

// Insere uma divisória arrastável entre a pane-left (tabela/camadas) e a
// pane-right (mapa), mantendo a proporção padrão 30/70 e permitindo ao usuário
// redimensionar. A largura é aplicada em % para permanecer responsiva.
// Ajusta o rodapé do mapa ao espaço disponível: nível 1 encurta os rótulos
// ("Área", "Histórico"); nível 2 deixa os botões só com ícone. O nome completo
// permanece no texto de ajuda (title) de cada botão.
function fitMapFooter(key){
  const f=document.getElementById('footer-'+key);
  if(!f || !f.clientWidth) return;
  const niveis=['mf-compact-1','mf-compact-2','mf-compact-3','mf-compact-4'];
  f.classList.remove(...niveis);
  const cabe=()=> f.scrollWidth <= f.clientWidth + 1;
  // 1: rótulos curtos · 2: botões só com ícone · 3: sem rótulos de texto dos
  // campos e sem separadores · 4: campos mais estreitos e sem o campo de zoom
  for(const n of niveis){ if(cabe()) return; f.classList.add(n); }
}

function setupResizableDivider(key, m){
  const mapEl = document.getElementById('map-'+key);
  if(!mapEl) return;
  const paneRight = mapEl.closest('.pane-right');
  if(!paneRight) return;
  const splitPane = paneRight.closest('.split-pane');
  const paneLeft = splitPane ? splitPane.querySelector('.pane-left') : null;
  if(!splitPane || !paneLeft) return;
  if(splitPane.querySelector('.pane-divider')) return; // já inserida

  const divider = document.createElement('div');
  divider.className = 'pane-divider';
  divider.title = 'Arraste para redimensionar (duplo clique restaura 30/70)';
  // insere a divisória entre pane-left e pane-right
  splitPane.insertBefore(divider, paneRight);

  // Restaura a posição salva da divisória (persistida por tela)
  try{
    const saved = localStorage.getItem('licgeo-split-'+key);
    if(saved){
      const pct = parseFloat(saved);
      if(isFinite(pct) && pct>=15 && pct<=70) paneLeft.style.width = pct + '%';
    }
  }catch(e){}
  // Duplo clique na divisória restaura a proporção padrão 30/70
  divider.addEventListener('dblclick', ()=>{
    paneLeft.style.width = '';
    try{ localStorage.removeItem('licgeo-split-'+key); }catch(e){}
    setTimeout(()=>{ try{ m.invalidateSize(); }catch(e){} }, 50);
  });

  let dragging = false;
  let lastPct = null;

  function onMove(clientX){
    const rect = splitPane.getBoundingClientRect();
    let leftPct = ((clientX - rect.left) / rect.width) * 100;
    // limites: entre 15% e 70% para a pane-left
    leftPct = Math.min(Math.max(leftPct, 15), 70);
    lastPct = leftPct;
    paneLeft.style.width = leftPct + '%';
    // atualiza o mapa em tempo real (throttle via requestAnimationFrame)
    if(!m._resizeRaf){
      m._resizeRaf = requestAnimationFrame(()=>{
        m._resizeRaf = null;
        try{ m.invalidateSize({animate:false}); }catch(e){}
      });
    }
  }

  divider.addEventListener('mousedown', e=>{
    e.preventDefault();
    dragging = true;
    divider.classList.add('dragging');
    document.body.classList.add('resizing-panes');
  });
  window.addEventListener('mousemove', e=>{
    if(!dragging) return;
    onMove(e.clientX);
  });
  window.addEventListener('mouseup', ()=>{
    if(!dragging) return;
    dragging = false;
    divider.classList.remove('dragging');
    document.body.classList.remove('resizing-panes');
    // persiste a posição escolhida
    if(lastPct != null){ try{ localStorage.setItem('licgeo-split-'+key, lastPct.toFixed(1)); }catch(e){} }
    // o mapa precisa recalcular o tamanho após o redimensionamento
    setTimeout(()=>{ try{ m.invalidateSize(); }catch(e){} }, 50);
  });

  // Suporte a toque (mobile)
  divider.addEventListener('touchstart', e=>{
    dragging = true; divider.classList.add('dragging');
  }, {passive:true});
  window.addEventListener('touchmove', e=>{
    if(!dragging || !e.touches[0]) return;
    onMove(e.touches[0].clientX);
  }, {passive:true});
  window.addEventListener('touchend', ()=>{
    if(!dragging) return;
    dragging = false; divider.classList.remove('dragging');
    if(lastPct != null){ try{ localStorage.setItem('licgeo-split-'+key, lastPct.toFixed(1)); }catch(e){} }
    setTimeout(()=>{ try{ m.invalidateSize(); }catch(e){} }, 50);
  });
}

function addMarker(key, lat, lon, label, idx, utm) {
  const m = maps[key]; if (!m) return null;
  const icon = L.divIcon({
    className:'',
    html:`<div style="width:26px;height:26px;background:var(--accent);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.5)">${idx}</div>`,
    iconSize:[26,26], iconAnchor:[13,13]
  });
  const mk = L.marker([lat,lon],{icon})
    .bindPopup(_markerPopupHtml(label, lat, lon, utm), {maxWidth:300, className:'rich-popup'})
    .addTo(m);
  mkrs[key].push(mk);
  _schedDistButton(key);
  return mk;
}
// Atualiza o botão "Distância entre pontos" após a tabela ser (re)montada
const _distBtnTimers={};
function _schedDistButton(key){
  clearTimeout(_distBtnTimers[key]);
  _distBtnTimers[key]=setTimeout(()=>updateDistButton(key), 60);
}
// Popup dos marcadores das tabelas. Com "utm" ({zona,E,N}), exibe também as
// coordenadas UTM (usado na tela Converter: entrada UTM + resultado lat/long).
function _markerPopupHtml(label, lat, lon, utm){
  const td='color:var(--muted);padding:2px 10px 2px 0';
  const sec=t=>`<tr><td colspan="2" class="mk-pop-sec">${t}</td></tr>`;
  let utmRows='';
  if(utm && isFinite(+utm.E) && isFinite(+utm.N)){
    const v=x=>(+x).toFixed(2).replace('.',',');
    utmRows = sec('UTM — SIRGAS 2000')
      + `<tr><td style="${td}">Zona</td><td style="font-weight:500">${escHtml(utm.zona||'')}</td></tr>`
      + `<tr><td style="${td}">E (m)</td><td style="font-weight:500">${utmCell(v(utm.E))}</td></tr>`
      + `<tr><td style="${td}">N (m)</td><td style="font-weight:500">${utmCell(v(utm.N))}</td></tr>`;
  }
  return `<div style="min-width:200px">
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:13px;
             margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid var(--border)">
          📍 ${escHtml(label)}
        </div>
        <table style="border-collapse:collapse;width:100%;font-size:12px">
          ${utmRows?sec('Latitude / Longitude'):''}
          <tr><td style="${td}">Latitude</td>
              <td style="font-weight:500">${coordCell(lat)}</td></tr>
          <tr><td style="${td}">Longitude</td>
              <td style="font-weight:500">${coordCell(lon)}</td></tr>
          ${utmRows}
        </table>
      </div>`;
}
function clearMarkers(key){ const m=maps[key]; if(!m)return; mkrs[key].forEach(mk=>m.removeLayer(mk)); mkrs[key]=[]; _schedDistButton(key); }
function fitMap(key, bounds){
  const m=maps[key]; if(!m||!bounds.length)return;
  if(bounds.length===1) m.setView(bounds[0],14);
  else m.fitBounds(L.latLngBounds(bounds),{padding:[32,32]});
}

// ════════════════════════════════════════
//  FERRAMENTA DE MEDIÇÃO (linha com unidade configurável)
// ════════════════════════════════════════
const measureState = {}; // key -> {points, line, rubberLine, vertexLayer, active, unit, handlers}
const MEASURE_UNITS = {
  m:  {label:'Metro (m)',     factor:1},
  km: {label:'Quilômetro (km)', factor:0.001},
  cm: {label:'Centímetro (cm)', factor:100},
};

function buildMeasurePanel(key){
  const panel = document.getElementById('measure-'+key);
  if(!panel || panel.dataset.built) return;
  panel.dataset.built='1';
  panel.innerHTML = `
    <div class="measure-panel-hdr"><span>📐 Medir distância</span><span class="mp-close" onclick="closeMeasurePopup('${key}')">✕</span></div>
    <div class="color-panel-section">
      <div class="color-panel-lbl">Unidade</div>
      <div class="measure-type-row">
        <button id="munit-m-${key}" class="active" onclick="setMeasureUnit('${key}','m')">m</button>
        <button id="munit-km-${key}" onclick="setMeasureUnit('${key}','km')">km</button>
        <button id="munit-cm-${key}" onclick="setMeasureUnit('${key}','cm')">cm</button>
      </div>
    </div>
    <div class="measure-hint" id="mhint-${key}">Clique no mapa para marcar o ponto inicial. Mova o mouse para medir e clique novamente para fixar o segmento.</div>
    <div class="measure-result" id="mresult-${key}">—</div>
    <div class="measure-actions">
      <button class="btn btn-sm" onclick="undoMeasurePoint('${key}')">↩ Desfazer</button>
      <button class="btn btn-sm" onclick="clearMeasure('${key}')">🗑 Limpar</button>
    </div>
  `;
}

function openMeasurePopup(key){
  if(typeof closeDistPopup==='function') closeDistPopup(key);
  if(typeof closeAreaPopup==='function') closeAreaPopup(key);
  if(typeof closeVertexPopup==='function') closeVertexPopup(key);
  buildMeasurePanel(key);
  const panel = document.getElementById('measure-'+key);
  panel.classList.add('open');
  document.getElementById('measureBtn-'+key)?.classList.add('active');
  if(!measureState[key]){
    measureState[key] = {points:[], line:null, rubberLine:null, vertexLayer:null, active:false, unit:'m', handlers:{}};
  }
  activateMeasure(key);
}
function closeMeasurePopup(key){
  const panel = document.getElementById('measure-'+key);
  panel.classList.remove('open');
  document.getElementById('measureBtn-'+key)?.classList.remove('active');
  deactivateMeasure(key);
}

function setMeasureUnit(key, unit){
  const st = measureState[key]; if(!st) return;
  st.unit = unit;
  ['m','km','cm'].forEach(u=>document.getElementById(`munit-${u}-${key}`).classList.toggle('active', u===unit));
  updateMeasureResult(key);
}

function activateMeasure(key){
  const m = maps[key]; if(!m) return;
  const st = measureState[key];
  st.active = true;
  m.getContainer().style.cursor = 'crosshair';
  ensureMeasureHandlers(key);
}
function deactivateMeasure(key, resetCursor=true){
  const m = maps[key]; if(!m) return;
  const st = measureState[key];
  if(st) st.active = false;
  if(resetCursor) m.getContainer().style.cursor = '';
}
// Registra os listeners de medição UMA VEZ por mapa; o comportamento é
// controlado pela flag measureState[key].active (evita problemas de
// remover/adicionar listeners dinamicamente).
const measureHandlersRegistered = {};
function ensureMeasureHandlers(key){
  if(measureHandlersRegistered[key]) return;
  measureHandlersRegistered[key] = true;
  const m = maps[key]; if(!m) return;

  // Intercepta cliques na fase de CAPTURA do contêiner do mapa enquanto a
  // medição está ativa, impedindo que camadas vetoriais (limites estaduais/
  // municipais, polígonos importados) abram seus próprios popups e bloqueiem
  // o clique antes que o Leaflet o processe como clique no mapa.
  m.getContainer().addEventListener('click', e => {
    const st = measureState[key];
    if(!st || !st.active) return;
    e.stopPropagation();
    const latlng = m.containerPointToLatLng(m.mouseEventToContainerPoint(e));
    addMeasurePoint(key, latlng);
  }, true);

  m.on('mousemove', e => {
    const st = measureState[key];
    if(!st || !st.active) return;
    updateRubberLine(key, e.latlng);
  });
}

// ESC = Desfazer último ponto de medição (quando a ferramenta está ativa)
document.addEventListener('keydown', e=>{
  if(e.key !== 'Escape') return;
  for(const key in measureState){
    if(measureState[key] && measureState[key].active){
      undoMeasurePoint(key);
      break;
    }
  }
});

function addMeasurePoint(key, latlng){
  const m = maps[key]; const st = measureState[key];
  st.points.push(latlng);
  redrawMeasure(key);
}
function undoMeasurePoint(key){
  const m = maps[key]; const st = measureState[key]; if(!st || !st.points.length) return;
  st.points.pop();
  if(st.rubberLine){ m.removeLayer(st.rubberLine); st.rubberLine=null; }
  if(!st.points.length){
    clearMeasure(key);
    return;
  }
  redrawMeasure(key);
}
function clearMeasure(key){
  const m = maps[key]; const st = measureState[key];
  if(!st) return;
  if(st.line){ m.removeLayer(st.line); st.line=null; }
  if(st.rubberLine){ m.removeLayer(st.rubberLine); st.rubberLine=null; }
  if(st.vertexLayer){ m.removeLayer(st.vertexLayer); st.vertexLayer=null; }
  st.points = [];
  updateMeasureResult(key);
}

function redrawMeasure(key){
  const m = maps[key]; const st = measureState[key];
  if(st.line){ m.removeLayer(st.line); st.line=null; }
  if(st.vertexLayer){ m.removeLayer(st.vertexLayer); st.vertexLayer=null; }

  if(st.points.length){
    st.vertexLayer = L.layerGroup(st.points.map(p=>
      L.circleMarker(p, {radius:4, color:'#e0a35b', weight:2, fillColor:'#e0a35b', fillOpacity:1})
    )).addTo(m);
  }
  if(st.points.length>=2){
    st.line = L.polyline(st.points, {color:'#e0a35b', weight:3}).addTo(m);
  }
  updateMeasureResult(key);
}

// Atualiza a linha de "elástico" entre o último ponto fixado e o cursor
function updateRubberLine(key, latlng){
  const m = maps[key]; const st = measureState[key];
  if(!st || !st.active || !st.points.length) return;
  const last = st.points[st.points.length-1];
  if(st.rubberLine) m.removeLayer(st.rubberLine);
  st.rubberLine = L.polyline([last, latlng], {color:'#e0a35b', weight:3, dashArray:'5 5'}).addTo(m);
  updateMeasureResult(key, latlng);
}

function totalDistance(points, extraPoint){
  let total = 0;
  const all = extraPoint ? [...points, extraPoint] : points;
  for(let i=1;i<all.length;i++) total += all[i-1].distanceTo(all[i]);
  return total;
}

function updateMeasureResult(key, livePoint){
  const st = measureState[key];
  const el = document.getElementById('mresult-'+key);
  if(!st || !el) return;
  if(!st.points.length){ el.textContent = '—'; return; }
  const fixedTotal = totalDistance(st.points);
  const liveTotal = livePoint ? totalDistance(st.points, livePoint) : fixedTotal;
  const unit = MEASURE_UNITS[st.unit];
  const fmt = v => {
    const val = v * unit.factor;
    const decimals = st.unit==='km' ? 3 : (st.unit==='cm' ? 0 : 2);
    return val.toLocaleString('pt-BR',{maximumFractionDigits:decimals});
  };
  if(livePoint){
    el.innerHTML = `Atual: <b>${fmt(liveTotal)}</b> ${st.unit}${st.points.length>1?` <span style="color:var(--muted)">(fixo: ${fmt(fixedTotal)} ${st.unit})</span>`:''}`;
  } else {
    el.innerHTML = `Distância total: <b>${fmt(fixedTotal)}</b> ${st.unit}`;
  }
}

// ════════════════════════════════════════
//  FERRAMENTA DE ÁREA (polígonos importados)
// ════════════════════════════════════════
// Área de polígono no elipsoide GRS80/SIRGAS2000 (mesma referência usada pelo
// QGIS). Usa o método da LATITUDE AUTÁLICA (equal-area): converte cada vértice
// para a latitude autálica e aplica o excesso esférico sobre a esfera autálica
// de raio Rq. Resulta em áreas equivalentes às do cálculo elipsoidal do QGIS.
const _GRS80 = (function(){
  const a = 6378137.0;            // semieixo maior (m)
  const f = 1/298.257222101;      // achatamento GRS80
  const e2 = f*(2-f);
  const e = Math.sqrt(e2);
  // q(±90°) — usado para normalizar a latitude autálica e o raio autálico
  const qp = (1-e2)*( 1/(1-e2) - (1/(2*e))*Math.log((1-e)/(1+e)) );
  const Rq = a*Math.sqrt(qp/2);   // raio autálico (esfera de mesma área)
  return {a,f,e2,e,qp,Rq};
})();

function _authalicLat(phi){ // phi em radianos
  const {e2,e,qp} = _GRS80;
  const sinp = Math.sin(phi);
  const q = (1-e2)*( sinp/(1-e2*sinp*sinp) - (1/(2*e))*Math.log((1-e*sinp)/(1+e*sinp)) );
  let ratio = q/qp;
  if(ratio> 1) ratio= 1;
  if(ratio<-1) ratio=-1;
  return Math.asin(ratio);
}

// Área (m²) de um anel [ [lon,lat], ... ] sobre o elipsoide GRS80.
function ringAreaM2(ring){
  const n = ring.length;
  if(n < 3) return 0;
  const Rq = _GRS80.Rq;
  const rad = d => d*Math.PI/180;
  let sum = 0;
  for(let i=0;i<n;i++){
    const p1 = ring[i];
    const p2 = ring[(i+1)%n];
    const lon1 = rad(p1[0]), lon2 = rad(p2[0]);
    const b1 = _authalicLat(rad(p1[1]));
    const b2 = _authalicLat(rad(p2[1]));
    sum += (lon2 - lon1) * (2 + Math.sin(b1) + Math.sin(b2));
  }
  return Math.abs(sum * Rq * Rq / 2);
}

// Soma a área de todos os polígonos (Polygon/MultiPolygon) de um GeoJSON,
// subtraindo os anéis internos (buracos).
function geojsonAreaM2(geojson){
  let total = 0;
  (geojson?.features||[]).forEach(f=>{
    const g = f.geometry; if(!g) return;
    const polys = g.type==='Polygon' ? [g.coordinates]
                : g.type==='MultiPolygon' ? g.coordinates : [];
    polys.forEach(poly=>{
      poly.forEach((ring,idx)=>{
        const a = ringAreaM2(ring);
        total += idx===0 ? a : -a; // primeiro anel = externo; demais = buracos
      });
    });
  });
  return total;
}

function fmtArea(m2){
  const ha = m2/10000, km2 = m2/1e6;
  const f = (v,d)=>v.toLocaleString('pt-BR',{maximumFractionDigits:d});
  return {m2:f(m2,2), km2:f(km2,6), ha:f(ha,4)};
}

function openAreaPopup(key){
  const btn = document.getElementById('areaBtn-'+key);
  if(btn && btn.disabled) return;
  // fecha os painéis de medição e de vértices se estiverem abertos
  closeMeasurePopup(key);
  if(typeof closeVertexPopup==='function') closeVertexPopup(key);
  if(typeof closeDistPopup==='function') closeDistPopup(key);
  buildAreaPanelList(key);
  const panel = document.getElementById('area-'+key);
  panel.classList.add('open');
  document.getElementById('areaBtn-'+key)?.classList.add('active');
}
function closeAreaPopup(key){
  const panel = document.getElementById('area-'+key);
  if(panel) panel.classList.remove('open');
  document.getElementById('areaBtn-'+key)?.classList.remove('active');
}

function buildAreaPanelList(key){
  const panel = document.getElementById('area-'+key);
  if(!panel) return;
  const feats = (uploadedLayers[key]||[]).filter(l=>l.hasPolygon || l.hasLine);
  const opts = feats.map(l=>{
    const icon = l.hasPolygon ? '⬛' : '➖';
    return `<button class="area-layer-btn" onclick="selectAreaLayer('${key}','${l.id}')"><span class="alb-icon">${icon}</span><span class="alb-name">${escHtml(l.name)}</span></button>`;
  }).join('');
  // Seção extra: verificação de buffer AID × ADA (aparece quando camadas com
  // denominação "ADA" e "AID" são detectadas entre os polígonos importados)
  const pair = findAdaAidEntries(key);
  const adaAidHtml = pair ? `
    <div class="color-panel-section">
      <div class="color-panel-lbl">Buffer AID × ADA</div>
      <button class="area-layer-btn adaaid-btn" onclick="checkAdaAidBuffer('${key}')"><span class="alb-icon">🛟</span><span class="alb-name">Verificar buffer de 250 m (${escHtml(pair.aid.name)} × ${escHtml(pair.ada.name)})</span></button>
      <div class="measure-result" id="adaaid-result-${key}" style="display:none"></div>
    </div>` : '';
  // Seção extra: cadeia de pontos LIGADOS na tabela (coluna 🔗).
  // Fechada (último ponto == primeiro) → polígono com área; aberta → linha
  // com comprimento.
  const chain = linkedChainInfo(key);
  let linkedHtml = '';
  if(chain){
    const icon = chain.closed ? '⬛' : '➖';
    const lbl = chain.closed
      ? `Polígono dos pontos ligados (${chain.coords.length-1} pontos)`
      : `Linha dos pontos ligados (${chain.coords.length} pontos)`;
    linkedHtml = `
    <div class="color-panel-section">
      <div class="color-panel-lbl">Pontos ligados (tabela)</div>
      <button class="area-layer-btn" id="linkedpoly-btn-${key}" onclick="selectLinkedFeature('${key}')"><span class="alb-icon">${icon}</span><span class="alb-name">${lbl}</span></button>
    </div>`;
  }
  panel.innerHTML = `
    <div class="measure-panel-hdr"><span>📐 Área e comprimento</span><span class="mp-close" onclick="closeAreaPopup('${key}')">✕</span></div>
    <div class="color-panel-section">
      <div class="color-panel-lbl">Camadas importadas (polígono e linha)</div>
      <div class="area-layer-list">${opts || '<div class="measure-hint">Nenhuma camada de polígono ou linha importada.</div>'}</div>
    </div>
    ${linkedHtml}
    ${adaAidHtml}
    <div class="measure-hint" id="ahint-${key}">Selecione uma camada acima: polígonos exibem a área total; linhas exibem o comprimento total.</div>
    <div class="measure-result" id="aresult-${key}">—</div>
  `;
}

// ── Verificação de buffer AID × ADA ──
// Detecta, entre os polígonos importados, camadas cujos nomes contenham as
// denominações "ADA" e "AID" (como palavras isoladas — "ADA.kml",
// "aid_250m.kml", "ADA - Empreendimento.shp", etc.).
function findAdaAidEntries(key){
  const polys = (uploadedLayers[key]||[]).filter(l=>l.hasPolygon);
  const isAda = n => /(^|[^a-z0-9])ada([^a-z0-9]|$)/i.test(n);
  const isAid = n => /(^|[^a-z0-9])aid([^a-z0-9]|$)/i.test(n);
  const ada = polys.find(l=>isAda(l.name) && !isAid(l.name));
  const aid = polys.find(l=>isAid(l.name));
  return (ada && aid) ? {ada, aid} : null;
}

// Extrai todos os anéis (contornos) de polígonos de um GeoJSON: [[lat,lon],...]
function _polygonRings(gj){
  const rings = [];
  (gj.features||[]).forEach(f=>{
    const g = f.geometry; if(!g) return;
    const polys = g.type==='Polygon' ? [g.coordinates]
                : g.type==='MultiPolygon' ? g.coordinates : [];
    polys.forEach(poly => poly.forEach(ring => {
      rings.push(ring.map(c=>[c[1], c[0]])); // [lat,lon]
    }));
  });
  return rings;
}

// Distância (m) de um ponto a um segmento, em projeção local equiretangular
// (precisa o bastante para distâncias de centenas de metros).
function _ptSegDistM(p, a, b){
  const lat0 = p[0]*Math.PI/180;
  const mx = 111320*Math.cos(lat0), my = 110540; // m por grau (lon, lat)
  const px=(p[1]-a[1])*mx, py=(p[0]-a[0])*my;
  const bx=(b[1]-a[1])*mx, by=(b[0]-a[0])*my;
  const len2 = bx*bx+by*by;
  let t = len2 ? (px*bx+py*by)/len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = px-t*bx, dy = py-t*by;
  return Math.sqrt(dx*dx+dy*dy);
}

// Menor distância (m) de um ponto ao conjunto de anéis
function _ptToRingsM(p, rings){
  let min = Infinity;
  for(const ring of rings){
    for(let i=1;i<ring.length;i++){
      const d = _ptSegDistM(p, ring[i-1], ring[i]);
      if(d < min) min = d;
    }
  }
  return min;
}

// Ponto dentro de algum polígono do GeoJSON (ray casting, com buracos)
function _gjContains(gj, lat, lon){
  for(const f of (gj.features||[])){
    const g = f.geometry; if(!g) continue;
    const polys = g.type==='Polygon' ? [g.coordinates]
                : g.type==='MultiPolygon' ? g.coordinates : [];
    for(const poly of polys){
      const inRing = ring => {
        let inside = false;
        for(let i=0, j=ring.length-1; i<ring.length; j=i++){
          const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
          if(((yi>lat)!==(yj>lat)) && (lon < (xj-xi)*(lat-yi)/(yj-yi)+xi)) inside = !inside;
        }
        return inside;
      };
      if(inRing(poly[0])){
        let inHole = false;
        for(let h=1; h<poly.length; h++){ if(inRing(poly[h])){ inHole=true; break; } }
        if(!inHole) return true;
      }
    }
  }
  return false;
}

function checkAdaAidBuffer(key){
  const pair = findAdaAidEntries(key);
  const out = document.getElementById('adaaid-result-'+key);
  if(!pair || !out) return;
  out.style.display = '';

  const adaRings = _polygonRings(pair.ada.geojson);
  const aidRings = _polygonRings(pair.aid.geojson);
  if(!adaRings.length || !aidRings.length){
    out.innerHTML = '<div class="measure-hint">Não foi possível extrair os contornos das camadas.</div>';
    return;
  }

  // ADA contida na AID? (amostra os vértices da ADA)
  let allInside = true;
  for(const ring of adaRings){
    for(const p of ring){
      if(!_gjContains(pair.aid.geojson, p[0], p[1])){ allInside = false; break; }
    }
    if(!allInside) break;
  }

  // Distância da borda da ADA à borda da AID (mín. e máx. sobre os vértices)
  let minD = Infinity, maxD = 0;
  for(const ring of adaRings){
    for(const p of ring){
      const d = _ptToRingsM(p, aidRings);
      if(d < minD) minD = d;
      if(d > maxD) maxD = d;
    }
  }
  // Refina o mínimo no sentido inverso (vértices da AID → bordas da ADA)
  for(const ring of aidRings){
    for(const p of ring){
      const d = _ptToRingsM(p, adaRings);
      if(d < minD) minD = d;
    }
  }

  const fmt = v => v.toLocaleString('pt-BR', {maximumFractionDigits:1});
  // Tolerância técnica: buffers gerados em SIG aproximam os arcos por
  // segmentos retos (discretização). Com a segmentação padrão do QGIS, um
  // buffer legítimo de 250 m pode medir até ~3-4 m a menos nos cantos
  // convexos. Por isso: ≥249,5 m = pleno; ≥246 m = compatível (diferença
  // atribuível à discretização); abaixo disso = insuficiente.
  let statusHtml;
  if(!allInside){
    statusHtml = `<div class="adaaid-status warn">⚠️ A ADA não está totalmente contida na AID — as bordas se cruzam ou a AID não envolve a ADA.</div>`;
  } else if(minD > 250.5){
    statusHtml = `<div class="adaaid-status ok">✅ A AID está ACIMA de 250 m no entorno da ADA (menor distância: ${fmt(minD)} m) — atende ao buffer mínimo.</div>`;
  } else if(minD >= 249.5){
    statusHtml = `<div class="adaaid-status ok">✅ A AID atende exatamente ao buffer mínimo de 250 m no entorno da ADA.</div>`;
  } else if(minD >= 246){
    statusHtml = `<div class="adaaid-status ok">✅ AID compatível com buffer de 250 m — a menor distância (${fmt(minD)} m) fica dentro da tolerância de discretização dos arcos do buffer (~3-4 m).</div>`;
  } else {
    statusHtml = `<div class="adaaid-status warn">⚠️ A AID está ABAIXO de 250 m no entorno da ADA em pelo menos um trecho.</div>`;
  }
  out.innerHTML = `
    ${statusHtml}
    <div class="area-result-row"><span>Menor distância entre as bordas</span><b>${fmt(minD)} m</b></div>
    <div class="area-result-row"><span>Maior distância (borda da ADA à AID)</span><b>${fmt(maxD)} m</b></div>
    <div class="measure-hint" style="margin:8px 0 0">Medição pelas distâncias entre os contornos das camadas (vértice a segmento). Camadas detectadas: ADA = "${escHtml(pair.ada.name)}", AID = "${escHtml(pair.aid.name)}".</div>
  `;
}

function selectAreaLayer(key, id){
  const entry = (uploadedLayers[key]||[]).find(l=>l.id===id);
  const res = document.getElementById('aresult-'+key);
  const hint = document.getElementById('ahint-'+key);
  // destaca o botão selecionado
  document.querySelectorAll(`#area-${key} .area-layer-btn`).forEach(b=>b.classList.remove('active'));
  const btns = [...document.querySelectorAll(`#area-${key} .area-layer-btn`)];
  const idxList = (uploadedLayers[key]||[]).filter(l=>l.hasPolygon || l.hasLine).findIndex(l=>l.id===id);
  if(btns[idxList]) btns[idxList].classList.add('active');
  if(!entry || !res){ return; }

  let rows = '';
  // POLÍGONO → área total
  if(entry.hasPolygon){
    const m2 = geojsonAreaM2(entry.geojson);
    const a = fmtArea(m2);
    rows += `
      <div class="area-result-row"><span>Metros quadrados</span><b>${a.m2} m²</b></div>
      <div class="area-result-row"><span>Quilômetros quadrados</span><b>${a.km2} km²</b></div>
      <div class="area-result-row"><span>Hectares</span><b>${a.ha} ha</b></div>`;
  }
  // LINHA → comprimento total
  if(entry.hasLine){
    const lenM = geojsonLengthM(entry.geojson);
    const mTxt  = lenM.toLocaleString('pt-BR', {maximumFractionDigits:1});
    const kmTxt = (lenM/1000).toLocaleString('pt-BR', {maximumFractionDigits:3});
    rows += `
      <div class="area-result-row"><span>Comprimento (metros)</span><b>${mTxt} m</b></div>
      <div class="area-result-row"><span>Comprimento (quilômetros)</span><b>${kmTxt} km</b></div>`;
  }
  if(hint){
    const lbl = entry.hasPolygon && entry.hasLine ? 'Área e comprimento totais de'
              : entry.hasPolygon ? 'Área total de' : 'Comprimento total de';
    hint.textContent = `${lbl} "${entry.name}":`;
  }
  res.innerHTML = rows || '—';
  // tenta dar zoom à camada selecionada
  try{ maps[key].fitBounds(entry.layer.getBounds(), {padding:[32,32]}); }catch(e){}
}

// Comprimento total (em metros) das linhas de um GeoJSON, somando os segmentos
// pela fórmula de Haversine (adequada para trilhas e caminhamentos).
function geojsonLengthM(geojson){
  let total = 0;
  const lineLen = coords => {
    let s = 0;
    for(let i=1;i<coords.length;i++){
      s += haversineM([coords[i-1][1], coords[i-1][0]], [coords[i][1], coords[i][0]]);
    }
    return s;
  };
  (geojson.features||[]).forEach(f=>{
    const g = f.geometry; if(!g) return;
    if(g.type==='LineString') total += lineLen(g.coordinates);
    else if(g.type==='MultiLineString') g.coordinates.forEach(part=> total += lineLen(part));
  });
  return total;
}

// ════════════════════════════════════════
//  CARREGAMENTO DE CAMADAS (overlay visual)
// ════════════════════════════════════════
function showLayerLoading(key){
  const el = document.getElementById('loading-'+key);
  if(el) el.classList.add('show');
}
function hideLayerLoading(key){
  const el = document.getElementById('loading-'+key);
  if(el) el.classList.remove('show');
}

// Exibe um aviso temporário no topo do mapa (ex: camada WMS indisponível)
function showLayerWarning(key, message){
  const wrap = document.querySelector(`#map-${key}`)?.closest('.map-wrap');
  if(!wrap) return;
  let toast = wrap.querySelector('.layer-warning-toast');
  if(!toast){
    toast = document.createElement('div');
    toast.className = 'layer-warning-toast';
    toast._messages = new Set();
    wrap.appendChild(toast);
  }
  toast._messages.add(message);
  toast.innerHTML = [...toast._messages].map(m=>'⚠️ '+m).join('<br>');
  toast.classList.add('show');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(()=>{
    toast.classList.remove('show');
    toast._messages.clear();
  }, 8000);
}

// ════════════════════════════════════════
//  CAMADAS GEOESPACIAIS ENVIADAS PELO USUÁRIO (KML/KMZ/SHP)
// ════════════════════════════════════════
const MAX_GEO_FILE_MB = 50;
const uploadedLayers = {ext:[], conv:[], inf:[]}; // {id,name,layer,color,type}

function bringUploadedLayersToFront(key){
  (uploadedLayers[key]||[]).forEach(l=>{
    try{ l.layer.bringToFront(); }catch(e){}
  });
}

// Remove TODAS as camadas geoespaciais importadas de uma seção (ext/conv/inf):
// tira do mapa e do controle de camadas, limpa a lista visual e zera o estado.
function clearUploadedLayers(key){
  const m = maps[key];
  (uploadedLayers[key]||[]).forEach(l=>{
    try{ if(m) m.removeLayer(l.layer); }catch(e){}
    try{ if(m && m._uploadLayersControl) m._uploadLayersControl.removeLayer(l.layer); }catch(e){}
    // Remove o relatório de integridade associado a esta camada (se houver)
    try{
      const rep = findTrackReport(l.name);
      if(rep && _trackReports[rep.fileName]) delete _trackReports[rep.fileName];
    }catch(e){}
  });
  uploadedLayers[key] = [];
  uploadedColorIdx[key] = 0;
  csvImportedPoints[key] = {};
  if(key==='inf' && typeof updateInfDownloadButtons==='function') updateInfDownloadButtons();
  // Limpa a lista visual e oculta o painel de camadas importadas
  const list = document.getElementById('geolist-'+key);
  if(list) list.innerHTML = '';
  const panel = document.getElementById('geoup-'+key);
  if(panel) panel.classList.remove('show');
  if(m && m._uploadLayersControl){
    const c = m._uploadLayersControl.getContainer();
    if(c) c.style.display = 'none';
    if(m._uploadLayersControl._toggleFn) m._uploadLayersControl._toggleFn(false);
  }
  // Atualiza o botão de área (não há mais polígonos importados)
  if(typeof updateAreaButton==='function') updateAreaButton(key);
  // Fecha popups de medição/área se abertos
  if(typeof closeAreaPopup==='function') closeAreaPopup(key);
  if(typeof closeMeasurePopup==='function') closeMeasurePopup(key);
  if(typeof closeVertexPopup==='function') closeVertexPopup(key);
}
const PASTEL_COLORS = ['#5fa8d3','#cf8b6c','#9085d6','#6fa787','#d68fa6','#bda36a','#e0a35b','#7ea8f8'];
// Cores padrão fixas por denominação, aplicadas SOMENTE à tipologia POLÍGONO:
// polígonos de ADA entram em AMARELO e os de AID em VERMELHO (convenção usual
// nas peças de licenciamento). Pontos e linhas do mesmo arquivo seguem a paleta
// normal. Vale para qualquer formato importado; a cor continua alterável no
// seletor do painel.
const NAMED_LAYER_COLORS = { ada:'#fbff00', aid:'#f71302' };
function colorForLayerName(name){
  const n = String(name||'');
  const isAda = /(^|[^a-z0-9])ada([^a-z0-9]|$)/i.test(n);
  const isAid = /(^|[^a-z0-9])aid([^a-z0-9]|$)/i.test(n);
  if(isAid) return NAMED_LAYER_COLORS.aid;   // "AID" tem precedência
  if(isAda) return NAMED_LAYER_COLORS.ada;
  return null;
}
let uploadedColorIdx = {ext:0, conv:0, inf:0};

function initGeoUploadPanel(key, map, layersControl){
  const panel = document.getElementById('geoup-'+key);
  if(!panel) return;
  panel.innerHTML = `
    <div class="geo-upload-hdr"><span>📁 Camadas importadas</span></div>
    <input type="file" class="geo-upload-input" id="geofile-${key}" accept=".kml,.kmz,.zip,.geojson,.json,.gpx,.gtm,.csv,.rar,.7z,.shp,.dbf,.shx,.prj" multiple>
    <input type="file" class="geo-upload-input" id="geofolder-${key}" webkitdirectory directory multiple>
    <div class="geo-layers-list" id="geolist-${key}"></div>
  `;
  document.getElementById('geofile-'+key).addEventListener('change', e=>handleGeoFile(key, e.target.files, map, layersControl));
  document.getElementById('geofolder-'+key).addEventListener('change', e=>handleGeoFolder(key, e.target.files, map, layersControl));
}

function triggerGeoUpload(key, mode){
  // Garante que o webmap esteja visível na mesma disposição usada por
  // "Salvar e visualizar no mapa" (evita tela dividida/duplicada).
  if(key==='inf' && document.getElementById('inf-split').style.display==='none'){
    document.getElementById('inf-input-panel').style.display='none';
    document.getElementById('inf-split').style.display='flex';
    const editBtn = document.getElementById('inf-edit-btn');
    if(editBtn && !infData.length){ editBtn.textContent='📝 Informar pontos'; }
    if(typeof updateInfDownloadButtons==='function') updateInfDownloadButtons();
  }
  if(!maps[key]){
    buildMap('map-'+key, key);
    setTimeout(()=>{ maps[key] && maps[key].invalidateSize(); _triggerGeoUploadInput(key, mode); }, 250);
    return;
  }
  maps[key].invalidateSize();
  _triggerGeoUploadInput(key, mode);
}
function _triggerGeoUploadInput(key, mode){
  if(mode==='folder'){ document.getElementById('geofolder-'+key)?.click(); }
  else { document.getElementById('geofile-'+key)?.click(); }
}

// Verifica se o clique acertou um PONTO ou LINHA importado (feições de maior
// prioridade). Abre o popup correspondente e retorna true.
function uploadedPointOrLineHit(key, latlng){
  const map = maps[key];
  if(!map) return false;
  const layers = uploadedLayers[key] || [];
  if(!layers.length) return false;

  const clickPt = map.latLngToContainerPoint(latlng);
  const TOL_POINT = 14, TOL_LINE = 10;
  let pointHit = null, lineHit = null;

  for(const entry of layers){
    if(!map.hasLayer(entry.layer)) continue; // ignora camadas desmarcadas/ocultas
    try{
      entry.layer.eachLayer(sub=>{
        const gt = sub.feature && sub.feature.geometry && sub.feature.geometry.type;
        if(sub instanceof L.CircleMarker){
          if(!pointHit && map.latLngToContainerPoint(sub.getLatLng()).distanceTo(clickPt) <= TOL_POINT){
            pointHit = sub;
          }
        } else if((gt==='LineString'||gt==='MultiLineString') && sub.getLatLngs){
          if(!lineHit && polylineHitTest(map, sub.getLatLngs(), clickPt, TOL_LINE)){
            lineHit = sub;
          }
        }
      });
    }catch(e){}
  }
  const chosen = pointHit || lineHit;
  if(!chosen) return false;
  openFeaturePopupAt(map, chosen, chosen instanceof L.CircleMarker ? chosen.getLatLng() : latlng);
  return true;
}

// Verifica se o clique caiu dentro de um POLÍGONO importado. Abre o popup e
// retorna true. Chamado APÓS a consulta WMS, para que as camadas WMS tenham
// prioridade sobre os polígonos importados.
function uploadedPolygonHit(key, latlng){
  const map = maps[key];
  if(!map) return false;
  const layers = uploadedLayers[key] || [];
  if(!layers.length) return false;
  let polyHit = null;
  for(const entry of layers){
    if(!map.hasLayer(entry.layer)) continue; // ignora camadas desmarcadas/ocultas
    try{
      entry.layer.eachLayer(sub=>{
        const gt = sub.feature && sub.feature.geometry && sub.feature.geometry.type;
        if(!polyHit && (gt==='Polygon'||gt==='MultiPolygon') && sub.getBounds){
          if(polygonHitTest(sub, latlng)) polyHit = sub;
        }
      });
    }catch(e){}
  }
  if(!polyHit) return false;
  openFeaturePopupAt(map, polyHit, latlng);
  return true;
}

// Abre o popup de uma feição importada de forma confiável, mesmo que a camada
// seja não-interativa (interactive:false). Reaproveita o conteúdo definido em
// bindPopup; se não houver, não faz nada.
function openFeaturePopupAt(map, layer, latlng){
  try{
    map.closePopup();
    const popup = layer.getPopup && layer.getPopup();
    if(popup){
      popup.setLatLng(latlng);
      map.openPopup(popup);
    } else if(layer.openPopup){
      layer.openPopup(latlng);
    }
  }catch(e){ console.warn('Falha ao abrir popup da feição importada', e); }
}

// Testa se um ponto (latlng) está dentro de um polígono (ray casting).
function polygonHitTest(polyLayer, latlng){
  try{
    if(!polyLayer.getBounds().contains(latlng)) return false;
    const gj = polyLayer.feature && polyLayer.feature.geometry;
    if(!gj) return false;
    const polys = gj.type==='Polygon' ? [gj.coordinates]
                : gj.type==='MultiPolygon' ? gj.coordinates : [];
    const x = latlng.lng, y = latlng.lat;
    for(const poly of polys){
      // anel externo = poly[0]; anéis internos (buracos) = poly[1..]
      let inside = false;
      const ring = poly[0];
      for(let i=0, j=ring.length-1; i<ring.length; j=i++){
        const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
        const intersect = ((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi);
        if(intersect) inside = !inside;
      }
      if(inside){
        // verifica buracos
        let inHole = false;
        for(let h=1; h<poly.length; h++){
          const hole = poly[h];
          let hi = false;
          for(let i=0, j=hole.length-1; i<hole.length; j=i++){
            const xi=hole[i][0], yi=hole[i][1], xj=hole[j][0], yj=hole[j][1];
            const intersect = ((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi);
            if(intersect) hi = !hi;
          }
          if(hi){ inHole = true; break; }
        }
        if(!inHole) return true;
      }
    }
  }catch(e){}
  return false;
}

// Testa se o ponto de clique (em px) está a até `tol` px de alguma aresta da
// polilinha. Aceita arrays aninhados (MultiLineString).
function polylineHitTest(map, latlngs, clickPt, tol){
  if(!latlngs || !latlngs.length) return false;
  if(Array.isArray(latlngs[0])){
    return latlngs.some(part => polylineHitTest(map, part, clickPt, tol));
  }
  for(let i=0;i<latlngs.length-1;i++){
    const a = map.latLngToContainerPoint(latlngs[i]);
    const b = map.latLngToContainerPoint(latlngs[i+1]);
    if(L.LineUtil.pointToSegmentDistance(clickPt, a, b) <= tol) return true;
  }
  return false;
}

// Detecta (sem abrir popup) se há um PONTO ou LINHA importado próximo ao clique.
// Usado para o polígono ceder a prioridade às feições de ponto/linha.
function nextColor(key){
  const c = PASTEL_COLORS[uploadedColorIdx[key] % PASTEL_COLORS.length];
  uploadedColorIdx[key]++;
  return c;
}

// ── Rótulos das camadas importadas no mapa ──────────────────────────────────
// Campos disponíveis para rotular: os MESMOS exibidos no popup da feição
// (propriedades da camada, limitadas a 8 como no popup).
function geoLabelFields(geojson){
  const keys = [];
  (geojson?.features||[]).forEach(f=>{
    Object.keys(f.properties||{}).forEach(k=>{ if(!keys.includes(k)) keys.push(k); });
  });
  return keys.slice(0,8);
}

// Aplica (ou remove) os rótulos permanentes da camada, conforme os campos
// selecionados em entry.labelProps.
function applyGeoLabels(entry){
  if(!entry || !entry.layer) return;
  const sel = entry.labelProps || [];
  entry.layer.eachLayer(sub=>{
    const props = (sub.feature && sub.feature.properties) || {};
    // MultiPoint vira grupo: rotula cada parte
    const alvos = (sub instanceof L.LayerGroup) ? [] : [sub];
    if(sub instanceof L.LayerGroup) sub.eachLayer(c=>alvos.push(c));
    alvos.forEach(t=>{
      try{ if(t.getTooltip && t.getTooltip()) t.unbindTooltip(); }catch(e){}
      if(!sel.length) return;
      const txt = sel.map(k=>props[k])
        .filter(v=>v!==undefined && v!==null && String(v).trim()!=='')
        .map(v=>escHtml(String(v))).join('<br>');
      if(!txt) return;
      const isPonto = typeof t.getLatLng === 'function';
      try{
        t.bindTooltip(txt, {
          permanent:true, opacity:1, className:'geo-map-label',
          direction: isPonto ? 'top' : 'center',
          offset: isPonto ? [0,-8] : [0,0],
        });
      }catch(e){ /* geometria sem âncora para rótulo */ }
    });
  });
}

// Abre o menu de seleção dos campos a exibir como rótulo no mapa.
function openGeoLabelMenu(entry, btn, key){
  closeGeoLabelMenu();
  const campos = geoLabelFields(entry.geojson);
  const menu = document.createElement('div');
  menu.className = 'glt-label-menu';
  menu.id = 'glt-label-menu';
  const itens = campos.length
    ? `<div class="glt-label-menu-list">${campos.map(c=>{
        const on = (entry.labelProps||[]).includes(c) ? ' checked' : '';
        return `<label><input type="checkbox" value="${escHtml(c)}"${on}><span>${escHtml(c)}</span></label>`;
      }).join('')}</div>`
    : `<div class="glt-label-menu-empty">Esta camada não possui propriedades.</div>`;
  menu.innerHTML = `<div class="glt-label-menu-head">
      <span class="glt-label-menu-title">Rótulos no mapa</span>
      <span class="glt-label-menu-close" title="Fechar">✕</span>
    </div>${itens}
    ${campos.length ? '<div class="glt-label-menu-actions"><button type="button">Limpar</button></div>' : ''}`;
  document.body.appendChild(menu);
  menu.querySelector('.glt-label-menu-close').addEventListener('click', ev=>{
    ev.stopPropagation();
    closeGeoLabelMenu();
  });

  // Posiciona junto ao botão, sem sair da janela
  const r = btn.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - mw - 8);
  let top  = r.bottom + 6;
  if(top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  menu.style.left = Math.max(8, left) + 'px';
  menu.style.top  = top + 'px';

  const atualizar = ()=>{
    entry.labelProps = [...menu.querySelectorAll('input[type="checkbox"]:checked')].map(i=>i.value);
    btn.classList.toggle('active', entry.labelProps.length>0);
    btn.title = entry.labelProps.length
      ? `Rótulos: ${entry.labelProps.join(', ')}` : 'Rótulos no mapa';
    applyGeoLabels(entry);
  };
  menu.addEventListener('change', atualizar);
  const btnLimpar = menu.querySelector('.glt-label-menu-actions button');
  if(btnLimpar) btnLimpar.addEventListener('click', ()=>{
    menu.querySelectorAll('input[type="checkbox"]').forEach(i=>{ i.checked = false; });
    atualizar();
  });
  menu.addEventListener('click', ev=>ev.stopPropagation());
  setTimeout(()=>{
    document.addEventListener('click', closeGeoLabelMenu, {once:true});
  }, 0);
  document.addEventListener('keydown', _geoLabelMenuEsc);
}
function closeGeoLabelMenu(){
  const m = document.getElementById('glt-label-menu');
  if(m) m.remove();
  document.removeEventListener('keydown', _geoLabelMenuEsc);
}
function _geoLabelMenuEsc(ev){ if(ev.key === 'Escape') closeGeoLabelMenu(); }

function addGeoLayerToPanel(key, name, layer, color, map, ulc, geojson){
  const id = 'gl_'+Math.random().toString(36).slice(2,9);

  // ── Tipologias vetoriais presentes (ponto, linha, polígono) ──
  const types = new Set();
  let pointCount = 0;
  (geojson?.features||[]).forEach(f=>{
    const t = f.geometry?.type;
    if(t==='Point'){ types.add('point'); pointCount += 1; }
    else if(t==='MultiPoint'){ types.add('point'); pointCount += (f.geometry.coordinates||[]).length; }
    else if(t==='LineString'||t==='MultiLineString') types.add('line');
    else if(t==='Polygon'||t==='MultiPolygon') types.add('polygon');
  });

  uploadedLayers[key].push({id, name, layer, color, dotColor:IMP_POINT_DOT_DEFAULT, geojson, types:[...types], hasPolygon:types.has('polygon'), hasLine:types.has('line'), pointCount});
  const panel = document.getElementById('geoup-'+key);
  panel.classList.add('show');
  const list = document.getElementById('geolist-'+key);
  const item = document.createElement('div');
  item.className='geo-layer-item';
  item.id='item-'+id;

  // Rank de tipologia para AGRUPAR as camadas no painel:
  // pontos (0) → linhas (1) → polígonos (2). Quando a camada tem mais de uma
  // tipologia, usa a de menor rank (a mais "pontual") como critério.
  const typeRank = {point:0, line:1, polygon:2};
  let primaryRank = 3;
  ['point','line','polygon'].forEach(t=>{ if(types.has(t)) primaryRank = Math.min(primaryRank, typeRank[t]); });
  item.dataset.typerank = primaryRank;
  item.dataset.name = (name||'').toLowerCase();
  item.dataset.pointcount = pointCount;

  // Ordem fixa das tipologias: pontos → linhas → polígonos
  const typeOrder = ['point','line','polygon'];
  const typeIcons = {point:'📍', line:'➖', polygon:'⬛'};
  const typeLabels = {point:'Ponto', line:'Linha', polygon:'Polígono'};
  const iconsHtml = typeOrder.filter(t=>types.has(t)).map(t=>{
    // No caso de pontos, mostra a quantidade ao lado do ícone
    const countTxt = (t==='point' && pointCount>0)
      ? `<span class="glt-type-count">${pointCount}</span>` : '';
    return `<span class="glt-type-icon" title="${t==='point'?('Total: '+pointCount+' ponto(s) detectado(s)'):typeLabels[t]}">${typeIcons[t]}${countTxt}</span>`;
  }).join('');

  // Badge de integridade da trilha (se houver relatório para esta camada)
  const report = findTrackReport(name);
  let badgeHtml = '';
  if(report){
    const icon = report.authentic ? '✅' : (report.limited ? '🛈' : '⚠️');
    const cls  = report.authentic ? 'tr-ok' : (report.limited ? 'tr-info' : 'tr-warn');
    const tip  = report.authentic ? 'Trilha autêntica — clique aqui para ver a análise'
               : report.limited ? 'Verificação limitada — clique aqui para mais detalhes'
               : 'Possíveis alterações — clique aqui para ver a análise';
    badgeHtml = `<span class="glt-integrity ${cls}" title="${escHtml(tip)}" data-report="${escHtml(report.fileName)}">${icon}</span>`;
  }

  // Camadas com pontos ganham um 2º seletor (redondo) para a cor do miolo
  const dotHtml = types.has('point')
    ? `<span class="glt-dot-wrap"><input type="color" class="layer-color-input glt-dot" value="${IMP_POINT_DOT_DEFAULT}" title="Cor do miolo dos pontos (padrão: preto)" aria-label="Cor do miolo dos pontos da camada ${escHtml(name)}"><button type="button" class="glt-dot-reset" title="Restaurar a cor padrão do miolo (preto)" aria-label="Restaurar a cor padrão do miolo" hidden>↺</button></span>`
    : '';
  item.innerHTML = `<input type="color" class="layer-color-input glt-color" value="${escHtml(color)}" title="${types.has('point')?'Cor da camada (contorno dos pontos, linhas e polígonos)':'Cor da camada'}">${dotHtml}<span class="glt-name" title="${escHtml(name)}">${escHtml(name)}</span><span class="glt-types">${iconsHtml}</span>${badgeHtml}<span class="glt-labels" title="Rótulos no mapa">🏷</span><span class="glt-rm" title="Remover">✕</span>`;
  const badgeEl = item.querySelector('.glt-integrity');
  if(badgeEl){
    badgeEl.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      openTrackReportModal(report);
    });
  }
  item.querySelector('.glt-labels').addEventListener('click', ev=>{
    ev.stopPropagation();
    const entry = uploadedLayers[key].find(l=>l.id===id);
    if(!entry) return;
    if(document.getElementById('glt-label-menu')){ closeGeoLabelMenu(); return; }
    openGeoLabelMenu(entry, ev.currentTarget, key);
  });
  item.querySelector('.glt-color').addEventListener('input', e=>{
    const newColor = e.target.value;
    const entry = uploadedLayers[key].find(l=>l.id===id);
    if(entry) entry.color = newColor;
    setGeoLayerColor(layer, newColor);
  });
  const dotInput = item.querySelector('.glt-dot');
  if(dotInput){
    const dotReset = item.querySelector('.glt-dot-reset');
    const applyDot = c=>{
      const entry = uploadedLayers[key].find(l=>l.id===id);
      if(entry) entry.dotColor = c;
      // com os vértices desta camada à mostra, guarda a cor e só a aplica
      // quando a ferramenta Vértices for fechada
      if(!_vtxOverrideActive(key, id)) setGeoLayerDotColor(layer, c);
      dotReset.hidden = c.toLowerCase()===IMP_POINT_DOT_DEFAULT;
    };
    dotInput.addEventListener('input', e=>applyDot(e.target.value));
    dotReset.addEventListener('click', ev=>{
      ev.stopPropagation();
      dotInput.value = IMP_POINT_DOT_DEFAULT;
      applyDot(IMP_POINT_DOT_DEFAULT);
    });
  }
  item.querySelector('.glt-rm').addEventListener('click', ()=>{
    closeGeoLabelMenu();
    map.removeLayer(layer);
    if(ulc) ulc.removeLayer(layer);
    uploadedLayers[key] = uploadedLayers[key].filter(l=>l.id!==id);
    item.remove();
    // Remove o relatório de integridade associado (se houver)
    try{
      const rep = findTrackReport(name);
      if(rep && _trackReports[rep.fileName]) delete _trackReports[rep.fileName];
    }catch(e){}
    // Remove os pontos CSV associados a esta camada (se houver) e atualiza o
    // botão Exportar da tela Informar
    try{
      if(csvImportedPoints[key] && csvImportedPoints[key][name]) delete csvImportedPoints[key][name];
      if(key==='inf' && typeof updateInfDownloadButtons==='function') updateInfDownloadButtons();
    }catch(e){}
    if(!uploadedLayers[key].length){
      panel.classList.remove('show');
      if(ulc){
        ulc.getContainer().style.display = 'none';
        ulc._toggleFn(false);
      }
    }
    updateAreaButton(key);
    // Se o painel de área estiver aberto, atualiza a lista de polígonos
    if(document.getElementById('area-'+key)?.classList.contains('open')) buildAreaPanelList(key);
  });
  item.querySelector('.glt-name').addEventListener('click', ()=>{
    try{ map.fitBounds(layer.getBounds(), {padding:[32,32]}); }catch(e){}
  });
  list.appendChild(item);
  reorderGeoLayerList(key);
  updateAreaButton(key);
}

// Reordena as camadas importadas no painel agrupando-as por tipologia:
// primeiro os pontos, depois as linhas e por último os polígonos.
// Dentro de cada grupo, mantém ordem alfabética pelo nome do arquivo.
function reorderGeoLayerList(key){
  const list = document.getElementById('geolist-'+key);
  if(!list) return;
  const items = Array.from(list.querySelectorAll('.geo-layer-item'));
  items.sort((a,b)=>{
    const ra = parseInt(a.dataset.typerank||'3', 10);
    const rb = parseInt(b.dataset.typerank||'3', 10);
    if(ra !== rb) return ra - rb; // grupos: ponto(0) → linha(1) → polígono(2)
    // Grupo de PONTOS (rank 0): ordenado pela QUANTIDADE de pontos detectados,
    // do MAIOR para o MENOR. Empate: ordem alfabética.
    if(ra === 0){
      const pa = parseInt(a.dataset.pointcount||'0', 10);
      const pb = parseInt(b.dataset.pointcount||'0', 10);
      if(pa !== pb) return pb - pa; // decrescente por total de pontos
      return (a.dataset.name||'').localeCompare(b.dataset.name||'', 'pt');
    }
    // Demais grupos (linha/polígono): ordem alfabética crescente
    return (a.dataset.name||'').localeCompare(b.dataset.name||'', 'pt');
  });
  items.forEach(it => list.appendChild(it)); // reanexa na nova ordem
}

// Habilita o botão "Área e comprimento" somente quando há ao menos uma camada
// importada do tipo polígono na seção atual.
function updateAreaButton(key){
  const btn = document.getElementById('areaBtn-'+key);
  if(!btn) return;
  const hasLayer = (uploadedLayers[key]||[]).some(l=>l.hasPolygon || l.hasLine);
  const hasLinked = !!linkedChainInfo(key); // cadeia de pontos ligados (🔗)
  const hasAny = hasLayer || hasLinked;
  btn.disabled = !hasAny;
  btn.title = hasAny ? 'Calcular área de polígonos, comprimento de linhas e medidas dos pontos ligados'
                     : 'Disponível quando houver polígono/linha importada ou 2+ pontos ligados na tabela';
  if(typeof updateVertexButton==='function') updateVertexButton(key);
  // Painel de vértices aberto: atualiza a lista de camadas (inclusão/remoção)
  if(document.getElementById('vtx-'+key)?.classList.contains('open')) buildVertexPanel(key);
}

// ════════════════════════════════════════════════════════════════════════
//  VÉRTICES DA CAMADA IMPORTADA — lista as coordenadas de cada vértice em
//  UTM (SIRGAS 2000) e em latitude/longitude, com exportação CSV, cópia para
//  planilha e marcação numerada dos vértices no mapa.
// ════════════════════════════════════════════════════════════════════════
const VTX_MAX_LINHAS = 3000;   // linhas exibidas no painel (o CSV leva todas)
const VTX_MAX_MARCAS = 1500;   // vértices marcados no mapa
const vtxState = {};           // por tela: {layerId, fuso, formato, rows, marks, mostrar}

function updateVertexButton(key){
  if(typeof updateDistButton==='function') updateDistButton(key);
  const btn=document.getElementById('vtxBtn-'+key);
  if(!btn) return;
  const has=(uploadedLayers[key]||[]).length>0;
  btn.disabled=!has;
  btn.title=has ? 'Listar os vértices de uma camada importada em UTM e latitude/longitude'
                : 'Disponível quando houver camada importada';
  if(!has) closeVertexPopup(key);
}

function openVertexPopup(key){
  const btn=document.getElementById('vtxBtn-'+key);
  if(btn && btn.disabled) return;
  if(typeof closeMeasurePopup==='function') closeMeasurePopup(key);
  if(typeof closeAreaPopup==='function') closeAreaPopup(key);
  if(typeof closeDistPopup==='function') closeDistPopup(key);
  if(!vtxState[key]) vtxState[key]={layerId:null, fuso:'auto', formato:'dec', rows:[], marks:null, mostrar:true};
  buildVertexPanel(key);
  document.getElementById('vtx-'+key)?.classList.add('open');
  btn?.classList.add('active');
}
function closeVertexPopup(key){
  document.getElementById('vtx-'+key)?.classList.remove('open');
  document.getElementById('vtxBtn-'+key)?.classList.remove('active');
  clearVertexMarks(key);
}

function buildVertexPanel(key){
  const panel=document.getElementById('vtx-'+key);
  if(!panel) return;
  const st=vtxState[key];
  const camadas=uploadedLayers[key]||[];
  if(st.layerId && !camadas.some(l=>l.id===st.layerId)){ st.layerId=null; st.rows=[]; clearVertexMarks(key); }
  const icone=l=> l.hasPolygon ? '⬛' : (l.hasLine ? '➖' : '📍');
  const opts=camadas.map(l=>`<button class="area-layer-btn${l.id===st.layerId?' active':''}" onclick="selectVertexLayer('${key}','${l.id}')"><span class="alb-icon">${icone(l)}</span><span class="alb-name">${escHtml(l.name)}</span></button>`).join('');
  const fusos=[]; for(let z=18;z<=25;z++) fusos.push(z);
  panel.innerHTML=`
    <div class="measure-panel-hdr"><span>📍 Vértices da camada</span><span class="mp-close" title="Fechar" onclick="closeVertexPopup('${key}')">✕</span></div>
    <div class="color-panel-section">
      <div class="color-panel-lbl">Camadas importadas</div>
      <div class="area-layer-list">${opts || '<div class="measure-hint">Nenhuma camada importada.</div>'}</div>
    </div>
    <div class="vtx-opts">
      <label>Fuso UTM
        <select onchange="setVertexOpt('${key}','fuso',this.value)">
          <option value="auto"${st.fuso==='auto'?' selected':''}>Automático (por vértice)</option>
          ${fusos.map(z=>`<option value="${z}"${String(st.fuso)===String(z)?' selected':''}>Forçar fuso ${z}</option>`).join('')}
        </select>
      </label>
      <label>Lat/Long
        <select onchange="setVertexOpt('${key}','formato',this.value)">
          <option value="dec"${st.formato==='dec'?' selected':''}>Graus decimais</option>
          <option value="gms"${st.formato==='gms'?' selected':''}>Graus, min., seg.</option>
        </select>
      </label>
      <label class="vtx-chk"><input type="checkbox"${st.mostrar?' checked':''} onchange="setVertexOpt('${key}','mostrar',this.checked)"> Numerar no mapa</label>
    </div>
    <div id="vtx-body-${key}"><div class="measure-hint">Selecione uma camada acima para listar seus vértices (SIRGAS 2000).</div></div>`;
  if(st.layerId) renderVertexTable(key);
}

function setVertexOpt(key, opt, val){
  const st=vtxState[key]; if(!st) return;
  st[opt]=val;
  if(opt==='fuso' && st.layerId) st.rows=computeVertexRows(key, st.layerId);
  if(st.layerId) renderVertexTable(key);
}

function selectVertexLayer(key, layerId){
  const st=vtxState[key]; if(!st) return;
  st.layerId=layerId;
  st.rows=computeVertexRows(key, layerId);
  document.querySelectorAll(`#vtx-${key} .area-layer-btn`).forEach(b=>{
    b.classList.toggle('active', b.getAttribute('onclick').includes(`'${layerId}'`));
  });
  renderVertexTable(key);
  // enquadra a camada
  const entry=(uploadedLayers[key]||[]).find(l=>l.id===layerId);
  try{ const b=entry.layer.getBounds(); if(b.isValid()) maps[key].fitBounds(b,{padding:[40,40]}); }catch(e){}
}

// UTM em um fuso específico (forçado) ou no fuso natural do vértice.
function _utmVertice(lat, lon, fusoForcado){
  if(fusoForcado==='auto' || !fusoForcado) return geoToUTM(lat, lon);
  const zone=parseInt(fusoForcado,10), south=lat<0;
  const [E,N]=proj4(geoProj, utmProj(zone,south), [lon,lat]);
  return {E:+E.toFixed(2), N:+N.toFixed(2), zone, letter:utmLetter(lat)};
}

// Percorre a geometria e devolve a lista ordenada de vértices.
// Polígonos: o vértice de fechamento (igual ao primeiro) não é repetido.
function computeVertexRows(key, layerId){
  const entry=(uploadedLayers[key]||[]).find(l=>l.id===layerId);
  if(!entry || !entry.geojson) return [];
  const st=vtxState[key]||{fuso:'auto'};
  const rows=[]; let n=0;
  const add=(c, feicao, parte)=>{
    const lon=+c[0], lat=+c[1];
    if(!isFinite(lat)||!isFinite(lon)) return;
    const u=_utmVertice(lat, lon, st.fuso);
    rows.push({n:++n, feicao, parte, lat, lon, zona:`${u.zone}${u.letter}`, E:u.E, N:u.N});
  };
  const anel=(ring, feicao, parte)=>{
    if(!Array.isArray(ring)) return;
    let pts=ring;
    if(pts.length>1){
      const a=pts[0], b=pts[pts.length-1];
      if(a[0]===b[0] && a[1]===b[1]) pts=pts.slice(0,-1);
    }
    pts.forEach(c=>add(c, feicao, parte));
  };
  (entry.geojson.features||[]).forEach((f,fi)=>{
    const g=f && f.geometry; if(!g) return;
    const p=f.properties||{};
    const nome=p.name||p.Name||p.NAME||p.nome||p.Nome||p.NOME||`Feição ${fi+1}`;
    const feicao=String(nome);
    switch(g.type){
      case 'Point': add(g.coordinates, feicao, ''); break;
      case 'MultiPoint': g.coordinates.forEach((c,i)=>add(c, feicao, g.coordinates.length>1?`Ponto ${i+1}`:'')); break;
      case 'LineString': g.coordinates.forEach(c=>add(c, feicao, '')); break;
      case 'MultiLineString': g.coordinates.forEach((ln,i)=>ln.forEach(c=>add(c, feicao, g.coordinates.length>1?`Parte ${i+1}`:''))); break;
      case 'Polygon': g.coordinates.forEach((r,ri)=>anel(r, feicao, ri===0?'':`Furo ${ri}`)); break;
      case 'MultiPolygon': g.coordinates.forEach((pol,pi)=>pol.forEach((r,ri)=>anel(r, feicao,
          (g.coordinates.length>1?`Parte ${pi+1}`:'') + (ri>0?`${g.coordinates.length>1?' · ':''}Furo ${ri}`:'')))); break;
    }
  });
  return rows;
}

// Formata latitude/longitude em graus decimais ou GMS (com hemisfério).
function fmtLatLon(v, eixo, formato){
  if(formato!=='gms') return v.toFixed(6).replace('.',',');
  const hem = eixo==='lat' ? (v<0?'S':'N') : (v<0?'O':'L');
  let a=Math.abs(v), g=Math.floor(a), mf=(a-g)*60, mi=Math.floor(mf), s=(mf-mi)*60;
  if(s>=59.9995){ s=0; mi+=1; } if(mi>=60){ mi=0; g+=1; }
  return `${g}°${String(mi).padStart(2,'0')}'${s.toFixed(3).padStart(6,'0').replace('.',',')}" ${hem}`;
}
const _fmtM = v => Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

function renderVertexTable(key){
  const st=vtxState[key]; const body=document.getElementById('vtx-body-'+key);
  if(!st || !body) return;
  const entry=(uploadedLayers[key]||[]).find(l=>l.id===st.layerId);
  const rows=st.rows||[];
  if(!entry || !rows.length){ body.innerHTML='<div class="measure-hint">A camada selecionada não possui vértices.</div>'; clearVertexMarks(key); return; }
  const feicoes=new Set(rows.map(r=>r.feicao+'|'+r.parte)).size;
  const zonas=[...new Set(rows.map(r=>r.zona))];
  // Fuso forçado muito distante da camada gera E fora da faixa útil do UTM
  const foraFaixa=rows.some(r=>r.E<160000||r.E>840000);
  const mostra=rows.slice(0, VTX_MAX_LINHAS);
  const temParte=rows.some(r=>r.parte);
  const linhas=mostra.map((r,i)=>`<tr data-i="${i}" onclick="focusVertex('${key}',${i})">
      <td>${r.n}</td>
      <td class="vtx-feat" title="${escHtml(r.feicao)}${r.parte?' · '+escHtml(r.parte):''}">${escHtml(r.feicao)}${temParte&&r.parte?`<span class="vtx-part">${escHtml(r.parte)}</span>`:''}</td>
      <td>${fmtLatLon(r.lat,'lat',st.formato)}</td><td>${fmtLatLon(r.lon,'lon',st.formato)}</td>
      <td>${escHtml(r.zona)}</td><td>${_fmtM(r.E)}</td><td>${_fmtM(r.N)}</td></tr>`).join('');
  body.innerHTML=`
    <div class="vtx-summary"><b>${rows.length.toLocaleString('pt-BR')}</b> vértice(s) em <b>${feicoes.toLocaleString('pt-BR')}</b> feição(ões)/parte(s) · fuso(s): <b>${zonas.join(', ')}</b>${zonas.length>1&&st.fuso==='auto'?' <span class="vtx-warn" title="A camada cruza mais de um fuso UTM. Para um memorial em fuso único, use a opção Forçar fuso.">⚠ mais de um fuso</span>':''}${foraFaixa?' <span class="vtx-warn" title="Há vértices com coordenada E fora da faixa válida do fuso (160.000–840.000 m). Escolha o fuso em que a camada está localizada.">⚠ E fora da faixa do fuso</span>':''}</div>
    <div class="vtx-table-wrap"><table class="vtx-table">
      <thead><tr><th>#</th><th>Feição</th><th>Latitude</th><th>Longitude</th><th>Fuso</th><th>E (m)</th><th>N (m)</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
    ${rows.length>VTX_MAX_LINHAS?`<div class="measure-hint">Exibindo os primeiros ${VTX_MAX_LINHAS.toLocaleString('pt-BR')} vértices. A exportação CSV inclui todos.</div>`:''}
    <div class="measure-actions vtx-actions">
      <button class="btn btn-sm" onclick="exportVertexCSV('${key}')" title="Baixar todos os vértices em planilha (CSV)">⬇ CSV</button>
      <button class="btn btn-sm" onclick="copyVertexTable('${key}',this)" title="Copiar a tabela para colar no Excel/Planilhas">📋 Copiar</button>
    </div>
    <div class="measure-hint">Datum SIRGAS 2000. Clique em uma linha para localizar o vértice no mapa.</div>`;
  drawVertexMarks(key);
}

function clearVertexMarks(key){
  const st=vtxState[key];
  if(st && st.marks){ try{ maps[key] && maps[key].removeLayer(st.marks); }catch(e){} st.marks=null; }
  _vtxRestorePointColor(key);
}
// Enquanto os vértices de uma camada com PONTOS estão à mostra, o miolo dos
// pontos dessa camada assume a cor do vértice (laranja); ao fechar a
// ferramenta, trocar de camada ou ocultar os marcadores, volta à cor escolhida
// pelo usuário para a camada.
const VTX_COR = '#ff8c1a';
function _vtxOverridePointColor(key, layerId){
  const st=vtxState[key]; if(!st) return;
  const entry=(uploadedLayers[key]||[]).find(l=>l.id===layerId);
  if(!entry || !(entry.types||[]).includes('point')) return;
  setGeoLayerDotColor(entry.layer, VTX_COR);
  st.overrideLayerId=layerId;
}
function _vtxRestorePointColor(key){
  const st=vtxState[key]; if(!st || !st.overrideLayerId) return;
  const entry=(uploadedLayers[key]||[]).find(l=>l.id===st.overrideLayerId);
  st.overrideLayerId=null;
  if(entry) setGeoLayerDotColor(entry.layer, entry.dotColor || IMP_POINT_DOT_DEFAULT);
}
function _vtxOverrideActive(key, layerId){
  const st=vtxState[key]; return !!(st && st.overrideLayerId===layerId);
}
function drawVertexMarks(key){
  clearVertexMarks(key);
  const st=vtxState[key], m=maps[key];
  if(!st || !m || !st.mostrar || !st.rows.length) return;
  const rows=st.rows.slice(0, VTX_MAX_MARCAS);
  _vtxOverridePointColor(key, st.layerId);
  const g=L.layerGroup();
  const numerar=rows.length<=300; // rótulo fixo só quando legível
  rows.forEach((r,i)=>{
    const c=L.circleMarker([r.lat,r.lon],{radius:4, color:'#fff', weight:1.5, fillColor:VTX_COR, fillOpacity:1, pane:'impPointPane', interactive:true});
    c.bindTooltip(`V${r.n}`, {permanent:numerar, direction:'top', offset:[0,-4], className:'vtx-label'});
    c.on('click', ev=>{ L.DomEvent.stopPropagation(ev); focusVertex(key, i); });
    g.addLayer(c);
  });
  g.addTo(m);
  st.marks=g;
}
function focusVertex(key, i){
  const st=vtxState[key], m=maps[key]; if(!st||!m) return;
  const r=st.rows[i]; if(!r) return;
  document.querySelectorAll(`#vtx-${key} .vtx-table tbody tr`).forEach(tr=>tr.classList.toggle('selected', +tr.dataset.i===i));
  const tr=document.querySelector(`#vtx-${key} .vtx-table tbody tr[data-i="${i}"]`);
  if(tr) tr.scrollIntoView({block:'nearest'});
  m.setView([r.lat,r.lon], Math.max(m.getZoom(), 16));
  L.popup({className:'rich-popup', closeButton:true, autoClose:true, offset:[0,-4]})
    .setLatLng([r.lat,r.lon])
    .setContent(`<div style="min-width:200px">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:13px;margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid var(--border)">📍 Vértice ${r.n}</div>
      <table style="border-collapse:collapse;width:100%;font-size:12px">
        <tr><td style="color:var(--muted);padding:2px 10px 2px 0">Feição</td><td style="font-weight:500;overflow-wrap:anywhere">${escHtml(r.feicao)}${r.parte?' · '+escHtml(r.parte):''}</td></tr>
        <tr><td style="color:var(--muted);padding:2px 10px 2px 0">Latitude</td><td style="font-weight:500">${fmtLatLon(r.lat,'lat',st.formato)}</td></tr>
        <tr><td style="color:var(--muted);padding:2px 10px 2px 0">Longitude</td><td style="font-weight:500">${fmtLatLon(r.lon,'lon',st.formato)}</td></tr>
        <tr><td style="color:var(--muted);padding:2px 10px 2px 0">Fuso</td><td style="font-weight:500">${escHtml(r.zona)}</td></tr>
        <tr><td style="color:var(--muted);padding:2px 10px 2px 0">E (m)</td><td style="font-weight:500">${_fmtM(r.E)}</td></tr>
        <tr><td style="color:var(--muted);padding:2px 10px 2px 0">N (m)</td><td style="font-weight:500">${_fmtM(r.N)}</td></tr>
      </table></div>`)
    .openOn(m);
}

// Matriz para exportação/cópia: números SEM separador de milhar (apenas a
// vírgula decimal), para que Excel, LibreOffice e QGIS os leiam como número.
function _vertexMatrix(key){
  const st=vtxState[key];
  const m2 = v => Number(v).toFixed(2).replace('.',',');
  const cab=['Vertice','Feicao','Parte','Latitude','Longitude','Fuso','E (m)','N (m)'];
  const lin=st.rows.map(r=>[r.n, r.feicao, r.parte, fmtLatLon(r.lat,'lat',st.formato), fmtLatLon(r.lon,'lon',st.formato), r.zona, m2(r.E), m2(r.N)]);
  return [cab, ...lin];
}
function exportVertexCSV(key){
  const st=vtxState[key]; if(!st||!st.rows.length) return;
  const entry=(uploadedLayers[key]||[]).find(l=>l.id===st.layerId);
  // CSV no padrão brasileiro (separador ";" e vírgula decimal) — abre direto no Excel
  const esc=v=>{ const s=String(v==null?'':v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
  const csv='﻿'+_vertexMatrix(key).map(l=>l.map(esc).join(';')).join('\r\n');
  const base=String(entry?entry.name:'camada').replace(/\.[a-z0-9]+$/i,'').replace(/[^\w\-]+/g,'_');
  saveBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}), `vertices_${base}.csv`);
}
async function copyVertexTable(key, btn){
  const st=vtxState[key]; if(!st||!st.rows.length) return;
  const tsv=_vertexMatrix(key).map(l=>l.join('\t')).join('\n');
  try{ await navigator.clipboard.writeText(tsv); }
  catch(e){
    const ta=document.createElement('textarea'); ta.value=tsv; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); }catch(_){} ta.remove();
  }
  if(btn){ const t=btn.textContent; btn.textContent='✔ Copiado'; setTimeout(()=>{ btn.textContent=t; },1500); }
}

function bindGeoFeaturePopup(layer, feature, key){
  const props = feature.properties || {};
  const rows = Object.entries(props).slice(0,8).map(([k,v])=>
    `<tr><td style="color:var(--muted);padding:3px 10px 3px 0;font-size:12px;overflow-wrap:anywhere;word-break:break-word;vertical-align:top">${escHtml(k)}</td><td style="font-weight:500;padding:3px 0;font-size:12px;overflow-wrap:anywhere;word-break:break-word">${v!==undefined&&v!==null?escHtml(v):'—'}</td></tr>`
  ).join('');
  const titulo = escHtml(props.name || props.Name || props.NAME || 'Feição');
  // Ícone da tipologia da feição clicada (ponto/linha/polígono)
  const gt = feature.geometry && feature.geometry.type;
  const typeIcon = (gt==='Point'||gt==='MultiPoint') ? '📍'
                 : (gt==='LineString'||gt==='MultiLineString') ? '➖'
                 : (gt==='Polygon'||gt==='MultiPolygon') ? '⬛' : '📐';
  const typeLbl  = (gt==='Point'||gt==='MultiPoint') ? 'Ponto'
                 : (gt==='LineString'||gt==='MultiLineString') ? 'Linha'
                 : (gt==='Polygon'||gt==='MultiPolygon') ? 'Polígono' : '';
  layer.bindPopup(`<div style="min-width:200px">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:13px;margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:6px">
        <span title="${typeLbl}" style="flex-shrink:0">${typeIcon}</span>
        <span style="overflow-wrap:anywhere;word-break:break-word">${titulo}</span>
      </div>
      <table style="border-collapse:collapse;width:100%;table-layout:fixed"><colgroup><col style="width:42%"><col style="width:58%"></colgroup>${rows || '<tr><td style="font-size:12px;color:var(--muted)">Sem atributos</td></tr>'}</table>
    </div>`, {maxWidth:320, className:'rich-popup'});
  // O clique é tratado de forma centralizada pelo handler do mapa
  // (clickHitsUploadedLayer), que aplica prioridade ponto > linha > polígono.
  // Não vinculamos um handler de clique por feição para evitar concorrência
  // entre camadas (que fazia o polígono sobrepor o popup de pontos/linhas).
}

// ════════════════════════════════════════
//  DISTÂNCIA ENTRE PONTOS (botão "↔️ Distância entre pontos" do rodapé)
// ════════════════════════════════════════
// Para um conjunto de pontos (os pontos da tabela da tela ou as feições do tipo
// ponto de uma camada importada), calcula entre TODOS os pares: a distância
// mínima, a máxima e a média — e, como apoio, a média da distância de cada
// ponto ao seu vizinho mais próximo. Usa EXATAMENTE a mesma métrica da
// ferramenta "Medir" (distância do Leaflet: fórmula de Haversine sobre a esfera
// de raio 6.371 km), para que os valores das duas ferramentas coincidam.
// Pares de pontos coincidentes (mesma posição) são desconsiderados e
// informados à parte.
const DIST_MAX_PONTOS = 4000;      // até ~8 milhões de pares
const DIST_COINCIDENTE_M = 0.01;   // abaixo disso, pontos considerados iguais
const distState = {};              // por tela: {src, unit, res, layer}

function _tablePointsFor(key){
  const t = key==='conv' ? convData : key==='ext' ? extData : key==='inf' ? infData : [];
  return (t||[]).filter(p=>p && isFinite(p.lat) && isFinite(p.lon))
    .map((p,i)=>({lat:+p.lat, lon:+p.lon, nome:p.name||`Ponto ${i+1}`}));
}
function _layerPointsFor(entry){
  const out=[];
  (entry && entry.geojson && entry.geojson.features || []).forEach((f,fi)=>{
    const g=f && f.geometry; if(!g) return;
    const p=f.properties||{};
    const nome=String(p.name||p.Name||p.NAME||p.nome||p.Nome||p.NOME||`Ponto ${fi+1}`);
    const add=(c,suf)=>{ const lon=+c[0], lat=+c[1]; if(isFinite(lat)&&isFinite(lon)) out.push({lat,lon,nome:suf?`${nome} · ${suf}`:nome}); };
    if(g.type==='Point') add(g.coordinates,'');
    else if(g.type==='MultiPoint') (g.coordinates||[]).forEach((c,i,a)=>add(c, a.length>1?`parte ${i+1}`:''));
  });
  return out;
}
// Fontes disponíveis na tela: tabela + camadas importadas com pontos
function _distSources(key){
  const fontes=[];
  const tab=_tablePointsFor(key);
  if(tab.length) fontes.push({id:'__tabela', nome:'Pontos da tabela', icone:'📋', n:tab.length, pts:()=>_tablePointsFor(key)});
  (uploadedLayers[key]||[]).forEach(l=>{
    if(!(l.types||[]).includes('point')) return;
    const n=_layerPointsFor(l).length;
    if(n) fontes.push({id:l.id, nome:l.name, icone:'📍', n, pts:()=>_layerPointsFor(l)});
  });
  return fontes;
}
function updateDistButton(key){
  const btn=document.getElementById('distBtn-'+key);
  if(!btn) return;
  const fontes=_distSources(key);
  const ok=fontes.some(f=>f.n>=2);
  btn.disabled=!ok;
  btn.title = ok ? 'Distância mínima, máxima e média entre os pontos (tabela ou camada importada)'
                 : 'Disponível quando houver ao menos 2 pontos (tabela ou camada importada)';
  const panel=document.getElementById('dist-'+key);
  if(!ok){ closeDistPopup(key); return; }
  if(panel && panel.classList.contains('open')){
    const st=distState[key];
    // fonte removida ou com menos de 2 pontos: limpa a seleção
    if(st && st.src && !fontes.some(f=>f.id===st.src && f.n>=2)){ st.src=null; st.res=null; _clearDistLayer(key); }
    else if(st && st.src){ _computeDist(key); if(st.layer) _drawDistLayer(key, false); }
    buildDistPanel(key);
  }
}
function openDistPopup(key){
  const btn=document.getElementById('distBtn-'+key);
  if(btn && btn.disabled) return;
  if(typeof closeMeasurePopup==='function') closeMeasurePopup(key);
  if(typeof closeAreaPopup==='function') closeAreaPopup(key);
  if(typeof closeVertexPopup==='function') closeVertexPopup(key);
  if(!distState[key]) distState[key]={src:null, unit:'m', res:null, layer:null};
  const st=distState[key];
  const fontes=_distSources(key).filter(f=>f.n>=2);
  // seleciona automaticamente quando há uma única fonte
  if(!st.src && fontes.length===1) st.src=fontes[0].id;
  if(st.src) _computeDist(key);
  buildDistPanel(key);
  document.getElementById('dist-'+key)?.classList.add('open');
  btn?.classList.add('active');
  if(st.res && st.tab!=='tabela') _drawDistLayer(key, false);
}
function closeDistPopup(key){
  document.getElementById('dist-'+key)?.classList.remove('open');
  document.getElementById('distBtn-'+key)?.classList.remove('active');
  _clearDistLayer(key);
  _clearDistRowLayer(key);
}
function selectDistSource(key, id){
  const st=distState[key]; if(!st) return;
  st.src=id;
  _clearDistRowLayer(key);
  _computeDist(key);
  buildDistPanel(key);
  if(st.tab!=='tabela') _drawDistLayer(key, true);
  else { const lyr=(uploadedLayers[key]||[]).find(l=>l.id===id); try{ const b=lyr?lyr.layer.getBounds():null; if(b&&b.isValid()) maps[key].fitBounds(b,{padding:[40,40]}); }catch(e){} }
}
function setDistUnit(key, unit){
  const st=distState[key]; if(!st) return;
  st.unit = unit==='km' ? 'km' : 'm';
  _clearDistRowLayer(key);
  buildDistPanel(key);
  if(st.layer) _drawDistLayer(key, false); // atualiza os rótulos das linhas
}
function _computeDist(key){
  const st=distState[key]; if(!st) return;
  const fonte=_distSources(key).find(f=>f.id===st.src);
  if(!fonte){ st.res=null; st.sig=null; return; }
  let pts=fonte.pts();
  // evita recálculo quando os pontos não mudaram (o painel é atualizado a cada
  // alteração na tela, p.ex. ao ligar pontos na coluna 🔗)
  let sa=0, sb=0; for(const p of pts){ sa+=p.lat; sb+=p.lon; }
  const assin=`${st.src}|${pts.length}|${sa.toFixed(9)}|${sb.toFixed(9)}`;
  if(st.res && st.sig===assin) return;
  st.sig=assin;
  _clearDistRowLayer(key);
  const total=pts.length, cortado=total>DIST_MAX_PONTOS;
  if(cortado) pts=pts.slice(0, DIST_MAX_PONTOS);
  const n=pts.length;
  // Mesma fórmula de L.CRS.Earth.distance (usada por latlng.distanceTo no
  // "Medir"), com senos/cossenos pré-calculados para acelerar os pares
  const R=(L.CRS && L.CRS.Earth && L.CRS.Earth.R) || 6371000, rad=Math.PI/180;
  const la=new Float64Array(n), lo=new Float64Array(n), cl=new Float64Array(n);
  for(let i=0;i<n;i++){ la[i]=pts[i].lat; lo[i]=pts[i].lon; cl[i]=Math.cos(pts[i].lat*rad); }
  const viz=new Float64Array(n).fill(Infinity), vizJ=new Int32Array(n).fill(-1);
  let min=Infinity, max=-Infinity, soma=0, pares=0, coinc=0, iMin=-1, jMin=-1, iMax=-1, jMax=-1;
  for(let i=0;i<n;i++){
    for(let j=i+1;j<n;j++){
      const s1=Math.sin((la[j]-la[i])*rad/2), s2=Math.sin((lo[j]-lo[i])*rad/2);
      const a=s1*s1 + cl[i]*cl[j]*s2*s2;
      const d=R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      if(d<DIST_COINCIDENTE_M){ coinc++; continue; }
      pares++; soma+=d;
      if(d<min){ min=d; iMin=i; jMin=j; }
      if(d>max){ max=d; iMax=i; jMax=j; }
      if(d<viz[i]){ viz[i]=d; vizJ[i]=j; }
      if(d<viz[j]){ viz[j]=d; vizJ[j]=i; }
    }
  }
  // Distância de cada ponto ao SEGUINTE da lista (1→2, 2→3, …)
  const seq=new Float64Array(Math.max(0,n-1));
  let somaSeq=0;
  for(let i=0;i<n-1;i++){
    const j=i+1;
    const s1=Math.sin((la[j]-la[i])*rad/2), s2=Math.sin((lo[j]-lo[i])*rad/2);
    const a=s1*s1 + cl[i]*cl[j]*s2*s2;
    seq[i]=R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    somaSeq+=seq[i];
  }
  let somaViz=0, nViz=0;
  for(let i=0;i<n;i++) if(isFinite(viz[i])){ somaViz+=viz[i]; nViz++; }
  st.res = pares ? {
    fonte:fonte.nome, n, total, cortado, pares, coinc,
    min, max, media:soma/pares, mediaViz: nViz? somaViz/nViz : NaN,
    pMin:[pts[iMin], pts[jMin]], iMin:[iMin+1, jMin+1],
    pMax:[pts[iMax], pts[jMax]], iMax:[iMax+1, jMax+1],
    pts, seq, somaSeq, viz, vizJ
  } : {fonte:fonte.nome, n, total, cortado, pares:0, coinc};
}
function _fmtDist(m, unit){
  if(!isFinite(m)) return '—';
  return unit==='km'
    ? (m/1000).toLocaleString('pt-BR',{minimumFractionDigits:3, maximumFractionDigits:3})+' km'
    : m.toLocaleString('pt-BR',{minimumFractionDigits:2, maximumFractionDigits:2})+' m';
}
function buildDistPanel(key){
  const panel=document.getElementById('dist-'+key); if(!panel) return;
  const st=distState[key]||{src:null,unit:'m',res:null};
  const fontes=_distSources(key);
  const lista=fontes.map(f=>{
    const ok=f.n>=2;
    return `<button class="area-layer-btn${f.id===st.src?' active':''}"${ok?'':' disabled title="São necessários ao menos 2 pontos"'} onclick="selectDistSource('${key}','${f.id}')"><span class="alb-icon">${f.icone}</span><span class="alb-name">${escHtml(f.nome)} <span class="dist-n">(${f.n} ${f.n===1?'ponto':'pontos'})</span></span></button>`;
  }).join('');
  const r=st.res, u=st.unit;
  const aba = st.tab==='tabela' ? 'tabela' : 'resumo';
  panel.classList.toggle('dist-wide', aba==='tabela' && !!(r && r.pares));
  let corpo='<div class="measure-hint">Selecione acima o conjunto de pontos.</div>';
  if(r && !r.pares){
    corpo=`<div class="measure-hint">Todos os ${r.n} pontos estão na mesma posição — não há distância a calcular.</div>`;
  } else if(r && aba==='tabela'){
    corpo=_distTabelaHtml(key, r, u);
  } else if(r){
    const par=(p,ix)=>`<span class="dist-par" title="${escHtml(p[0].nome)} ↔ ${escHtml(p[1].nome)}">#${ix[0]} ${escHtml(p[0].nome)} ↔ #${ix[1]} ${escHtml(p[1].nome)}</span>`;
    corpo=`
      <div class="dist-cards">
        <div class="dist-card dist-min">
          <div class="dist-card-top"><span>Distância mínima</span><button type="button" class="dist-ver" onclick="focusDistPair('${key}','min')" title="Mostrar o par no mapa">🔍 ver</button></div>
          <b>${_fmtDist(r.min,u)}</b>${par(r.pMin,r.iMin)}
        </div>
        <div class="dist-card dist-max">
          <div class="dist-card-top"><span>Distância máxima</span><button type="button" class="dist-ver" onclick="focusDistPair('${key}','max')" title="Mostrar o par no mapa">🔍 ver</button></div>
          <b>${_fmtDist(r.max,u)}</b>${par(r.pMax,r.iMax)}
        </div>
        <div class="dist-card">
          <div class="dist-card-top"><span>Distância média entre os pontos</span></div>
          <b>${_fmtDist(r.media,u)}</b><span class="dist-par">média de ${r.pares.toLocaleString('pt-BR')} ${r.pares===1?'par':'pares'} de pontos</span>
        </div>
      </div>
      <div class="dist-extra">Média até o vizinho mais próximo: <b>${_fmtDist(r.mediaViz,u)}</b></div>
      <div class="measure-hint dist-nota">${r.n} pontos · mesmo cálculo da ferramenta Medir.${r.coinc?` ${r.coinc} ${r.coinc===1?'par de pontos coincidentes foi desconsiderado':'pares de pontos coincidentes foram desconsiderados'}.`:''}${r.cortado?` ⚠️ A camada tem ${r.total.toLocaleString('pt-BR')} pontos; o cálculo considera os ${DIST_MAX_PONTOS.toLocaleString('pt-BR')} primeiros.`:''}</div>
      <div class="measure-actions"><button class="btn btn-sm" onclick="copyDistResult('${key}')">📋 Copiar resultado</button></div>`;
  }
  panel.innerHTML=`
    <div class="measure-panel-hdr"><span>↔️ Distância entre pontos</span><span class="mp-close" title="Fechar" onclick="closeDistPopup('${key}')">✕</span></div>
    <div class="color-panel-section">
      <div class="color-panel-lbl">Pontos</div>
      <div class="area-layer-list">${lista || '<div class="measure-hint">Nenhum ponto disponível.</div>'}</div>
    </div>
    <div class="color-panel-section">
      <div class="color-panel-lbl">Unidade</div>
      <div class="measure-type-row">
        <button class="${u==='m'?'active':''}" onclick="setDistUnit('${key}','m')">Metros (m)</button>
        <button class="${u==='km'?'active':''}" onclick="setDistUnit('${key}','km')">Quilômetros (km)</button>
      </div>
    </div>
    ${r && r.pares ? `<div class="dist-tabs" role="tablist">
      <button type="button" role="tab" aria-selected="${aba==='resumo'}" class="${aba==='resumo'?'active':''}" onclick="setDistTab('${key}','resumo')">📊 Resumo</button>
      <button type="button" role="tab" aria-selected="${aba==='tabela'}" class="${aba==='tabela'?'active':''}" onclick="setDistTab('${key}','tabela')">📋 Tabela por ponto</button>
    </div>` : ''}
    ${corpo}`;
}
function setDistTab(key, tab){
  const st=distState[key]; if(!st) return;
  st.tab = tab==='tabela' ? 'tabela' : 'resumo';
  buildDistPanel(key);
  // cada aba destaca no mapa apenas o que mostra: Resumo → pares mín./máx.;
  // Tabela → ligações do ponto clicado
  if(st.tab==='resumo'){ _clearDistRowLayer(key); _drawDistLayer(key, false); }
  else _clearDistLayer(key);
}
// Tabela por ponto: distância ao SEGUINTE da lista (12→13, 13→14…) e ao
// VIZINHO MAIS PRÓXIMO (qualquer ponto do conjunto, exceto coincidentes)
const DIST_TAB_MAX = 1500;  // linhas exibidas (o CSV leva todas)
function _distTabelaHtml(key, r, u){
  const lim=Math.min(r.n, DIST_TAB_MAX);
  let linhas='';
  for(let i=0;i<lim;i++){
    const p=r.pts[i], j=r.vizJ[i];
    const seg = i<r.n-1
      ? `<span class="dt-ref">→ #${i+2}</span> ${_fmtDist(r.seq[i],u)}`
      : '<span class="dt-ref">—</span>';
    const viz = j>=0
      ? `<span class="dt-ref" title="${escHtml(r.pts[j].nome)}">#${j+1}</span> ${_fmtDist(r.viz[i],u)}`
      : '<span class="dt-ref" title="Só há pontos coincidentes">—</span>';
    linhas+=`<tr data-i="${i}" onclick="focusDistRow('${key}',${i})" title="Clique para ver no mapa"><td>${i+1}</td><td class="dt-nome" title="${escHtml(p.nome)}">${escHtml(p.nome)}</td><td>${seg}</td><td>${viz}</td></tr>`;
  }
  return `
    <div class="dist-tab-legend">
      <span><i class="dt-sw dt-sw-seq"></i>Seguinte da lista (1→2, 2→3…)</span>
      <span><i class="dt-sw dt-sw-viz"></i>Vizinho mais próximo</span>
    </div>
    <div class="vtx-table-wrap dist-table-wrap">
      <table class="vtx-table dist-table">
        <thead><tr><th>#</th><th>Ponto</th><th>Até o seguinte</th><th>Vizinho mais próximo</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr><td colspan="2">Soma da sequência (1→${r.n})</td><td>${_fmtDist(r.somaSeq,u)}</td><td>média ${_fmtDist(r.mediaViz,u)}</td></tr></tfoot>
      </table>
    </div>
    ${r.n>lim?`<div class="measure-hint">Exibindo ${lim.toLocaleString('pt-BR')} de ${r.n.toLocaleString('pt-BR')} pontos — o CSV contém todos.</div>`:''}
    <div class="measure-actions">
      <button class="btn btn-sm" onclick="exportDistCSV('${key}')">⬇ CSV</button>
      <button class="btn btn-sm" onclick="copyDistTable('${key}')">📋 Copiar tabela</button>
    </div>`;
}
// Destaca no mapa as ligações de um ponto da tabela
function _clearDistRowLayer(key){
  const st=distState[key];
  if(st && st.rowLayer){ try{ maps[key] && maps[key].removeLayer(st.rowLayer); }catch(e){} st.rowLayer=null; }
}
function focusDistRow(key, i){
  const st=distState[key], m=maps[key]; if(!st||!st.res||!st.res.pts||!m) return;
  const r=st.res, p=r.pts[i]; if(!p) return;
  _clearDistRowLayer(key);
  document.querySelectorAll(`#dist-${key} .dist-table tbody tr`).forEach(tr=>tr.classList.toggle('selected', +tr.dataset.i===i));
  const g=L.featureGroup(), pts=[[p.lat,p.lon]];
  const seg=(q,cor,txt)=>{
    const ll=[[p.lat,p.lon],[q.lat,q.lon]]; pts.push([q.lat,q.lon]);
    L.polyline(ll,{color:'#fff', weight:6, opacity:.85, interactive:false}).addTo(g);
    L.polyline(ll,{color:cor, weight:3, interactive:false}).bindTooltip(txt,{permanent:true, direction:'center', className:'dist-label'}).addTo(g);
    L.circleMarker([q.lat,q.lon],{radius:5, color:'#fff', weight:2, fillColor:cor, fillOpacity:1, interactive:false}).addTo(g);
  };
  if(i<r.n-1) seg(r.pts[i+1],'#3b82f6',`#${i+1}→#${i+2} ${_fmtDist(r.seq[i],st.unit)}`);
  const j=r.vizJ[i];
  if(j>=0 && j!==i+1) seg(r.pts[j],'#2fb26b',`vizinho #${j+1} ${_fmtDist(r.viz[i],st.unit)}`);
  else if(j===i+1) g.eachLayer(l=>{ if(l.getTooltip && l.getTooltip()) l.setTooltipContent(`#${i+1}→#${i+2} ${_fmtDist(r.seq[i],st.unit)} (vizinho mais próximo)`); });
  L.circleMarker([p.lat,p.lon],{radius:7, color:'#fff', weight:2, fillColor:'#ffb020', fillOpacity:1, interactive:false})
    .bindTooltip(`#${i+1} ${p.nome}`,{direction:'top', offset:[0,-6], className:'vtx-label'}).addTo(g);
  g.addTo(m); st.rowLayer=g;
  try{ m.fitBounds(L.latLngBounds(pts),{padding:[70,70], maxZoom:18}); }catch(e){}
}
function _distTabelaMatriz(key){
  const st=distState[key]; if(!st||!st.res||!st.res.pts) return null;
  const r=st.res, dec=(v,d)=>isFinite(v)?v.toFixed(d).replace('.',','):'';
  const cab=['ponto','nome','latitude','longitude','seguinte','dist_seguinte_m','vizinho_mais_proximo','dist_vizinho_m'];
  const linhas=r.pts.map((p,i)=>[i+1, p.nome, dec(p.lat,8), dec(p.lon,8),
    i<r.n-1?i+2:'', i<r.n-1?dec(r.seq[i],2):'', r.vizJ[i]>=0?r.vizJ[i]+1:'', r.vizJ[i]>=0?dec(r.viz[i],2):'']);
  return [cab, ...linhas];
}
function exportDistCSV(key){
  const mtz=_distTabelaMatriz(key); if(!mtz) return;
  const esc=v=>{ const s=String(v==null?'':v); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
  const csv='\uFEFF'+mtz.map(l=>l.map(esc).join(';')).join('\r\n');
  const nome=String(distState[key].res.fonte||'pontos').replace(/\.[a-z0-9]+$/i,'').replace(/[^\w\-]+/g,'_').slice(0,60);
  saveBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}), `distancias_${nome}.csv`);
}
function copyDistTable(key){
  const mtz=_distTabelaMatriz(key); if(!mtz) return;
  const txt=mtz.map(l=>l.join('\t')).join('\n');
  const btn=[...document.querySelectorAll(`#dist-${key} .measure-actions .btn`)].pop();
  try{ navigator.clipboard.writeText(txt).then(()=>{ if(btn){ const t=btn.textContent; btn.textContent='✔ Copiado'; setTimeout(()=>btn.textContent=t,1400); } },()=>{}); }catch(e){}
}
// Linhas no mapa: par da distância mínima (verde) e da máxima (vermelho)
function _clearDistLayer(key){
  const st=distState[key];
  if(st && st.layer){ try{ maps[key] && maps[key].removeLayer(st.layer); }catch(e){} st.layer=null; }
}
function _drawDistLayer(key, enquadrar){
  _clearDistLayer(key);
  const st=distState[key], m=maps[key];
  if(!st || !m || !st.res || !st.res.pares) return;
  const r=st.res, g=L.featureGroup();
  const linha=(p,cor,txt)=>{
    const ll=[[p[0].lat,p[0].lon],[p[1].lat,p[1].lon]];
    L.polyline(ll,{color:'#fff', weight:6, opacity:.85, interactive:false}).addTo(g);
    L.polyline(ll,{color:cor, weight:3, dashArray:'7 5', interactive:false})
      .bindTooltip(txt,{permanent:true, direction:'center', className:'dist-label'}).addTo(g);
    ll.forEach(c=>L.circleMarker(c,{radius:5, color:'#fff', weight:2, fillColor:cor, fillOpacity:1, interactive:false}).addTo(g));
  };
  linha(r.pMax,'#e5484d',`máx. ${_fmtDist(r.max, st.unit)}`);
  linha(r.pMin,'#2fb26b',`mín. ${_fmtDist(r.min, st.unit)}`);
  g.addTo(m);
  st.layer=g;
  if(enquadrar){ try{ m.fitBounds(g.getBounds(),{padding:[50,50], maxZoom:17}); }catch(e){} }
}
function focusDistPair(key, qual){
  const st=distState[key], m=maps[key]; if(!st||!st.res||!m) return;
  if(!st.layer) _drawDistLayer(key, false);
  const p = qual==='min' ? st.res.pMin : st.res.pMax;
  m.fitBounds(L.latLngBounds([[p[0].lat,p[0].lon],[p[1].lat,p[1].lon]]),{padding:[70,70], maxZoom:18});
}
function copyDistResult(key){
  const st=distState[key]; if(!st||!st.res||!st.res.pares) return;
  const r=st.res, u=st.unit;
  const txt=[
    `Distância entre pontos — ${r.fonte} (${r.n} pontos)`,
    `Mínima: ${_fmtDist(r.min,u)} (#${r.iMin[0]} ${r.pMin[0].nome} ↔ #${r.iMin[1]} ${r.pMin[1].nome})`,
    `Máxima: ${_fmtDist(r.max,u)} (#${r.iMax[0]} ${r.pMax[0].nome} ↔ #${r.iMax[1]} ${r.pMax[1].nome})`,
    `Média entre os pontos: ${_fmtDist(r.media,u)} (${r.pares} pares)`,
    `Média até o vizinho mais próximo: ${_fmtDist(r.mediaViz,u)}`
  ].join('\n');
  const btn=document.querySelector(`#dist-${key} .measure-actions .btn`);
  const ok=()=>{ if(btn){ const t=btn.textContent; btn.textContent='✔ Copiado'; setTimeout(()=>btn.textContent=t,1400); } };
  try{ navigator.clipboard.writeText(txt).then(ok, ()=>{}); }catch(e){}
}

// Símbolo das feições do tipo PONTO importadas: anel na cor da camada (preto
// por padrão) com um miolo de borda branca (preto por padrão; laranja enquanto
// a ferramenta Vértices exibe a camada) para destacar a posição exata. O miolo acompanha o ponto ao ligar/desligar a
// camada, removê-la ou movê-la; a cor da camada continua no anel externo.
// O miolo pode ter a cor alterada por camada (seletor redondo no painel
// "Camadas importadas"); o padrão é o preto, como o anel externo, separados
// pelas bordas brancas. Os marcadores da ferramenta
// Vértices não são afetados — continuam sempre laranja.
const IMP_POINT_DOT_DEFAULT = '#000000';   // miolo: preto (padrão)
const IMP_POINT_RING_DEFAULT = '#000000';  // contorno (anel) das camadas de pontos: preto
const IMP_POINT_DOT = {radius:3.5, color:'#ffffff', weight:1.5, fillColor:IMP_POINT_DOT_DEFAULT, fillOpacity:1};
const ImpPointMarker = L.CircleMarker.extend({
  onAdd(map){
    L.CircleMarker.prototype.onAdd.call(this, map);
    if(!this._dot){
      this._dot = L.circleMarker(this._latlng, Object.assign({}, IMP_POINT_DOT, {
        fillColor:this.options.dotColor || IMP_POINT_DOT_DEFAULT,
        pane:this.options.pane, renderer:this.options.renderer, interactive:false, bubblingMouseEvents:false
      }));
    }
    this._dot.addTo(map);
  },
  onRemove(map){
    if(this._dot) map.removeLayer(this._dot);
    L.CircleMarker.prototype.onRemove.call(this, map);
  },
  setLatLng(ll){
    L.CircleMarker.prototype.setLatLng.call(this, ll);
    if(this._dot) this._dot.setLatLng(ll);
    return this;
  },
  bringToFront(){
    L.CircleMarker.prototype.bringToFront.call(this);
    if(this._dot && this._dot._map) this._dot.bringToFront();
    return this;
  }
});

// Altera a cor do miolo de todos os pontos de uma camada importada
function setGeoLayerDotColor(layer, color){
  color = color || IMP_POINT_DOT_DEFAULT;
  layer.eachLayer(sub=>{
    if(sub instanceof ImpPointMarker){
      sub.options.dotColor = color;
      if(sub._dot) sub._dot.setStyle({fillColor:color});
    }
  });
}

// Reaplica a cor a uma camada GeoJSON importada, preservando o estilo
// por tipo de geometria (modo circunscrito para polígonos, etc.)
function setGeoLayerColor(layer, color){
  layer.eachLayer(sub=>{
    const geomType = sub.feature?.geometry?.type;
    if(sub.setStyle){
      if(geomType==='Polygon'||geomType==='MultiPolygon'){
        sub.setStyle({color, fillColor:color, weight:2.5, fillOpacity:0.05, dashArray:'4 3'});
      } else if(geomType==='LineString'||geomType==='MultiLineString'){
        sub.setStyle({color, weight:3.5, opacity:1, fill:false});
      } else if(sub instanceof L.CircleMarker){
        sub.setStyle({color:'#ffffff', fillColor:color, weight:1.5, fillOpacity:1});
      } else {
        sub.setStyle({color, fillColor:color, weight:2.5, fillOpacity:0.12});
      }
    }
  });
}

// Normaliza GeometryCollections em tipos Multi* homogêneos. KMLs com
// <MultiGeometry> de vários polígonos (ex.: ADAs multipartes exportadas pelo
// QGIS/ArcGIS) viram "GeometryCollection" na conversão para GeoJSON — um tipo
// que o restante do sistema (ícone de tipologia, Área e comprimento, buffer
// AID × ADA) não reconhece. Aqui cada feição desse tipo é convertida em uma ou
// mais feições homogêneas (MultiPolygon / MultiLineString / MultiPoint),
// preservando as propriedades.
function normalizeGeometryCollections(geojson){
  if(!geojson || !Array.isArray(geojson.features)) return geojson;
  const out = [];
  const flatten = (g, acc) => { // coleta geometrias simples, recursivamente
    if(!g) return;
    if(g.type === 'GeometryCollection') (g.geometries||[]).forEach(sub=>flatten(sub, acc));
    else acc.push(g);
  };
  geojson.features.forEach(f=>{
    const g = f.geometry;
    if(!g || g.type !== 'GeometryCollection'){ out.push(f); return; }
    const geoms = []; flatten(g, geoms);
    const polys = [], lines = [], points = [];
    geoms.forEach(s=>{
      if(s.type==='Polygon') polys.push(s.coordinates);
      else if(s.type==='MultiPolygon') s.coordinates.forEach(c=>polys.push(c));
      else if(s.type==='LineString') lines.push(s.coordinates);
      else if(s.type==='MultiLineString') s.coordinates.forEach(c=>lines.push(c));
      else if(s.type==='Point') points.push(s.coordinates);
      else if(s.type==='MultiPoint') s.coordinates.forEach(c=>points.push(c));
    });
    if(polys.length)  out.push({...f, geometry:{type:'MultiPolygon',    coordinates:polys}});
    if(lines.length)  out.push({...f, geometry:{type:'MultiLineString', coordinates:lines}});
    if(points.length) out.push({...f, geometry:{type:'MultiPoint',      coordinates:points}});
    if(!polys.length && !lines.length && !points.length) out.push(f); // vazia: mantém
  });
  geojson.features = out;
  return geojson;
}

// Ponto de entrada de TODAS as importações (KML, KMZ, GeoJSON, GPX, CSV,
// Shapefile). Quando o arquivo agrupa mais de uma tipologia (ex.: KML de LT com
// torres = pontos, eixo = linha e faixa = polígono), as feições são
// DESAGRUPADAS em camadas individuais — uma por tipologia —, para que o usuário
// possa ligar/desligar e medir cada uma separadamente. Arquivos com uma única
// tipologia continuam gerando uma única camada, com o nome original.
function addGeoJSONToMap(key, geojson, name, map, layersControl){
  geojson = normalizeGeometryCollections(geojson);
  const feats = geojson.features || [];
  const grupos = { polygon:[], line:[], point:[] };
  feats.forEach(f=>{
    const t = f.geometry && f.geometry.type;
    if(t==='Polygon'||t==='MultiPolygon') grupos.polygon.push(f);
    else if(t==='LineString'||t==='MultiLineString') grupos.line.push(f);
    else if(t==='Point'||t==='MultiPoint') grupos.point.push(f);
  });
  const presentes = Object.keys(grupos).filter(t=>grupos[t].length);
  // Cor fixa por denominação (ADA/AID) — aplicável APENAS a polígonos.
  const corNomeada = colorForLayerName(name);
  // Uma só tipologia (ou nenhuma reconhecida): comportamento original.
  if(presentes.length <= 1){
    const opts = (presentes[0] === 'polygon' && corNomeada) ? {color: corNomeada} : {};
    return addGeoJSONLayerSingle(key, geojson, name, map, layersControl, opts);
  }
  // Mistura de tipologias: separa em camadas individuais. Cada tipologia recebe
  // uma COR DISTINTA da paleta, para diferenciá-las no mapa; o polígono usa a
  // cor da denominação quando houver (ADA/AID). A cor de cada camada pode ser
  // alterada individualmente pelo seletor do painel.
  const rotulos = { polygon:'Polígonos', line:'Linhas', point:'Pontos' };
  const base = String(name).replace(/\.(kml|kmz|geojson|json|gpx|gtm|csv|zip)$/i, '');
  const ext  = String(name).slice(base.length);
  const criadas = [];
  ['polygon','line','point'].forEach(t=>{
    if(!grupos[t].length) return;
    const sub = { type:'FeatureCollection', features: grupos[t] };
    const nome = `${base} — ${rotulos[t]}${ext}`;
    const cor = t === 'point' ? IMP_POINT_RING_DEFAULT
              : (t === 'polygon' && corNomeada) ? corNomeada : nextColor(key);
    const lyr = addGeoJSONLayerSingle(key, sub, nome, map, layersControl, {color:cor, skipFit:true});
    if(lyr) criadas.push(lyr);
  });
  console.info(`[GeoTools] "${name}": ${presentes.length} tipologias separadas em camadas individuais (${presentes.map(t=>rotulos[t].toLowerCase()).join(', ')}).`);
  // Enquadra o mapa em TODAS as partes juntas (uma única vez)
  try{
    let total = null;
    criadas.forEach(l=>{
      const b = l.getBounds();
      if(b && b.isValid()) total = total ? total.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast());
    });
    if(total && total.isValid()) map.fitBounds(total, {padding:[32,32]});
  }catch(e){ console.warn('Bounds inválidos ao enquadrar camadas separadas de', name, e); }
  return criadas;
}

// Cria UMA camada a partir de um GeoJSON já homogêneo/normalizado.
// opts: { color } cor fixa (compartilhada entre tipologias do mesmo arquivo)
//       { skipFit } não enquadra o mapa (o enquadramento é feito pelo chamador)
function addGeoJSONLayerSingle(key, geojson, name, map, layersControl, opts){
  opts = opts || {};
  // Determina a tipologia predominante da coleção para escolher o pane
  // (prioridade de clique: ponto > linha > polígono).
  const tset = new Set();
  (geojson.features||[]).forEach(f=>{
    const t = f.geometry && f.geometry.type;
    if(t==='Point'||t==='MultiPoint') tset.add('point');
    else if(t==='LineString'||t==='MultiLineString') tset.add('line');
    else if(t==='Polygon'||t==='MultiPolygon') tset.add('polygon');
  });
  // Camadas só de pontos: contorno preto por padrão (alterável no seletor)
  const soPontos = tset.size===1 && tset.has('point');
  const color = soPontos ? IMP_POINT_RING_DEFAULT : (opts.color || nextColor(key));
  const paneFor = gt => {
    if(gt==='Point'||gt==='MultiPoint') return 'impPointPane';
    if(gt==='LineString'||gt==='MultiLineString') return 'impLinePane';
    if(gt==='Polygon'||gt==='MultiPolygon') return 'impPolygonPane';
    return 'impPolygonPane';
  };
  // "Modo circunscrito" para polígonos: apenas contorno, sem preenchimento sólido
  const R = map._impRenderers || {};
  const layer = L.geoJSON(geojson, {
    style: f => {
      const t = f.geometry && f.geometry.type;
      if(t==='Polygon'||t==='MultiPolygon'){
        return {color, weight:2.5, fillOpacity:0.05, fillColor:color, dashArray:'4 3', pane:'impPolygonPane', renderer:R.impPolygonPane, interactive:false};
      }
      if(t==='LineString'||t==='MultiLineString'){
        return {color, weight:3.5, opacity:1, fill:false, pane:'impLinePane', renderer:R.impLinePane, interactive:false};
      }
      if(t==='Point'||t==='MultiPoint'){
        // o estilo do GeoJSON também é aplicado aos pontos: mantém o anel cheio
        // na cor da camada com a borda (sombreamento) branca
        return {color:'#ffffff', weight:1.5, opacity:1, fillColor:color, fillOpacity:1, pane:'impPointPane', renderer:R.impPointPane, interactive:false};
      }
      return {color, weight:2.5, fillOpacity:0.12, fillColor:color, pane:'impPolygonPane', renderer:R.impPolygonPane, interactive:false};
    },
    pointToLayer: (f, latlng) => new ImpPointMarker(latlng, {radius:7, color:'#ffffff', weight:1.5, fillColor:color, fillOpacity:1, pane:'impPointPane', renderer:R.impPointPane, interactive:false}),
    onEachFeature: (feature, layer) => bindGeoFeaturePopup(layer, feature, key)
  });
  layer.addTo(map);
  layersControl.addOverlay(layer, name);
  const ulcContainer = layersControl.getContainer();
  ulcContainer.style.display = '';
  if(!ulcContainer.querySelector('.ulc-toggle')){
    const toggle = document.createElement('div');
    toggle.className = 'ulc-toggle';
    toggle.textContent = 'Minimizar';
    toggle.addEventListener('click', ()=>{
      layersControl._toggleFn(true);
    });
    ulcContainer.querySelector('.leaflet-control-layers-list').appendChild(toggle);
  }
  addGeoLayerToPanel(key, name, layer, color, map, layersControl, geojson);
  if(!opts.skipFit){
    try{
      const b = layer.getBounds();
      if(b.isValid()) map.fitBounds(b, {padding:[32,32]});
    }catch(e){ console.warn('Bounds inválidos para camada', name, e); }
  }
  // Garante a renderização imediata das feições (evita o efeito de só aparecer
  // após o primeiro zoom). O reflow causado por nomes de camada longos no painel
  // pode deixar os renderizadores dessincronizados; forçamos um reset completo
  // dos panes após o layout estabilizar.
  function forceRedraw(){
    try{
      map.invalidateSize({animate:false});
      const R = map._impRenderers || {};
      Object.values(R).forEach(r=>{
        try{ if(r._reset) r._reset(); else if(r._update) r._update(); }catch(_){}
      });
    }catch(_){}
  }
  setTimeout(forceRedraw, 60);
  // Segundo redraw após o reflow do painel de camadas (nomes longos):
  setTimeout(forceRedraw, 350);
  return layer;
}

// ── Detecta zona UTM a partir do .prj (WKT) ou estima pela Easting ──
function detectUTMZone(prjText, sampleCoords){
  // Tenta extrair zona e hemisfério do WKT do .prj (ex: "UTM zone 23S", "23S")
  if(prjText){
    const m = prjText.match(/UTM[_\s]*zone[_\s]*(\d{1,2})\s*([NS])?/i) ||
              prjText.match(/zone\s*=?\s*(\d{1,2})\s*([NS])?/i);
    if(m){
      const zone = parseInt(m[1]);
      const south = m[2] ? m[2].toUpperCase()==='S' : /SOUTH|sul/i.test(prjText);
      if(zone>=1 && zone<=60) return {zone, south};
    }
    // Tenta extrair do código EPSG (319XX = SIRGAS2000 UTM Sul, 319XX N variantes)
    const epsg = prjText.match(/EPSG["',\s:]*(\d{4,5})/i);
    if(epsg){
      const code = parseInt(epsg[1]);
      // SIRGAS2000 / UTM zone XXS = EPSG 31978-31985 (zonas 17S-25S, aproximação Brasil)
      if(code>=31960 && code<=31985){
        const zone = code - 31960 + 17; // ajuste aproximado para faixa SIRGAS2000 sul
        if(zone>=17 && zone<=25) return {zone, south:true};
      }
    }
  }
  // Sem .prj utilizável: estima zona pela Easting (válido apenas para Brasil, hemisfério sul)
  if(sampleCoords && sampleCoords.length>=2){
    const e = sampleCoords[0], n = sampleCoords[1];
    if(e>100000 && e<1000000 && n>0 && n<10000000){
      // Não é possível determinar a zona apenas pela Easting com precisão;
      // assume zona 23S (região central do Brasil) como aproximação razoável.
      console.warn('[GeoTools] Zona UTM não informada no .prj — assumindo zona 23S (SIRGAS2000) como aproximação.');
      return {zone:23, south:true};
    }
  }
  return null;
}

// ── Reprojeta coordenadas de um GeoJSON de UTM (SIRGAS2000/GRS80) para Lat/Lon ──
function reprojectGeoJSON(geojson, zone, south){
  const src = utmProj(zone, south);
  const dst = geoProj;
  function reprojectCoords(coords){
    if(typeof coords[0]==='number'){
      try{
        const [lon,lat] = proj4(src, dst, coords);
        return [+lon.toFixed(8), +lat.toFixed(8)];
      }catch(e){ return coords; }
    }
    return coords.map(reprojectCoords);
  }
  geojson.features.forEach(f=>{
    if(f.geometry && f.geometry.coordinates){
      f.geometry.coordinates = reprojectCoords(f.geometry.coordinates);
    }
  });
}

// Se as coordenadas do GeoJSON estiverem fora da faixa lat/lon (ou seja, ainda
// em UTM porque o shpjs não conseguiu reprojetar via .prj), tenta reprojetar
// manualmente assumindo UTM SIRGAS2000/GRS80. Examina várias feições para
// não depender só da primeira (que poderia ser de outra tipologia).
function maybeReprojectGeoJSON(geojson, prjText){
  const sample = (geojson.features||[]).find(f=>f.geometry && f.geometry.coordinates);
  if(!sample) return;
  const flat = JSON.stringify(sample.geometry.coordinates).match(/-?\d+\.?\d*/g).map(Number);
  const outOfRange = flat.some(v=>!isFinite(v) || Math.abs(v)>180+90);
  if(!outOfRange) return;
  const zoneInfo = detectUTMZone(prjText, flat);
  if(zoneInfo){
    reprojectGeoJSON(geojson, zoneInfo.zone, zoneInfo.south);
  }
}

// Remove a 3ª/4ª dimensão (Z elevação / M medida) de cada vértice. Tracks de
// GPS convertidos para shapefile costumam ser PolyLineZ/PolyLineM; se o valor Z
// ou M "vazar" para a posição de uma coordenada, a feição é plotada em local
// errado (ex.: Antártida). Mantemos apenas [lon, lat] (2D).
function stripZMCoords(geojson){
  function strip(coords){
    if(typeof coords[0]==='number'){
      return [coords[0], coords[1]]; // descarta Z e M
    }
    return coords.map(strip);
  }
  (geojson.features||[]).forEach(f=>{
    if(f.geometry && f.geometry.coordinates){
      f.geometry.coordinates = strip(f.geometry.coordinates);
    }
  });
}

// Pipeline completo para camadas importadas: remove Z/M, reprojeta se necessário.
function sanitizeAndReproject(geojson, prjText, base){
  stripZMCoords(geojson);
  maybeReprojectGeoJSON(geojson, prjText);
  checkShapefileTrackIntegrity(geojson, base);
}

// Verifica integridade quando o shapefile contém LINHAS que aparentam ser
// trilhas. Na conversão GPX→SHP, os atributos de gravação (tempo, velocidade)
// podem ou não ser preservados. Procuramos por colunas típicas de trilha no
// .dbf (ex.: time/timestamp/ele/speed). A presença indica que as propriedades
// originais foram mantidas; a ausência impede a verificação de autenticidade.
function checkShapefileTrackIntegrity(geojson, base){
  try{
    const feats = geojson.features || [];
    const lineFeats = feats.filter(f=>{
      const t = f.geometry && f.geometry.type;
      return t==='LineString' || t==='MultiLineString';
    });
    if(!lineFeats.length) return; // não há linhas

    // Atributos/colunas típicas de trilha gravada por GPS
    const trackKeys = ['time','timestamp','datetime','hora','ele','elevation','altitude','speed','velocidade','course','heading','hdop','vdop','pdop','sat','fix','track_fid','track_seg','trkpt','gpxtype'];
    const sample = lineFeats[0].properties || {};
    const keys = Object.keys(sample).map(k=>k.toLowerCase());
    const found = trackKeys.filter(tk => keys.some(k => k.includes(tk)));

    // Densidade média de vértices por linha
    const totalVerts = lineFeats.reduce((s,f)=>{
      const c = f.geometry.coordinates;
      const count = (f.geometry.type==='MultiLineString') ? c.reduce((a,p)=>a+p.length,0) : c.length;
      return s+count;
    },0);
    const avg = Math.round(totalVerts/lineFeats.length);

    // Pista pelo nome do arquivo
    const nameHint = /(trilha|track|caminhament|percurso|trajeto|rota|gps|gpx|walk|hike|trail)/i.test(base||'');

    // ── DECISÃO: isto é uma trilha? ──
    // Só consideramos trilha (e exibimos o aviso de integridade) se houver
    // evidência positiva: atributos de GPS, OU nome sugestivo, OU densidade de
    // vértices muito alta (gravação contínua). Linhas comuns — estradas, rios,
    // limites, hidrografia — não têm esses sinais e NÃO são avaliadas.
    const looksLikeTrack = found.length > 0 || nameHint || avg >= 80;
    if(!looksLikeTrack) return; // linha comum — não aplica verificação de trilha

    const flags = [], positives = [];
    if(found.length){
      positives.push('atributos de trilha preservados na conversão: ' + found.join(', '));
    } else {
      flags.push('o shapefile não preserva atributos de gravação (tempo, altitude, velocidade)');
      flags.push('a conversão para SHP descartou os metadados originais da trilha');
    }
    if(nameHint) positives.push('nome do arquivo sugere ser uma trilha/percurso');
    if(avg >= 30) positives.push(`alta densidade de vértices (~${avg} por linha), típica de gravação contínua`);
    else flags.push(`baixa densidade de vértices (~${avg} por linha) — pode indicar simplificação/edição`);

    showShapefileTrackReport(base, flags, positives);
  }catch(e){ console.warn('Falha na verificação de trilha (SHP):', e); }
}

function showShapefileTrackReport(fileName, flags, positives){
  const ok = positives.some(p=>p.includes('atributos de trilha preservados'));
  // 'limited' = verificação limitada (metadados descartados na conversão SHP)
  _trackReports[fileName] = { authentic: ok, limited: !ok, flags, positives, kind:'shp', fileName };
}

// ════════════════════════════════════════
//  LEITOR DE GTM (GPS TrackMaker — binário)
// ════════════════════════════════════════
// GTM é um formato BINÁRIO PROPRIETÁRIO (popular no Brasil). Não há biblioteca
// JS pronta, então implementamos um leitor do formato GTM 211 com base na
// especificação pública. Lê waypoints e tracklogs georreferenciados em WGS84.
// Retorna { geojson, trackInfo } ou null se não conseguir interpretar.
function parseGTM(buffer){
  try{
    const dv = new DataView(buffer);
    let off = 0;
    const u8  = ()=>{ const v=dv.getUint8(off); off+=1; return v; };
    const i16 = ()=>{ const v=dv.getInt16(off,true); off+=2; return v; };
    const u16 = ()=>{ const v=dv.getUint16(off,true); off+=2; return v; };
    const i32 = ()=>{ const v=dv.getInt32(off,true); off+=4; return v; };
    const u32 = ()=>{ const v=dv.getUint32(off,true); off+=4; return v; };
    const f64 = ()=>{ const v=dv.getFloat64(off,true); off+=8; return v; };
    const f32 = ()=>{ const v=dv.getFloat32(off,true); off+=4; return v; };
    const str = ()=>{ const n=u16(); let s=''; for(let i=0;i<n;i++) s+=String.fromCharCode(u8()); return s; };

    // ── Cabeçalho ──
    const version = i16();
    const tag = str(); // deve ser "TrackMaker"
    if(!/TrackMaker/i.test(tag)) return null; // não é GTM válido
    if(version < 211){
      // versões antigas têm layout diferente; não suportadas
      return { unsupported:true };
    }

    // Campos do cabeçalho GTM 211 (conforme especificação)
    i16();          // code
    /* gradnum   */ i16();
    /* bcolor    */ i32();
    /* nwpts visíveis etc. — pulamos campos de exibição */
    /* fcolor    */ i32();
    /* gradevel? */ const _grad = f32(); void _grad;
    /* bytsdir   */ u8();
    /* gradutm?  */ i16();
    // Datum / projeção (queremos WGS84). O bloco a seguir contém vários campos
    // de configuração de tela e datum que variam; em vez de mapear cada byte
    // (frágil), localizamos os dados pelo padrão dos blocos de contagem.
    // Para robustez, fazemos uma varredura: a partir daqui o GTM 211 traz
    // o número de waypoints, imagens, trilhas, etc.
    // Lê os contadores principais:
    const nwpt   = i32();  // número de waypoints
    const ntrk   = i32();  // número de pontos de tracklog (todos os trechos)
    const nimg   = i32();  // número de imagens
    const ntk    = i32();  // número de trilhas (track headers)

    // pula nomes de datum/zona (2 strings) e parâmetros — campos de tamanho fixo
    // Datum string + projeção: tentamos pular com segurança.
    // Estrutura: 1 byte (n1) + ... Aqui assumimos WGS84; se a leitura
    // desalinhar, abortamos e sugerimos GPX.
    str(); // datum name (ex: "WGS 84")
    /* projection */ str();

    // ── Waypoints ──
    const features = [];
    for(let i=0;i<nwpt;i++){
      const lon = f64();
      const lat = f64();
      const nameLen = u8(); let wname=''; for(let k=0;k<nameLen;k++) wname+=String.fromCharCode(u8());
      const cmtLen = u16(); let cmt=''; for(let k=0;k<cmtLen;k++) cmt+=String.fromCharCode(u8());
      i16();            // icon
      u8();             // dspl
      f32();            // wrot (rotation) — campos de exibição
      i16();            // walt? varia
      /* alguns campos extras de exibição/altitude */
      const alt = f32();
      i16(); i16();     // date fields (parciais)
      if(isFinite(lat)&&isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180){
        features.push({type:'Feature', properties:{nome:wname.trim(), comentario:cmt.trim(), altitude:alt},
          geometry:{type:'Point', coordinates:[lon,lat]}});
      }
    }

    // ── Tracklog points ──
    // Cada ponto: lon(double), lat(double), header(byte: 1=novo trecho), date(long), alt(float)
    const tracks = [];   // array de arrays de [lon,lat]
    let current = null;
    const trackTimes = [];
    let curTimes = null;
    for(let i=0;i<ntrk;i++){
      const lon = f64();
      const lat = f64();
      const hdr = u8();          // 1 = início de novo trecho
      const dateRaw = i32();     // data (dias desde 1899-12-30, formato Delphi)
      const alt = f32();
      i16();                     // campo extra (ex: track index)
      if(!isFinite(lat)||!isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){
        continue; // ponto inválido — provável desalinhamento; ignora
      }
      if(hdr===1 || current===null){
        current = []; tracks.push(current);
        curTimes = []; trackTimes.push(curTimes);
      }
      current.push([lon,lat]);
      // converte data Delphi (dias desde 1899-12-30) para epoch ms, se válida
      let t = null;
      if(dateRaw>0){ t = (dateRaw - 25569) * 86400000; } // 25569 = dias entre 1899-12-30 e 1970-01-01
      curTimes.push({t, alt});
    }
    tracks.forEach((coords, idx)=>{
      if(coords.length >= 2){
        features.push({type:'Feature', properties:{nome:`Trilha ${idx+1}`, tipo:'trilha'},
          geometry:{type:'LineString', coordinates:coords}});
      }
    });

    if(!features.length) return null;

    // Informação para análise de integridade da(s) trilha(s)
    const trackInfo = { tracks, trackTimes, totalPoints: ntrk, nTracks: tracks.length };
    return { geojson:{type:'FeatureCollection', features}, trackInfo };
  }catch(e){
    console.warn('Falha ao interpretar GTM (formato binário pode variar):', e);
    return null;
  }
}

// Análise de integridade para trilhas extraídas de GTM (similar ao GPX).
function analyzeGTMTrackIntegrity(trackInfo, fileName){
  try{
    if(!trackInfo || !trackInfo.tracks || !trackInfo.tracks.length) return;
    const flags = [], positives = [];

    let totalPts = 0, withTime = 0, withAlt = 0;
    const allTimes = [], allPts = [];
    trackInfo.tracks.forEach((coords, ti)=>{
      const times = trackInfo.trackTimes[ti] || [];
      coords.forEach((c, pi)=>{
        totalPts++;
        const meta = times[pi] || {};
        if(meta.t != null) { withTime++; allTimes.push(meta.t); }
        if(meta.alt != null && isFinite(meta.alt) && meta.alt !== 0) withAlt++;
        allPts.push([c[1], c[0]]); // [lat,lon]
      });
    });

    const timeRatio = totalPts ? withTime/totalPts : 0;
    if(timeRatio >= 0.9) positives.push('carimbos de tempo presentes na maioria dos pontos');
    else if(timeRatio === 0) flags.push('nenhum ponto possui carimbo de tempo (típico de trilha desenhada/editada)');
    else flags.push(`apenas ${Math.round(timeRatio*100)}% dos pontos têm carimbo de tempo`);

    if(allTimes.length >= 2){
      let nonMono = 0;
      for(let i=1;i<allTimes.length;i++) if(allTimes[i] < allTimes[i-1]) nonMono++;
      if(nonMono === 0) positives.push('sequência temporal consistente (crescente)');
      else flags.push(`${nonMono} ponto(s) com tempo fora de ordem (possível edição)`);

      // velocidade mediana (trilha a pé)
      const speeds = [];
      for(let i=1;i<allPts.length && i<allTimes.length;i++){
        const dt = (allTimes[i]-allTimes[i-1])/1000;
        if(dt<=0) continue;
        const d = haversineM(allPts[i-1], allPts[i]);
        speeds.push((d/dt)*3.6);
      }
      if(speeds.length){
        const s = speeds.slice().sort((a,b)=>a-b);
        const median = s[Math.floor(s.length/2)];
        if(speeds.some(v=>v>200)) flags.push('trecho(s) com velocidade impossível (> 200 km/h) — forte indício de edição');
        else if(median > 15) flags.push(`velocidade mediana ~${median.toFixed(1)} km/h alta para trilha a pé`);
        else if(median >= 1 && median <= 12) positives.push(`ritmo compatível com caminhada (mediana ~${median.toFixed(1)} km/h)`);
      }
    }

    if(withAlt/totalPts >= 0.9) positives.push('altitude registrada nos pontos');
    else if(withAlt === 0) flags.push('sem dados de altitude');

    if(totalPts < 10) flags.push(`baixa densidade de pontos (${totalPts}) — atípico para gravação contínua`);

    showTrackIntegrityReport(fileName, flags, positives);
  }catch(e){ console.warn('Falha na análise de integridade da trilha (GTM):', e); }
}

// ── Leitura de KML/KMZ ──
async function handleGeoFile(key, files, map, layersControl){
  const arr = Array.from(files||[]);
  if(!arr.length) return;

  const totalSize = arr.reduce((s,f)=>s+f.size,0);
  if(totalSize > MAX_GEO_FILE_MB*1024*1024){
    alert(`Arquivo muito grande. O limite é ${MAX_GEO_FILE_MB} MB.`);
    return;
  }

  // Se o usuário selecionou componentes soltos de shapefile (.shp/.dbf/.shx…),
  // trata como um conjunto shapefile (reaproveita a lógica de pasta).
  const hasShpParts = arr.some(f=>/\.(shp|dbf|shx|prj|cpg)$/i.test(f.name));
  if(hasShpParts){
    return handleGeoFolder(key, files, map, layersControl);
  }

  showLayerLoading(key);
  try{
    for(const file of arr){
      const name = file.name;
      try{
        if(/\.(kml|kmz)$/i.test(name)){
          await importKmlFile(key, file, map, layersControl);
        } else if(/\.(geojson|json)$/i.test(name)){
          const txt = await file.text();
          const geojson = JSON.parse(txt);
          if(!geojson.features || !geojson.features.length){ alert(`Nenhuma feição encontrada em "${name}".`); continue; }
          addGeoJSONToMap(key, geojson, name, map, layersControl);
        } else if(/\.gpx$/i.test(name)){
          const gpxText = await file.text();
          const dom = new DOMParser().parseFromString(gpxText, 'text/xml');
          const geojson = toGeoJSON.gpx(dom);
          if(!geojson.features || !geojson.features.length){ alert(`Nenhuma feição encontrada em "${name}".`); continue; }
          analyzeTrackIntegrity(dom, name); // verifica autenticidade da trilha (GPX)
          addGeoJSONToMap(key, geojson, name, map, layersControl);
        } else if(/\.gtm$/i.test(name)){
          const buf = await file.arrayBuffer();
          const result = parseGTM(buf);
          if(!result || !result.geojson || !result.geojson.features.length){
            alert(`Não foi possível ler feições do arquivo GTM "${name}".\n\nO formato GPS TrackMaker (.gtm) é binário e proprietário. O sistema tenta interpretá-lo, mas só lê arquivos georreferenciados em WGS84 (datum padrão). Se o arquivo usa outro datum (ex.: SAD69, Córrego Alegre) ou uma variação não suportada, exporte-o como GPX no GPS TrackMaker (Arquivo → Salvar como → GPX) e importe novamente.`);
            continue;
          }
          // Analisa integridade das trilhas extraídas do GTM
          if(result.trackInfo) analyzeGTMTrackIntegrity(result.trackInfo, name);
          addGeoJSONToMap(key, result.geojson, name, map, layersControl);
        } else if(/\.csv$/i.test(name)){
          await importCsvFile(key, file, map, layersControl);
        } else if(/\.zip$/i.test(name)){
          await importZippedArchive(key, file, map, layersControl);
        } else if(/\.(rar|7z|tar|gz)$/i.test(name)){
          alert(`Arquivos ${name.split('.').pop().toUpperCase()} não podem ser descompactados no navegador.\n\nReexporte o shapefile como .ZIP (formato compactado padrão) — ele é aceito diretamente — ou use o botão "Importar Shapefile (pasta)".`);
        } else {
          alert(`Formato não reconhecido: "${name}".\nFormatos aceitos: KML, KMZ, GeoJSON, GPX, GTM (GPS TrackMaker), CSV (com coordenadas), Shapefile (.zip ou pasta).`);
        }
      }catch(err){
        console.error(err);
        alert(`Erro ao processar "${name}": ${err.message}`);
      }
    }
  }finally{
    setTimeout(()=>hideLayerLoading(key), 400);
  }
}

// Importa um CSV contendo coordenadas válidas e plota como camada de pontos.
// Aceita dois esquemas de colunas (detectados pelo cabeçalho):
//   1) GEOGRÁFICAS: colunas de latitude/longitude em graus decimais
//      (lat, latitude, y  ×  lon, long, lng, longitude, x);
//   2) UTM: colunas de Este/Norte (e, este, easting, coord_e, utm_e ×
//      n, norte, northing, coord_n, utm_n) + coluna de FUSO (fuso, zona,
//      zone) — a letra/hemisfério é opcional (letra, letter, hemisferio;
//      padrão 'M' = hemisfério sul, adequado ao Brasil).
// Delimitador (; , ou TAB) e decimais pt-BR (vírgula) são detectados
// automaticamente. Demais colunas viram propriedades do ponto (popup).
async function importCsvFile(key, file, map, layersControl){
  const raw = (await file.text()).replace(/^\uFEFF/, ''); // remove BOM
  const lines = raw.split(/\r\n|\n|\r/).filter(l=>l.trim().length);
  if(lines.length < 2){
    alert(`CSV "${file.name}" vazio ou sem linhas de dados.`);
    return;
  }
  // Detecta o delimitador pela 1ª linha (o mais frequente entre ; , TAB)
  const head = lines[0];
  const counts = { ';': (head.match(/;/g)||[]).length,
                   ',': (head.match(/,/g)||[]).length,
                   '\t': (head.match(/\t/g)||[]).length };
  const delim = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
  if(!counts[delim]){
    alert(`Não foi possível detectar o delimitador do CSV "${file.name}" (use ; , ou TAB).`);
    return;
  }
  // Parser simples com suporte a campos entre aspas
  const parseLine = line => {
    const out = []; let cur = '', inQ = false;
    for(let i=0;i<line.length;i++){
      const c = line[i];
      if(inQ){
        if(c === '"'){ if(line[i+1] === '"'){ cur+='"'; i++; } else inQ = false; }
        else cur += c;
      } else {
        if(c === '"') inQ = true;
        else if(c === delim){ out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur);
    return out.map(s=>s.trim());
  };

  const headers = parseLine(lines[0]).map(h=>h.toLowerCase());
  const idx = pred => headers.findIndex(pred);

  // Identifica colunas de coordenadas (nomes flexíveis, inclusive os gerados
  // pela própria exportação do CheckLic: utm_easting, utm_northing, zona_utm)
  const iLat = idx(h=>/^(lat|latitude|lat_dd|y)$/.test(h) || /latitude/.test(h));
  const iLon = idx(h=>/^(lon|lng|long|longitude|lon_dd|x)$/.test(h) || /longitude/.test(h));
  const iE   = idx(h=>/^(e|este)$/.test(h) || /easting|utm_e|coord_e|(^|[^a-z])este([^a-z]|$)|leste/.test(h));
  const iN   = idx(h=>/^(n|norte)$/.test(h) || /northing|utm_n|coord_n|(^|[^a-z])norte([^a-z]|$)/.test(h));
  const iZona= idx(h=>/fuso|zona|zone/.test(h));
  const iLet = idx(h=>/^(letra|letter|hemisferio|hemisfério|hem|banda)$/.test(h));
  const iName= idx(h=>/^(nome|name|ponto|id|codigo|c[óo]digo|descri[cç][ãa]o|label|titulo|t[íi]tulo)$/.test(h));

  const modo = (iLat>=0 && iLon>=0) ? 'geo'
             : (iE>=0 && iN>=0 && iZona>=0) ? 'utm'
             : null;
  if(!modo){
    alert(`Não encontrei colunas de coordenadas válidas em "${file.name}".\n\nEsquemas aceitos (nomes no cabeçalho):\n• Geográficas: lat/latitude + lon/longitude (graus decimais)\n• UTM: este/e + norte/n + fuso/zona (letra opcional; padrão hemisfério sul)`);
    return;
  }

  // Normalização numérica sensível ao contexto:
  // - GEOGRÁFICAS: o ponto é SEMPRE decimal (ex.: -15.794200); vírgula única
  //   também é decimal (pt-BR: -15,794200); ambos juntos = pt-BR completo.
  // - UTM: usa a heurística de milhar (534.000 → 534000; 9.350.200,5 → ok).
  const numGeo = v => {
    v = String(v||'').trim();
    if(v.includes('.') && v.includes(',')) v = v.replace(/\./g,'').replace(',', '.');
    else if(v.includes(',')) v = v.replace(',', '.');
    const f = parseFloat(v); return isFinite(f) ? f : null;
  };
  const numUtm = v => { const s = normalizeNumStr(v); const f = parseFloat(s); return isFinite(f) ? f : null; };
  const features = [];
  let skipped = 0;
  for(let li=1; li<lines.length; li++){
    const cells = parseLine(lines[li]);
    if(cells.every(c=>!c)) continue; // linha vazia
    let lat=null, lon=null;
    if(modo === 'geo'){
      lat = numGeo(cells[iLat]); lon = numGeo(cells[iLon]);
      if(lat===null || lon===null || Math.abs(lat)>90 || Math.abs(lon)>180){ skipped++; continue; }
    } else {
      const E = numUtm(cells[iE]), N = numUtm(cells[iN]);
      // A zona pode vir combinada com a letra (ex.: "23K") ou separada
      const zonaRaw = String(cells[iZona]||'').trim();
      const zm = zonaRaw.match(/(\d{1,2})\s*([A-Za-z])?/);
      const zona = zm ? parseInt(zm[1],10) : NaN;
      const letra = (iLet>=0 && cells[iLet]) ? cells[iLet].trim().toUpperCase().charAt(0)
                  : (zm && zm[2]) ? zm[2].toUpperCase() : 'M';
      if(E===null || N===null || !isFinite(zona) || zona<1 || zona>60 ||
         E < 100000 || E > 900000 || N < 0 || N > 10000000){ skipped++; continue; }
      const geo = utmToGeo(E, N, zona, letra);
      if(!geo){ skipped++; continue; }
      lat = geo.lat; lon = geo.lon;
    }
    // Propriedades: nome + demais colunas
    const props = {};
    props.name = (iName>=0 && cells[iName]) ? cells[iName] : `Ponto ${features.length+1}`;
    headers.forEach((h,i)=>{
      if(i===iLat||i===iLon||i===iE||i===iN||i===iZona||i===iLet||i===iName) return;
      if(cells[i]) props[parseLine(lines[0])[i]] = cells[i];
    });
    features.push({ type:'Feature', properties: props,
                    geometry:{ type:'Point', coordinates:[lon, lat] } });
  }

  if(!features.length){
    alert(`Nenhuma coordenada válida encontrada em "${file.name}".` +
      (skipped ? `\n(${skipped} linha(s) com valores inválidos foram ignoradas.)` : ''));
    return;
  }
  if(skipped){
    console.info(`[GeoTools] CSV "${file.name}": ${features.length} pontos importados, ${skipped} linha(s) inválida(s) ignorada(s).`);
  }
  const geojson = { type:'FeatureCollection', features };
  addGeoJSONToMap(key, geojson, file.name, map, layersControl);
  // Registra os pontos para EXPORTAÇÃO (KML/Shapefile/GeoJSON) e habilita o
  // botão Exportar (na tela Informar, que é controlada por visibilidade).
  csvImportedPoints[key][file.name] = features.map(f=>({
    name: f.properties.name,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
  }));
  if(key==='inf' && typeof updateInfDownloadButtons==='function') updateInfDownloadButtons();
}

// Lê um arquivo KML ou KMZ e adiciona ao mapa.
// Faz o parse de um texto KML de forma TOLERANTE. Alguns exportadores (ex.:
// "Layer to KML" do ArcGIS) usam atributos com prefixos de namespace não
// declarados (tipicamente xsi:schemaLocation sem xmlns:xsi no elemento raiz).
// O DOMParser do navegador é estrito e rejeita o documento inteiro
// (parsererror) — enquanto Google Earth e QGIS abrem normalmente. Aqui, se o
// parse falhar, declaramos os prefixos ausentes no elemento raiz e tentamos de
// novo.
function parseKmlDom(kmlText){
  let dom = new DOMParser().parseFromString(kmlText, 'text/xml');
  if(!dom.querySelector('parsererror')) return dom;
  // Coleta prefixos usados em elementos (<pfx:tag) e atributos (pfx:attr=)
  const used = new Set();
  (kmlText.match(/<\/?([A-Za-z][\w.-]*):/g)||[]).forEach(m=>used.add(m.replace(/[<\/:]/g,'')));
  (kmlText.match(/\s([A-Za-z][\w.-]*):[\w.-]+\s*=/g)||[]).forEach(m=>used.add(m.trim().split(':')[0]));
  used.delete('xml'); used.delete('xmlns');
  const KNOWN = {
    xsi:'http://www.w3.org/2001/XMLSchema-instance',
    gx:'http://www.google.com/kml/ext/2.2',
    atom:'http://www.w3.org/2005/Atom',
    kml:'http://www.opengis.net/kml/2.2',
    xal:'urn:oasis:names:tc:ciq:xsdschema:xAL:2.0',
  };
  const missing = [...used].filter(p=>!new RegExp('xmlns:'+p+'\\s*=').test(kmlText));
  if(missing.length){
    const decls = missing.map(p=>` xmlns:${p}="${KNOWN[p]||('http://tempuri.org/'+p)}"`).join('');
    const fixed = kmlText.replace(/<kml\b([^>]*)>/, (m,attrs)=>`<kml${attrs}${decls}>`);
    const dom2 = new DOMParser().parseFromString(fixed, 'text/xml');
    if(!dom2.querySelector('parsererror')){
      console.info(`[GeoTools] KML corrigido: namespace(s) não declarado(s) [${missing.join(', ')}] adicionados ao elemento raiz.`);
      return dom2;
    }
  }
  return dom; // devolve o original (com erro) para o fluxo tratar
}

async function importKmlFile(key, file, map, layersControl){
  let kmlText;
  if(/\.kmz$/i.test(file.name)){
    const zip = await JSZip.loadAsync(file);
    const kmlEntry = Object.values(zip.files).find(f=>/\.kml$/i.test(f.name));
    if(!kmlEntry){ alert('Arquivo KMZ não contém um KML válido.'); return; }
    kmlText = await kmlEntry.async('text');
  } else {
    kmlText = await file.text();
  }
  const dom = parseKmlDom(kmlText);
  const parseErr = dom.querySelector('parsererror');
  const geojson = parseErr ? {features:[]} : toGeoJSON.kml(dom);
  if(!geojson.features || !geojson.features.length){
    if(parseErr){
      alert(`O arquivo KML contém erros de estrutura XML e não pôde ser lido:\n\n${parseErr.textContent.trim().split('\n')[1] || 'erro de sintaxe XML'}\n\nDica: abra e reexporte o arquivo no QGIS ou Google Earth para corrigi-lo.`);
    } else {
      alert('Nenhuma feição encontrada no arquivo KML.');
    }
    return;
  }
  addGeoJSONToMap(key, geojson, file.name, map, layersControl);
}

// Lê um shapefile compactado em .zip (a biblioteca shpjs aceita o buffer do
// zip diretamente e já cuida do .prj/reprojeção quando presente).
// Lê um .zip e decide o conteúdo: se contiver KML/KMZ, importa-os; caso
// contrário, trata como shapefile compactado.
async function importZippedArchive(key, file, map, layersControl){
  let zip;
  try{
    zip = await JSZip.loadAsync(file);
  }catch(err){
    // Não é um zip legível pelo JSZip — tenta como shapefile direto (shpjs)
    return importZippedShapefile(key, file, map, layersControl);
  }
  const entries = Object.values(zip.files).filter(f=>!f.dir);
  const kmlEntries = entries.filter(f=>/\.kml$/i.test(f.name));
  const kmzEntries = entries.filter(f=>/\.kmz$/i.test(f.name));
  const gpxEntries = entries.filter(f=>/\.gpx$/i.test(f.name));
  const gtmEntries = entries.filter(f=>/\.gtm$/i.test(f.name));
  const geojsonEntries = entries.filter(f=>/\.(geojson|json)$/i.test(f.name));
  const hasShp = entries.some(f=>/\.shp$/i.test(f.name));

  // Se houver KML/KMZ/GPX/GTM/GeoJSON dentro do zip, importa cada um deles
  if(kmlEntries.length || kmzEntries.length || gpxEntries.length || gtmEntries.length || geojsonEntries.length){
    let added = 0;
    for(const entry of kmlEntries){
      try{
        const txt = await entry.async('text');
        const dom = parseKmlDom(txt);
        const gj = dom.querySelector('parsererror') ? {features:[]} : toGeoJSON.kml(dom);
        if(gj.features && gj.features.length){
          addGeoJSONToMap(key, gj, entry.name.split('/').pop(), map, layersControl);
          added++;
        }
      }catch(e){ console.warn('Falha ao ler KML do zip:', entry.name, e); }
    }
    for(const entry of kmzEntries){
      try{
        const kmzBlob = await entry.async('blob');
        const innerZip = await JSZip.loadAsync(kmzBlob);
        const innerKml = Object.values(innerZip.files).find(f=>/\.kml$/i.test(f.name));
        if(innerKml){
          const txt = await innerKml.async('text');
          const dom = parseKmlDom(txt);
          const gj = dom.querySelector('parsererror') ? {features:[]} : toGeoJSON.kml(dom);
          if(gj.features && gj.features.length){
            addGeoJSONToMap(key, gj, entry.name.split('/').pop(), map, layersControl);
            added++;
          }
        }
      }catch(e){ console.warn('Falha ao ler KMZ do zip:', entry.name, e); }
    }
    for(const entry of gpxEntries){
      try{
        const txt = await entry.async('text');
        const dom = new DOMParser().parseFromString(txt, 'text/xml');
        const gj = toGeoJSON.gpx(dom);
        if(gj.features && gj.features.length){
          const nm = entry.name.split('/').pop();
          analyzeTrackIntegrity(dom, nm); // verifica autenticidade da trilha
          addGeoJSONToMap(key, gj, nm, map, layersControl);
          added++;
        }
      }catch(e){ console.warn('Falha ao ler GPX do zip:', entry.name, e); }
    }
    for(const entry of gtmEntries){
      try{
        const ab = await entry.async('arraybuffer');
        const result = parseGTM(ab);
        if(result && result.geojson && result.geojson.features.length){
          const nm = entry.name.split('/').pop();
          if(result.trackInfo) analyzeGTMTrackIntegrity(result.trackInfo, nm);
          addGeoJSONToMap(key, result.geojson, nm, map, layersControl);
          added++;
        } else {
          console.warn('GTM do zip sem feições legíveis:', entry.name);
        }
      }catch(e){ console.warn('Falha ao ler GTM do zip:', entry.name, e); }
    }
    for(const entry of geojsonEntries){
      try{
        const txt = await entry.async('text');
        const gj = JSON.parse(txt);
        if(gj.features && gj.features.length){
          addGeoJSONToMap(key, gj, entry.name.split('/').pop(), map, layersControl);
          added++;
        }
      }catch(e){ console.warn('Falha ao ler GeoJSON do zip:', entry.name, e); }
    }
    // Se além desses houver também um shapefile, importa-o também
    if(hasShp){ await importZippedShapefile(key, file, map, layersControl); return; }
    if(!added) alert(`O arquivo "${file.name}" não contém arquivos geoespaciais com feições válidas.`);
    return;
  }

  // Sem outros formatos: trata como shapefile compactado
  return importZippedShapefile(key, file, map, layersControl);
}

async function importZippedShapefile(key, file, map, layersControl){
  const buf = await file.arrayBuffer();
  let geojson;
  try{
    geojson = await shp(buf); // shpjs: aceita ArrayBuffer de um .zip
  }catch(err){
    alert(`Erro ao ler o shapefile compactado "${file.name}": ${err.message}\nVerifique se o .zip contém ao menos os arquivos .shp, .shx e .dbf.`);
    return;
  }
  // shpjs pode retornar uma FeatureCollection ou um array delas (múltiplos .shp)
  const collections = Array.isArray(geojson) ? geojson : [geojson];
  let added = 0;
  collections.forEach((gj, i)=>{
    if(gj && gj.features && gj.features.length){
      sanitizeAndReproject(gj, null, file.name); // remove Z/M e reprojeta se necessário
      const nm = collections.length>1 ? `${file.name} (${gj.fileName||('camada '+(i+1))})` : file.name;
      addGeoJSONToMap(key, gj, nm, map, layersControl);
      added++;
    }
  });
  if(!added) alert(`O shapefile compactado "${file.name}" não contém feições válidas.`);
}

// ════════════════════════════════════════
//  VERIFICAÇÃO DE INTEGRIDADE DE TRILHAS (GPX)
// ════════════════════════════════════════
// IMPORTANTE: arquivos GPX/SHP não possuem assinatura criptográfica. Não é
// possível PROVAR matematicamente que uma trilha não foi alterada. O que se faz
// aqui é uma ANÁLISE DE PLAUSIBILIDADE: tracks gravados por GPS real têm
// características típicas (carimbos de tempo sequenciais, velocidades plausíveis,
// densidade de pontos, metadados do aparelho/software). A ausência ou
// inconsistência desses sinais indica que o arquivo pode ter sido editado.
function analyzeTrackIntegrity(gpxDom, fileName){
  try{
    const trkpts = Array.from(gpxDom.getElementsByTagName('trkpt'));
    if(!trkpts.length) return; // não é um track (pode ser rota/waypoint) — não avalia

    const total = trkpts.length;
    let withTime = 0, withEle = 0;
    const times = [], pts = [];
    trkpts.forEach(tp=>{
      const lat = parseFloat(tp.getAttribute('lat'));
      const lon = parseFloat(tp.getAttribute('lon'));
      const timeEl = tp.getElementsByTagName('time')[0];
      const eleEl  = tp.getElementsByTagName('ele')[0];
      if(timeEl){ withTime++; const t = Date.parse(timeEl.textContent); if(!isNaN(t)) times.push(t); }
      if(eleEl) withEle++;
      if(isFinite(lat) && isFinite(lon)) pts.push([lat,lon]);
    });

    // Metadados do criador (aparelho/software de gravação)
    const gpxEl = gpxDom.getElementsByTagName('gpx')[0];
    const creator = gpxEl ? (gpxEl.getAttribute('creator')||'') : '';

    const flags = [];      // problemas encontrados
    const positives = [];  // indícios de autenticidade

    // 1) Carimbos de tempo: tracks reais têm tempo em (quase) todos os pontos
    const timeRatio = total ? withTime/total : 0;
    if(timeRatio >= 0.9) positives.push('carimbos de tempo presentes na maioria dos pontos');
    else if(timeRatio === 0) flags.push('nenhum ponto possui carimbo de tempo (típico de trilha desenhada manualmente)');
    else flags.push(`apenas ${Math.round(timeRatio*100)}% dos pontos têm carimbo de tempo`);

    // 2) Sequência temporal: tempos devem ser crescentes
    if(times.length >= 2){
      let nonMonotonic = 0;
      for(let i=1;i<times.length;i++) if(times[i] < times[i-1]) nonMonotonic++;
      if(nonMonotonic === 0) positives.push('sequência temporal consistente (crescente)');
      else flags.push(`${nonMonotonic} ponto(s) com tempo fora de ordem (possível edição)`);
    }

    // 3) Velocidades plausíveis. Como as trilhas são percorridas A PÉ, a
    //    velocidade típica fica entre ~2 e ~7 km/h (até ~15 km/h em corrida ou
    //    descidas). Avaliamos a mediana (robusta a saltos de GPS) e marcamos
    //    velocidades grosseiramente impossíveis (> 200 km/h) como sinal de
    //    edição; velocidades altas sustentadas como atípicas para caminhada.
    if(times.length >= 2 && pts.length === times.length){
      let grossImplausible = 0, maxSpeed = 0;
      const speeds = [];
      for(let i=1;i<pts.length;i++){
        const dt = (times[i]-times[i-1])/1000; // s
        if(dt <= 0) continue;
        const d = haversineM(pts[i-1], pts[i]); // m
        const kmh = (d/dt)*3.6;
        speeds.push(kmh);
        if(kmh > maxSpeed) maxSpeed = kmh;
        if(kmh > 200) grossImplausible++;
      }
      // mediana das velocidades (descarta picos isolados de GPS)
      let median = 0;
      if(speeds.length){
        const s = speeds.slice().sort((a,b)=>a-b);
        median = s[Math.floor(s.length/2)];
      }
      if(grossImplausible > 0){
        flags.push(`${grossImplausible} trecho(s) com velocidade impossível (> 200 km/h) — forte indício de edição`);
      } else if(median > 15){
        flags.push(`velocidade mediana ~${median.toFixed(1)} km/h é alta para uma trilha a pé (esperado ~2–7 km/h)`);
      } else if(median >= 1 && median <= 12){
        positives.push(`ritmo compatível com caminhada (mediana ~${median.toFixed(1)} km/h)`);
      } else {
        positives.push(`velocidades sem saltos impossíveis (máx. ~${Math.round(maxSpeed)} km/h)`);
      }
    }

    // 4) Elevação: tracks de GPS costumam registrar altitude
    if(withEle/total >= 0.9) positives.push('altitude registrada nos pontos');
    else if(withEle === 0) flags.push('sem dados de altitude');

    // 5) Densidade/segmentos retos: poucos pontos com grandes saltos sugere
    //    desenho manual em vez de gravação contínua
    if(total < 10) flags.push(`baixa densidade de pontos (${total}) — atípico para gravação contínua`);

    // 6) Metadado do criador
    if(creator) positives.push(`gravado/exportado por: "${creator}"`);
    else flags.push('sem identificação do software/aparelho de origem (atributo "creator")');

    showTrackIntegrityReport(fileName, flags, positives);
  }catch(e){ console.warn('Falha na análise de integridade da trilha:', e); }
}

// Distância de Haversine entre [lat,lon] em metros
function haversineM(a, b){
  const R = 6371000, rad = d=>d*Math.PI/180;
  const dLat = rad(b[0]-a[0]), dLon = rad(b[1]-a[1]);
  const s = Math.sin(dLat/2)**2 + Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}

// Exibe um aviso ao usuário com o resultado da análise de autenticidade.
// Armazena o relatório de integridade da trilha para ser exibido como ícone/
// badge no painel de camadas importadas. A chave é o nome do arquivo.
const _trackReports = {};

function showTrackIntegrityReport(fileName, flags, positives){
  const authentic = flags.length === 0;
  _trackReports[fileName] = { authentic, flags, positives, kind:'gpx', fileName };
}

// Localiza o relatório de integridade correspondente a uma camada do painel.
// O nome da camada pode ter sufixos (".shp", "(camada N)"), então tentamos
// correspondência exata e depois por prefixo do nome base.
function findTrackReport(layerName){
  if(!layerName) return null;
  if(_trackReports[layerName]) return _trackReports[layerName];
  const base = layerName.replace(/\s*\(.*?\)\s*/g,'').replace(/\.(shp|gpx|kml|kmz|zip|geojson|json)$/i,'').trim().toLowerCase();
  for(const key in _trackReports){
    const kb = key.replace(/\.(shp|gpx|kml|kmz|zip|geojson|json)$/i,'').trim().toLowerCase();
    if(kb === base || kb.startsWith(base) || base.startsWith(kb)) return _trackReports[key];
  }
  return null;
}

// Abre um modal com o relatório completo de integridade da trilha.
// Abre o Esri World Imagery Wayback em nova aba, centralizado na posição e
// zoom atuais do mapa. O Wayback exibe o histórico de versões da imagem de
// satélite (datas de publicação) — gratuito e sem necessidade de login para
// consulta. Formato do hash: mapCenter=lon,lat,zoom (mesmo padrão que o app
// usa ao compartilhar a visualização).
function openWayback(key){
  const m = maps[key];
  if(!m) return;
  const c = m.getCenter();
  const z = Math.round(m.getZoom());
  const url = `https://livingatlas.arcgis.com/wayback/#mapCenter=${c.lng.toFixed(5)}%2C${c.lat.toFixed(5)}%2C${z}`;
  window.open(url, '_blank', 'noopener');
}

// Exibe um modal com informações sobre o sistema de referência (EPSG) usado.
// Seção "Coordenadas exibidas" do popup EPSG, conforme o formato do rodapé
function _epsgSecaoExibidas(key){
  if(coordFmt==='geo') return `<table class="epsg-table">
          <tr><td>Código</td><td><b>EPSG:4326</b></td></tr>
          <tr><td>Nome</td><td>WGS 84 (World Geodetic System 1984)</td></tr>
          <tr><td>Tipo</td><td>Geográfico (latitude / longitude)</td></tr>
          <tr><td>Unidade</td><td>Graus decimais</td></tr>
        </table>`;
  const ll=_lastCoordLL[key] || (maps[key] ? maps[key].getCenter() : L.latLng(-15.8,-47.9));
  const u=_utmInfo(ll.lat, ll.lng);
  return `<table class="epsg-table">
          <tr><td>Código</td><td><b>${u.epsg?'EPSG:'+u.epsg:'—'}</b></td></tr>
          <tr><td>Nome</td><td>SIRGAS 2000 / UTM zone ${u.zone}${u.south?'S':'N'}</td></tr>
          <tr><td>Tipo</td><td>Projetado (UTM — Universal Transversa de Mercator)</td></tr>
          <tr><td>Unidade</td><td>Metros (E, N)</td></tr>
          <tr><td>Fuso</td><td>Automático: o do ponto sob o cursor (atual: ${u.zone}${u.letter})</td></tr>
        </table>`;
}
function openEpsgPopup(key){
  const old = document.getElementById('epsg-modal');
  if(old) old.remove();
  const modal = document.createElement('div');
  modal.id = 'epsg-modal';
  modal.className = 'track-modal-overlay';
  modal.innerHTML = `
    <div class="track-modal" role="dialog" aria-modal="true">
      <div class="track-modal-hdr">
        <span class="track-modal-title">🌐 Sistema de Referência (EPSG)</span>
        <button type="button" class="track-modal-close" aria-label="Fechar">✕</button>
      </div>
      <div class="track-sec">
        <div class="track-sec-lbl">Coordenadas exibidas</div>
        ${_epsgSecaoExibidas(key)}
      </div>
      <div class="track-sec">
        <div class="track-sec-lbl">Projeção do mapa base</div>
        <table class="epsg-table">
          <tr><td>Código</td><td><b>EPSG:3857</b></td></tr>
          <tr><td>Nome</td><td>WGS 84 / Pseudo-Mercator (Web Mercator)</td></tr>
          <tr><td>Uso</td><td>Renderização dos tiles (OpenStreetMap, Esri)</td></tr>
        </table>
      </div>
      <div class="track-concl">
        O Datum oficial do Brasil é o <b>SIRGAS2000 (EPSG:4674)</b>, que é praticamente coincidente com o
        WGS 84 (EPSG:4326) — a diferença entre eles é da ordem de centímetros,  desprezível para a maioria das aplicações de mapeamento. 
        As coordenadas exibidas neste WebSIG podem ser usadas diretamente como SIRGAS2000.
      </div>
    </div>`;
  document.body.appendChild(modal);
  const close = ()=>modal.remove();
  modal.querySelector('.track-modal-close').addEventListener('click', close);
  modal.addEventListener('click', e=>{ if(e.target===modal) close(); });
  document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ close(); document.removeEventListener('keydown', esc); } });
}

function openTrackReportModal(report){
  if(!report) return;
  const old = document.getElementById('track-report-modal');
  if(old) old.remove();

  const statusTxt = report.authentic
    ? '✅ Indícios de AUTENTICIDADE'
    : (report.limited ? '🛈 Verificação LIMITADA' : '⚠️ Possíveis ALTERAÇÕES');
  const statusCls = report.authentic ? 'tr-ok' : (report.limited ? 'tr-info' : 'tr-warn');

  const posList = (report.positives||[]).map(p=>`<li>${escHtml(p)}</li>`).join('');
  const flagList = (report.flags||[]).map(f=>`<li>${escHtml(f)}</li>`).join('');

  const concl = report.authentic
    ? 'A trilha apresenta as características típicas de uma gravação de GNSS original (percurso a pé).'
    : (report.limited
        ? 'A conversão para Shapefile descartou os metadados de gravação (tempo, velocidade), o que impede confirmar a autenticidade. Para verificação completa, importe o arquivo GPX original.'
        : 'Os pontos de atenção sugerem que o arquivo pode ter sido editado ou não corresponde a uma gravação contínua de GNSS.');

  const modal = document.createElement('div');
  modal.id = 'track-report-modal';
  modal.className = 'track-modal-overlay';
  modal.innerHTML = `
    <div class="track-modal" role="dialog" aria-modal="true">
      <div class="track-modal-hdr">
        <span class="track-modal-title">Análise de integridade da trilha</span>
        <button type="button" class="track-modal-close" aria-label="Fechar">✕</button>
      </div>
      <div class="track-modal-file">📄 ${escHtml(report.fileName)}</div>
      <div class="track-status ${statusCls}">${statusTxt}</div>
      ${posList ? `<div class="track-sec"><div class="track-sec-lbl">Indícios favoráveis</div><ul class="track-pos">${posList}</ul></div>` : ''}
      ${flagList ? `<div class="track-sec"><div class="track-sec-lbl">Pontos de atenção</div><ul class="track-flag">${flagList}</ul></div>` : ''}
      <div class="track-concl">${escHtml(concl)}</div>
      <div class="track-note">Observação: esta é uma análise de plausibilidade. Arquivos GPX/SHP não possuem assinatura digital, portanto não é possível comprovar com certeza absoluta se houve alteração.</div>
    </div>`;
  document.body.appendChild(modal);
  const close = ()=>modal.remove();
  modal.querySelector('.track-modal-close').addEventListener('click', close);
  modal.addEventListener('click', e=>{ if(e.target===modal) close(); });
  document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ close(); document.removeEventListener('keydown', esc); } });
}

// ── Leitura de Shapefile (pasta com .shp/.dbf/.shx/.prj) ──
async function handleGeoFolder(key, files, map, layersControl){
  const arr = Array.from(files);
  if(!arr.length) return;

  const totalSize = arr.reduce((s,f)=>s+f.size,0);
  if(totalSize > MAX_GEO_FILE_MB*1024*1024){
    alert(`A pasta excede o limite de ${MAX_GEO_FILE_MB} MB.`);
    return;
  }

  // Agrupa por nome base (sem extensão) para detectar conjuntos shapefile
  const groups = {};
  arr.forEach(f=>{
    const m = f.name.match(/(?:^|\/)([^\/]+)\.(shp|shx|dbf|prj|cpg)$/i);
    if(!m) return;
    const base = m[1], ext = m[2].toLowerCase();
    groups[base] = groups[base] || {};
    groups[base][ext] = f;
  });

  const baseNames = Object.keys(groups);
  if(!baseNames.length){
    alert('Nenhum arquivo .shp encontrado na pasta selecionada.');
    return;
  }

  showLayerLoading(key);
  try{
    for(const base of baseNames){
      const set = groups[base];
      const missing = [];
      if(!set.shp) missing.push('.shp');
      if(!set.dbf) missing.push('.dbf');
      if(!set.shx) missing.push('.shx');
      if(missing.length){
        alert(`O conjunto "${base}" está incompleto. Componentes faltando: ${missing.join(', ')}.`);
        continue;
      }
      // Monta um .zip em memória com os componentes e usa o MESMO caminho do
      // import por .zip (shp(buffer)). Isso garante tratamento idêntico de
      // todas as geometrias (ponto, linha, polígono) e da reprojeção via .prj,
      // evitando divergências entre os modos "pasta" e ".zip".
      try{
        const zip = new JSZip();
        // Usa os bytes brutos (Uint8Array) sem compressão (STORE) para evitar
        // qualquer alteração nos dados binários do shapefile, garantindo que o
        // shpjs leia exatamente como leria de um .zip gerado por um SIG.
        zip.file(base+'.shp', new Uint8Array(await set.shp.arrayBuffer()));
        zip.file(base+'.dbf', new Uint8Array(await set.dbf.arrayBuffer()));
        zip.file(base+'.shx', new Uint8Array(await set.shx.arrayBuffer()));
        if(set.prj) zip.file(base+'.prj', new Uint8Array(await set.prj.arrayBuffer()));
        if(set.cpg) zip.file(base+'.cpg', new Uint8Array(await set.cpg.arrayBuffer()));
        const zipBuf = await zip.generateAsync({type:'arraybuffer', compression:'STORE'});
        let geojson = await shp(zipBuf);
        const collections = Array.isArray(geojson) ? geojson : [geojson];
        let prjText = null;
        if(set.prj){ try{ prjText = await set.prj.text(); }catch(e){} }
        let added = 0;
        collections.forEach((gj, i)=>{
          if(!gj || !gj.features || !gj.features.length) return;
          sanitizeAndReproject(gj, prjText, base);
          const nm = collections.length>1 ? `${base} (${gj.fileName||('camada '+(i+1))}).shp` : base+'.shp';
          addGeoJSONToMap(key, gj, nm, map, layersControl);
          added++;
        });
        if(!added) alert(`O shapefile "${base}" não contém feições válidas.`);
      }catch(err){
        console.error(err);
        alert(`Erro ao processar o shapefile "${base}": ${err.message}`);
        continue;
      }
    }
  }catch(err){
    console.error(err);
    alert('Erro ao processar o shapefile: '+err.message);
  }finally{
    setTimeout(()=>hideLayerLoading(key), 400);
  }
}

// ════════════════════════════════════════
//  NAVEGAÇÃO
// ════════════════════════════════════════
function go(screen){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+screen).classList.add('active');
  if(screen==='converter'&&convCount===0) addConvRow();
  if(screen==='informar' &&infCount===0)  addInfRow();
  setTimeout(()=>{
    if(screen==='converter'&&document.getElementById('conv-split').style.display!=='none'){buildMap('map-conv','conv');maps.conv&&maps.conv.invalidateSize();}
    if(screen==='informar' &&document.getElementById('inf-split').style.display!=='none') {buildMap('map-inf','inf'); maps.inf&&maps.inf.invalidateSize();}
    if(screen==='extrair'  &&document.getElementById('ext-split').style.display!=='none') {buildMap('map-ext','ext');maps.ext&&maps.ext.invalidateSize();}
  },80);
}

// ════════════════════════════════════════
//  EXPORT KML
// ════════════════════════════════════════
function downloadKML(data, fname){
  if(!data||!data.length){alert('Nenhum ponto para exportar.');return;}
  const xe=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const pts=data.map((p,i)=>`  <Placemark>\n    <name>${xe(p.name||'Ponto '+(i+1))}</name>\n    <Point><coordinates>${p.lon},${p.lat},0</coordinates></Point>\n  </Placemark>`).join('\n');
  saveBlob(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n  <name>${xe(fname)}</name>\n${pts}\n</Document>\n</kml>`],{type:'application/vnd.google-earth.kml+xml'}),fname+'.kml');
}

// ════════════════════════════════════════
//  EXPORT SHAPEFILE
// ════════════════════════════════════════
async function downloadSHP(data, fname){
  if(!data||!data.length){alert('Nenhum ponto para exportar.');return;}
  const n=data.length,REC=28,FL=60,RL=1+FL,HS=65;
  const sl=100+n*REC,sv=new DataView(new ArrayBuffer(sl));
  wHdr(sv,sl,data);
  for(let i=0;i<n;i++){const o=100+i*REC;sv.setInt32(o,i+1,false);sv.setInt32(o+4,10,false);sv.setInt32(o+8,1,true);sv.setFloat64(o+12,data[i].lon,true);sv.setFloat64(o+20,data[i].lat,true);}
  const xl=100+n*8,xv=new DataView(new ArrayBuffer(xl));
  wHdr(xv,xl,data);
  for(let i=0;i<n;i++){xv.setInt32(100+i*8,(100+i*REC)/2,false);xv.setInt32(104+i*8,10,false);}
  const dv=new DataView(new ArrayBuffer(HS+n*RL));
  const now=new Date();
  dv.setUint8(0,3);dv.setUint8(1,now.getFullYear()-1900);dv.setUint8(2,now.getMonth()+1);dv.setUint8(3,now.getDate());
  dv.setInt32(4,n,true);dv.setInt16(8,HS,true);dv.setInt16(10,RL,true);
  wStr(dv,32,'NAME');dv.setUint8(43,'C'.charCodeAt(0));dv.setUint8(48,FL);dv.setUint8(64,0x0D);
  for(let i=0;i<n;i++){const b=HS+i*RL;dv.setUint8(b,0x20);wStr(dv,b+1,String(data[i].name||'Ponto '+(i+1)).substring(0,FL).padEnd(FL,' '));}
  const prj='GEOGCS["SIRGAS 2000",DATUM["Sistema_de_Referencia_Geocentrico_para_las_AmericaS_2000",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
  const zip=new JSZip();
  zip.file(fname+'.shp',sv.buffer);zip.file(fname+'.shx',xv.buffer);zip.file(fname+'.dbf',dv.buffer);zip.file(fname+'.prj',prj);
  saveBlob(await zip.generateAsync({type:'blob'}),fname+'_shapefile.zip');
}
function wHdr(dv,bl,data){
  dv.setInt32(0,9994,false);dv.setInt32(24,bl/2,false);dv.setInt32(28,1000,true);dv.setInt32(32,1,true);
  const lo=data.map(p=>p.lon),la=data.map(p=>p.lat);
  dv.setFloat64(36,Math.min(...lo),true);dv.setFloat64(44,Math.min(...la),true);
  dv.setFloat64(52,Math.max(...lo),true);dv.setFloat64(60,Math.max(...la),true);
}
function wStr(dv,o,s){for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));}
function saveBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}

// ════════════════════════════════════════
//  LIGAR PONTOS (coluna 🔗 das tabelas)
// ════════════════════════════════════════
// O usuário marca pontos na tabela; cada ponto marcado é destacado no mapa e
// uma linha é traçada ligando-os NA ORDEM DE SELEÇÃO. Serve para visualizar
// uma linha ou o contorno de um polígono de interesse.
const pointLinkSel = {conv:[], ext:[], inf:[]};   // índices na ordem de seleção
const pointLinkLayers = {conv:null, ext:null, inf:null}; // {line, rings[]}

function togglePointLink(key, idx, cb){
  const sel = pointLinkSel[key];
  if(cb.checked){
    if(!sel.includes(idx)) sel.push(idx);
  } else {
    const p = sel.indexOf(idx);
    if(p >= 0) sel.splice(p, 1);
  }
  redrawPointLink(key);
}

function redrawPointLink(key){
  const m = maps[key];
  if(!m) return;
  // remove renderização anterior
  const old = pointLinkLayers[key];
  if(old){
    try{ if(old.line) m.removeLayer(old.line); }catch(e){}
    (old.rings||[]).forEach(r=>{ try{ m.removeLayer(r); }catch(e){} });
  }
  pointLinkLayers[key] = null;

  const data = _exportDataFor(key);
  const pts = pointLinkSel[key].map(i=>data[i]).filter(Boolean);
  if(!pts.length){
    // seleção esvaziada: ainda assim atualiza o botão/painel de medição
    updateAreaButton(key);
    const p0 = document.getElementById('area-'+key);
    if(p0 && p0.classList.contains('open')) buildAreaPanelList(key);
    return;
  }

  const rings = pts.map(p => L.circleMarker([p.lat, p.lon], {
    radius:11, color:'#ffb020', weight:3, fill:false, interactive:false
  }).addTo(m));

  let line = null;
  if(pts.length >= 2){
    line = L.polyline(pts.map(p=>[p.lat, p.lon]), {
      color:'#ffb020', weight:3, dashArray:'6 4', interactive:false
    }).addTo(m);
  }
  pointLinkLayers[key] = {line, rings};
  // Habilita/atualiza a ferramenta "Área e comprimento" conforme a ligação
  // passa a formar (ou deixa de formar) um polígono.
  updateAreaButton(key);
  const panel = document.getElementById('area-'+key);
  if(panel && panel.classList.contains('open')) buildAreaPanelList(key);
}

// Limpa a seleção de ligação (chamado quando a tabela é recriada/limpa)
function resetPointLink(key){
  pointLinkSel[key] = [];
  redrawPointLink(key);
}

// Retorna o anel do polígono formado pelos pontos ligados, se houver ao menos
// 3 pontos DISTINTOS (o fechamento é automático; se o usuário repetiu o
// primeiro ponto no final, a duplicata é ignorada). Formato: [[lon,lat],...]
// fechado (último == primeiro). Retorna null se não formar polígono.
// Analisa a cadeia de pontos ligados (coluna 🔗) e classifica:
// - FECHADA (polígono): o ÚLTIMO ponto selecionado tem as mesmas coordenadas
//   do PRIMEIRO (o usuário fechou a ligação), com pelo menos 3 vértices
//   distintos → mede ÁREA e perímetro.
// - ABERTA (linha): 2+ pontos sem fechamento → mede apenas o COMPRIMENTO.
// Retorna null (menos de 2 pontos) ou {coords:[[lon,lat]...], closed:bool}.
// Para cadeia fechada, coords é o anel fechado (último == primeiro).
function linkedChainInfo(key){
  const data = _exportDataFor(key);
  const raw = pointLinkSel[key].map(i=>data[i]).filter(Boolean).map(p=>[p.lon, p.lat]);
  if(raw.length < 2) return null;
  // fechamento explícito: último ponto selecionado == primeiro
  const closedByUser = raw.length >= 4 &&
    raw[0][0] === raw[raw.length-1][0] && raw[0][1] === raw[raw.length-1][1];
  // remove duplicatas consecutivas (mantendo a ordem)
  let pts = raw.filter((p,i)=> i===0 || p[0]!==raw[i-1][0] || p[1]!==raw[i-1][1]);
  if(closedByUser){
    // pts termina no primeiro (duplicado) — remove p/ contar vértices distintos
    if(pts.length>=2 && pts[0][0]===pts[pts.length-1][0] && pts[0][1]===pts[pts.length-1][1]){
      pts = pts.slice(0,-1);
    }
    if(pts.length < 3) return {coords: pts, closed:false}; // degenerado: trata como linha
    return {coords: [...pts, pts[0]], closed:true};
  }
  if(pts.length < 2) return null;
  return {coords: pts, closed:false};
}

// Calcula e exibe as medidas da cadeia de pontos ligados:
// polígono fechado → área + perímetro; linha aberta → comprimento.
function selectLinkedFeature(key){
  const info = linkedChainInfo(key);
  const res = document.getElementById('aresult-'+key);
  const hint = document.getElementById('ahint-'+key);
  if(!info || !res) return;
  document.querySelectorAll(`#area-${key} .area-layer-btn`).forEach(b=>b.classList.remove('active'));
  const btn = document.getElementById(`linkedpoly-btn-${key}`);
  if(btn) btn.classList.add('active');

  if(info.closed){
    const ring = info.coords;
    const gj = {type:'FeatureCollection', features:[{type:'Feature', properties:{}, geometry:{type:'Polygon', coordinates:[ring]}}]};
    const a = fmtArea(geojsonAreaM2(gj));
    const perim = geojsonLengthM({features:[{geometry:{type:'LineString', coordinates:ring}}]});
    const pTxt = perim.toLocaleString('pt-BR',{maximumFractionDigits:1});
    const pKm  = (perim/1000).toLocaleString('pt-BR',{maximumFractionDigits:3});
    if(hint) hint.textContent = `Polígono FECHADO pelos ${ring.length-1} pontos ligados:`;
    res.innerHTML = `
      <div class="area-result-row"><span>Metros quadrados</span><b>${a.m2} m²</b></div>
      <div class="area-result-row"><span>Quilômetros quadrados</span><b>${a.km2} km²</b></div>
      <div class="area-result-row"><span>Hectares</span><b>${a.ha} ha</b></div>
      <div class="area-result-row"><span>Perímetro</span><b>${pTxt} m (${pKm} km)</b></div>`;
  } else {
    const len = geojsonLengthM({features:[{geometry:{type:'LineString', coordinates: info.coords}}]});
    const mTxt  = len.toLocaleString('pt-BR',{maximumFractionDigits:1});
    const kmTxt = (len/1000).toLocaleString('pt-BR',{maximumFractionDigits:3});
    if(hint) hint.textContent = `Linha ABERTA ligando ${info.coords.length} pontos (para medir a área, feche o polígono marcando por último um ponto com as mesmas coordenadas do primeiro):`;
    res.innerHTML = `
      <div class="area-result-row"><span>Comprimento (metros)</span><b>${mTxt} m</b></div>
      <div class="area-result-row"><span>Comprimento (quilômetros)</span><b>${kmTxt} km</b></div>`;
  }
  try{
    const latlngs = info.coords.map(c=>[c[1], c[0]]);
    maps[key].fitBounds(L.latLngBounds(latlngs), {padding:[32,32]});
  }catch(e){}
}


// ════════════════════════════════════════
//  EXPORTAÇÃO UNIFICADA (menu com escolha de formato)
// ════════════════════════════════════════
// Pontos vindos de arquivos CSV importados (por tela e por arquivo), para
// que também possam ser EXPORTADOS (KML/Shapefile/GeoJSON) junto com os
// pontos das tabelas.
const csvImportedPoints = {conv:{}, ext:{}, inf:{}};
function _csvPointsFor(key){
  const byFile = csvImportedPoints[key] || {};
  return Object.values(byFile).flat();
}
function _exportDataFor(key){
  const table = key==='conv' ? convData : key==='ext' ? extData : key==='inf' ? infData : [];
  const csv = _csvPointsFor(key);
  return csv.length ? [...table, ...csv] : table;
}
function toggleExportMenu(ev, key, fname){
  ev.stopPropagation();
  const menu = document.getElementById('exportmenu-'+key);
  if(!menu) return;
  const data = _exportDataFor(key);
  if(!data || !data.length){ alert('Nenhum ponto para exportar.'); return; }
  // fecha outros menus abertos
  document.querySelectorAll('.export-menu.open').forEach(m=>{ if(m!==menu) m.classList.remove('open'); });
  const isOpen = menu.classList.contains('open');
  if(isOpen){ menu.classList.remove('open'); return; }
  menu.innerHTML = `
    <button type="button" onclick="doExport('${key}','${fname}','kml')">📄 KML (.kml)</button>
    <button type="button" onclick="doExport('${key}','${fname}','shp')">🗂️ Shapefile (.zip)</button>
    <button type="button" onclick="doExport('${key}','${fname}','geojson')">🌐 GeoJSON (.geojson)</button>
    <button type="button" onclick="doExport('${key}','${fname}','csv')">📊 Planilha CSV (.csv)</button>
  `;
  menu.classList.add('open');
}
function doExport(key, fname, fmt){
  const data = _exportDataFor(key);
  const menu = document.getElementById('exportmenu-'+key);
  if(menu) menu.classList.remove('open');
  if(!data || !data.length){ alert('Nenhum ponto para exportar.'); return; }
  if(fmt==='kml')      downloadKML(data, fname);
  else if(fmt==='shp') downloadSHP(data, fname);
  else if(fmt==='geojson') downloadGeoJSON(data, fname);
  else if(fmt==='csv') downloadPointsCSV(data, fname, key);
}
// CSV no padrão brasileiro (separador ";", vírgula decimal, UTF-8 com BOM):
// abre direto no Excel/LibreOffice e pode ser reimportado no próprio CheckLic
// (botão "Importar arquivo geoespacial"). Inclui lat/long, UTM e — nas fotos —
// altitude, data/hora e a origem da coordenada.
function downloadPointsCSV(data, fname, key){
  if(!data||!data.length){alert('Nenhum ponto para exportar.');return;}
  const dec=(v,d)=> (v===''||v==null||!isFinite(+v)) ? '' : Number(v).toFixed(d).replace('.',',');
  const esc=v=>{ const s=String(v==null?'':v); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
  const fotos = key==='ext';
  const cab=['nome','latitude','longitude','zona_utm','utm_e','utm_n'];
  if(fotos) cab.push('altitude_m','data_hora','origem_coordenada');
  const origemTxt={exif:'GPS (metadados)', ocr:'Texto impresso na foto', editado:'Editado manualmente'};
  const linhas=data.map((p,i)=>{
    let E=p.E, N=p.N, zona=p.zona;
    if(!isFinite(+E)||!isFinite(+N)||!zona){ const u=geoToUTM(p.lat,p.lon); E=u.E; N=u.N; zona=`${u.zone}${u.letter}`; }
    const l=[p.name||('Ponto '+(i+1)), dec(p.lat,8), dec(p.lon,8), zona, dec(E,2), dec(N,2)];
    if(fotos){
      const origem = p.editado ? origemTxt.editado : (origemTxt[p.origem] || (p.origem?p.origem:'Arquivo importado'));
      l.push(p.alt!==''&&p.alt!=null ? dec(p.alt,1) : '', p.dtFmt||'', origem);
    }
    return l;
  });
  const csv='\uFEFF'+[cab,...linhas].map(l=>l.map(esc).join(';')).join('\r\n');
  saveBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}), fname+'.csv');
}
function downloadGeoJSON(data, fname){
  if(!data||!data.length){alert('Nenhum ponto para exportar.');return;}
  const fc = {
    type:'FeatureCollection',
    features: data.map((p,i)=>({
      type:'Feature',
      properties:{ nome: p.name || ('Ponto '+(i+1)) },
      geometry:{ type:'Point', coordinates:[p.lon, p.lat] }
    }))
  };
  saveBlob(new Blob([JSON.stringify(fc,null,2)],{type:'application/geo+json'}), fname+'.geojson');
}
// Fecha o menu de exportação ao clicar fora
document.addEventListener('click', e=>{
  if(e.target.closest && e.target.closest('.export-wrap')) return;
  document.querySelectorAll('.export-menu.open').forEach(m=>m.classList.remove('open'));
});

// ════════════════════════════════════════
//  TELA 1 — CONVERTER
// ════════════════════════════════════════
let convCount=0, convData=[];


// ── Normalização de números COLADOS nos campos E/N ──
// Ao colar valores como "534.000", "9.350.000" ou "193.109,55", os separadores
// de milhar são removidos e a vírgula decimal vira ponto — o usuário não
// precisa conferir a formatação antes de colar.
function normalizeNumStr(txt){
  txt = String(txt||'').trim().replace(/\s+/g,'');
  const hasDot = txt.includes('.'), hasComma = txt.includes(',');
  if(hasDot && hasComma){
    // pt-BR completo: pontos = milhar, vírgula = decimal
    return txt.replace(/\./g,'').replace(',', '.');
  }
  if(hasComma){
    const parts = txt.split(',');
    // uma vírgula com 3 dígitos após = milhar; caso contrário = decimal
    if(parts.length === 2 && parts[1].length !== 3) return parts.join('.');
    return parts.join('');
  }
  if(hasDot){
    const parts = txt.split('.');
    // um ponto com 1-2 dígitos após = decimal (mantém); demais casos = milhar
    if(parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) return txt;
    return parts.join('');
  }
  return txt;
}
// Intercepta o "colar" nos campos E/N (Converter e Informar), em fase de
// captura — funciona também nas linhas criadas dinamicamente.
document.addEventListener('paste', function(e){
  const t = e.target;
  if(!t || t.tagName !== 'INPUT') return;
  if(!/^(conv|inf)-(e|n)-\d+$/.test(t.id || '')) return;
  const raw = (e.clipboardData || window.clipboardData).getData('text');
  if(!raw) return;
  e.preventDefault();
  const clean = normalizeNumStr(raw);
  t.value = clean;
  t.dispatchEvent(new Event('input', {bubbles:true}));
}, true);

// ── Pré-preenchimento automático de novas entradas ──
// Copia Fuso e Zona (letra) da PRIMEIRA entrada preenchida; para o Nome do
// ponto (tela Informar), numera automaticamente a partir do nome da primeira
// entrada (ex.: "p1" → "p2", "p3"; "Vistoria" → "Vistoria 2", "Vistoria 3").
function prefillFromFirst(prefix, id, withName){
  // localiza a primeira linha existente (a de menor índice ainda presente)
  let firstId = null;
  for(let i=1; i<id; i++){
    if(document.getElementById(`${prefix}-z-${i}`)){ firstId = i; break; }
  }
  if(firstId === null) return; // esta é a primeira linha
  const zEl = document.getElementById(`${prefix}-z-${firstId}`);
  const lEl = document.getElementById(`${prefix}-l-${firstId}`);
  if(zEl && zEl.value) document.getElementById(`${prefix}-z-${id}`).value = zEl.value;
  if(lEl && lEl.value) document.getElementById(`${prefix}-l-${id}`).value = lEl.value;
  if(withName){
    const nmFirst = document.getElementById(`${prefix}-nm-${firstId}`);
    const nmNew = document.getElementById(`${prefix}-nm-${id}`);
    if(nmFirst && nmNew && nmFirst.value.trim()){
      const base = nmFirst.value.trim();
      // quantas linhas existem antes desta (para numerar em sequência)
      let count = 0;
      for(let i=1; i<id; i++) if(document.getElementById(`${prefix}-nm-${i}`)) count++;
      const m = base.match(/^(.*?)(\d+)\s*$/);
      nmNew.value = m ? (m[1] + (parseInt(m[2],10) + count)) : `${base} ${count+1}`;
    }
  }
}

function addConvRow(){
  convCount++;const id=convCount,div=document.createElement('div');
  div.className='coord-row';div.id=`conv-row-${id}`;
  div.innerHTML=`
    <div class="coord-idx">${id}</div>
    <div class="coord-field f-zone"><label>Fuso (Nº)</label><input type="number" min="1" max="60" placeholder="ex: 23" id="conv-z-${id}"></div>
    <div class="coord-field f-letra"><label>Zona (Letra)</label><select id="conv-l-${id}"><option value="">--</option>${letraOpts()}</select></div>
    <div class="coord-field f-en"><label>Este (E) - 6 dígitos</label><input type="number" step="0.01" placeholder="ex: 193109.55" id="conv-e-${id}"></div>
    <div class="coord-field f-en"><label>Norte (N) - 7 dígitos</label><input type="number" step="0.01" placeholder="ex: 8251130.47" id="conv-n-${id}"></div>
    <button class="btn-rm" onclick="removeEl('conv-row-${id}')">✕</button>`;
  document.getElementById('conv-rows').appendChild(div);
  prefillFromFirst('conv', id, false); // copia Fuso/Zona da 1ª entrada
}

function convConvert(){
  convData=[];resetPointLink('conv');document.getElementById('conv-tbody').innerHTML='';let found=0;
  for(let i=1;i<=convCount;i++){
    const eEl=document.getElementById(`conv-e-${i}`);if(!eEl)continue;
    const E=parseFloat(eEl.value),N=parseFloat(document.getElementById(`conv-n-${i}`).value);
    const Z=parseInt(document.getElementById(`conv-z-${i}`).value);
    const L=document.getElementById(`conv-l-${i}`).value||'K';
    if(isNaN(E)||isNaN(N)||!Z)continue;
    const geo=utmToGeo(E,N,Z,L);if(!geo)continue;
    found++;convData.push({name:`Ponto ${found}`,lat:geo.lat,lon:geo.lon,E,N,zona:`${Z}${L}`});
    const tr=document.createElement('tr');tr.dataset.idx=found-1;
    tr.innerHTML=`<td class="td-link"><input type="checkbox" class="pt-link-cb" title="Ligar este ponto" onclick="event.stopPropagation()" onchange="togglePointLink('conv',${found-1},this)"></td><td>${found}</td><td><span class="zona-pill">${Z}${L}</span></td><td>${coordCell(geo.lat)}</td><td>${coordCell(geo.lon)}</td>`;
    document.getElementById('conv-tbody').appendChild(tr);
  }
  if(!found){alert('Preencha pelo menos uma linha completa (Fuso, Zona, E, N)');return;}
  document.getElementById('conv-cnt').textContent=found;
  document.getElementById('conv-pts-lbl').textContent=`${found} pts`;
  document.getElementById('conv-input-panel').style.display='none';
  document.getElementById('conv-split').style.display='flex';
  buildMap('map-conv','conv');
  setTimeout(()=>{
    clearMarkers('conv');const bounds=[];
    convData.forEach((p,i)=>{addMarker('conv',p.lat,p.lon,p.name,i+1,{zona:p.zona,E:p.E,N:p.N});bounds.push([p.lat,p.lon]);});
    fitMap('conv',bounds);
    document.querySelectorAll('#conv-tbody tr').forEach(tr=>{
      tr.addEventListener('click',()=>{
        document.querySelectorAll('#conv-tbody tr').forEach(t=>t.classList.remove('selected'));
        tr.classList.add('selected');
        const p=convData[parseInt(tr.dataset.idx)];
        if(p&&maps.conv)maps.conv.setView([p.lat,p.lon],15);
        const mk=mkrs.conv[parseInt(tr.dataset.idx)];if(mk)mk.openPopup();
      });
    });
  },300);
}
function showConvInput(){document.getElementById('conv-split').style.display='none';document.getElementById('conv-input-panel').style.display='block';}
function clearConverter(){
  convCount=0;convData=[];resetPointLink('conv');
  document.getElementById('conv-rows').innerHTML='';document.getElementById('conv-tbody').innerHTML='';
  document.getElementById('conv-split').style.display='none';document.getElementById('conv-input-panel').style.display='block';
  clearMarkers('conv');
  clearUploadedLayers('conv');
  if(typeof clearMeasure==='function') clearMeasure('conv');
  addConvRow();
}

// ════════════════════════════════════════
//  TELA 2 — EXTRAIR
// ════════════════════════════════════════
let extData=[];
function setExtMode(mode){
  document.getElementById('tb-arquivo').classList.toggle('active',mode==='arquivo');
  document.getElementById('tb-pasta').classList.toggle('active',mode==='pasta');
  const fi=document.getElementById('ext-file-input'),btn=document.querySelector('#ext-dz .btn');
  if(mode==='pasta'){fi.removeAttribute('multiple');fi.setAttribute('webkitdirectory','');fi.setAttribute('directory','');document.getElementById('ext-dz-title').textContent='Arraste a pasta aqui';btn.textContent='Selecionar pasta';}
  else{fi.removeAttribute('webkitdirectory');fi.removeAttribute('directory');fi.setAttribute('multiple','');document.getElementById('ext-dz-title').textContent='Arraste as fotos aqui';btn.textContent='Selecionar arquivos';}
}
const extDz=document.getElementById('ext-dz');
extDz.addEventListener('dragover',e=>{e.preventDefault();extDz.classList.add('drag-over');});
extDz.addEventListener('dragleave',()=>extDz.classList.remove('drag-over'));
extDz.addEventListener('drop',e=>{
  e.preventDefault();extDz.classList.remove('drag-over');
  const items = e.dataTransfer.items;
  const fallbackFiles = e.dataTransfer.files; // capturado sincronamente, sempre disponível
  if(items && items.length && items[0].webkitGetAsEntry){
    // Captura as entries SINCRONAMENTE — o DataTransfer fica inválido após o evento
    const entries = [];
    for(let i=0;i<items.length;i++){
      const entry = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
      if(entry) entries.push(entry);
    }
    // A API de entries pode não funcionar (ex: páginas abertas via file://).
    // Usa um timeout para não travar silenciosamente: se não resolver a tempo,
    // recorre à lista simples de arquivos (fallbackFiles).
    let settled = false;
    const timeout = setTimeout(()=>{
      if(settled) return;
      settled = true;
      handleExtFiles(fallbackFiles);
    }, 1500);
    Promise.all(entries.map(readEntry)).then(arrs=>{
      if(settled) return;
      settled = true;
      clearTimeout(timeout);
      const files = arrs.flat();
      if(!files.length && fallbackFiles.length){ handleExtFiles(fallbackFiles); return; }
      handleExtFiles(files);
    }).catch(()=>{
      if(settled) return;
      settled = true;
      clearTimeout(timeout);
      handleExtFiles(fallbackFiles);
    });
  } else {
    handleExtFiles(fallbackFiles);
  }
});
document.getElementById('ext-file-input').addEventListener('change',e=>handleExtFiles(e.target.files));

// ── Suporte a arrastar pastas: percorre a árvore via webkitGetAsEntry ──
function readEntry(entry){
  return new Promise(resolve=>{
    if(entry.isFile){
      entry.file(file=>resolve([file]), ()=>resolve([]));
    } else if(entry.isDirectory){
      const reader = entry.createReader();
      const all = [];
      const readBatch = ()=>{
        reader.readEntries(batch=>{
          if(!batch.length){
            Promise.all(all.map(readEntry)).then(arrs=>resolve(arrs.flat()));
            return;
          }
          all.push(...batch);
          readBatch();
        }, ()=>resolve([]));
      };
      readBatch();
    } else {
      resolve([]);
    }
  });
}

const IMG_EXT=/\.(jpe?g|tiff?|heic|heif|webp|png)$/i;
async function handleExtFiles(files){
  const imgs=Array.from(files).filter(f=>IMG_EXT.test(f.name));
  if(!imgs.length){alert('Nenhuma imagem suportada encontrada.');return;}
  extData=[];resetPointLink('ext');clearMarkers('ext');
  const pw=document.getElementById('ext-progress'),pf=document.getElementById('ext-fill'),pl=document.getElementById('ext-label');
  pw.style.display='block';let withGPS=0,withoutGPS=0,viaOCR=0;
  const ocrState={failed:false, warned:false};
  try{
    for(let i=0;i<imgs.length;i++){
      pf.style.width=`${Math.round((i/imgs.length)*100)}%`;
      const base=`Processando ${i+1} de ${imgs.length}: ${imgs[i].name}`;
      pl.textContent=base;
      let row=null;
      try{
        row=await readGPS(imgs[i], msg=>{ pl.textContent=`${base} — ${msg}`; }, ocrState);
      }catch(err){
        console.warn('[GeoTools] Falha ao processar', imgs[i].name, err);
        row=null;
      }
      if(row){extData.push(row);withGPS++;if(row.origem==='ocr')viaOCR++;}else withoutGPS++;
    }
  }finally{
    // Libera o leitor de texto (OCR) ao final do lote para devolver memória
    terminateOcrWorker();
  }
  pf.style.width='100%';pl.textContent='✔ Concluído';
  if(ocrState.failed && withoutGPS){
    setTimeout(()=>alert('Algumas fotos não têm GPS nos metadados e o leitor de texto (OCR) não pôde ser carregado para ler as coordenadas impressas na imagem.\n\nVerifique a conexão com a internet (o leitor é baixado de cdn.jsdelivr.net na primeira utilização) e tente novamente.'),750);
  }
  setTimeout(()=>{pw.style.display='none';showExtResults(withGPS,withoutGPS,viaOCR);},700);
}

// Lê a posição da foto: 1º pelos metadados EXIF (GPS); se não houver, tenta
// ler as coordenadas IMPRESSAS na imagem (carimbo de apps como TimePhoto,
// Timestamp Camera, GPS Map Camera, NoteCam…) por reconhecimento de texto.
async function readGPS(file, onStatus, ocrState){
  let row=null;
  try{ row=await withTimeout(readExifGPS(file), 10000, null); }
  catch(e){ console.warn('[GeoTools] EXIF ilegível em', file.name, e); row=null; }
  if(row) return row;
  if(ocrState && ocrState.failed) return null; // OCR indisponível nesta sessão
  try{
    const r=await readStampGPS(file, onStatus);
    if(r) r.file=file; // referência ao arquivo para conferência visual no editor
    return r;
  }catch(e){
    console.warn('[GeoTools] OCR indisponível/falhou para', file.name, e);
    if(ocrState && e && e.ocrLoadFailed) ocrState.failed=true;
    return null;
  }
}

function withTimeout(promise, ms, fallback){
  return new Promise(resolve=>{
    let done=false;
    const t=setTimeout(()=>{ if(!done){ done=true; resolve(fallback); } }, ms);
    promise.then(v=>{ if(!done){ done=true; clearTimeout(t); resolve(v); } },
                 ()=>{ if(!done){ done=true; clearTimeout(t); resolve(fallback); } });
  });
}

// Leitura do GPS pelos metadados EXIF. Usa a leitura direta do arquivo binário
// (síncrona e protegida por try/catch): erros internos da biblioteca EXIF em
// arquivos atípicos não podem mais deixar o processamento "travado".
function readExifGPS(file){
  return new Promise(resolve=>{
    if(!/\.(jpe?g)$/i.test(file.name) && file.type!=='image/jpeg'){ resolve(null); return; }
    const fr=new FileReader();
    fr.onerror=()=>resolve(null);
    fr.onload=()=>{
      try{
        const tags=EXIF.readFromBinaryFile(fr.result)||{};
        const ld=tags.GPSLatitude, lr=tags.GPSLatitudeRef;
        const od=tags.GPSLongitude, or=tags.GPSLongitudeRef;
        const ar=tags.GPSAltitude, aref=tags.GPSAltitudeRef;
        const dt=tags.DateTimeOriginal||tags.DateTime||'';
        if(!ld||!od){resolve(null);return;}
        const lat=dms2dec(ld,lr),lon=dms2dec(od,or);
        if(lat===null||lon===null||!isFinite(lat)||!isFinite(lon)||(lat===0&&lon===0)){resolve(null);return;}
        const utm=geoToUTM(lat,lon);
        let alt='';if(ar!==undefined){const v=typeof ar==='object'?ar.numerator/ar.denominator:Number(ar);if(isFinite(v))alt=(aref===1?-v:v).toFixed(1);}
        let dtFmt='';
        if(dt){
          // EXIF format: "YYYY:MM:DD HH:MM:SS"
          const m=String(dt).match(/(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
          if(m) dtFmt=`${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]||'00'}`;
          else dtFmt=String(dt).substring(0,16);
        }
        resolve({name:file.name,lat,lon,E:utm.E,N:utm.N,zona:`${utm.zone}${utm.letter}`,alt,dtFmt,origem:'exif'});
      }catch(e){
        console.warn('[GeoTools] Erro ao ler EXIF de', file.name, e);
        resolve(null);
      }
    };
    fr.readAsArrayBuffer(file);
  });
}

// ══════════════════════════════════════════════════════════════════════
//  OCR — coordenadas impressas na imagem
//  O leitor (Tesseract.js) é carregado sob demanda, somente quando alguma
//  foto não tem GPS nos metadados. Todo o reconhecimento roda NO NAVEGADOR:
//  a foto não é enviada a nenhum servidor (apenas o programa de leitura e o
//  modelo de idioma são baixados do CDN na primeira utilização).
// ══════════════════════════════════════════════════════════════════════
const OCR_CFG = {
  lib:  'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  worker:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  core: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
  lang: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',
};
let _ocrWorkerPromise=null;
function loadScriptOnce(src){
  return new Promise((resolve,reject)=>{
    if(document.querySelector(`script[data-src="${src}"]`)){
      if(window.Tesseract) resolve(); else
      document.querySelector(`script[data-src="${src}"]`).addEventListener('load',()=>resolve(),{once:true});
      return;
    }
    const s=document.createElement('script');
    s.src=src; s.async=true; s.dataset.src=src;
    s.onload=()=>resolve();
    s.onerror=()=>{ s.remove(); reject(new Error('Falha ao carregar '+src)); };
    document.head.appendChild(s);
  });
}
function getOcrWorker(onStatus){
  if(!_ocrWorkerPromise){
    _ocrWorkerPromise=(async()=>{
      if(onStatus) onStatus('carregando o leitor de texto (primeira vez pode levar alguns segundos)…');
      try{
        if(!window.Tesseract) await loadScriptOnce(OCR_CFG.lib);
        const w=await Tesseract.createWorker('eng', 1, {
          workerPath:OCR_CFG.worker, corePath:OCR_CFG.core, langPath:OCR_CFG.lang,
        });
        await w.setParameters({ preserve_interword_spaces:'1' });
        return w;
      }catch(e){
        const err=new Error('Leitor de texto (OCR) indisponível: '+(e&&e.message||e));
        err.ocrLoadFailed=true;
        throw err;
      }
    })();
    _ocrWorkerPromise.catch(()=>{ _ocrWorkerPromise=null; });
  }
  return _ocrWorkerPromise;
}
function terminateOcrWorker(){
  const p=_ocrWorkerPromise; _ocrWorkerPromise=null;
  if(p) p.then(w=>{ try{ w.terminate(); }catch(e){} }).catch(()=>{});
}

// Recorta uma faixa da imagem e devolve um canvas pronto para o OCR.
//  mode 'white': isola o texto claro e pouco saturado (carimbo branco com
//               sombra) → texto preto sobre fundo branco;
//  mode 'gray' : escala de cinza com contraste reforçado (carimbos coloridos).
function stampCanvas(bitmap, region, mode, opts){
  opts = opts || {};
  const W=bitmap.width, H=bitmap.height;
  const sx=Math.round(region.x*W), sy=Math.round(region.y*H);
  const sw=Math.max(1,Math.round(region.w*W)), sh=Math.max(1,Math.round(region.h*H));
  const scale=(opts.scale||1)*Math.min(1, 1900/sw);
  const pad=opts.pad||0;
  const cw=Math.max(1,Math.round(sw*scale)), ch=Math.max(1,Math.round(sh*scale));
  const c=document.createElement('canvas'); c.width=cw+2*pad; c.height=ch+2*pad;
  const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle = mode==='white' ? '#000' : '#fff'; // borda neutra (vira branco após binarizar)
  ctx.fillRect(0,0,c.width,c.height);
  ctx.drawImage(bitmap, sx, sy, sw, sh, pad, pad, cw, ch);
  const img=ctx.getImageData(0,0,c.width,c.height), d=img.data;
  if(mode==='white'){
    const Wc=c.width, Hc=c.height, M=new Uint8Array(Wc*Hc);
    for(let i=0,j=0;i<d.length;i+=4,j++){
      const r=d[i],g=d[i+1],b=d[i+2];
      const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
      M[j] = (mn>=200 && (mx-mn)<=45) ? 1 : 0;
    }
    if(opts.despeckle){ // remove pontos isolados (reflexos, folhagem clara)
      const M2=M.slice();
      for(let y=1;y<Hc-1;y++) for(let x=1;x<Wc-1;x++){
        const k=y*Wc+x; if(!M[k]) continue;
        const n=M[k-Wc-1]+M[k-Wc]+M[k-Wc+1]+M[k-1]+M[k+1]+M[k+Wc-1]+M[k+Wc]+M[k+Wc+1];
        if(n<3) M2[k]=0;
      }
      M.set(M2);
    }
    for(let i=0,j=0;i<d.length;i+=4,j++){
      const v = M[j]?0:255;
      d[i]=d[i+1]=d[i+2]=v; d[i+3]=255;
    }
  } else {
    let lo=255,hi=0; const L=new Uint8ClampedArray(d.length/4);
    for(let i=0,j=0;i<d.length;i+=4,j++){
      const v=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; L[j]=v;
      if(v<lo)lo=v; if(v>hi)hi=v;
    }
    const span=Math.max(1,hi-lo);
    for(let i=0,j=0;i<d.length;i+=4,j++){
      const v=255-Math.round((L[j]-lo)*255/span); // inverte: texto claro vira escuro
      d[i]=d[i+1]=d[i+2]=v; d[i+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  return c;
}

// Valor mais frequente de uma lista (empate → o primeiro que apareceu).
function _maisFrequente(vals){
  const cont=new Map();
  vals.forEach(v=>{ if(v!==''&&v!=null) cont.set(v,(cont.get(v)||0)+1); });
  let melhor=null, n=0;
  for(const [v,c] of cont){ if(c>n){ melhor=v; n=c; } }
  return {valor:melhor, votos:n};
}

async function readStampGPS(file, onStatus){
  let bitmap;
  try{ bitmap=await createImageBitmap(file); }
  catch(e){ return null; } // formato que o navegador não decodifica (ex.: HEIC no Chrome)
  const worker=await getOcrWorker(onStatus);
  if(onStatus) onStatus('sem GPS nos metadados · lendo coordenadas impressas na foto…');
  const ler = async (reg, mode, opts, psm)=>{
    await worker.setParameters({tessedit_pageseg_mode: psm||'3'});
    const {data}=await worker.recognize(stampCanvas(bitmap, reg, mode, opts));
    return data||{};
  };
  // Regiões onde os apps de carimbo costumam escrever (parte inferior é a
  // mais comum; depois o topo; por fim a imagem inteira reduzida).
  const tentativas=[
    {r:{x:0,y:0.58,w:1,h:0.42}, mode:'white'},
    {r:{x:0,y:0.58,w:1,h:0.42}, mode:'gray'},
    {r:{x:0,y:0,   w:1,h:0.35}, mode:'white'},
    {r:{x:0,y:0,   w:1,h:1   }, mode:'gray'},
  ];
  try{
    for(const t of tentativas){
      const data=await ler(t.r, t.mode, {}, '3');
      const p1=parseStampText(data.text||'');
      if(!p1) continue;
      console.info(`[GeoTools] OCR "${file.name}" (${t.mode}):`, JSON.stringify((data.text||'').trim()));

      // ── Confirmação por novas leituras ──
      // O reconhecimento pode trocar dígitos isolados (1↔7, 3↔8…). Por isso o
      // carimbo é relido em um recorte justo, com pré-processamentos
      // diferentes, e cada campo (zona, E, N, data) é decidido por maioria.
      const leituras=[p1], datas=[p1.dtFmt];
      let reg=null;
      try{
        const alvo=String(p1.trecho||'').split(/\s+/).map(s=>s.replace(/[^0-9A-Za-z]/g,'')).filter(s=>s.length>=2);
        const ws=(data.words||[]).filter(w=>{
          const tx=String(w.text||'').replace(/[^0-9A-Za-z]/g,'');
          return tx.length>=2 && alvo.some(a=>a.includes(tx)||tx.includes(a));
        });
        if(ws.length){
          const bb={x0:Math.min(...ws.map(w=>w.bbox.x0)), x1:Math.max(...ws.map(w=>w.bbox.x1)),
                    y0:Math.min(...ws.map(w=>w.bbox.y0)), y1:Math.max(...ws.map(w=>w.bbox.y1))};
          const sc=Math.min(1, 1900/(t.r.w*bitmap.width)); // px do recorte por px da foto
          const fx=v=>t.r.x + v/sc/bitmap.width, fy=v=>t.r.y + v/sc/bitmap.height;
          const x0=fx(bb.x0), x1=fx(bb.x1), y0=fy(bb.y0), y1=fy(bb.y1), lh=y1-y0, cw=x1-x0;
          // inclui a linha acima (data) e a de baixo; amplia para os dois lados
          // (carimbos alinhados à direita ou à esquerda)
          reg={x:Math.max(0,x0-cw*0.45), y:Math.max(0,y0-lh*1.7)};
          reg.w=Math.min(1,x1+cw*0.45)-reg.x; reg.h=Math.min(1,y1+lh*1.4)-reg.y;
        }
      }catch(e){ reg=null; }
      if(reg){
        const variantes=[
          {mode:'white', opts:{despeckle:true, pad:30, scale:0.6}, psm:'6'},
          {mode:'white', opts:{despeckle:true, pad:30}, psm:'3'},
        ];
        for(const v of variantes){
          try{
            const d2=await ler(reg, v.mode, v.opts, v.psm);
            const p2=parseStampText(d2.text||'');
            if(p2) leituras.push(p2);
            datas.push(parseStampDate(d2.text||''));
          }catch(e){ /* leitura extra opcional */ }
        }
      }
      await worker.setParameters({tessedit_pageseg_mode:'3'});

      // ── Decisão por maioria ──
      const zona=_maisFrequente(leituras.map(l=>l.zona)).valor;
      const E=_maisFrequente(leituras.map(l=>String(l.E))), N=_maisFrequente(leituras.map(l=>String(l.N)));
      const Ev=parseFloat(E.valor), Nv=parseFloat(N.valor);
      // posição geográfica: de uma leitura idêntica ao resultado, ou recalculada
      let base=leituras.find(l=>l.zona===zona && String(l.E)===E.valor && String(l.N)===N.valor);
      let lat, lon;
      if(base){ lat=base.lat; lon=base.lon; }
      else{
        const zm=String(zona).match(/^(\d{1,2})([A-Z])$/);
        const g=zm ? utmToGeo(Ev, Nv, +zm[1], zm[2]) : null;
        if(!g){ base=p1; lat=p1.lat; lon=p1.lon; } else { lat=g.lat; lon=g.lon; }
      }
      const concordam=leituras.filter(l=>l.zona===zona && String(l.E)===E.valor && String(l.N)===N.valor).length;
      // Confiança: alta quando 2+ leituras independentes coincidem em todos os
      // campos da coordenada; baixa quando houve apenas uma leitura válida ou
      // as leituras divergiram (o usuário deve conferir com a foto).
      const conf = concordam>=2 ? 'alta' : 'baixa';

      // Data/hora: maioria entre as leituras; depois o nome do arquivo.
      let dt=_maisFrequente(datas).valor||'';
      const dtArq=dateFromFileName(file.name);
      if(dtArq){
        // O nome do arquivo é gerado pelo próprio app/câmera: prevalece quando
        // a leitura da imagem divergir dele em data, hora ou minuto.
        if(!dt || dt.slice(0,16)!==dtArq.slice(0,16)) dt=dtArq;
      }
      console.info(`[GeoTools] OCR "${file.name}": ${leituras.length} leitura(s), ${concordam} concordante(s) → ${zona} ${E.valor} ${N.valor} · confiança ${conf}`);
      return {name:file.name, lat, lon, E:Ev, N:Nv, zona, alt:p1.alt||'', dtFmt:dt,
              origem:'ocr', ocrConf:conf, ocrTexto:(base||p1).trecho};
    }
  }finally{
    try{ bitmap.close(); }catch(e){}
  }
  return null;
}

// Data/hora impressa: "31/08/2026 6:09 PM", "31-08-2026 18:09:12",
// "2026-08-31 18:09". Retorna "DD/MM/AAAA HH:MM:SS" ou ''.
function parseStampDate(txt){
  txt=String(txt||'').replace(/\s+/g,' ');
  const ok=(d,mo,y,h,mi)=> +mo>=1 && +mo<=12 && +d>=1 && +d<=31 && +y>=1990 && +y<=2100 && +h<=23 && +mi<=59;
  let m = txt.match(/(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})[\s,]+(\d{1,2})[:h](\d{2})(?::(\d{2}))?\s*([AaPp])?\.?\s*[Mm]?/);
  if(m){
    let h=parseInt(m[4],10); const ap=(m[7]||'').toUpperCase();
    if(ap==='P' && h<12) h+=12; if(ap==='A' && h===12) h=0;
    if(ok(m[1],m[2],m[3],h,m[5])) return `${m[1]}/${m[2]}/${m[3]} ${String(h).padStart(2,'0')}:${m[5]}:${m[6]||'00'}`;
  }
  if((m = txt.match(/(\d{4})[\/.\-](\d{2})[\/.\-](\d{2})[\sT,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/)) && ok(m[3],m[2],m[1],m[4],m[5])){
    return `${m[3]}/${m[2]}/${m[1]} ${m[4].padStart(2,'0')}:${m[5]}:${m[6]||'00'}`;
  }
  return '';
}
// Data/hora a partir do NOME do arquivo — padrão de muitas câmeras e apps:
// "IMG_20260831_164154.jpg", "TimePhoto_20260831_164154.jpg", "20260831-164154".
function dateFromFileName(name){
  const m=String(name||'').match(/(20\d{2})(\d{2})(\d{2})[_\-\s]?(\d{2})(\d{2})(\d{2})/);
  if(!m) return '';
  const [,y,mo,d,h,mi,s]=m;
  if(+mo<1||+mo>12||+d<1||+d>31||+h>23||+mi>59||+s>59) return '';
  return `${d}/${mo}/${y} ${h}:${mi}:${s}`;
}

// Interpreta o texto reconhecido e extrai a coordenada (UTM, graus decimais
// ou graus/minutos/segundos) e a data/hora. Retorna null se nada for válido.
function parseStampText(raw){
  if(!raw) return null;
  // Corrige confusões típicas do OCR SOMENTE em sequências numéricas
  // (O→0, l/I→1, S→5, B→8, Z→2), preservando letras isoladas (hemisfério, zona).
  const fixDigits = s => s.replace(/[0-9OoIlSBZ]{3,}(?:[.,][0-9OoIlSBZ]+)?/g, tok=>{
    const nd=(tok.match(/\d/g)||[]).length;
    if(nd < Math.ceil(tok.replace(/[.,]/g,'').length*0.6)) return tok; // é palavra, não número
    return tok.replace(/[Oo]/g,'0').replace(/[Il]/g,'1').replace(/S/g,'5').replace(/B/g,'8').replace(/Z/g,'2');
  });
  const txt = fixDigits(String(raw).replace(/[|]/g,'1')).replace(/\s+/g,' ').trim();
  const num = s => parseFloat(String(s).replace(',','.'));
  const inBR = (lat,lon)=> lat>=-34.5 && lat<=6 && lon>=-74.5 && lon<=-28.5;

  const dtFmt=parseStampDate(txt);
  let m;
  let alt='';
  const ma = txt.match(/(?:alt(?:itude)?|elev(?:a[cç][aã]o)?)\s*[:=]?\s*(-?\d{1,4}(?:[.,]\d+)?)\s*m\b/i);
  if(ma) alt=num(ma[1]).toFixed(1);

  const out = (lat,lon,E,N,zona,trecho)=>({lat:+lat.toFixed(8),lon:+lon.toFixed(8),E,N,zona,dtFmt,alt,trecho});

  // 1) UTM com zona: "22M 344141 9921636", "22 M 344141mE 9921636mN",
  //    "Zona 23K E: 627657 N: 7740219"
  const reUTM = /\b(\d{1,2})\s?([C-HJ-NP-X])\b[\s,;:]*(?:E\s*[:=]?\s*)?(\d{6}(?:[.,]\d{1,3})?)\s*(?:m\s*E|mE|E)?[\s,;:]+(?:N\s*[:=]?\s*)?(\d{7}(?:[.,]\d{1,3})?)/i;
  //    variante com a zona depois: "E 344141 N 9921636 22M"
  const reUTM2 = /\bE\s*[:=]?\s*(\d{6}(?:[.,]\d{1,3})?)\s*m?[\s,;]+N\s*[:=]?\s*(\d{7}(?:[.,]\d{1,3})?)\s*m?[\s,;]+(?:zona|fuso|zone)?\s*[:=]?\s*(\d{1,2})\s?([C-HJ-NP-X])\b/i;
  let u = txt.match(reUTM), E,N,zone,letter,trecho;
  if(u){ zone=+u[1]; letter=u[2].toUpperCase(); E=num(u[3]); N=num(u[4]); trecho=u[0]; }
  else if((u=txt.match(reUTM2))){ E=num(u[1]); N=num(u[2]); zone=+u[3]; letter=u[4].toUpperCase(); trecho=u[0]; }
  if(u && zone>=1 && zone<=60 && E>=100000 && E<=900000 && N>=0 && N<=10000000){
    let geo=utmToGeo(E,N,zone,letter);
    // Hemisfério: letra trocada pelo OCR (ex.: M→N) colocaria o ponto no
    // hemisfério errado. Se só a alternativa cair no Brasil, usa-a.
    if(geo && !inBR(geo.lat,geo.lon)){
      const alt2 = utmToGeo(E,N,zone, 'CDEFGHJKLM'.includes(letter)?'N':'M');
      if(alt2 && inBR(alt2.lat,alt2.lon)){ geo=alt2; letter = 'CDEFGHJKLM'.includes(letter)?'N':'M'; }
    }
    if(geo && isFinite(geo.lat) && isFinite(geo.lon)){
      return out(geo.lat, geo.lon, E, N, `${zone}${letter}`, trecho);
    }
  }

  // Converte lat/lon em ponto de saída (calcula UTM)
  const fromLatLon = (lat,lon,trecho)=>{
    if(!isFinite(lat)||!isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) return null;
    const ut=geoToUTM(lat,lon);
    return out(lat,lon,ut.E,ut.N,`${ut.zone}${ut.letter}`,trecho);
  };
  const sgn = (v,h)=> (h && /[SWO]/i.test(h)) ? -Math.abs(v) : v;

  // 2) Graus/minutos/segundos: 20°29'35.8"S 43°46'19.5"W (O/L em português)
  const reDMS = /(\d{1,2})\s*[°ºo*]\s*(\d{1,2})\s*['’′`]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["”″]|'')?\s*([NS])[\s,;\/]+(\d{1,3})\s*[°ºo*]\s*(\d{1,2})\s*['’′`]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["”″]|'')?\s*([EWOL])/i;
  if((m = txt.match(reDMS))){
    const lat = sgn(+m[1] + +m[2]/60 + num(m[3])/3600, m[4]);
    const lon = sgn(+m[5] + +m[6]/60 + num(m[7])/3600, m[8]);
    const r = fromLatLon(lat,lon,m[0]); if(r) return r;
  }

  // 3) Graus decimais: "-20.493272, -43.772080", "Lat -20.4932 Long -43.7720",
  //    "20.4932°S 43.7720°W"
  const reDec = /(?:lat\w*\.?\s*[:=]?\s*)?(-?\d{1,2}[.,]\d{4,8})\s*[°º]?\s*([NS])?[\s,;\/]+(?:lo?ng?\w*\.?\s*[:=]?\s*)?(-?\d{1,3}[.,]\d{4,8})\s*[°º]?\s*([EWOL])?/i;
  if((m = txt.match(reDec))){
    const lat = sgn(num(m[1]), m[2]), lon = sgn(num(m[3]), m[4]);
    const r = fromLatLon(lat,lon,m[0]); if(r) return r;
  }
  return null;
}
function dms2dec(dms,ref){
  if(!dms||dms.length<3)return null;
  const f=v=>typeof v==='object'?v.numerator/v.denominator:Number(v);
  let d=f(dms[0])+f(dms[1])/60+f(dms[2])/3600;
  if(ref==='S'||ref==='W')d=-d;return+d.toFixed(8);
}
function showExtResults(withGPS,withoutGPS,viaOCR){
  document.getElementById('ext-upload-panel').style.display='none';
  document.getElementById('ext-split').style.display='flex';
  document.getElementById('ext-cnt-ok').textContent=withGPS;
  document.getElementById('ext-cnt-warn').textContent=withoutGPS;
  // Fotos cuja posição foi lida do texto impresso na imagem (OCR)
  const ocrChip=document.getElementById('ext-chip-ocr');
  if(ocrChip){
    ocrChip.style.display = viaOCR ? '' : 'none';
    const n=document.getElementById('ext-cnt-ocr'); if(n) n.textContent=viaOCR||0;
  }
  document.getElementById('ext-total-lbl').textContent=`${withGPS} pts`;
  buildMap('map-ext','ext');
  setTimeout(()=>{
    const tbody=document.getElementById('ext-tbody');tbody.innerHTML='';const bounds=[];
    extData.forEach((r,i)=>{
      const tr=document.createElement('tr');
      tr.dataset.idx=i; tr.innerHTML=_extRowCells(r,i);
      tr.addEventListener('click',()=>{
        document.querySelectorAll('#ext-tbody tr').forEach(t=>t.classList.remove('selected'));
        tr.classList.add('selected');
        if(maps.ext)maps.ext.setView([r.lat,r.lon],15);
        if(mkrs.ext[i])mkrs.ext[i].openPopup();
      });
      tbody.appendChild(tr);addMarker('ext',r.lat,r.lon,_extMarkerLabel(r),i+1);bounds.push([r.lat,r.lon]);
    });
    fitMap('ext',bounds);
  },300);
}
// ── Células da linha da tabela de fotos ──
function _extRowCells(r,i){
  let badge='', dica='';
  if(r.origem==='ocr'){
    if(r.editado){
      dica=' — coordenada lida da foto e corrigida manualmente';
    }else if(r.ocrConf==='alta'){
      badge='<span class="ocr-badge" title="Coordenada lida do texto impresso na foto (OCR), confirmada por leituras repetidas">🔎</span>';
      dica=' — coordenada lida do texto impresso na foto (OCR): confira';
    }else{
      badge='<span class="ocr-badge ocr-low" title="Coordenada lida do texto impresso na foto (OCR) com leituras divergentes — confira com a foto">⚠️🔎</span>';
      dica=' — coordenada lida do texto impresso na foto (OCR) com leituras divergentes: confira';
    }
  }
  const editBtn = r.origem==='ocr'
    ? `<button type="button" class="ext-edit-btn${r.editado?' is-edited':''}" title="${r.editado?'Corrigida manualmente — clique para rever ou restaurar a leitura original':'Editar zona, coordenadas, altitude e data/hora lidas da foto'}" aria-label="Editar dados lidos da foto ${escHtml(r.name)}" onclick="event.stopPropagation();openExtEditor(${i})">✏️</button>`
    : '';
  const fmt0=v=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:0});
  return `<td class="td-link"><input type="checkbox" class="pt-link-cb" title="Ligar este ponto" onclick="event.stopPropagation()" onchange="togglePointLink('ext',${i},this)"${pointLinkSel.ext.includes(i)?' checked':''}></td>`
    + `<td>${i+1}</td>`
    + `<td class="fname-cell${r.origem==='ocr'?' fname-ocr':''}" title="${escHtml(r.name)}${dica}"><div class="fname-wrap">${editBtn}${badge}<span class="fname-txt">${escHtml(r.name)}</span></div></td>`
    + `<td><span class="zona-pill" style="font-size:10px;padding:1px 5px">${escHtml(r.zona)}</span></td>`
    + `<td style="font-size:11px">${fmt0(r.E)}</td><td style="font-size:11px">${fmt0(r.N)}</td>`
    + `<td style="font-size:11px;text-align:right">${r.alt!==''&&r.alt!=null?escHtml(r.alt)+'m':'—'}</td>`
    + `<td style="font-size:11px;white-space:nowrap">${escHtml(r.dtFmt)||'—'}</td>`;
}
function _extMarkerLabel(r){
  if(r.origem!=='ocr') return r.name;
  return r.editado ? `${r.name} (coordenada corrigida manualmente)` : `${r.name} (coordenada lida da imagem — confira)`;
}

// ════════════════════════════════════════
//  EDITOR DOS DADOS LIDOS DA FOTO (OCR)
// ════════════════════════════════════════
// Permite corrigir zona, E, N, altitude e data/hora de uma foto cuja posição foi
// lida do texto impresso na imagem. A foto é exibida ao lado para conferência;
// ao salvar, a tabela, o marcador (posição e popup), a ligação de pontos e a
// exportação passam a usar os valores corrigidos.
let _extEd=null; // {i, url, overlay, onKey}
function openExtEditor(i){
  const r=extData[i]; if(!r) return;
  closeExtEditor();
  const zm=String(r.zona||'').toUpperCase().match(/^(\d{1,2})\s*([C-HJ-NP-X])?$/);
  const fuso=zm?zm[1]:'', letra=zm&&zm[2]?zm[2]:'';
  const url = r.file ? URL.createObjectURL(r.file) : null;
  const ov=document.createElement('div');
  ov.className='track-modal-overlay';
  ov.innerHTML=`
    <div class="track-modal ext-edit-modal" role="dialog" aria-modal="true" aria-labelledby="exted-title">
      <div class="track-modal-hdr">
        <span class="track-modal-title" id="exted-title">✏️ Editar dados lidos da foto</span>
        <button type="button" class="track-modal-close" aria-label="Fechar" onclick="closeExtEditor()">✕</button>
      </div>
      <div class="track-modal-file">#${i+1} · ${escHtml(r.name)}${r.editado?' · <b>corrigida manualmente</b>':''}</div>
      <div class="exted-body">
        ${url?`<div class="exted-photo">
          <div class="exted-img-wrap" id="exted-imgwrap"><img src="${url}" alt="Foto ${escHtml(r.name)}" id="exted-img"></div>
          <div class="exted-photo-bar">
            <button type="button" class="btn btn-sm" id="exted-zoom" onclick="toggleExtEditorZoom()">🔍 Ampliar</button>
            <span>Confira os valores com o texto impresso na foto.</span>
          </div>
        </div>`:''}
        <div class="exted-form">
          <div class="exted-row">
            <label>Fuso (Nº)<input type="number" min="1" max="60" id="exted-fuso" value="${escHtml(fuso)}"></label>
            <label>Zona (Letra)<select id="exted-letra"><option value="">--</option>${letraOpts()}</select></label>
          </div>
          <label>Este (E) — m<input type="text" inputmode="decimal" id="exted-e" value="${_edNum(r.E)}"></label>
          <label>Norte (N) — m<input type="text" inputmode="decimal" id="exted-n" value="${_edNum(r.N)}"></label>
          <div class="exted-row">
            <label>Altitude (m)<input type="text" inputmode="decimal" id="exted-alt" value="${r.alt!==''&&r.alt!=null?escHtml(String(r.alt)):''}" placeholder="opcional"></label>
            <label>Data/Hora<input type="text" id="exted-dt" value="${escHtml(r.dtFmt||'')}" placeholder="dd/mm/aaaa hh:mm:ss"></label>
          </div>
          <div class="exted-preview" id="exted-preview" aria-live="polite"></div>
          ${r.ocrTexto?`<details class="exted-ocr"><summary>Texto lido pelo OCR</summary><pre>${escHtml(r.ocrTexto)}</pre></details>`:''}
        </div>
      </div>
      <div class="exted-actions">
        ${r._orig?'<button type="button" class="btn btn-sm" onclick="restoreExtEditor()" title="Volta aos valores lidos originalmente da foto">↺ Restaurar leitura original</button>':'<span></span>'}
        <div class="exted-actions-r">
          <button type="button" class="btn btn-sm" onclick="closeExtEditor()">Cancelar</button>
          <button type="button" class="btn btn-primary btn-sm" id="exted-save" onclick="saveExtEditor()">💾 Salvar e atualizar mapa</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const sel=ov.querySelector('#exted-letra'); if(letra) sel.value=letra;
  ov.addEventListener('mousedown',e=>{ if(e.target===ov) closeExtEditor(); });
  const onKey=e=>{
    if(e.key==='Escape'){ e.preventDefault(); closeExtEditor(); }
    else if(e.key==='Enter' && e.target && e.target.tagName==='INPUT'){ e.preventDefault(); saveExtEditor(); }
  };
  document.addEventListener('keydown',onKey);
  ['exted-fuso','exted-letra','exted-e','exted-n'].forEach(id=>{
    const el=ov.querySelector('#'+id); el.addEventListener('input',_extEditorPreview); el.addEventListener('change',_extEditorPreview);
  });
  _extEd={i,url,overlay:ov,onKey};
  _extEditorPreview();
  setTimeout(()=>{ const f=ov.querySelector('#exted-e'); if(f){ f.focus(); f.select(); } },30);
}
function _edNum(v){ return (v===''||v==null||!isFinite(+v)) ? '' : String(+(+v).toFixed(2)).replace('.',','); }
function _parseNumBR(s){
  s=String(s==null?'':s).trim().replace(/\s/g,'');
  if(!s) return NaN;
  // aceita "362117,5", "362.117,5", "362117.5" e "9.938.166"
  if(s.includes(',')) s=s.replace(/\./g,'').replace(',','.');
  else if((s.match(/\./g)||[]).length>1 || /^\d{1,3}(\.\d{3})+$/.test(s) && s.replace(/\./g,'').length>=6) s=s.replace(/\./g,'');
  return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
}
function toggleExtEditorZoom(){
  const w=document.getElementById('exted-imgwrap'), b=document.getElementById('exted-zoom'); if(!w) return;
  const on=w.classList.toggle('zoom');
  if(b) b.textContent = on ? '🔍 Reduzir' : '🔍 Ampliar';
  // carimbos costumam ficar no canto inferior direito: posiciona a vista lá
  if(on) setTimeout(()=>{ w.scrollTop=w.scrollHeight; w.scrollLeft=w.scrollWidth; },20);
}
// Valida os campos; retorna {ok, erros[], vals}
function _extEditorRead(){
  const g=id=>document.getElementById(id);
  const fuso=parseInt(g('exted-fuso').value,10), letra=(g('exted-letra').value||'').toUpperCase();
  const E=_parseNumBR(g('exted-e').value), N=_parseNumBR(g('exted-n').value);
  const altTxt=g('exted-alt').value.trim(), alt=altTxt===''?'':_parseNumBR(altTxt);
  const dt=g('exted-dt').value.trim().replace(/\s+/g,' ');
  const erros=[];
  if(!(fuso>=1&&fuso<=60)) erros.push('Fuso deve estar entre 1 e 60.');
  if(!letra) erros.push('Selecione a letra da zona (ex.: M, L, K).');
  if(!isFinite(E)) erros.push('Este (E) inválido.');
  else if(E<100000||E>900000) erros.push('Este (E) fora da faixa UTM (100.000 a 900.000 m).');
  if(!isFinite(N)) erros.push('Norte (N) inválido.');
  else if(N<0||N>10000000) erros.push('Norte (N) fora da faixa UTM (0 a 10.000.000 m).');
  if(altTxt!=='' && !isFinite(alt)) erros.push('Altitude inválida (use apenas números).');
  if(dt && !/^\d{2}\/\d{2}\/\d{4}(\s\d{1,2}:\d{2}(:\d{2})?)?$/.test(dt)) erros.push('Data/hora no formato dd/mm/aaaa hh:mm:ss.');
  let geo=null;
  if(!erros.length){ geo=utmToGeo(E,N,fuso,letra); if(!geo||!isFinite(geo.lat)||!isFinite(geo.lon)) erros.push('Não foi possível converter a coordenada.'); }
  return {ok:!erros.length, erros, vals:{fuso,letra,E,N,alt:altTxt===''?'':String(+alt),dt,geo}};
}
function _extEditorPreview(){
  const box=document.getElementById('exted-preview'); if(!box) return;
  const {ok,erros,vals}=_extEditorRead();
  const r=extData[_extEd?_extEd.i:-1];
  if(!ok){ box.className='exted-preview err'; box.innerHTML=erros.map(e=>'⚠️ '+escHtml(e)).join('<br>'); return; }
  const {geo}=vals;
  let html=`<b>Lat/Long:</b> ${geo.lat.toFixed(6)}, ${geo.lon.toFixed(6)}`;
  // distância do ponto original — ajuda a perceber erros de digitação
  if(r && isFinite(r.lat)){
    const d=L.latLng(r.lat,r.lon).distanceTo([geo.lat,geo.lon]);
    if(d>=0.5) html+=`<br>Deslocamento em relação ao valor atual: <b>${d<1000?d.toFixed(0)+' m':(d/1000).toLocaleString('pt-BR',{maximumFractionDigits:2})+' km'}</b>`;
  }
  const foraBR = geo.lat<-34.5||geo.lat>5.5||geo.lon<-74.5||geo.lon>-28.5;
  if(foraBR) html+='<br>⚠️ O ponto fica fora do território brasileiro — confira o fuso, a letra e o Norte (N).';
  box.className='exted-preview'+(foraBR?' warn':'');
  box.innerHTML=html;
}
function saveExtEditor(){
  if(!_extEd) return;
  const {ok,erros,vals}=_extEditorRead();
  if(!ok){ _extEditorPreview(); const b=document.getElementById('exted-preview'); if(b){ b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); } return; }
  const i=_extEd.i, r=extData[i]; if(!r){ closeExtEditor(); return; }
  if(!r._orig) r._orig={lat:r.lat,lon:r.lon,E:r.E,N:r.N,zona:r.zona,alt:r.alt,dtFmt:r.dtFmt};
  const zona=`${vals.fuso}${vals.letra}`;
  Object.assign(r,{E:vals.E,N:vals.N,zona,lat:vals.geo.lat,lon:vals.geo.lon,alt:vals.alt,dtFmt:vals.dt});
  const o=r._orig;
  r.editado = !(o.E===r.E && o.N===r.N && o.zona===r.zona && String(o.alt)===String(r.alt) && (o.dtFmt||'')===(r.dtFmt||''));
  if(!r.editado) delete r._orig;
  closeExtEditor();
  _applyExtRowUpdate(i);
}
function restoreExtEditor(){
  if(!_extEd) return;
  const i=_extEd.i, r=extData[i]; if(!r||!r._orig) return;
  Object.assign(r,r._orig); delete r._orig; r.editado=false;
  closeExtEditor();
  _applyExtRowUpdate(i);
}
// Atualiza tabela, marcador, ligação de pontos e enquadramento após a edição
function _applyExtRowUpdate(i){
  const r=extData[i];
  const tr=document.querySelector(`#ext-tbody tr[data-idx="${i}"]`);
  if(tr){
    tr.innerHTML=_extRowCells(r,i);
    tr.classList.remove('row-updated'); void tr.offsetWidth; tr.classList.add('row-updated');
  }
  const mk=mkrs.ext[i];
  if(mk){
    mk.setLatLng([r.lat,r.lon]);
    mk.setPopupContent(_markerPopupHtml(_extMarkerLabel(r), r.lat, r.lon));
  }
  redrawPointLink('ext');
  updateDistButton('ext');
  const m=maps.ext;
  if(m && mk){
    if(!m.getBounds().pad(-0.05).contains([r.lat,r.lon])) m.setView([r.lat,r.lon], Math.max(m.getZoom(),15));
    setTimeout(()=>{ try{ mk.openPopup(); }catch(e){} },250);
  }
  const n=extData.filter(x=>x.editado).length;
  console.info(`[GeoTools] Foto "${r.name}" ${r.editado?'corrigida':'restaurada'} → ${r.zona} ${r.E} ${r.N} (${n} foto(s) corrigida(s))`);
}
function closeExtEditor(){
  if(!_extEd) return;
  document.removeEventListener('keydown',_extEd.onKey);
  try{ _extEd.overlay.remove(); }catch(e){}
  const url=_extEd.url; if(url) setTimeout(()=>URL.revokeObjectURL(url),0);
  _extEd=null;
}

function clearExtrair(){
  closeExtEditor();
  extData=[];resetPointLink('ext');clearMarkers('ext');
  clearUploadedLayers('ext');
  if(typeof clearMeasure==='function') clearMeasure('ext');
  document.getElementById('ext-upload-panel').style.display='block';
  document.getElementById('ext-split').style.display='none';
  document.getElementById('ext-file-input').value='';
  document.getElementById('ext-tbody').innerHTML='';
  setExtMode('arquivo');
}

// ════════════════════════════════════════
//  TELA 3 — INFORMAR
// ════════════════════════════════════════
let infCount=0, infData=[];
function addInfRow(){
  infCount++;const id=infCount,div=document.createElement('div');
  div.className='coord-row';div.id=`inf-row-${id}`;
  div.innerHTML=`
    <div class="coord-idx">${id}</div>
    <div class="coord-field f-name"><label>Nome do ponto</label><input type="text" placeholder="ex: Marco 01" id="inf-nm-${id}"></div>
    <div class="coord-field f-zone"><label>Fuso (Nº)</label><input type="number" min="1" max="60" placeholder="ex: 23" id="inf-z-${id}"></div>
    <div class="coord-field f-letra"><label>Zona (Letra)</label><select id="inf-l-${id}"><option value="">--</option>${letraOpts()}</select></div>
    <div class="coord-field f-en"><label>Este (E) - 6 dígitos</label><input type="number" step="0.01" placeholder="ex: 193109.55" id="inf-e-${id}"></div>
    <div class="coord-field f-en"><label>Norte (N) - 7 dígitos</label><input type="number" step="0.01" placeholder="ex: 8251130.47" id="inf-n-${id}"></div>
    <button class="btn-rm" onclick="removeEl('inf-row-${id}')">✕</button>`;
  document.getElementById('inf-rows').appendChild(div);
  prefillFromFirst('inf', id, true); // copia Fuso/Zona e numera o Nome
}
function saveInformar(){
  infData=[];resetPointLink('inf');document.getElementById('inf-tbody').innerHTML='';let found=0;
  for(let i=1;i<=infCount;i++){
    const eEl=document.getElementById(`inf-e-${i}`);if(!eEl)continue;
    const E=parseFloat(eEl.value),N=parseFloat(document.getElementById(`inf-n-${i}`).value);
    const Z=parseInt(document.getElementById(`inf-z-${i}`).value);
    const L=document.getElementById(`inf-l-${i}`).value||'K';
    const nm=document.getElementById(`inf-nm-${i}`).value.trim()||`Ponto ${i}`;
    if(isNaN(E)||isNaN(N)||!Z)continue;
    const geo=utmToGeo(E,N,Z,L);if(!geo)continue;
    found++;infData.push({name:nm,lat:geo.lat,lon:geo.lon,E,N,zona:`${Z}${L}`});
    const tr=document.createElement('tr');tr.dataset.idx=found-1;
    tr.innerHTML=`<td class="td-link"><input type="checkbox" class="pt-link-cb" title="Ligar este ponto" onclick="event.stopPropagation()" onchange="togglePointLink('inf',${found-1},this)"></td><td>${found}</td><td>${escHtml(nm)}</td><td><span class="zona-pill">${escHtml(Z)}${escHtml(L)}</span></td><td style="font-size:11px">${E.toLocaleString('pt-BR',{maximumFractionDigits:1})}</td><td style="font-size:11px">${N.toLocaleString('pt-BR',{maximumFractionDigits:1})}</td>`;
    document.getElementById('inf-tbody').appendChild(tr);
  }
  if(!found){alert('Preencha pelo menos um ponto completo (Zona, Letra, E, N).');return;}
  document.getElementById('inf-cnt').textContent=found;
  document.getElementById('inf-pts-lbl').textContent=`${found} pts`;
  document.getElementById('inf-input-panel').style.display='none';
  document.getElementById('inf-split').style.display='flex';
  const editBtn = document.getElementById('inf-edit-btn');
  if(editBtn) editBtn.textContent='✏️ Editar pontos';
  updateInfDownloadButtons();
  buildMap('map-inf','inf');
  setTimeout(()=>{
    clearMarkers('inf');const bounds=[];
    infData.forEach((p,i)=>{addMarker('inf',p.lat,p.lon,p.name,i+1);bounds.push([p.lat,p.lon]);});
    fitMap('inf',bounds);
    document.querySelectorAll('#inf-tbody tr').forEach(tr=>{
      tr.addEventListener('click',()=>{
        document.querySelectorAll('#inf-tbody tr').forEach(t=>t.classList.remove('selected'));
        tr.classList.add('selected');
        const p=infData[parseInt(tr.dataset.idx)];
        if(p&&maps.inf)maps.inf.setView([p.lat,p.lon],15);
        const mk=mkrs.inf[parseInt(tr.dataset.idx)];if(mk)mk.openPopup();
      });
    });
  },300);
}
function showInfInput(){
  document.getElementById('inf-split').style.display='none';
  document.getElementById('inf-input-panel').style.display='block';
  const editBtn = document.getElementById('inf-edit-btn');
  if(editBtn) editBtn.textContent='✏️ Editar pontos';
}

// Mostra os botões "Baixar KML/Shapefile" somente quando há pontos UTM
// informados manualmente. Ao apenas importar arquivos geoespaciais para
// visualização, esses botões ficam ocultos (não há o que baixar).
function updateInfDownloadButtons(){
  const has = (Array.isArray(infData) && infData.length > 0) || _csvPointsFor('inf').length > 0;
  const exp = document.getElementById('inf-dl-kml'); // wrapper do botão Exportar
  const div = document.getElementById('inf-dl-divider');
  if(exp) exp.style.display = has ? '' : 'none';
  if(div) div.style.display = has ? '' : 'none';
}
function clearInformar(){
  infCount=0;infData=[];resetPointLink('inf');
  document.getElementById('inf-rows').innerHTML='';document.getElementById('inf-tbody').innerHTML='';
  document.getElementById('inf-split').style.display='none';document.getElementById('inf-input-panel').style.display='block';
  clearMarkers('inf');
  clearUploadedLayers('inf');
  if(typeof clearMeasure==='function') clearMeasure('inf');
  if(typeof updateInfDownloadButtons==='function') updateInfDownloadButtons();
  addInfRow();
}
function removeEl(id){const el=document.getElementById(id);if(el)el.remove();}
