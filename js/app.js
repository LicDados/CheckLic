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

  const m = L.map(divId, {zoomControl:true}).setView([-15.5,-47.9], 5);
  maps[key] = m;

  // ── Bases ──
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:19, attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(m);

  const sat = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom:19, attribution:'Tiles © Esri' }
  );

  // Fundo vetorial em branco (sem tiles, apenas cor de fundo do mapa)
  const blank = L.layerGroup();
  blank.on('add', ()=>{ m.getContainer().style.background = 'var(--bg)'; });
  blank.on('remove', ()=>{ m.getContainer().style.background = ''; });

  // ── Grupos declarados ANTES dos fetches (evita ReferenceError) ──
  const estadoGroup    = L.layerGroup();
  const munGroup       = L.layerGroup();
  const topoGroup      = L.layerGroup();

  // Cores configuráveis pelo usuário para as camadas padrão (persistidas)
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
    const rows = campos.map(([k,v]) =>
      `<tr>
        <td style="color:var(--muted);padding:3px 10px 3px 0;font-size:12px;white-space:nowrap;vertical-align:top">${escHtml(k)}</td>
        <td style="font-weight:500;padding:3px 0;font-size:12px">${v!==undefined&&v!==null&&v!==''?escHtml(v):'—'}</td>
      </tr>`
    ).join('');
    L.popup({maxWidth:300, className:'rich-popup', closeButton:true, autoClose:true})
      .setLatLng(latlng)
      .setContent(`<div style="min-width:200px">
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:14px;
             margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border)">${titulo}</div>
        <table style="border-collapse:collapse;width:100%">${rows}</table>
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
    {nome:'IPHAN - FCA (Empreendimentos cadastrados)',                      url:'https://geoserver.iphan.gov.br/geoserver/fca/wms',  layer:'fca:fca', tipo:'poligono', wfsFallback:{url:'https://geoserver.iphan.gov.br/geoserver/fca/ows', typeName:'fca:fca'}},
    {nome:'IPHAN - Sítios Arqueológicos (SICG)',            url:'https://geoserver.iphan.gov.br/geoserver/SICG/wms', layer:'SICG:sitios', tipo:'ponto', wfsFallback:{url:'https://geoserver.iphan.gov.br/geoserver/SICG/ows', typeName:'SICG:sitios'}},
    {nome:'IPHAN - Polígonos de Sítios Arqueológicos (SICG)',  url:'https://geoserver.iphan.gov.br/geoserver/SICG/wms', layer:'SICG:sitios_pol', tipo:'poligono', wfsFallback:{url:'https://geoserver.iphan.gov.br/geoserver/SICG/ows', typeName:'SICG:sitios_pol'}},
    {nome:'IPHAN - Bens Materiais (SICG)',url:'https://geoserver.iphan.gov.br/geoserver/SICG/wms', layer:'SICG:tg_bem_classificacao', tipo:'ponto', wfsFallback:{url:'https://geoserver.iphan.gov.br/geoserver/SICG/ows', typeName:'SICG:tg_bem_classificacao'}},
    {nome:'IPHAN - Bens Imateriais (SICG)',   url:'https://geoserver.iphan.gov.br/geoserver/SICG/wms', layer:'SICG:tg_bem_imaterial', tipo:'ponto', wfsFallback:{url:'https://geoserver.iphan.gov.br/geoserver/SICG/ows', typeName:'SICG:tg_bem_imaterial'}},
    {nome:'ANA - Hidrografia (SNIRH)',                  url:'https://www.snirh.gov.br/arcgis/services/INDE/Camadas/MapServer/WMSServer', layer:'106', clickTolerance:8, dpi:180, noJsonp:true, tipo:'linear'},
    {nome:'IBGE - Localidades Indígenas (Censo 2022)',      url:'https://geoservicoscenso2022.ibge.gov.br/geoserver/censo2022/ows', layer:'cete_BR_LIs_CD2022_02062025', tipo:'poligono'},
    {nome:'IBGE - Locais de Concentração de Pessoas Indígenas (Censo 2022)',url:'https://geoservicoscenso2022.ibge.gov.br/geoserver/censo2022/ows', layer:'cete_BR_LCPIs_CD2022_02062025', tipo:'ponto'},
    {nome:'IBGE - Localidades Quilombolas (Censo 2022)',      url:'https://geoservicoscenso2022.ibge.gov.br/geoserver/censo2022/ows', layer:'cete_BR_LQs_22_pt', tipo:'ponto'},    
    {nome:'IBGE - Localidades Projeto de Assentamento',      url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CGEO:APL_Localidades_Projeto_De_Assentamento', tipo:'ponto'},
    {nome:'IBGE - Territórios Quilombolas',   url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CGMAT:qg_2022_620_territorioquilombola__v02', tipo:'poligono'},   
    {nome:'IBGE - Geomorfologia (Linear)',    url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CREN:Geomorfologia_simbLinear_Brasil', tipo:'linear'},
    {nome:'IBGE - Curvas de Nível',           url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CCAR:BCIM_Curva_Nivel_L', tipo:'linear'},
    {nome:'IBGE - Hidrografia',               url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CCAR:BC250_2025_hid', tipo:'linear'},
    {nome:'IBGE - Trecho Ferroviário',        url:'https://geoservicos.ibge.gov.br/geoserver/ows', layer:'CCAR:BC250_2025_fer_trecho_ferroviario_l', tipo:'linear'},
    {nome:'VALEC - Trecho Ferroviário', url:'https://geoservicos.inde.gov.br/geoserver/VALEC/ows', layer:'trecho_ferroviario_infrasa', tipo:'linear'},
    {nome:'DNIT - Rodovias',      url:'https://geoservicos.inde.gov.br/geoserver/DNIT/ows', layer:'cide_2024_25,snv_202507a', tipo:'linear'},
    {nome:'ICMBio - Cavidades Naturais Subterrâneas', url:'https://geoservicos.inde.gov.br/geoserver/ICMBio/ows', layer:'canie_052026_p', tipo:'ponto'},
    {nome:'ICMBio - UCs Federais',  url:'https://geoservicos.inde.gov.br/geoserver/ICMBio/ows', layer:'limiteucsfederais_a', tipo:'poligono'},
    {nome:'FUNAI - Aldeias Indígenas',         url:'https://geoserver.funai.gov.br/geoserver/Funai/wms', layer:'Funai:aldeias_pontos', tipo:'ponto', wfsFallback:{url:'https://geoserver.funai.gov.br/geoserver/Funai/ows', typeName:'Funai:aldeias_pontos'}},    
    {nome:'FUNAI - Terras Indígenas', url:'https://geoserver.funai.gov.br/geoserver/Funai/wms', layer:'Funai:tis_poligonais', tipo:'poligono', wfsFallback:{url:'https://geoserver.funai.gov.br/geoserver/Funai/ows', typeName:'Funai:tis_poligonais'}},
    {nome:'SNIF/SFB - Diversos/2024 (INCRA/FUNAI/ICMBio/Órgãos estaduais)',  url:'https://sistemas.florestal.gov.br/geoserver/snif/wms', layer:'snif:cnfp_2024', tipo:'poligono', gfiSrs:'EPSG:4674',
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
  ];
  // Camadas que devem ficar em segundo plano (renderizadas "abaixo" das
  // demais camadas quando ativas simultaneamente). São polígonos preenchidos
  // normais (não em modo circunscrito).
  const WMS_LAYERS_BACKGROUND = [
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
      attribution: def.nome,
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
    { 'OpenStreetMap': osm, 'Satélite (ESRI)': sat, 'Vetorial puro': blank },
    {
      'Limites Estaduais': estadoGroup,
      'Limites Municipais': munGroup,
      'Toponímias': topoGroup,
      ...wmsOverlaysPrimary,
      ...wmsOverlaysBackground,
    },
    { position:'topright', collapsed:false }
  ).addTo(m);

  // Barra de rolagem caso a lista de camadas exceda a altura da tela
  const lcContainer = layersControl.getContainer();
  lcContainer.style.overflow = 'hidden'; // o scroll fica apenas na lista interna
  lcContainer.classList.add('std-layers-control');
  const lcList = lcContainer.querySelector('.leaflet-control-layers-list');

  // Ajusta a altura máxima do painel de camadas para nunca invadir o rodapé
  // (coordenadas/escala/medir). Recalcula no redimensionamento do mapa.
  const FOOTER_CLEARANCE = 58; // altura do rodapé + folga
  function adjustLayersMaxHeight(){
    if(lcContainer.classList.contains('collapsed-manual')) return;
    const mapH = m.getSize().y;
    const top = 10;     // distância do topo do mapa ao controle
    const chrome = 44;  // espaço do botão "Minimizar" + paddings
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
        info_format:'application/json',
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
        let resp = await fetchWithCorsFallback(reqUrl);
        if(resp && resp.ok){
          try{ data = await resp.json(); }
          catch(parseErr){ data = null; } // resposta não é JSON válido (ex: HTML/erro)
        }
        if(!data && !def.noJsonp){
          // Tenta JSONP (suportado pelo GeoServer via
          // info_format=text/javascript&format_options=callback:NOME)
          data = await jsonpGetFeatureInfo(def.url, params);
          console.info(`[GeoTools] ${def.nome}: tentativa JSONP`, data ? 'retornou dados' : 'sem retorno/timeout');
        }

        if(!data || !data.features || !data.features.length){
          // Fallback 1: tenta info_format=text/html e extrai a primeira tabela
          const rowsFromHtml = await htmlGetFeatureInfo(def.url, params);
          console.info(`[GeoTools] ${def.nome}: tentativa HTML`, rowsFromHtml ? `retornou ${rowsFromHtml.length} linhas` : 'sem retorno');
          if(rowsFromHtml && rowsFromHtml.length){
            openInfoPopup(latlng, `🗺️ ${def.nome}`, rowsFromHtml);
            foundAny = true;
            break;
          }
          // Fallback 2: consulta WFS espacial (bbox pequeno em torno do clique) —
          // leve, pois retorna apenas as feições próximas ao ponto clicado.
          if(def.wfsFallback){
            const rowsFromWfs = await wfsSpatialQuery(def.wfsFallback, latlng);
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
  async function htmlGetFeatureInfo(url, params){
    try{
      const p = new URLSearchParams(params);
      p.set('info_format','text/html');
      const resp = await fetchWithCorsFallback(url + '?' + p.toString());
      if(!resp || !resp.ok) return null;
      const html = await resp.text();
      if(!html || !/<table/i.test(html)) return null;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const table = doc.querySelector('table');
      if(!table) return null;
      const rows = [];
      table.querySelectorAll('tr').forEach(tr=>{
        const cells = [...tr.querySelectorAll('th,td')].map(c=>c.textContent.trim());
        if(cells.length===2 && cells[0]) rows.push([cells[0], cells[1]||'—']);
      });
      return rows.length ? rows.slice(0,10) : null;
    }catch(e){
      return null; // CORS ou outro erro — ignora silenciosamente
    }
  }

  // Consulta WFS espacial leve: busca apenas feições que intersectam um
  // pequeno bbox (~80m) em torno do ponto clicado, em vez de carregar toda
  // a camada. Usado como último recurso quando WMS GetFeatureInfo falha.
  // ── Proxy CORS de último recurso ──
  // Servidores como IPHAN, FUNAI e SNIF/SFB não enviam o cabeçalho
  // Access-Control-Allow-Origin, o que faz o navegador bloquear a leitura da
  // resposta do GetFeatureInfo. Como esses serviços muitas vezes também não
  // suportam JSONP, tentamos uma cascata de proxies CORS públicos.
  const CORS_PROXIES = [
    u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
    u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    u => 'https://thingproxy.freeboard.io/fetch/' + u,
  ];
  async function fetchWithCorsFallback(url){
    // 1ª tentativa: requisição direta (funciona se o servidor enviar CORS)
    try{
      const r = await fetch(url);
      if(r && r.ok) return r;
    }catch(err){
      if(!(err instanceof TypeError)) throw err;
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

  async function wfsSpatialQuery(wfsDef, latlng){
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
      const resp = await fetchWithCorsFallback(wfsDef.url + '?' + params.toString());
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
      setTimeout(finish, 600);
    }
  });
  m.on('overlayremove', e => {
    if (e.name === 'Toponímias') {
      [...estTopoMarkers, ...munTopoMarkers].forEach(({marker}) => {
        if (topoGroup.hasLayer(marker)) topoGroup.removeLayer(marker);
      });
    }
  });

  // ── Rodapé: coordenadas do mouse ──
  m.on('mousemove', e => {
    const el = document.getElementById('coord-'+key);
    if(!el) return;
    // Não atualiza quando o cursor está sobre a faixa do rodapé
    const footer = document.getElementById('footer-'+key);
    if(footer){
      const fr = footer.getBoundingClientRect();
      const oe = e.originalEvent;
      if(oe && oe.clientY >= fr.top && oe.clientX >= fr.left && oe.clientX <= fr.right){
        el.textContent = '—';
        return;
      }
    }
    el.textContent = `${e.latlng.lat.toFixed(6)}°, ${e.latlng.lng.toFixed(6)}°`;
  });
  m.on('mouseout', () => {
    const el = document.getElementById('coord-'+key);
    if(el) el.textContent = '—';
  });

  // ── Rodapé: escala ──
  function updateScale(k){
    const el = document.getElementById('scale-'+k);
    if(!el) return;
    const center = m.getCenter();
    const zoom = m.getZoom();
    const metersPerPixel = 156543.03392 * Math.cos(center.lat*Math.PI/180) / Math.pow(2, zoom);
    let scaleDenom = Math.round(metersPerPixel / 0.00028); // 0.00028m = pixel padrão (96dpi)
    el.textContent = `1 : ${scaleDenom.toLocaleString('pt-BR')}`;
  }
  m.on('zoomend moveend load', () => updateScale(key));

  // ── Clique no mapa: se Limites Estaduais/Municipais não estiverem
  //    ativos e o clique não atingir outra camada, exibe coordenadas ──
  m.on('click', async e => {
    if (measureState[key] && measureState[key].active) return; // ferramenta de medição em uso
    // Consulta camadas WMS ativas (GetFeatureInfo) antes de qualquer outra lógica
    const handled = await queryWmsFeatureInfo(e.latlng, e.containerPoint);
    if (handled) return;
    const hasEstado = m.hasLayer(estadoGroup);
    const hasMun = m.hasLayer(munGroup);
    if (hasEstado || hasMun) return; // outras camadas tratam seus próprios cliques
    // Verifica se algum overlay extra carregado pelo usuário está sob o ponto
    if (clickHitsUploadedLayer(key, e.latlng)) return;
    openInfoPopup(e.latlng, '📍 Coordenadas', [
      ['Latitude',  e.latlng.lat.toFixed(6)+'°'],
      ['Longitude', e.latlng.lng.toFixed(6)+'°'],
    ]);
  });

  // ── Impede que cliques no rodapé (botão Medir, etc.) cheguem ao mapa ──
  const footerEl = document.getElementById('footer-'+key);
  if(footerEl) L.DomEvent.disableClickPropagation(footerEl);
  const measurePanelEl = document.getElementById('measure-'+key);
  if(measurePanelEl) L.DomEvent.disableClickPropagation(measurePanelEl);
  const areaPanelEl = document.getElementById('area-'+key);
  if(areaPanelEl) L.DomEvent.disableClickPropagation(areaPanelEl);

  if(!measureState[key]) measureState[key] = {points:[], line:null, rubberLine:null, vertexLayer:null, active:false, unit:'m', handlers:{}};
  ensureMeasureHandlers(key);

  setTimeout(() => { m.invalidateSize(); updateScale(key); adjustLayersMaxHeight(); }, 200);

  // Inicializa painel de upload de arquivos geoespaciais
  initGeoUploadPanel(key, m, uploadLayersControl);
}

function addMarker(key, lat, lon, label, idx) {
  const m = maps[key]; if (!m) return null;
  const icon = L.divIcon({
    className:'',
    html:`<div style="width:26px;height:26px;background:var(--accent);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.5)">${idx}</div>`,
    iconSize:[26,26], iconAnchor:[13,13]
  });
  const mk = L.marker([lat,lon],{icon})
    .bindPopup(
      `<div style="min-width:200px">
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:13px;
             margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid var(--border)">
          📍 ${escHtml(label)}
        </div>
        <table style="border-collapse:collapse;width:100%;font-size:12px">
          <tr><td style="color:var(--muted);padding:2px 10px 2px 0">Latitude</td>
              <td style="font-weight:500">${coordCell(lat)}</td></tr>
          <tr><td style="color:var(--muted);padding:2px 10px 2px 0">Longitude</td>
              <td style="font-weight:500">${coordCell(lon)}</td></tr>
        </table>
      </div>`,
      {maxWidth:280, className:'rich-popup'}
    )
    .addTo(m);
  mkrs[key].push(mk);
  return mk;
}
function clearMarkers(key){ const m=maps[key]; if(!m)return; mkrs[key].forEach(mk=>m.removeLayer(mk)); mkrs[key]=[]; }
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
  if(typeof closeAreaPopup==='function') closeAreaPopup(key);
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
  // fecha o painel de medição se estiver aberto
  closeMeasurePopup(key);
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
  const polys = (uploadedLayers[key]||[]).filter(l=>l.hasPolygon);
  const opts = polys.map(l=>
    `<button class="area-layer-btn" onclick="selectAreaLayer('${key}','${l.id}')">⬛ ${escHtml(l.name)}</button>`
  ).join('');
  panel.innerHTML = `
    <div class="measure-panel-hdr"><span>📐 Área de polígono</span><span class="mp-close" onclick="closeAreaPopup('${key}')">✕</span></div>
    <div class="color-panel-section">
      <div class="color-panel-lbl">Camadas de polígono importadas</div>
      <div class="area-layer-list">${opts || '<div class="measure-hint">Nenhuma camada de polígono importada.</div>'}</div>
    </div>
    <div class="measure-hint" id="ahint-${key}">Selecione uma camada acima para calcular sua área total.</div>
    <div class="measure-result" id="aresult-${key}">—</div>
  `;
}

function selectAreaLayer(key, id){
  const entry = (uploadedLayers[key]||[]).find(l=>l.id===id);
  const res = document.getElementById('aresult-'+key);
  const hint = document.getElementById('ahint-'+key);
  // destaca o botão selecionado
  document.querySelectorAll(`#area-${key} .area-layer-btn`).forEach(b=>b.classList.remove('active'));
  const btns = [...document.querySelectorAll(`#area-${key} .area-layer-btn`)];
  const idxList = (uploadedLayers[key]||[]).filter(l=>l.hasPolygon).findIndex(l=>l.id===id);
  if(btns[idxList]) btns[idxList].classList.add('active');
  if(!entry || !res){ return; }
  const m2 = geojsonAreaM2(entry.geojson);
  const a = fmtArea(m2);
  if(hint) hint.textContent = `Área total de "${entry.name}":`;
  res.innerHTML = `
    <div class="area-result-row"><span>Metros quadrados</span><b>${a.m2} m²</b></div>
    <div class="area-result-row"><span>Quilômetros quadrados</span><b>${a.km2} km²</b></div>
    <div class="area-result-row"><span>Hectares</span><b>${a.ha} ha</b></div>
  `;
  // tenta dar zoom à camada selecionada
  try{ maps[key].fitBounds(entry.layer.getBounds(), {padding:[32,32]}); }catch(e){}
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
  });
  uploadedLayers[key] = [];
  uploadedColorIdx[key] = 0;
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
}
const PASTEL_COLORS = ['#5fa8d3','#cf8b6c','#9085d6','#6fa787','#d68fa6','#bda36a','#e0a35b','#7ea8f8'];
let uploadedColorIdx = {ext:0, conv:0, inf:0};

