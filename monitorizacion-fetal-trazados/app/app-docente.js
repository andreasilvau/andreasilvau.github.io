/* Módulo de Monitorización Fetal — contenido editable e ingreso docente.
   Carga lo publicado por el equipo docente (/api/contenido) y, con la clave docente,
   permite editar textos, crear y editar casos, subir registros reales y ordenar u ocultar. */
(function () {
'use strict';
if (window.__dcCargado) return; window.__dcCargado = true;

/* ================= utilidades ================= */
var OI = ['basal', 'vari', 'acel', 'des', 'rec', 'du', 'cat', 'res'];
function porOrden(a, b) { return OI.indexOf(a.k) - OI.indexOf(b.k); }
function clon(o) { return JSON.parse(JSON.stringify(o)); }
function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function plano(s) { return norm(String(s || '').replace(/[<>]/g, '')); }
function nuevoId(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function h(tag, attrs, kids) {
  var e = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    if (attrs[k] == null || attrs[k] === false) continue;
    if (k === 'text') e.textContent = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
    else if (k === 'class') e.className = attrs[k];
    else if (attrs[k] === true) e.setAttribute(k, '');
    else e.setAttribute(k, attrs[k]);
  }
  (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
var OKTAG = { P: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, BR: 1, UL: 1, OL: 1, LI: 1, A: 1, SMALL: 1, SUP: 1, SUB: 1, SPAN: 1, ABBR: 1, CODE: 1 };
function limpiar(html) {
  var t = document.createElement('template'); t.innerHTML = String(html || '');
  (function rec(n) {
    [].slice.call(n.childNodes).forEach(function (c) {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1) { c.remove(); return; }
      rec(c);
      if (!OKTAG[c.tagName]) {
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|SVG|MATH|TEMPLATE|LINK|META|FORM|INPUT|BUTTON|SELECT|TEXTAREA)$/.test(c.tagName)) { c.remove(); return; }
        var f = document.createDocumentFragment(); while (c.firstChild) f.appendChild(c.firstChild);
        if (/^(DIV|H\d|BLOCKQUOTE)$/.test(c.tagName)) f.appendChild(document.createElement('br'));
        c.replaceWith(f); return;
      }
      [].slice.call(c.attributes).forEach(function (a) {
        var v = a.value.trim(), keep = false;
        if (c.tagName === 'A' && a.name === 'href') keep = /^(https?:|#|mailto:)/i.test(v);
        else if (c.tagName === 'A' && a.name === 'data-go') keep = /^[a-z]+$/.test(v);
        else if (a.name === 'class') keep = /^[\w -]*$/.test(v);
        else if (c.tagName === 'ABBR' && a.name === 'title') keep = true;
        if (!keep) c.removeAttribute(a.name);
      });
      if (c.tagName === 'A' && /^https?:/i.test(c.getAttribute('href') || '')) { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener'); }
    });
  })(t.content);
  return t.innerHTML.replace(/(<br>)+$/, '');
}
/* texto con párrafos -> html simple, y al revés */
function aParrafos(html) { var x = limpiar(html).trim(); if (!x) return ''; if (/^<p[ >]/i.test(x)) return x; return x.split(/(?:<br>\s*){2,}/).map(function (p) { return '<p>' + p + '</p>'; }).join(''); }

/* ================= estado ================= */
var BASE_CASOS = CASOS.slice(), BASE_REAL = REAL.slice(), BASE_INF = INF.slice();
var ORIG_C = {}, ORIG_R = {};
BASE_CASOS.forEach(function (c) { ORIG_C[c.id] = { t: c.t, v: c.v, fin: c.fin }; });
BASE_REAL.forEach(function (r) { ORIG_R[r.id] = clon({ t: r.t, tipo: r.tipo, ctx: r.ctx, img: r.img, w: r.w, h: r.h, key: r.key, ex: r.ex, cond: r.cond }); });
var PUB = vacio();          // lo publicado
var D = null;               // borrador mientras se edita
var editando = false, sucio = false, textosOn = false;
var clave = null; try { clave = sessionStorage.getItem('mf-clave'); } catch (e) {}

function vacio() { return { v: 1, textos: {}, extras: [], casos: {}, reales: {}, orden: { casos: [], inf: [] }, ocultos: [] }; }
function normalizar(d) {
  var v = vacio(); if (!d || typeof d !== 'object') return v;
  ['textos', 'casos', 'reales'].forEach(function (k) { if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) v[k] = d[k]; });
  if (Array.isArray(d.extras)) v.extras = d.extras;
  if (Array.isArray(d.ocultos)) v.ocultos = d.ocultos;
  if (d.orden) { if (Array.isArray(d.orden.casos)) v.orden.casos = d.orden.casos; if (Array.isArray(d.orden.inf)) v.orden.inf = d.orden.inf; }
  return v;
}
function datos() { return editando ? D : PUB; }

/* ================= bloques de texto editables ================= */
var SECC = ['inicio', 'tipos', 'conceptos', 'acog', 'practica', 'casos', 'informe', 'fuentes'];
var SEL = 'h2,h3,h4,h5,p,li,td,th,figcaption,dt,dd,blockquote,caption';
var EXCL = '#seg,#pr-box,#grupos,#caso,#inf-cards,#inf-caso,.etapas,.cta-row,.escala,.sig-etapa,nav,button,.dc-ui,[data-dc-extra]';
var BLOQ = {};
function indexar() {
  BLOQ = {};
  var raices = SECC.map(function (id) { return [id, document.getElementById(id)]; });
  raices.push(['pie', document.querySelector('footer')]);
  raices.forEach(function (par) {
    var t = par[0], root = par[1]; if (!root) return; var cnt = {};
    var lista = [].slice.call(root.querySelectorAll(SEL));
    if (!lista.length && t === 'pie') lista = [root];
    lista.forEach(function (e) {
      if (e !== root && e.closest(EXCL)) return;
      if (e !== root && e.querySelector(SEL)) return;
      if (e.id && /resumen|avance|lectura|aviso|cuenta|titulo|ctx/.test(e.id)) return;
      if (e.querySelector('input,select,textarea,canvas,button,img')) return;
      var tx = norm(e.textContent); if (!tx) return;
      var k = t + ':' + hash(tx); cnt[k] = (cnt[k] || 0) + 1; k += ':' + cnt[k];
      e.setAttribute('data-dc', k); BLOQ[k] = { el: e, orig: e.innerHTML, tab: t };
    });
  });
}
function restaurarTextos() {
  for (var k in BLOQ) { var b = BLOQ[k]; if (b.el.innerHTML !== b.orig) b.el.innerHTML = b.orig; b.el.hidden = false; b.el.classList.remove('dc-oculto'); }
  [].forEach.call(document.querySelectorAll('[data-dc-extra]'), function (e) { e.remove(); });
}
function aplicarTextos(d) {
  for (var k in d.textos) {
    var b = BLOQ[k], m = d.textos[k]; if (!b || !m) continue;
    if (typeof m.html === 'string') b.el.innerHTML = limpiar(m.html);
    if (m.oculto) { b.el.classList.add('dc-oculto'); b.el.hidden = !editando; }
  }
  var ultimo = {};
  (d.extras || []).forEach(function (x) {
    var b = BLOQ[x.after]; if (!b || !x.id) return;
    var tag = /^(LI)$/.test(b.el.tagName) ? 'li' : 'p';
    var e = document.createElement(tag); e.setAttribute('data-dc-extra', x.id); e.setAttribute('data-dc-after', x.after); e.className = 'dc-extra';
    e.innerHTML = limpiar(x.html || '');
    var ref = ultimo[x.after] || b.el; ref.after(e); ultimo[x.after] = e;
  });
}
/* enlaces internos que quedaron dentro de textos editados */
document.addEventListener('click', function (ev) {
  if (ev.defaultPrevented) return;
  var a = ev.target.closest && ev.target.closest('a[data-go]'); if (!a || editando && textosOn) return;
  ev.preventDefault(); show(a.getAttribute('data-go'));
});

/* ================= casos clínicos creados por docentes ================= */
var PLANT = {
  RBNE: [['basal', 'FCF basal', '¿Cuál es la frecuencia cardíaca fetal basal?', 'basal'], ['vari', 'Variabilidad', '¿Cómo es la variabilidad?', 'vari'],
    ['acel', 'Aceleraciones', '¿Cuántas aceleraciones de al menos 15 lpm por 15 segundos hay?', 'acelR'], ['des', 'Desaceleraciones', '¿Hay desaceleraciones?', 'desR'],
    ['res', 'Resultado', '¿Cómo se informa este RBNE?', 'resR', 'resR']],
  TTC: [['basal', 'FCF basal', '¿Cuál es la frecuencia cardíaca fetal basal?', 'basal'], ['vari', 'Variabilidad', '¿Cómo es la variabilidad?', 'vari'],
    ['des', 'Desaceleraciones tardías', '¿Hay desaceleraciones tardías?', 'tardT', 'des'], ['du', 'Dinámica uterina', '¿La dinámica permite interpretar la prueba?', 'duT', 'resT'],
    ['res', 'Resultado', '¿Cómo se informa este TTC?', 'resT', 'resT']],
  MEFI: [['basal', 'FCF basal', '¿Cuál es la frecuencia cardíaca fetal basal?', 'basal'], ['vari', 'Variabilidad', '¿Cómo es la variabilidad?', 'vari'],
    ['acel', 'Aceleraciones', '¿Hay aceleraciones?', 'acel'], ['des', 'Desaceleraciones', '¿Qué desaceleraciones hay?', 'des'],
    ['du', 'Dinámica uterina', '¿Cómo está la dinámica uterina?', 'du'], ['cat', 'Conclusión', '¿A qué categoría corresponde?', 'cat']]
};
var REFCOND = { RBNE: 'condA', TTC: 'condT', MEFI: 'condI' };
function contracciones(s) {
  if (!s.cont || !(s.cont.cada > 0)) return [];
  var per = s.cont.cada * 60, ini = Math.max(45, Math.min(90, per * 0.5)), fin = s.dur * 60 - 30, out = [];
  for (var t = ini; t < fin; t += per) out.push({ t: t, d: +s.cont.d || 60, amp: +s.cont.amp || 50 });
  return out;
}
function eventos(s, con) {
  var r = rng((s.seed || 1) + 7), ev = [], N = s.dur * 60;
  var na = Math.max(0, Math.min(12, +((s.acel && s.acel.n) || 0)));
  if (na) {
    var huecos = [];
    if (con.length > 1) { for (var i = 0; i < con.length; i++) { var a = con[i].t + con[i].d / 2 + 10, b = (i + 1 < con.length ? con[i + 1].t - con[i + 1].d / 2 : N) - 10; if (b - a > 40) huecos.push((a + b) / 2); } }
    if (huecos.length < na) { huecos = []; for (var j = 0; j < na; j++) huecos.push(N * (j + 0.5) / na); }
    for (var q = 0; q < na; q++) { var c = huecos[Math.floor(q * huecos.length / na)], d = 22 + Math.round(r() * 12); ev.push({ y: 'acel', t: Math.max(5, c - d / 2), amp: 17 + Math.round(r() * 7), d: d }); }
  }
  var de = s.des || {}, tipo = de.tipo || 'no';
  if (tipo === 'prol') ev.push({ y: 'prol', t: Math.round(N * 0.5), dep: +de.dep || 55, d: 220 });
  else if (tipo !== 'no' && con.length) {
    var idx = con.map(function (_, i) { return i; });
    if (de.en === 'mitad') idx = idx.filter(function (i) { return i % 2 === 0; });
    else if (de.en === 'una') idx = [Math.floor(con.length / 2)];
    idx.forEach(function (i) {
      var dep = (+de.dep || { prec: 18, tard: 20, var: 40 }[tipo]) + Math.round((r() - 0.5) * 6);
      if (tipo === 'prec') ev.push({ y: 'prec', i: i, dep: dep });
      else if (tipo === 'tard') ev.push({ y: 'tard', i: i, dep: dep, lag: 30, d: 80 });
      else if (tipo === 'var') ev.push({ y: 'var', i: i, off: -12 + Math.round(r() * 8), dep: dep, d: 34 + Math.round(r() * 10) });
    });
  }
  return ev;
}
function trazoDesdeSpec(s) {
  var con = contracciones(s);
  var c = { seed: +s.seed || 1, dur: +s.dur || 20, base: +s.base || 140, vseg: [[0, +s.vamp || 12]], con: con, ev: eventos(s, con), mov: !!(s.acel && s.acel.mov) };
  if (s.sin) { c.sin = 9; c.vseg = [[0, 0.7]]; }
  return c;
}
function casoDesdeSpec(id, s) {
  if (!s || !PLANT[s.g] || !s.t) return null;
  var c = trazoDesdeSpec(s); c.id = id; c.g = s.g; c.t = plano(s.t); c.v = aParrafos(s.v || '') || '<p></p>'; c.fin = aParrafos(s.fin || '') || '<p>Fin del caso.</p>'; c.nuevo = true;
  var P = s.pasos || {};
  c.steps = PLANT[s.g].map(function (p) { var x = P[p[0]] || {}, ops = OPT[p[3]]; var a = +x.a; if (!(a >= 0 && a < ops.length)) a = 0; return S(p[0], p[1], p[2], ops, a, limpiar(x.ok || ''), p[4]); });
  var cd = s.cond || {}, opts = (cd.opts || []).map(plano).filter(Boolean);
  if (opts.length >= 2) { var ca = +cd.a; if (!(ca >= 0 && ca < opts.length)) ca = 0; c.steps.push(S('cond', 'Conducta', '¿Cuál es la conducta?', opts, ca, limpiar(cd.ok || ''), REFCOND[s.g])); }
  return c;
}
function sugerir(s) {
  var base = +s.base, vamp = +s.vamp, con = contracciones(s), por10 = con.length ? 10 / s.cont.cada : 0;
  var tipo = (s.des && s.des.tipo) || 'no', en = (s.des && s.des.en) || 'todas', na = +((s.acel && s.acel.n) || 0);
  var recur = en !== 'una' && con.length > 1;
  var r = {};
  r.basal = s.sin ? 3 : base > 160 ? 1 : base < 110 ? 2 : 0;
  r.vari = s.sin ? 0 : vamp <= 1.5 ? 0 : vamp <= 5 ? 1 : vamp <= 25 ? 2 : 3;
  if (s.g === 'RBNE') {
    r.acel = na * 20 / s.dur >= 2 ? 0 : na ? 1 : 2; r.des = tipo === 'no' ? 0 : 1;
    r.res = (r.acel === 0 && tipo === 'no' && r.basal === 0) ? 0 : 1;
  } else if (s.g === 'TTC') {
    r.des = tipo === 'tard' ? (recur ? 2 : 1) : 0;
    r.du = por10 > 5 ? 2 : por10 >= 3 ? 0 : 1;
    r.res = r.du === 2 ? 4 : r.du === 1 && r.des !== 2 ? 3 : r.des === 2 ? 1 : r.des === 1 ? 2 : 0;
  } else {
    r.acel = na ? 0 : 1;
    r.des = { no: 0, prec: 1, prol: 6 }[tipo]; if (tipo === 'tard') r.des = recur ? 2 : 3; if (tipo === 'var') r.des = recur ? 4 : 5;
    r.du = por10 > 5 ? 1 : 0;
    var III = s.sin || (r.vari === 0 && ((tipo === 'tard' && recur) || (tipo === 'var' && recur) || base < 110));
    var I = r.basal === 0 && r.vari === 2 && (tipo === 'no' || tipo === 'prec');
    r.cat = III ? 2 : I ? 0 : 1;
  }
  return r;
}
function textoSugerido(k, s, a, ops) {
  if (k === 'basal') return s.sin ? 'Hay una ondulación regular y lisa: patrón sinusoidal.' : 'La línea de base está en torno a ' + s.base + ' lpm.';
  return ops[a] ? ops[a] + '.' : '';
}

/* ================= aplicar estructura (casos, registros, orden, ocultos) ================= */
function ordenar(a, ids) {
  var pos = {}; (ids || []).forEach(function (id, i) { pos[id] = i; });
  var o = a.map(function (x, i) { return [x, i]; });
  o.sort(function (p, q) { var a1 = p[0].id in pos ? pos[p[0].id] : 1e6 + p[1], b1 = q[0].id in pos ? pos[q[0].id] : 1e6 + q[1]; return a1 - b1; });
  for (var i = 0; i < a.length; i++) a[i] = o[i][0];
}
function imgValida(u) { return typeof u === 'string' && (/^\/api\/img\?id=[A-Za-z0-9_-]+$/.test(u) || /^\/reales\/[a-z0-9-]+\.webp$/.test(u)); }
function realDesde(id, m, base) {
  var r = base || { id: id, real: 1 };
  var o = ORIG_R[id] ? clon(ORIG_R[id]) : {};
  r.t = plano(m.t != null ? m.t : o.t); r.tipo = RES[m.tipo] ? m.tipo : (o.tipo || 'RBNE');
  r.ctx = String(m.ctx != null ? m.ctx : o.ctx || ''); r.img = imgValida(m.img) ? m.img : o.img;
  r.w = +m.w || o.w || 1000; r.h = +m.h || o.h || 600; r.key = m.key || o.key || {}; r.ex = m.ex || o.ex || {}; r.cond = String(m.cond != null ? m.cond : o.cond || '');
  r.campos = camposReal(r.tipo).sort(porOrden);
  return r;
}
function todosCasos(d) {
  BASE_CASOS.forEach(function (c) { var o = ORIG_C[c.id], m = d.casos[c.id] || {}; c.t = m.t ? plano(m.t) : o.t; c.v = m.v ? aParrafos(m.v) : o.v; c.fin = m.fin ? aParrafos(m.fin) : o.fin; });
  var nuevos = Object.keys(d.casos).filter(function (id) { return !ORIG_C[id]; }).map(function (id) { return casoDesdeSpec(id, d.casos[id]); }).filter(Boolean);
  var t = BASE_CASOS.concat(nuevos); ordenar(t, d.orden.casos); return t;
}
function todosRegistros(d) {
  BASE_REAL.forEach(function (r) { realDesde(r.id, d.reales[r.id] || {}, r); });
  var nr = Object.keys(d.reales).filter(function (id) { return !ORIG_R[id]; }).map(function (id) { return realDesde(id, d.reales[id]); }).filter(function (r) { return r.t && r.img; });
  var t = BASE_REAL.concat(nr).concat(BASE_INF); ordenar(t, d.orden.inf); return t;
}
function aplicarEstructura(d) {
  var oc = {}; (d.ocultos || []).forEach(function (id) { oc[id] = 1; });
  var tc = todosCasos(d).filter(function (c) { return !oc[c.id]; });
  CASOS.splice.apply(CASOS, [0, CASOS.length].concat(tc));
  var tr = todosRegistros(d).filter(function (x) { return !oc[x.id]; });
  REAL.splice.apply(REAL, [0, REAL.length].concat(tr.filter(function (x) { return x.real; })));
  INF.splice.apply(INF, [0, INF.length].concat(tr.filter(function (x) { return !x.real; })));
  ALLINF.splice.apply(ALLINF, [0, ALLINF.length].concat(REAL, INF));
  try { lista(); } catch (e) {}
  try { infLista(); } catch (e) {}
  try { avance(); } catch (e) {}
}
function aplicarTodo(d) { restaurarTextos(); aplicarTextos(d); aplicarEstructura(d); if (editando && textosOn) activarTextos(true); }

/* ================= API ================= */
function api(accion, cuerpo) {
  cuerpo = cuerpo || {}; cuerpo.accion = accion;
  return fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-clave': clave || '' }, body: JSON.stringify(cuerpo) })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 401) { olvidarClave(); } if (!r.ok) throw new Error(j.error || ('Error ' + r.status)); return j; }); });
}
function olvidarClave() { clave = null; try { sessionStorage.removeItem('mf-clave'); } catch (e) {} }

/* ================= estilos ================= */
var css = [
  '.dc-acceso{max-width:1180px;margin:0 auto;padding:0 18px 28px;font-size:.85rem}',
  '.dc-acceso a{color:var(--muted)}',
  'body.dc-on{padding-bottom:84px}',
  '.dc-barra{position:fixed;left:0;right:0;bottom:0;z-index:50;background:#033a5d;color:#fff;border-top:4px solid #00b0e1;box-shadow:0 -6px 18px rgba(3,58,93,.18)}',
  '.dc-barra-in{max-width:1180px;margin:0 auto;padding:10px 18px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
  '.dc-barra b{font:700 .95rem var(--display,inherit);margin-right:6px;color:#06e0ff}',
  '.dc-barra button{font:600 .9rem var(--sans);min-height:40px;padding:8px 13px;border-radius:7px;border:1px solid rgba(255,255,255,.45);background:transparent;color:#fff;cursor:pointer}',
  '.dc-barra button:hover{background:rgba(255,255,255,.12)}',
  '.dc-barra button[aria-pressed="true"]{background:#fff;color:#033a5d}',
  '.dc-barra .dc-pub{background:#fff;color:#033a5d;border-color:#fff}',
  '.dc-barra .dc-estado{font-size:.85rem;color:#cfe6f5;margin-left:auto}',
  '.dc-edit{outline:1px dashed #0a7fb8;outline-offset:3px;border-radius:2px;cursor:text}',
  '.dc-edit:focus{outline:2px solid #0a7fb8;background:#f2f9fd}',
  '.dc-oculto{opacity:.4;text-decoration:line-through}',
  '.dc-extra.dc-edit{outline-color:#1f7a45}',
  '.dc-mini{position:absolute;z-index:45;display:flex;gap:4px;flex-wrap:wrap;background:#033a5d;padding:5px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.2)}',
  '.dc-mini button{font:600 .8rem var(--sans);min-height:34px;padding:5px 10px;border-radius:6px;border:0;background:#fff;color:#033a5d;cursor:pointer}',
  'dialog.dc-dlg{border:0;border-radius:12px;padding:0;width:min(980px,96vw);max-height:92vh;overflow:auto;color:var(--ink);background:var(--panel,#fff);box-shadow:0 20px 50px rgba(3,58,93,.35)}',
  'dialog.dc-dlg::backdrop{background:rgba(3,30,50,.55)}',
  'dialog.dc-chico{width:min(440px,94vw)}',
  '.dc-cab{display:flex;align-items:center;gap:10px;padding:14px 20px;background:#033a5d;color:#fff;border-bottom:4px solid #00b0e1;position:sticky;top:0;z-index:2}',
  '.dc-cab h2{margin:0;font:700 1.15rem var(--display,inherit);color:#fff;border:0;padding:0;flex:1}',
  '.dc-cab button{font:600 .9rem var(--sans);min-height:38px;padding:6px 12px;border-radius:7px;border:1px solid rgba(255,255,255,.5);background:transparent;color:#fff;cursor:pointer}',
  '.dc-cuerpo{padding:18px 20px 22px;overflow:auto}',
  '.dc-cuerpo h3{margin:18px 0 8px;font-size:1.02rem}',
  '.dc-fila{display:flex;flex-wrap:wrap;gap:12px;margin:10px 0}',
  '.dc-campo{display:flex;flex-direction:column;gap:4px;min-width:150px;flex:1}',
  '.dc-campo>span{font:600 .85rem var(--sans);color:var(--muted)}',
  '.dc-campo input,.dc-campo select,.dc-campo textarea,.dc-rt{font:400 16px var(--sans);padding:8px 10px;border:1px solid var(--field);border-radius:7px;background:#fff;color:var(--ink);min-height:40px;box-sizing:border-box;width:100%}',
  '.dc-rt{min-height:90px;line-height:1.45}.dc-rt p{margin:0 0 .6em}',
  '.dc-ayuda{font-size:.85rem;color:var(--muted);margin:2px 0 8px}',
  '.dc-lista{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}',
  '.dc-lista li{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--line)}',
  '.dc-lista li .t{flex:1;min-width:180px}',
  '.dc-lista li.oc .t{opacity:.5}',
  '.dc-lista small{font:500 .75rem var(--mono);color:var(--muted);display:block}',
  '.dc-btn{font:600 .85rem var(--sans);min-height:36px;padding:5px 11px;border-radius:7px;border:1px solid var(--field);background:#fff;color:var(--ink);cursor:pointer}',
  '.dc-btn:hover{border-color:#033a5d}',
  '.dc-btn.pri{background:#033a5d;color:#fff;border-color:#033a5d}',
  '.dc-btn.pel{color:#b42318;border-color:#b42318}',
  '.dc-btn[disabled]{opacity:.4;cursor:default}',
  '.dc-paso{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0;background:#fbfdff}',
  '.dc-chk{display:flex;flex-wrap:wrap;gap:6px 14px}.dc-chk label{display:flex;gap:6px;align-items:center;font-size:.92rem}',
  '.dc-prev{overflow-x:auto;border:1px solid var(--line);border-radius:8px;background:var(--paper)}',
  '.dc-err{color:#b42318;font-weight:600}',
  '.dc-ok{color:#1f7a45;font-weight:600}',
  '.dc-anon{position:relative;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#eee;touch-action:none}',
  '.dc-anon canvas{display:block;width:100%;height:auto;cursor:crosshair}',
  '.dc-pie{display:flex;flex-wrap:wrap;gap:8px;padding:14px 20px;border-top:1px solid var(--line);position:sticky;bottom:0;background:var(--panel,#fff)}',
  '@media (max-width:620px){.dc-barra-in{gap:6px}.dc-barra .dc-estado{width:100%;margin:0}}'
].join('\n');
document.head.appendChild(h('style', { text: css }));

/* ================= diálogos ================= */
function dialogo(titulo, chico) {
  var dlg = h('dialog', { class: 'dc-dlg dc-ui' + (chico ? ' dc-chico' : ''), 'aria-label': titulo });
  var cerrar = h('button', { type: 'button', text: 'Cerrar', onclick: function () { dlg.close(); } });
  var cuerpo = h('div', { class: 'dc-cuerpo' });
  dlg.appendChild(h('div', { class: 'dc-cab' }, [h('h2', { text: titulo }), cerrar]));
  dlg.appendChild(cuerpo);
  dlg.addEventListener('close', function () { setTimeout(function () { dlg.remove(); }, 0); });
  document.body.appendChild(dlg); dlg.showModal();
  return { dlg: dlg, cuerpo: cuerpo, cerrar: cerrar };
}
function campo(lab, input, ayuda) { return h('label', { class: 'dc-campo' }, [h('span', { text: lab }), input, ayuda ? h('span', { class: 'dc-ayuda', text: ayuda }) : null]); }
function rt(html) { return h('div', { class: 'dc-rt', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', html: limpiar(html || '') }); }
function sel(opts, val) { var s = h('select'); opts.forEach(function (o, i) { var v = Array.isArray(o) ? o[0] : i, t = Array.isArray(o) ? o[1] : o; var op = h('option', { value: String(v), text: t }); if (String(v) === String(val)) op.selected = true; s.appendChild(op); }); return s; }

/* ================= ingreso ================= */
function pedirClave(luego) {
  var d = dialogo('Ingreso docente', true);
  var inp = h('input', { type: 'password', autocomplete: 'current-password', id: 'dc-clave' });
  var msg = h('p', { class: 'dc-ayuda', role: 'status' });
  var btn = h('button', { class: 'dc-btn pri', type: 'submit', text: 'Entrar' });
  var f = h('form', null, [h('p', { text: 'Con la clave docente puedes editar los textos de cada pestaña, crear casos clínicos, subir registros reales y ordenar u ocultar contenido.' }), campo('Clave docente', inp), msg, h('div', { class: 'dc-fila' }, [btn])]);
  f.addEventListener('submit', function (ev) {
    ev.preventDefault(); clave = inp.value.trim(); if (!clave) return;
    btn.disabled = true; msg.className = 'dc-ayuda'; msg.textContent = 'Comprobando…';
    api('probar').then(function () { try { sessionStorage.setItem('mf-clave', clave); } catch (e) {} d.dlg.close(); (luego || entrar)(); })
      .catch(function (e) { btn.disabled = false; msg.className = 'dc-err'; msg.textContent = e.message; inp.select(); });
  });
  d.cuerpo.appendChild(f); inp.focus();
}
var acceso = h('div', { class: 'dc-acceso dc-ui' }, [h('a', { href: '#docente', id: 'dc-ingreso', text: 'Ingreso docente', onclick: function (ev) { ev.preventDefault(); if (editando) return; if (clave) entrar(); else pedirClave(); } })]);
var ft = document.querySelector('footer'); (ft || document.body).after ? (ft ? ft.after(acceso) : document.body.appendChild(acceso)) : document.body.appendChild(acceso);

/* ================= modo docente ================= */
var barra = null, estado = null, mini = null;
function marcarSucio() { sucio = true; if (estado) { estado.className = 'dc-estado'; estado.textContent = 'Cambios sin publicar'; } }
function entrar() {
  if (editando) return;
  editando = true; sucio = false; D = clon(PUB); document.body.classList.add('dc-on');
  var bt = h('button', { type: 'button', 'aria-pressed': 'false', text: 'Editar textos', onclick: function () { activarTextos(!textosOn); bt.setAttribute('aria-pressed', String(textosOn)); } });
  estado = h('span', { class: 'dc-estado', role: 'status', text: 'Sin cambios' });
  barra = h('div', { class: 'dc-barra dc-ui', role: 'region', 'aria-label': 'Herramientas docentes' }, [h('div', { class: 'dc-barra-in' }, [
    h('b', { text: 'Modo docente' }), bt,
    h('button', { type: 'button', text: 'Casos clínicos', onclick: panelCasos }),
    h('button', { type: 'button', text: 'Registros del informe', onclick: panelRegistros }),
    h('button', { type: 'button', text: 'Historial', onclick: panelHistorial }),
    h('button', { type: 'button', class: 'dc-pub', text: 'Guardar y publicar', onclick: publicar }),
    h('button', { type: 'button', text: 'Salir', onclick: salir }), estado])]);
  document.body.appendChild(barra);
  aplicarTodo(D);
}
function salir() {
  if (sucio) {
    var d = dialogo('Hay cambios sin publicar', true);
    d.cuerpo.appendChild(h('p', { text: 'Si sales ahora, los cambios que no publicaste se pierden.' }));
    d.cuerpo.appendChild(h('div', { class: 'dc-fila' }, [
      h('button', { class: 'dc-btn pri', type: 'button', text: 'Seguir editando', onclick: function () { d.dlg.close(); } }),
      h('button', { class: 'dc-btn pel', type: 'button', text: 'Descartar y salir', onclick: function () { d.dlg.close(); sucio = false; salir(); } })]));
    return;
  }
  activarTextos(false); editando = false; D = null; document.body.classList.remove('dc-on');
  if (barra) barra.remove(); barra = null; olvidarClave(); aplicarTodo(PUB);
}
window.addEventListener('beforeunload', function (e) { if (editando && sucio) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- textos ---------- */
function editables() { return [].slice.call(document.querySelectorAll('[data-dc],[data-dc-extra]')).filter(function (e) { return !e.closest('.dc-ui'); }); }
function activarTextos(on) {
  textosOn = on;
  editables().forEach(function (e) {
    if (on) { e.setAttribute('contenteditable', 'true'); e.classList.add('dc-edit'); if (e.classList.contains('dc-oculto')) e.hidden = false; }
    else { e.removeAttribute('contenteditable'); e.classList.remove('dc-edit'); if (e.classList.contains('dc-oculto')) e.hidden = editando ? false : true; }
  });
  if (!on && mini) { mini.remove(); mini = null; }
  if (on) recogerTextos(); // normaliza el borrador
}
document.addEventListener('input', function (ev) { var t = ev.target; if (editando && t.closest && t.closest('[data-dc],[data-dc-extra]') && !t.closest('.dc-ui')) marcarSucio(); }, true);
document.addEventListener('focusin', function (ev) {
  if (!editando || !textosOn) return;
  var e = ev.target.closest && ev.target.closest('[data-dc],[data-dc-extra]'); if (!e || e.closest('.dc-ui')) return;
  ponerMini(e);
});
function ponerMini(e) {
  if (mini) mini.remove();
  var extra = e.hasAttribute('data-dc-extra'), k = e.getAttribute('data-dc');
  var cmd = function (c) { return function (ev) { ev.preventDefault(); e.focus(); document.execCommand(c); marcarSucio(); }; };
  var btns = [
    h('button', { type: 'button', text: 'Negrita', onmousedown: cmd('bold') }),
    h('button', { type: 'button', text: 'Cursiva', onmousedown: cmd('italic') }),
    h('button', { type: 'button', text: 'Agregar párrafo debajo', onmousedown: function (ev) {
      ev.preventDefault(); var anc = extra ? e.getAttribute('data-dc-after') : k; var base = BLOQ[anc]; if (!base) return;
      if (/^(TD|TH|CAPTION)$/.test(base.el.tagName)) { aviso('En tablas no se pueden agregar párrafos.'); return; }
      var n = document.createElement(base.el.tagName === 'LI' ? 'li' : 'p'); n.setAttribute('data-dc-extra', nuevoId('x')); n.setAttribute('data-dc-after', anc);
      n.className = 'dc-extra dc-edit'; n.setAttribute('contenteditable', 'true'); n.textContent = 'Nuevo párrafo';
      e.after(n); marcarSucio(); n.focus(); var r = document.createRange(); r.selectNodeContents(n); var s = getSelection(); s.removeAllRanges(); s.addRange(r);
    } }),
    extra ? h('button', { type: 'button', text: 'Eliminar párrafo', onmousedown: function (ev) { ev.preventDefault(); e.remove(); if (mini) mini.remove(); mini = null; marcarSucio(); } })
      : h('button', { type: 'button', text: e.classList.contains('dc-oculto') ? 'Mostrar a estudiantes' : 'Ocultar a estudiantes', onmousedown: function (ev) { ev.preventDefault(); e.classList.toggle('dc-oculto'); marcarSucio(); ponerMini(e); } }),
    !extra ? h('button', { type: 'button', text: 'Volver al original', onmousedown: function (ev) { ev.preventDefault(); e.innerHTML = BLOQ[k].orig; e.classList.remove('dc-oculto'); marcarSucio(); ponerMini(e); } }) : null
  ];
  mini = h('div', { class: 'dc-mini dc-ui', role: 'toolbar', 'aria-label': 'Formato del texto' }, btns);
  document.body.appendChild(mini);
  var r = e.getBoundingClientRect();
  mini.style.left = Math.max(8, Math.min(r.left + scrollX, scrollX + innerWidth - mini.offsetWidth - 8)) + 'px';
  mini.style.top = Math.max(8, r.top + scrollY - mini.offsetHeight - 8) + 'px';
}
function aviso(t) { if (estado) { estado.className = 'dc-estado'; estado.textContent = t; } }
function recogerTextos() {
  if (!D) return;
  var tx = {};
  for (var k in BLOQ) {
    var b = BLOQ[k], cur = limpiar(b.el.innerHTML), org = limpiar(b.orig), oc = b.el.classList.contains('dc-oculto');
    if (norm(cur) !== norm(org) || oc) tx[k] = { html: norm(cur) !== norm(org) ? cur : null, oculto: oc };
  }
  D.textos = tx;
  D.extras = [].slice.call(document.querySelectorAll('[data-dc-extra]')).filter(function (e) { return BLOQ[e.getAttribute('data-dc-after')]; })
    .map(function (e) { return { id: e.getAttribute('data-dc-extra'), after: e.getAttribute('data-dc-after'), html: limpiar(e.innerHTML) }; })
    .filter(function (x) { return norm(x.html.replace(/<[^>]+>/g, '')); });
}

/* ---------- publicar ---------- */
function publicar() {
  recogerTextos();
  aviso('Publicando…');
  api('guardar', { datos: D }).then(function (j) {
    PUB = clon(D); sucio = false;
    var hora = new Date(j.actualizado || Date.now()); estado.className = 'dc-estado';
    estado.textContent = 'Publicado a las ' + hora.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }).catch(function (e) { estado.className = 'dc-estado'; estado.textContent = 'No se publicó: ' + e.message; if (!clave) pedirClave(publicar); });
}

/* ---------- historial ---------- */
function panelHistorial() {
  var d = dialogo('Historial de versiones publicadas', true);
  var ul = h('ul', { class: 'dc-lista' }); d.cuerpo.appendChild(h('p', { class: 'dc-ayuda', text: 'Cada vez que publicas se guarda una copia. Restaurar una versión la vuelve a publicar tal cual.' })); d.cuerpo.appendChild(ul);
  api('historial').then(function (j) {
    if (!j.versiones.length) ul.appendChild(h('li', { text: 'Todavía no hay versiones publicadas.' }));
    j.versiones.forEach(function (v, i) {
      var f = new Date(v.guardado);
      ul.appendChild(h('li', null, [h('span', { class: 't', text: f.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) + (i === 0 ? ' (actual)' : '') }),
        i === 0 ? null : h('button', { class: 'dc-btn', type: 'button', text: 'Restaurar', onclick: function () {
          api('restaurar', { n: v.n }).then(function (r) { PUB = normalizar(r.datos); D = clon(PUB); sucio = false; aplicarTodo(D); aviso('Versión restaurada y publicada'); d.dlg.close(); }).catch(function (e) { alertaEn(d.cuerpo, e.message); });
        } })]));
    });
  }).catch(function (e) { alertaEn(d.cuerpo, e.message); });
}
function alertaEn(box, t) { box.appendChild(h('p', { class: 'dc-err', role: 'alert', text: t })); }

/* ---------- utilidades de lista (orden y visibilidad) ---------- */
function oculto(id) { return D.ocultos.indexOf(id) >= 0; }
function alternarOculto(id) { var i = D.ocultos.indexOf(id); if (i >= 0) D.ocultos.splice(i, 1); else D.ocultos.push(id); marcarSucio(); aplicarEstructura(D); }
function mover(lista, ids, id, dir, mismoGrupo) {
  var i = ids.indexOf(id), j = i + dir;
  while (j >= 0 && j < ids.length && !mismoGrupo(ids[j])) j += dir;
  if (j < 0 || j >= ids.length) return false;
  ids[i] = ids[j]; ids[j] = id; return true;
}

/* ---------- casos clínicos ---------- */
function panelCasos() {
  var d = dialogo('Casos clínicos');
  function pintar() {
    d.cuerpo.innerHTML = '';
    var todos = todosCasos(D); D.orden.casos = todos.map(function (c) { return c.id; });
    d.cuerpo.appendChild(h('p', { class: 'dc-ayuda', text: 'Ordena, oculta o edita los casos. Los casos nuevos se crean con un trazado generado a partir de los parámetros que elijas. Los cambios se ven al tiro en la página; para que los vean las estudiantes, usa «Guardar y publicar».' }));
    d.cuerpo.appendChild(h('div', { class: 'dc-fila' }, [h('button', { class: 'dc-btn pri', type: 'button', text: 'Crear caso clínico', onclick: function () { d.dlg.close(); editorCaso(null); } })]));
    GRUPOS.forEach(function (g) {
      var del = todos.filter(function (c) { return c.g === g[0]; }); if (!del.length) return;
      d.cuerpo.appendChild(h('h3', { text: g[1] }));
      var ul = h('ul', { class: 'dc-lista' });
      del.forEach(function (c, i) {
        var oc = oculto(c.id);
        ul.appendChild(h('li', { class: oc ? 'oc' : '' }, [
          h('span', { class: 't' }, [h('small', { text: (c.nuevo ? 'Caso nuevo' : 'Caso del módulo') + (oc ? ' · oculto' : '') }), c.t]),
          h('button', { class: 'dc-btn', type: 'button', text: 'Subir', 'aria-label': 'Subir ' + c.t, disabled: i === 0, onclick: function () { if (mover(todos, D.orden.casos, c.id, -1, function (id) { return todos.find(function (x) { return x.id === id; }).g === c.g; })) { marcarSucio(); aplicarEstructura(D); pintar(); } } }),
          h('button', { class: 'dc-btn', type: 'button', text: 'Bajar', 'aria-label': 'Bajar ' + c.t, disabled: i === del.length - 1, onclick: function () { if (mover(todos, D.orden.casos, c.id, 1, function (id) { return todos.find(function (x) { return x.id === id; }).g === c.g; })) { marcarSucio(); aplicarEstructura(D); pintar(); } } }),
          h('button', { class: 'dc-btn', type: 'button', text: oc ? 'Mostrar' : 'Ocultar', onclick: function () { alternarOculto(c.id); pintar(); } }),
          h('button', { class: 'dc-btn', type: 'button', text: 'Editar', onclick: function () { d.dlg.close(); editorCaso(c.id); } })]));
      });
      d.cuerpo.appendChild(ul);
    });
  }
  pintar();
}
function editorCaso(id) {
  var esBase = id && ORIG_C[id];
  if (esBase) return editorCasoBase(id);
  var s = id ? clon(D.casos[id]) : { g: 'MEFI', t: '', v: '', fin: '', dur: 20, base: 140, vamp: 12, sin: false, seed: Math.floor(Math.random() * 9000) + 100,
    cont: { cada: 3, d: 60, amp: 50 }, acel: { n: 2, mov: false }, des: { tipo: 'no', en: 'todas', dep: 0 }, pasos: {}, cond: { opts: ['', '', ''], a: 0, ok: '' } };
  var tocado = {}; if (id) Object.keys(s.pasos || {}).forEach(function (k) { tocado[k] = true; });
  var d = dialogo(id ? 'Editar caso clínico' : 'Crear caso clínico');
  var c = d.cuerpo;
  var gSel = sel(GRUPOS.map(function (g) { return [g[0], g[1]]; }), s.g);
  var tIn = h('input', { type: 'text', value: s.t, maxlength: '120' });
  var vRt = rt(s.v), finRt = rt(s.fin);
  c.appendChild(h('div', { class: 'dc-fila' }, [campo('Tipo de monitoreo', gSel), campo('Título del caso', tIn, 'Por ejemplo: «Preeclampsia, 37 semanas».')]));
  c.appendChild(campo('Historia clínica', vRt, 'Lo que lee la estudiante antes de ver el trazado.'));
  c.appendChild(h('h3', { text: 'Trazado' }));
  var durS = sel([[10, '10 minutos'], [20, '20 minutos'], [30, '30 minutos'], [40, '40 minutos']], s.dur);
  var baseIn = h('input', { type: 'number', min: '60', max: '200', step: '5', value: s.base });
  var varS = sel([[1, 'Ausente'], [3.5, 'Mínima (hasta 5 lpm)'], [12, 'Moderada (6 a 25 lpm)'], [30, 'Marcada (más de 25 lpm)']], s.vamp);
  var sinC = h('input', { type: 'checkbox' }); sinC.checked = !!s.sin;
  var cadaS = sel([[0, 'Sin contracciones'], [10, 'Cada 10 min (1 en 10 min)'], [5, 'Cada 5 min (2 en 10 min)'], [3.3, 'Cada 3 a 4 min (3 en 10 min)'], [2.5, 'Cada 2 a 3 min (4 en 10 min)'], [2, 'Cada 2 min (5 en 10 min)'], [1.6, 'Cada 1 a 2 min (6 en 10 min)']], s.cont ? s.cont.cada : 0);
  var cdurIn = h('input', { type: 'number', min: '30', max: '120', step: '5', value: s.cont ? s.cont.d : 60 });
  var campIn = h('input', { type: 'number', min: '20', max: '85', step: '5', value: s.cont ? s.cont.amp : 50 });
  var acN = h('input', { type: 'number', min: '0', max: '12', step: '1', value: s.acel ? s.acel.n : 0 });
  var movC = h('input', { type: 'checkbox' }); movC.checked = !!(s.acel && s.acel.mov);
  var desS = sel([['no', 'Sin desaceleraciones'], ['prec', 'Precoces'], ['tard', 'Tardías'], ['var', 'Variables'], ['prol', 'Una desaceleración prolongada']], s.des.tipo);
  var enS = sel([['todas', 'En todas las contracciones'], ['mitad', 'En la mitad de las contracciones'], ['una', 'En una sola contracción']], s.des.en);
  var depIn = h('input', { type: 'number', min: '0', max: '90', step: '5', value: s.des.dep || '', placeholder: 'automática' });
  c.appendChild(h('div', { class: 'dc-fila' }, [campo('Duración', durS), campo('FCF basal (lpm)', baseIn), campo('Variabilidad', varS),
    h('label', { class: 'dc-campo' }, [h('span', { text: 'Patrón sinusoidal' }), h('span', { class: 'dc-chk' }, [h('label', null, [sinC, 'Sí'])])])]));
  c.appendChild(h('div', { class: 'dc-fila' }, [campo('Contracciones', cadaS), campo('Duración de cada contracción (s)', cdurIn), campo('Intensidad (mmHg)', campIn)]));
  c.appendChild(h('div', { class: 'dc-fila' }, [campo('Número de aceleraciones', acN),
    h('label', { class: 'dc-campo' }, [h('span', { text: 'Movimientos fetales' }), h('span', { class: 'dc-chk' }, [h('label', null, [movC, 'Marcar en el registro'])])]),
    campo('Desaceleraciones', desS), campo('Frecuencia', enS), campo('Profundidad (lpm bajo la basal)', depIn)]));
  var cv = h('canvas', { role: 'img', 'aria-label': 'Vista previa del trazado' });
  var prev = h('div', { class: 'dc-prev strip' }, [cv]);
  c.appendChild(prev);
  c.appendChild(h('div', { class: 'dc-fila' }, [h('button', { class: 'dc-btn', type: 'button', text: 'Generar otra variante del trazado', onclick: function () { s.seed = Math.floor(Math.random() * 9000) + 100; leer(); } }),
    h('span', { class: 'dc-ayuda', text: 'Las aceleraciones y desaceleraciones se ubican solas. Si algo no se ve como esperas, prueba otra variante.' })]));
  c.appendChild(h('h3', { text: 'Preguntas paso a paso' }));
  c.appendChild(h('p', { class: 'dc-ayuda', text: 'Las respuestas se sugieren a partir del trazado; revísalas y escribe la explicación que verá la estudiante al acertar.' }));
  var pasosBox = h('div'); c.appendChild(pasosBox);
  c.appendChild(h('h3', { text: 'Conducta' }));
  var condBox = h('div'); c.appendChild(condBox);
  c.appendChild(campo('Desenlace', finRt, 'Lo que pasó con la paciente; se muestra al terminar el caso.'));
  var msg = h('p', { role: 'status' });
  var pie = h('div', { class: 'dc-pie' }, [h('button', { class: 'dc-btn pri', type: 'button', text: id ? 'Guardar cambios del caso' : 'Agregar caso', onclick: guardar }),
    h('button', { class: 'dc-btn', type: 'button', text: 'Volver a la lista', onclick: function () { d.dlg.close(); panelCasos(); } }),
    id ? h('button', { class: 'dc-btn pel', type: 'button', text: 'Eliminar caso', onclick: function () { delete D.casos[id]; D.orden.casos = D.orden.casos.filter(function (x) { return x !== id; }); D.ocultos = D.ocultos.filter(function (x) { return x !== id; }); marcarSucio(); aplicarEstructura(D); d.dlg.close(); panelCasos(); } }) : null, msg]);
  d.dlg.appendChild(pie);
  var selPaso = {}, okPaso = {};
  function pintarPasos() {
    pasosBox.innerHTML = ''; var sug = sugerir(s);
    PLANT[s.g].forEach(function (p) {
      var k = p[0], ops = OPT[p[3]], x = s.pasos[k] || (s.pasos[k] = {});
      if (!tocado[k]) { x.a = sug[k] != null ? sug[k] : 0; }
      var se = sel(ops, x.a); selPaso[k] = se;
      var ok = h('textarea', { rows: '2' }); ok.value = x.ok || ''; okPaso[k] = ok;
      ok.placeholder = textoSugerido(k, s, x.a, ops) || 'Explicación';
      se.addEventListener('change', function () { x.a = +se.value; tocado[k] = true; ok.placeholder = textoSugerido(k, s, x.a, ops); });
      ok.addEventListener('input', function () { x.ok = ok.value; });
      pasosBox.appendChild(h('div', { class: 'dc-paso' }, [h('b', { text: p[1] + ': ' }), h('span', { text: p[2] }), h('div', { class: 'dc-fila' }, [campo('Respuesta correcta', se), campo('Explicación al acertar', ok)])]));
    });
  }
  function pintarCond() {
    condBox.innerHTML = ''; var cd = s.cond; while (cd.opts.length < 2) cd.opts.push('');
    var rad = 'dc-cond-' + Math.random().toString(36).slice(2);
    cd.opts.forEach(function (o, i) {
      var r = h('input', { type: 'radio', name: rad, 'aria-label': 'Opción ' + (i + 1) + ' es la correcta' }); r.checked = +cd.a === i;
      r.addEventListener('change', function () { cd.a = i; });
      var t = h('input', { type: 'text', value: o, placeholder: 'Opción ' + (i + 1) }); t.addEventListener('input', function () { cd.opts[i] = t.value; });
      var q = h('button', { class: 'dc-btn', type: 'button', text: 'Quitar', disabled: cd.opts.length <= 2, onclick: function () { cd.opts.splice(i, 1); if (cd.a >= cd.opts.length) cd.a = 0; pintarCond(); } });
      condBox.appendChild(h('div', { class: 'dc-fila', style: 'align-items:center' }, [h('label', { class: 'dc-chk' }, [r, 'Correcta']), h('span', { class: 'dc-campo' }, [t]), q]));
    });
    var okc = h('textarea', { rows: '2', placeholder: 'Por qué esa es la conducta' }); okc.value = cd.ok || ''; okc.addEventListener('input', function () { cd.ok = okc.value; });
    condBox.appendChild(h('div', { class: 'dc-fila' }, [cd.opts.length < 5 ? h('button', { class: 'dc-btn', type: 'button', text: 'Agregar opción', onclick: function () { cd.opts.push(''); pintarCond(); } }) : null]));
    condBox.appendChild(campo('Explicación al acertar', okc));
  }
  function leer() {
    s.g = gSel.value; s.dur = +durS.value; s.base = Math.max(60, Math.min(200, +baseIn.value || 140)); s.vamp = +varS.value; s.sin = sinC.checked;
    var cada = +cadaS.value; s.cont = cada ? { cada: cada, d: +cdurIn.value || 60, amp: +campIn.value || 50 } : null;
    s.acel = { n: Math.max(0, Math.min(12, +acN.value || 0)), mov: movC.checked };
    s.des = { tipo: desS.value, en: enS.value, dep: +depIn.value || 0 };
    var tr = trazoDesdeSpec(s);
    requestAnimationFrame(function () { try { draw(cv, tr, build(tr), false, { h1: 170, h2: 60, ppm: 30 }); } catch (e) {} });
    var sug = sugerir(s);
    PLANT[s.g].forEach(function (p) { var k = p[0]; if (!tocado[k] && selPaso[k] && sug[k] != null) { s.pasos[k].a = sug[k]; selPaso[k].value = String(sug[k]); }
      if (okPaso[k]) okPaso[k].placeholder = textoSugerido(k, s, s.pasos[k].a, OPT[p[3]]) || 'Explicación'; });
  }
  [durS, baseIn, varS, sinC, cadaS, cdurIn, campIn, acN, movC, desS, enS, depIn].forEach(function (x) { x.addEventListener('input', leer); x.addEventListener('change', leer); });
  gSel.addEventListener('change', function () { s.g = gSel.value; s.pasos = {}; tocado = {}; pintarPasos(); leer(); });
  function guardar() {
    s.t = plano(tIn.value); s.v = limpiar(vRt.innerHTML); s.fin = limpiar(finRt.innerHTML); leer();
    s.cond.opts = s.cond.opts.map(plano); var llenas = s.cond.opts.filter(Boolean);
    var falta = !s.t ? 'el título' : !norm(vRt.textContent) ? 'la historia clínica' : llenas.length < 2 ? 'al menos dos opciones de conducta' : !s.cond.opts[s.cond.a] ? 'marcar una opción de conducta correcta que tenga texto' : null;
    if (falta) { msg.className = 'dc-err'; msg.textContent = 'Falta ' + falta + '.'; return; }
    var a = s.cond.opts[s.cond.a]; s.cond.opts = llenas; s.cond.a = llenas.indexOf(a);
    PLANT[s.g].forEach(function (p) { var x = s.pasos[p[0]]; if (x && !norm(x.ok)) x.ok = textoSugerido(p[0], s, x.a, OPT[p[3]]); x.ok = limpiar(x.ok || ''); });
    Object.keys(s.pasos).forEach(function (k) { if (!PLANT[s.g].some(function (p) { return p[0] === k; })) delete s.pasos[k]; });
    var nid = id || nuevoId('cd'); D.casos[nid] = s; if (D.orden.casos.indexOf(nid) < 0) D.orden.casos.push(nid);
    marcarSucio(); aplicarEstructura(D); d.dlg.close(); panelCasos();
  }
  pintarPasos(); pintarCond(); leer();
  tIn.focus();
}
function editorCasoBase(id) {
  var c0 = BASE_CASOS.find(function (c) { return c.id === id; }), m = D.casos[id] || {};
  var d = dialogo('Editar caso del módulo');
  d.cuerpo.appendChild(h('p', { class: 'dc-ayuda', text: 'En los casos que vienen con el módulo puedes cambiar el título, la historia y el desenlace. El trazado y las preguntas están ligados entre sí y no se editan aquí; si necesitas otro trazado, crea un caso nuevo.' }));
  var tIn = h('input', { type: 'text', value: m.t || ORIG_C[id].t, maxlength: '120' }), vRt = rt(m.v || ORIG_C[id].v), fRt = rt(m.fin || ORIG_C[id].fin);
  d.cuerpo.appendChild(campo('Título', tIn)); d.cuerpo.appendChild(campo('Historia clínica', vRt)); d.cuerpo.appendChild(campo('Desenlace', fRt));
  d.cuerpo.appendChild(h('p', { class: 'dc-ayuda', text: 'Preguntas del caso: ' + c0.steps.map(function (s) { return s.label; }).join(', ') + '.' }));
  d.dlg.appendChild(h('div', { class: 'dc-pie' }, [
    h('button', { class: 'dc-btn pri', type: 'button', text: 'Guardar cambios del caso', onclick: function () {
      var x = {}, t = plano(tIn.value), v = limpiar(vRt.innerHTML), f = limpiar(fRt.innerHTML);
      if (t && t !== ORIG_C[id].t) x.t = t; if (norm(v) && norm(v) !== norm(limpiar(ORIG_C[id].v))) x.v = v; if (norm(f) && norm(f) !== norm(limpiar(ORIG_C[id].fin))) x.fin = f;
      if (Object.keys(x).length) D.casos[id] = x; else delete D.casos[id];
      marcarSucio(); aplicarEstructura(D); d.dlg.close(); panelCasos();
    } }),
    h('button', { class: 'dc-btn', type: 'button', text: 'Volver al original', onclick: function () { delete D.casos[id]; marcarSucio(); aplicarEstructura(D); d.dlg.close(); panelCasos(); } }),
    h('button', { class: 'dc-btn', type: 'button', text: 'Volver a la lista', onclick: function () { d.dlg.close(); panelCasos(); } })]));
}

/* ---------- registros del informe ---------- */
function panelRegistros() {
  var d = dialogo('Registros del informe');
  function pintar() {
    d.cuerpo.innerHTML = '';
    var todos = todosRegistros(D); D.orden.inf = todos.map(function (x) { return x.id; });
    d.cuerpo.appendChild(h('p', { class: 'dc-ayuda', text: 'Sube registros reales con su clave de respuestas y la retroalimentación del equipo docente. También puedes ordenar u ocultar cualquier registro.' }));
    d.cuerpo.appendChild(h('div', { class: 'dc-fila' }, [h('button', { class: 'dc-btn pri', type: 'button', text: 'Agregar registro real', onclick: function () { d.dlg.close(); editorReal(null); } })]));
    [[true, 'Trazados reales'], [false, 'Trazados simulados']].forEach(function (g) {
      var del = todos.filter(function (x) { return !!x.real === g[0]; }); if (!del.length) return;
      d.cuerpo.appendChild(h('h3', { text: g[1] }));
      var ul = h('ul', { class: 'dc-lista' });
      del.forEach(function (x, i) {
        var oc = oculto(x.id), mismo = function (idb) { var y = todos.find(function (z) { return z.id === idb; }); return !!y.real === g[0]; };
        ul.appendChild(h('li', { class: oc ? 'oc' : '' }, [
          h('span', { class: 't' }, [h('small', { text: (x.tipo || 'MEFI') + (ORIG_R[x.id] || !x.real ? ' · del módulo' : ' · nuevo') + (oc ? ' · oculto' : '') }), x.t]),
          h('button', { class: 'dc-btn', type: 'button', text: 'Subir', disabled: i === 0, onclick: function () { if (mover(todos, D.orden.inf, x.id, -1, mismo)) { marcarSucio(); aplicarEstructura(D); pintar(); } } }),
          h('button', { class: 'dc-btn', type: 'button', text: 'Bajar', disabled: i === del.length - 1, onclick: function () { if (mover(todos, D.orden.inf, x.id, 1, mismo)) { marcarSucio(); aplicarEstructura(D); pintar(); } } }),
          h('button', { class: 'dc-btn', type: 'button', text: oc ? 'Mostrar' : 'Ocultar', onclick: function () { alternarOculto(x.id); pintar(); } }),
          x.real ? h('button', { class: 'dc-btn', type: 'button', text: 'Editar', onclick: function () { d.dlg.close(); editorReal(x.id); } }) : null]));
      });
      d.cuerpo.appendChild(ul);
    });
  }
  pintar();
}
function editorReal(id) {
  var esBase = id && ORIG_R[id];
  var m = id ? clon(D.reales[id] || {}) : {};
  var r = realDesde(id || 'nuevo', m); if (!id) { r.t = ''; r.ctx = ''; r.img = null; r.key = {}; r.ex = {}; r.cond = ''; r.tipo = 'MEFI'; }
  var st = { t: r.t, tipo: r.tipo, ctx: r.ctx, img: r.img, w: r.w, h: r.h, key: clon(r.key || {}), ex: clon(r.ex || {}), cond: r.cond };
  var d = dialogo(id ? 'Editar registro real' : 'Agregar registro real');
  var c = d.cuerpo;
  var tIn = h('input', { type: 'text', value: st.t, maxlength: '120' });
  var tipoS = sel([['RBNE', 'RBNE'], ['TTC', 'TTC'], ['MEFI', 'MEFI intraparto']], st.tipo);
  var ctxIn = h('textarea', { rows: '3' }); ctxIn.value = st.ctx;
  c.appendChild(h('div', { class: 'dc-fila' }, [campo('Título', tIn, 'Lo que ve la estudiante en la tarjeta, por ejemplo «TTC en embarazo de 39 semanas».'), campo('Tipo de registro', tipoS)]));
  c.appendChild(campo('Contexto', ctxIn, 'Datos clínicos mínimos para leer el registro. No incluyas nombre, RUT, ficha ni fechas de la paciente.'));
  c.appendChild(h('h3', { text: 'Imagen del registro' }));
  var vista = h('div', { class: 'dc-prev' }); var fileIn = h('input', { type: 'file', accept: 'image/*', class: 'dc-btn' });
  function pintarVista() { vista.innerHTML = ''; if (st.img) vista.appendChild(h('img', { src: st.img, alt: 'Registro', style: 'display:block;max-width:100%;height:auto' })); else vista.appendChild(h('p', { class: 'dc-ayuda', style: 'padding:12px', text: 'Todavía no hay imagen.' })); }
  pintarVista();
  c.appendChild(vista);
  c.appendChild(h('div', { class: 'dc-fila', style: 'align-items:center' }, [campo(st.img ? 'Reemplazar imagen' : 'Subir foto o escaneo del registro', fileIn, 'Antes de subirla podrás tapar los datos de la paciente.')]));
  fileIn.addEventListener('change', function () { var f = fileIn.files[0]; if (!f) return; anonimizar(f, function (res) { st.img = res.url; st.w = res.w; st.h = res.h; pintarVista(); marcarSucio(); }); fileIn.value = ''; });
  c.appendChild(h('h3', { text: 'Clave de respuestas y retroalimentación' }));
  c.appendChild(h('p', { class: 'dc-ayuda', text: 'Marca las respuestas que aceptas. Si en un dato no marcas ninguna, ese dato no se evalúa en este registro.' }));
  var claveBox = h('div'); c.appendChild(claveBox);
  function pintarClave() {
    claveBox.innerHTML = '';
    camposReal(st.tipo).sort(porOrden).forEach(function (f) {
      var kv = st.key[f.k], box = h('div', { class: 'dc-paso' }, [h('b', { text: f.label })]);
      if (f.type === 'num') {
        var lo = h('input', { type: 'number', min: '50', max: '220', value: kv == null ? '' : Array.isArray(kv) ? kv[0] : kv });
        var hi = h('input', { type: 'number', min: '50', max: '220', value: kv == null ? '' : Array.isArray(kv) ? kv[1] : kv });
        var upd = function () { var a = parseFloat(lo.value), b = parseFloat(hi.value); if (isNaN(a) && isNaN(b)) st.key[f.k] = null; else if (isNaN(b) || a === b) st.key[f.k] = isNaN(a) ? b : a; else if (isNaN(a)) st.key[f.k] = b; else st.key[f.k] = [Math.min(a, b), Math.max(a, b)]; };
        lo.addEventListener('input', upd); hi.addEventListener('input', upd);
        box.appendChild(h('div', { class: 'dc-fila' }, [campo('Desde (lpm)', lo), campo('Hasta (lpm)', hi, 'Si es un solo valor, deja los dos iguales. Se acepta ±' + f.tol + ' lpm.')]));
      } else {
        var acept = kv == null ? [] : Array.isArray(kv) ? kv : [kv];
        var chk = h('div', { class: 'dc-chk' });
        f.opts.forEach(function (o, i) {
          var cb = h('input', { type: 'checkbox' }); cb.checked = acept.indexOf(i) >= 0;
          cb.addEventListener('change', function () { var sel2 = [].slice.call(chk.querySelectorAll('input')).map(function (x, j) { return x.checked ? j : -1; }).filter(function (j) { return j >= 0; }); st.key[f.k] = !sel2.length ? null : sel2.length === 1 ? sel2[0] : sel2; });
          chk.appendChild(h('label', null, [cb, o]));
        });
        box.appendChild(chk);
      }
      var ex = h('textarea', { rows: '2', placeholder: 'Explicación que verá la estudiante' }); ex.value = st.ex[f.k] || '';
      ex.addEventListener('input', function () { st.ex[f.k] = ex.value; });
      box.appendChild(campo('Retroalimentación', ex));
      claveBox.appendChild(box);
    });
  }
  pintarClave();
  tipoS.addEventListener('change', function () { st.tipo = tipoS.value; if (st.key.res != null) st.key.res = null; pintarClave(); });
  var condIn = h('textarea', { rows: '5' }); condIn.value = st.cond;
  c.appendChild(campo('Conducta del equipo docente', condIn, 'Se muestra junto a la conducta que propone la estudiante. Puedes usar líneas que empiecen con «•».'));
  var msg = h('p', { role: 'status' });
  d.dlg.appendChild(h('div', { class: 'dc-pie' }, [
    h('button', { class: 'dc-btn pri', type: 'button', text: id ? 'Guardar cambios del registro' : 'Agregar registro', onclick: function () {
      st.t = plano(tIn.value); st.tipo = tipoS.value; st.ctx = ctxIn.value.trim(); st.cond = condIn.value.trim();
      var falta = !st.t ? 'el título' : !st.img ? 'la imagen del registro' : !st.cond ? 'la conducta del equipo docente' : null;
      if (falta) { msg.className = 'dc-err'; msg.textContent = 'Falta ' + falta + '.'; return; }
      Object.keys(st.ex).forEach(function (k) { st.ex[k] = String(st.ex[k] || '').trim(); if (!st.ex[k]) delete st.ex[k]; });
      var nid = id || nuevoId('rl'); D.reales[nid] = st; if (D.orden.inf.indexOf(nid) < 0) { var ult = -1; D.orden.inf.forEach(function (x, i) { if (/^real|^rl/.test(x)) ult = i; }); D.orden.inf.splice(ult + 1, 0, nid); }
      marcarSucio(); aplicarEstructura(D); d.dlg.close(); panelRegistros();
    } }),
    h('button', { class: 'dc-btn', type: 'button', text: 'Volver a la lista', onclick: function () { d.dlg.close(); panelRegistros(); } }),
    esBase ? h('button', { class: 'dc-btn', type: 'button', text: 'Volver al original', onclick: function () { delete D.reales[id]; marcarSucio(); aplicarEstructura(D); d.dlg.close(); panelRegistros(); } }) : null,
    id && !esBase ? h('button', { class: 'dc-btn pel', type: 'button', text: 'Eliminar registro', onclick: function () { delete D.reales[id]; D.orden.inf = D.orden.inf.filter(function (x) { return x !== id; }); marcarSucio(); aplicarEstructura(D); d.dlg.close(); panelRegistros(); } }) : null,
    msg]));
  tIn.focus();
}

/* ---------- anonimizar y subir imagen ---------- */
function anonimizar(file, listo) {
  var d = dialogo('Tapar datos de la paciente');
  var c = d.cuerpo;
  c.appendChild(h('p', { text: 'Arrastra sobre la imagen para tapar con un rectángulo blanco el nombre, RUT, ficha, fechas y cualquier dato que identifique a la paciente. Gira la imagen si quedó de lado.' }));
  var cv = h('canvas'), box = h('div', { class: 'dc-anon' }, [cv]);
  var msg = h('p', { role: 'status' });
  var img = new Image(), rot = 0, rects = [], arr = null;
  var MAXW = 1600;
  function dims() { var w = img.naturalWidth, hh = img.naturalHeight; if (rot % 2) { var t = w; w = hh; hh = t; } var k = Math.min(1, MAXW / w); return { w: Math.round(w * k), h: Math.round(hh * k), k: k }; }
  function pintar() {
    var m = dims(); cv.width = m.w; cv.height = m.h; var g = cv.getContext('2d');
    g.save(); g.translate(m.w / 2, m.h / 2); g.rotate(rot * Math.PI / 2);
    var dw = img.naturalWidth * m.k, dh = img.naturalHeight * m.k; g.drawImage(img, -dw / 2, -dh / 2, dw, dh); g.restore();
    g.fillStyle = '#fff'; rects.forEach(function (r) { g.fillRect(r[0], r[1], r[2], r[3]); });
    if (arr) { g.strokeStyle = '#b42318'; g.lineWidth = 3; g.strokeRect(arr[0], arr[1], arr[2], arr[3]); }
  }
  function pos(ev) { var b = cv.getBoundingClientRect(); return [(ev.clientX - b.left) * cv.width / b.width, (ev.clientY - b.top) * cv.height / b.height]; }
  var ini = null;
  cv.addEventListener('pointerdown', function (ev) { ini = pos(ev); cv.setPointerCapture(ev.pointerId); ev.preventDefault(); });
  cv.addEventListener('pointermove', function (ev) { if (!ini) return; var p = pos(ev); arr = [Math.min(ini[0], p[0]), Math.min(ini[1], p[1]), Math.abs(p[0] - ini[0]), Math.abs(p[1] - ini[1])]; pintar(); });
  cv.addEventListener('pointerup', function () { if (arr && arr[2] > 4 && arr[3] > 4) rects.push(arr); arr = null; ini = null; pintar(); });
  c.appendChild(h('div', { class: 'dc-fila' }, [
    h('button', { class: 'dc-btn', type: 'button', text: 'Girar 90°', onclick: function () { rot = (rot + 1) % 4; rects = []; pintar(); } }),
    h('button', { class: 'dc-btn', type: 'button', text: 'Deshacer último rectángulo', onclick: function () { rects.pop(); pintar(); } })]));
  c.appendChild(box);
  var subir = h('button', { class: 'dc-btn pri', type: 'button', text: 'Subir imagen anonimizada', onclick: function () {
    subir.disabled = true; msg.className = 'dc-ayuda'; msg.textContent = 'Subiendo…'; pintar();
    exportar(cv, function (blob) {
      var fr = new FileReader();
      fr.onload = function () {
        var b64 = String(fr.result).split(',')[1];
        api('imagen', { mime: blob.type, b64: b64 }).then(function (j) { d.dlg.close(); listo({ url: j.url, w: 1000, h: Math.round(1000 * cv.height / cv.width) }); })
          .catch(function (e) { subir.disabled = false; msg.className = 'dc-err'; msg.textContent = 'No se pudo subir: ' + e.message; });
      };
      fr.readAsDataURL(blob);
    });
  } });
  d.dlg.appendChild(h('div', { class: 'dc-pie' }, [subir, h('button', { class: 'dc-btn', type: 'button', text: 'Cancelar', onclick: function () { d.dlg.close(); } }), msg]));
  var url = URL.createObjectURL(file);
  img.onload = function () { pintar(); URL.revokeObjectURL(url); };
  img.onerror = function () { msg.className = 'dc-err'; msg.textContent = 'No se pudo abrir esa imagen. Prueba con una foto JPG o PNG.'; subir.disabled = true; };
  img.src = url;
}
function exportar(cv, cb) {
  var intentos = [['image/webp', 0.82], ['image/jpeg', 0.85], ['image/jpeg', 0.7], ['image/jpeg', 0.55]];
  (function sig(i) {
    var t = intentos[Math.min(i, intentos.length - 1)];
    cv.toBlob(function (b) {
      if (!b) return sig(i + 1);
      if (b.type !== t[0] && t[0] === 'image/webp') return sig(i + 1);
      if (b.size > 2.6e6 && i < intentos.length - 1) return sig(i + 1);
      cb(b);
    }, t[0], t[1]);
  })(0);
}

/* ================= arranque ================= */
indexar();
fetch('/api/contenido', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
  if (!j) return; PUB = normalizar(j.datos); if (!editando) aplicarTodo(PUB);
  var m = /^#caso-(.+)$/.exec(location.hash || ''); if (m && CASOS.some(function (c) { return c.id === m[1]; }) && (!cur || cur.id !== m[1])) { show('casos'); abrir(m[1]); }
}).catch(function () {});
if (location.hash === '#docente') { if (clave) entrar(); else pedirClave(); }
window.__dc = { aplicarTodo: aplicarTodo, casoDesdeSpec: casoDesdeSpec, sugerir: sugerir, limpiar: limpiar, BLOQ: function () { return BLOQ; }, datos: datos };
})();
