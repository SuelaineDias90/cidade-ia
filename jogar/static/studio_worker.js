// STUDIO CIDADE IA — o código dos criadores roda AQUI, isolado do jogo (Web Worker):
// não vê a sua conta, não mexe na página, só conversa com o jogo por mensagens.
let LUA = null, cmds = [], partes = {}, nomes = {}, jog = { x: 0, y: 0, z: 0, vida: 100, vel: 10, pulo: 12, tamanho: 1, gravidade: 1 }, pontos = 0, tempo = 0, proxId = 1;
const H = { comecar: [], quadro: [], tocar: {}, tecla: {}, timers: [] };
const c = (...a) => cmds.push(a);
const fmt = v => typeof v === 'object' ? JSON.stringify(v) : String(v);
function proxy(id) {
  const P = partes[id]; if (!P) return null;
  return new Proxy({}, {
    get(_, k) {
      if (k === 'mover') return (dx = 0, dy = 0, dz = 0) => { P.x += +dx; P.y += +dy; P.z += +dz; c('parte', id, { x: P.x, y: P.y, z: P.z }); };
      if (k === 'girar') return (graus = 0) => { P.ry = (P.ry || 0) + (+graus) * Math.PI / 180; c('parte', id, { ry: P.ry }); };
      if (k === 'sumir') return () => { P.visivel = false; c('parte', id, { visivel: false }); };
      if (k === 'aparecer') return () => { P.visivel = true; c('parte', id, { visivel: true }); };
      if (k === 'apagar') return () => { delete partes[id]; c('apagar', id); };
      if (k === 'distancia') return () => Math.hypot(P.x - jog.x, P.y - jog.y, P.z - jog.z);
      return P[k];
    },
    set(_, k, v) { if (['x', 'y', 'z', 'sx', 'sy', 'sz', 'ry', 'cor', 'visivel', 'texto', 'solido'].includes(k)) { P[k] = v; c('parte', id, { [k]: v }); } return true; },
  });
}
// peça que não existe: não quebra o jogo, só avisa uma vez
const avisados = new Set();
function vazio(nome) {
  if (!avisados.has(nome)) { avisados.add(nome); c('erro', `Não existe peça chamada "${nome}". Dê esse nome a uma peça na aba Construir.`); }
  const nada = () => {};
  return new Proxy({}, { get: (_, k) => (['mover', 'girar', 'sumir', 'aparecer', 'apagar'].includes(k) ? nada : k === 'distancia' ? () => Infinity : k === 'existe' ? false : undefined), set: () => true });
}
const jogador = new Proxy({}, {
  get(_, k) {
    if (k === 'teleportar') return (x, y, z) => { c('tp', +x, +y, +z); jog.x = +x; jog.y = +y; jog.z = +z; };
    if (k === 'animacao') return nome => c('anim', String(nome));
    return jog[k];
  },
  set(_, k, v) { if (['vel', 'pulo', 'tamanho', 'gravidade', 'vida'].includes(k)) { jog[k] = +v; c('jogador', { [k]: +v }); } return true; },
});
const jogo = {
  ao_comecar: f => H.comecar.push(f),
  a_cada_quadro: f => H.quadro.push(f),
  ao_tocar: (nome, f) => (H.tocar[nome] = H.tocar[nome] || []).push(f),
  ao_apertar: (tecla, f) => (H.tecla[String(tecla).toUpperCase()] = H.tecla[String(tecla).toUpperCase()] || []).push(f),
  depois: (seg, f) => H.timers.push({ t: tempo + +seg, f }),
  repetir: (seg, f) => H.timers.push({ t: tempo + +seg, f, rep: +seg }),
  parte: nome => (nomes[nome] != null && partes[nomes[nome]] ? proxy(nomes[nome]) : vazio(nome)),
  partes: nome => Object.keys(partes).filter(id => !nome || partes[id].nome === nome).map(proxy),
  criar: (tipo, p = {}) => { const id = 'c' + proxId++; partes[id] = { tipo, x: 0, y: 1, z: 0, sx: 2, sy: 2, sz: 2, cor: '#ff5ca8', visivel: true, ...p, id }; if (p.nome) nomes[p.nome] = id; c('criar', id, partes[id]); return proxy(id); },
  mensagem: (t, seg = 3) => c('msg', fmt(t), +seg),
  pontos: n => { if (n !== undefined && n !== null) { pontos = +n; c('pontos', pontos); } return pontos; },
  somar_pontos: n => { pontos += +n; c('pontos', pontos); return pontos; },
  ganhar: t => c('fim', true, fmt(t || 'Você ganhou!')),
  perder: t => c('fim', false, fmt(t || 'Você perdeu!')),
  aleatorio: (a, b) => a + Math.random() * (b - a),
  tempo: () => tempo,
  print: (...a) => c('log', a.map(fmt).join(' ')),
  erro: t => c('erro', String(t)),
};
jogo.jogador = jogador;
self.jogo = jogo; self.print = jogo.print; self.console = { log: jogo.print, warn: jogo.print, error: jogo.print };
const seguro = (f, ...a) => { try { f(...a); } catch (e) { const l = String(e && e.stack || '').match(/<anonymous>:(\d+)/); c('erro', (l ? `linha ${l[1] - 2}: ` : '') + String(e && e.message || e)); } };
const LUA_PRELUDIO = `
local js = require "js"
local J = js.global.jogo
local H = { comecar = {}, quadro = {}, tocar = {}, tecla = {}, timers = {} }
local tempo = 0
jogo = {}
jogo.jogador = J.jogador
function jogo.ao_comecar(f) table.insert(H.comecar, f) end
function jogo.a_cada_quadro(f) table.insert(H.quadro, f) end
function jogo.ao_tocar(n, f) H.tocar[n] = H.tocar[n] or {}; table.insert(H.tocar[n], f) end
function jogo.ao_apertar(t, f) t = string.upper(t); H.tecla[t] = H.tecla[t] or {}; table.insert(H.tecla[t], f) end
function jogo.depois(s, f) table.insert(H.timers, { t = tempo + s, f = f }) end
function jogo.repetir(s, f) table.insert(H.timers, { t = tempo + s, f = f, rep = s }) end
function jogo.parte(n) return J:parte(n) end
function jogo.criar(t, p) local o = js.new(js.global.Object) if p then for k, v in pairs(p) do o[k] = v end end return J:criar(t, o) end
function jogo.mensagem(t, s) J:mensagem(tostring(t), s or 3) end
function jogo.pontos(n) return J:pontos(n) end
function jogo.somar_pontos(n) return J:somar_pontos(n) end
function jogo.ganhar(t) J:ganhar(t) end
function jogo.perder(t) J:perder(t) end
function jogo.aleatorio(a, b) return a + math.random() * (b - a) end
function jogo.tempo() return tempo end
print = function(...) local t = {} for i = 1, select("#", ...) do t[#t + 1] = tostring(select(i, ...)) end J:print(table.concat(t, " ")) end
local function seguro(f, ...) local ok, e = pcall(f, ...) if not ok then J:erro(tostring(e)) end end
function jogo.__comecar() for _, f in ipairs(H.comecar) do seguro(f) end end
function jogo.__quadro(dt)
  tempo = tempo + dt
  for _, f in ipairs(H.quadro) do seguro(f, dt) end
  for i = #H.timers, 1, -1 do local T = H.timers[i] if tempo >= T.t then seguro(T.f) if T.rep then T.t = T.t + T.rep else table.remove(H.timers, i) end end end
end
function jogo.__tocar(nome, peca) for _, f in ipairs(H.tocar[nome] or {}) do seguro(f, peca) end for _, f in ipairs(H.tocar["*"] or {}) do seguro(f, peca) end end
function jogo.__tecla(k) for _, f in ipairs(H.tecla[k] or {}) do seguro(f) end end
`;
function iniciar(m) {
  partes = {}; nomes = {};
  for (const p of m.partes) { partes[p.id] = { ...p }; if (p.nome) nomes[p.nome] = p.id; }
  Object.assign(jog, m.jogador || {});
  try {
    if (m.lang === 'lua') {
      self.window = self; importScripts(m.luaUrl);
      const roda = src => self.fengari.load(src)();
      roda(LUA_PRELUDIO); roda(m.codigo || '');
      const F = s => self.fengari.load(s); LUA = { comecar: F('jogo.__comecar()'), quadro: F('local js = require "js" jogo.__quadro(js.global.__a1)'), tocar: F('local js = require "js" jogo.__tocar(js.global.__a1, js.global.__a2)'), tecla: F('local js = require "js" jogo.__tecla(js.global.__a1)') };
    } else (new Function('jogo', 'print', '"use strict";\n' + (m.codigo || '')))(jogo, jogo.print);
  } catch (e) { c('erro', String(e && e.message || e)); }
  if (LUA) seguro(LUA.comecar); else for (const f of H.comecar) seguro(f);
  flush();
}
function flush() { if (cmds.length) { postMessage(cmds); cmds = []; } else postMessage([]); }
onmessage = ({ data: m }) => {
  if (m.t === 'init') return iniciar(m);
  if (m.t === 'quadro') {
    tempo += m.dt; Object.assign(jog, m.jog);
    if (LUA) { self.__a1 = m.dt; seguro(LUA.quadro); return flush(); }
    for (const f of H.quadro) seguro(f, m.dt);
    for (let i = H.timers.length - 1; i >= 0; i--) { const T = H.timers[i]; if (tempo >= T.t) { seguro(T.f); if (T.rep) T.t += T.rep; else H.timers.splice(i, 1); } }
  } else if (m.t === 'tocar' && LUA) { self.__a1 = partes[m.id]?.nome || ''; self.__a2 = proxy(m.id); seguro(LUA.tocar); }
  else if (m.t === 'tecla' && LUA) { self.__a1 = m.k; seguro(LUA.tecla); }
  else if (m.t === 'tocar') { const p = partes[m.id]; for (const f of H.tocar[p?.nome] || []) seguro(f, proxy(m.id)); for (const f of H.tocar['*'] || []) seguro(f, proxy(m.id)); }
  else if (m.t === 'tecla') for (const f of H.tecla[m.k] || []) seguro(f);
  else if (m.t === 'some') delete partes[m.id];
  flush();
};