function initGeoUploadPanel(key, map, layersControl){
  const panel = document.getElementById('geoup-'+key);
  if(!panel) return;
  panel.innerHTML = `
    <div class="geo-upload-hdr"><span>📁 Camadas importadas</span></div>
    <input type="file" class="geo-upload-input" id="geofile-${key}" accept=".kml,.kmz">
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

function clickHitsUploadedLayer(key, latlng){
  // Verificação simples: se houver camadas enviadas, deixa o evento da própria
  // camada (que chama stopPropagation) tratar o clique; aqui retornamos false
  // para permitir o popup de coordenadas quando o clique não acerta nada.
  return false;
}

function nextColor(key){
  const c = PASTEL_COLORS[uploadedColorIdx[key] % PASTEL_COLORS.length];
  uploadedColorIdx[key]++;
  return c;
}

function addGeoLayerToPanel(key, name, layer, color, map, ulc, geojson){
  const id = 'gl_'+Math.random().toString(36).slice(2,9);

  // ── Tipologias vetoriais presentes (ponto, linha, polígono) ──
  const types = new Set();
  (geojson?.features||[]).forEach(f=>{
    const t = f.geometry?.type;
    if(t==='Point'||t==='MultiPoint') types.add('point');
    else if(t==='LineString'||t==='MultiLineString') types.add('line');
    else if(t==='Polygon'||t==='MultiPolygon') types.add('polygon');
  });

  uploadedLayers[key].push({id, name, layer, color, geojson, types:[...types], hasPolygon:types.has('polygon')});
  const panel = document.getElementById('geoup-'+key);
  panel.classList.add('show');
  const list = document.getElementById('geolist-'+key);
  const item = document.createElement('div');
  item.className='geo-layer-item';
  item.id='item-'+id;

  const typeIcons = {point:'📍', line:'➖', polygon:'⬛'};
  const typeLabels = {point:'Ponto', line:'Linha', polygon:'Polígono'};
  const iconsHtml = [...types].map(t=>`<span class="glt-type-icon" title="${typeLabels[t]}">${typeIcons[t]}</span>`).join('');

  item.innerHTML = `<input type="color" class="layer-color-input glt-color" value="${escHtml(color)}" title="Cor da camada"><span class="glt-name" title="${escHtml(name)}">${escHtml(name)}</span><span class="glt-types">${iconsHtml}</span><span class="glt-rm" title="Remover">✕</span>`;
  item.querySelector('.glt-color').addEventListener('input', e=>{
    const newColor = e.target.value;
    const entry = uploadedLayers[key].find(l=>l.id===id);
    if(entry) entry.color = newColor;
    setGeoLayerColor(layer, newColor);
  });
  item.querySelector('.glt-rm').addEventListener('click', ()=>{
    map.removeLayer(layer);
    if(ulc) ulc.removeLayer(layer);
    uploadedLayers[key] = uploadedLayers[key].filter(l=>l.id!==id);
    item.remove();
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
  updateAreaButton(key);
}

// Habilita o botão "Área de polígono" somente quando há ao menos uma camada
// importada do tipo polígono na seção atual.
function updateAreaButton(key){
  const btn = document.getElementById('areaBtn-'+key);
  if(!btn) return;
  const hasPoly = (uploadedLayers[key]||[]).some(l=>l.hasPolygon);
  btn.disabled = !hasPoly;
  btn.title = hasPoly ? 'Calcular área de polígonos importados'
                      : 'Disponível quando houver polígono importado';
}

function styleGeoLayer(color){
  return {
    color: color, weight: 2, opacity: 0.9,
    fillColor: color, fillOpacity: 0.12,
    dashArray: null
  };
}

function bindGeoFeaturePopup(layer, feature, key){
  const props = feature.properties || {};
  const rows = Object.entries(props).slice(0,8).map(([k,v])=>
    `<tr><td style="color:var(--muted);padding:3px 10px 3px 0;font-size:12px;white-space:nowrap;vertical-align:top">${escHtml(k)}</td><td style="font-weight:500;padding:3px 0;font-size:12px">${v!==undefined&&v!==null?escHtml(v):'—'}</td></tr>`
  ).join('');
  const titulo = escHtml(props.name || props.Name || props.NAME || 'Feição');
  layer.bindPopup(`<div style="min-width:180px">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:13px;margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid var(--border)">📐 ${titulo}</div>
      <table style="border-collapse:collapse;width:100%">${rows || '<tr><td style="font-size:12px;color:var(--muted)">Sem atributos</td></tr>'}</table>
    </div>`, {maxWidth:280, className:'rich-popup'});
  layer.on('click', e=>{
    if(measureState[key] && measureState[key].active) return; // medição ativa: deixa o clique chegar ao mapa
    L.DomEvent.stopPropagation(e);
    const map = maps[key];
    if(map){ map.closePopup(); }
    layer.openPopup(e.latlng);
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
        sub.setStyle({color, fillColor:color, weight:2, fillOpacity:0.6});
      } else {
        sub.setStyle({color, fillColor:color, weight:2.5, fillOpacity:0.12});
      }
    }
  });
}

function addGeoJSONToMap(key, geojson, name, map, layersControl){
  const color = nextColor(key);
  // "Modo circunscrito" para polígonos: apenas contorno, sem preenchimento sólido
  const layer = L.geoJSON(geojson, {
    style: f => {
      const t = f.geometry && f.geometry.type;
      if(t==='Polygon'||t==='MultiPolygon'){
        return {color, weight:2.5, fillOpacity:0.05, fillColor:color, dashArray:'4 3'};
      }
      if(t==='LineString'||t==='MultiLineString'){
        return {color, weight:3.5, opacity:1, fill:false};
      }
      return {color, weight:2.5, fillOpacity:0.12, fillColor:color};
    },
    pointToLayer: (f, latlng) => L.circleMarker(latlng, {radius:6, color, weight:2, fillColor:color, fillOpacity:0.6}),
    onEachFeature: (feature, layer) => bindGeoFeaturePopup(layer, feature, key)
  });
  layer.addTo(map);
  layer.bringToFront();
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
  try{
    const b = layer.getBounds();
    if(b.isValid()) map.fitBounds(b, {padding:[32,32]});
  }catch(e){ console.warn('Bounds inválidos para camada', name, e); }
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

// ── Leitura de KML/KMZ ──
async function handleGeoFile(key, files, map, layersControl){
  const file = files[0]; if(!file) return;
  if(file.size > MAX_GEO_FILE_MB*1024*1024){
    alert(`Arquivo muito grande. O limite é ${MAX_GEO_FILE_MB} MB.`);
    return;
  }
  showLayerLoading(key);
  try{
    let kmlText;
    if(/\.kmz$/i.test(file.name)){
      const zip = await JSZip.loadAsync(file);
      const kmlEntry = Object.values(zip.files).find(f=>/\.kml$/i.test(f.name));
      if(!kmlEntry){ alert('Arquivo KMZ não contém um KML válido.'); hideLayerLoading(key); return; }
      kmlText = await kmlEntry.async('text');
    } else {
      kmlText = await file.text();
    }
    const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
    const geojson = toGeoJSON.kml(dom);
    if(!geojson.features || !geojson.features.length){
      alert('Nenhuma feição encontrada no arquivo KML.');
      hideLayerLoading(key); return;
    }
    addGeoJSONToMap(key, geojson, file.name, map, layersControl);
  }catch(err){
    console.error(err);
    alert('Erro ao processar o arquivo KML/KMZ: '+err.message);
  }finally{
    setTimeout(()=>hideLayerLoading(key), 400);
  }
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
    const m = f.name.match(/^(.*)\.(shp|shx|dbf|prj|cpg)$/i);
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
      const shpBuf = await set.shp.arrayBuffer();
      const dbfBuf = await set.dbf.arrayBuffer();
      let prjText = null;
      if(set.prj){ try{ prjText = await set.prj.text(); }catch(e){} }
      let geojson;
      try{
        geojson = await shp.combine([ shp.parseShp(shpBuf, prjText), shp.parseDbf(dbfBuf) ]);
      }catch(err){
        console.error(err);
        alert(`Erro ao processar o shapefile "${base}": ${err.message}`);
        continue;
      }
      if(!geojson.features || !geojson.features.length){
        alert(`O shapefile "${base}" não contém feições válidas.`);
        continue;
      }
      // Verifica se as coordenadas estão em uma faixa geográfica plausível (lat/lon)
      const sample = geojson.features.find(f=>f.geometry && f.geometry.coordinates);
      if(sample){
        const flat = JSON.stringify(sample.geometry.coordinates).match(/-?\d+\.?\d*/g).map(Number);
        const outOfRange = flat.some(v=>!isFinite(v) || Math.abs(v)>180+90);
        if(outOfRange){
          // Tenta reprojetar manualmente assumindo UTM SIRGAS2000/GRS80.
          // Detecta a zona pelo .prj (se houver) ou estima pela coordenada Easting.
          const zoneInfo = detectUTMZone(prjText, flat);
          if(zoneInfo){
            reprojectGeoJSON(geojson, zoneInfo.zone, zoneInfo.south);
          } else {
            alert(`O shapefile "${base}" parece estar em coordenadas projetadas (UTM) e não foi possível determinar a zona automaticamente. Inclua o arquivo .prj para conversão.`);
            continue;
          }
        }
      }
      addGeoJSONToMap(key, geojson, base+'.shp', map, layersControl);
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
//  TELA 1 — CONVERTER
// ════════════════════════════════════════
let convCount=0, convData=[];

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
}

function convConvert(){
  convData=[];document.getElementById('conv-tbody').innerHTML='';let found=0;
  for(let i=1;i<=convCount;i++){
    const eEl=document.getElementById(`conv-e-${i}`);if(!eEl)continue;
    const E=parseFloat(eEl.value),N=parseFloat(document.getElementById(`conv-n-${i}`).value);
    const Z=parseInt(document.getElementById(`conv-z-${i}`).value);
    const L=document.getElementById(`conv-l-${i}`).value||'K';
    if(isNaN(E)||isNaN(N)||!Z)continue;
    const geo=utmToGeo(E,N,Z,L);if(!geo)continue;
    found++;convData.push({name:`Ponto ${found}`,lat:geo.lat,lon:geo.lon});
    const tr=document.createElement('tr');tr.dataset.idx=found-1;
    tr.innerHTML=`<td>${found}</td><td><span class="zona-pill">${Z}${L}</span></td><td>${coordCell(geo.lat)}</td><td>${coordCell(geo.lon)}</td>`;
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
    convData.forEach((p,i)=>{addMarker('conv',p.lat,p.lon,p.name,i+1);bounds.push([p.lat,p.lon]);});
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
  convCount=0;convData=[];
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

const IMG_EXT=/\.(jpe?g|tiff?|heic|heif|webp)$/i;
async function handleExtFiles(files){
  const imgs=Array.from(files).filter(f=>IMG_EXT.test(f.name));
  if(!imgs.length){alert('Nenhuma imagem suportada encontrada.');return;}
  extData=[];clearMarkers('ext');
  const pw=document.getElementById('ext-progress'),pf=document.getElementById('ext-fill'),pl=document.getElementById('ext-label');
  pw.style.display='block';let withGPS=0,withoutGPS=0;
  for(let i=0;i<imgs.length;i++){
    pf.style.width=`${Math.round((i/imgs.length)*100)}%`;
    pl.textContent=`Processando ${i+1} de ${imgs.length}: ${imgs[i].name}`;
    const row=await readGPS(imgs[i]);
    if(row){extData.push(row);withGPS++;}else withoutGPS++;
  }
  pf.style.width='100%';pl.textContent='✔ Concluído';
  setTimeout(()=>{pw.style.display='none';showExtResults(withGPS,withoutGPS);},700);
}
function readGPS(file){
  return new Promise(resolve=>{
    const img=new Image(),url=URL.createObjectURL(file);
    img.onload=()=>{
      EXIF.getData(img,function(){
        const ld=EXIF.getTag(this,'GPSLatitude'),lr=EXIF.getTag(this,'GPSLatitudeRef');
        const od=EXIF.getTag(this,'GPSLongitude'),or=EXIF.getTag(this,'GPSLongitudeRef');
        const ar=EXIF.getTag(this,'GPSAltitude'),aref=EXIF.getTag(this,'GPSAltitudeRef');
        const dt=EXIF.getTag(this,'DateTimeOriginal')||EXIF.getTag(this,'DateTime')||'';
        URL.revokeObjectURL(url);
        if(!ld||!od){resolve(null);return;}
        const lat=dms2dec(ld,lr),lon=dms2dec(od,or);
        if(lat===null||lon===null){resolve(null);return;}
        const utm=geoToUTM(lat,lon);
        let alt='';if(ar!==undefined){const v=typeof ar==='object'?ar.numerator/ar.denominator:Number(ar);alt=(aref===1?-v:v).toFixed(1);}
        let dtFmt='';
        if(dt){
          // EXIF format: "YYYY:MM:DD HH:MM:SS"
          const m=String(dt).match(/(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})/);
          if(m) dtFmt=`${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]||'00'}`;
          else dtFmt=String(dt).substring(0,16);
        }
        resolve({name:file.name,lat,lon,E:utm.E,N:utm.N,zona:`${utm.zone}${utm.letter}`,alt,dtFmt});
      });
    };
    img.onerror=()=>{URL.revokeObjectURL(url);resolve(null);};
    img.src=url;
  });
}
function dms2dec(dms,ref){
  if(!dms||dms.length<3)return null;
  const f=v=>typeof v==='object'?v.numerator/v.denominator:Number(v);
  let d=f(dms[0])+f(dms[1])/60+f(dms[2])/3600;
  if(ref==='S'||ref==='W')d=-d;return+d.toFixed(8);
}
function showExtResults(withGPS,withoutGPS){
  document.getElementById('ext-upload-panel').style.display='none';
  document.getElementById('ext-split').style.display='flex';
  document.getElementById('ext-cnt-ok').textContent=withGPS;
  document.getElementById('ext-cnt-warn').textContent=withoutGPS;
  document.getElementById('ext-total-lbl').textContent=`${withGPS} pts`;
  buildMap('map-ext','ext');
  setTimeout(()=>{
    const tbody=document.getElementById('ext-tbody');tbody.innerHTML='';const bounds=[];
    extData.forEach((r,i)=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${i+1}</td><td class="fname-cell" title="${escHtml(r.name)}">${escHtml(r.name)}</td><td><span class="zona-pill" style="font-size:10px;padding:1px 5px">${escHtml(r.zona)}</span></td><td style="font-size:11px">${r.E.toLocaleString('pt-BR',{maximumFractionDigits:0})}</td><td style="font-size:11px">${r.N.toLocaleString('pt-BR',{maximumFractionDigits:0})}</td><td style="font-size:11px;text-align:right">${r.alt!==''?escHtml(r.alt)+'m':'—'}</td><td style="font-size:11px;white-space:nowrap">${escHtml(r.dtFmt)||'—'}</td>`;
      tr.addEventListener('click',()=>{
        document.querySelectorAll('#ext-tbody tr').forEach(t=>t.classList.remove('selected'));
        tr.classList.add('selected');
        if(maps.ext)maps.ext.setView([r.lat,r.lon],15);
        if(mkrs.ext[i])mkrs.ext[i].openPopup();
      });
      tbody.appendChild(tr);addMarker('ext',r.lat,r.lon,r.name,i+1);bounds.push([r.lat,r.lon]);
    });
    fitMap('ext',bounds);
  },300);
}
function clearExtrair(){
  extData=[];clearMarkers('ext');
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
}
function saveInformar(){
  infData=[];document.getElementById('inf-tbody').innerHTML='';let found=0;
  for(let i=1;i<=infCount;i++){
    const eEl=document.getElementById(`inf-e-${i}`);if(!eEl)continue;
    const E=parseFloat(eEl.value),N=parseFloat(document.getElementById(`inf-n-${i}`).value);
    const Z=parseInt(document.getElementById(`inf-z-${i}`).value);
    const L=document.getElementById(`inf-l-${i}`).value||'K';
    const nm=document.getElementById(`inf-nm-${i}`).value.trim()||`Ponto ${i}`;
    if(isNaN(E)||isNaN(N)||!Z)continue;
    const geo=utmToGeo(E,N,Z,L);if(!geo)continue;
    found++;infData.push({name:nm,lat:geo.lat,lon:geo.lon});
    const tr=document.createElement('tr');tr.dataset.idx=found-1;
    tr.innerHTML=`<td>${found}</td><td>${escHtml(nm)}</td><td><span class="zona-pill">${escHtml(Z)}${escHtml(L)}</span></td><td style="font-size:11px">${E.toLocaleString('pt-BR',{maximumFractionDigits:1})}</td><td style="font-size:11px">${N.toLocaleString('pt-BR',{maximumFractionDigits:1})}</td>`;
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
  const has = Array.isArray(infData) && infData.length > 0;
  const kml = document.getElementById('inf-dl-kml');
  const shp = document.getElementById('inf-dl-shp');
  const div = document.getElementById('inf-dl-divider');
  if(kml) kml.style.display = has ? '' : 'none';
  if(shp) shp.style.display = has ? '' : 'none';
  if(div) div.style.display = has ? '' : 'none';
}
function clearInformar(){
  infCount=0;infData=[];
  document.getElementById('inf-rows').innerHTML='';document.getElementById('inf-tbody').innerHTML='';
  document.getElementById('inf-split').style.display='none';document.getElementById('inf-input-panel').style.display='block';
  clearMarkers('inf');
  clearUploadedLayers('inf');
  if(typeof clearMeasure==='function') clearMeasure('inf');
  if(typeof updateInfDownloadButtons==='function') updateInfDownloadButtons();
  addInfRow();
}
function removeEl(id){const el=document.getElementById(id);if(el)el.remove();}
