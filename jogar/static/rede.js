// Cidade IA ONLINE — rede sem servidor próprio.
// Usa um servidor público de mensagens (MQTT por WebSocket) que fica ligado 24h, e assinatura digital
// (ECDSA P-256 do próprio navegador) pra ninguém se passar por outro jogador nem pelo dono.
(() => {
  const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
  const RAIZ = 'cidadeia/v1/';
  const te = new TextEncoder(), td = new TextDecoder();

  // ---------- cliente MQTT 3.1.1 mínimo (QoS 0, retain)
  class MQ {
    constructor() { this.subs = new Map(); this.ok = false; this.fila = []; this.ouvintes = []; this.tent = 0; }
    ligar() {
      const url = BROKERS[this.tent % BROKERS.length];
      let ws; try { ws = new WebSocket(url, 'mqtt'); } catch (e) { return this._depois(); }
      ws.binaryType = 'arraybuffer'; this.ws = ws; this.buf = new Uint8Array(0);
      ws.onopen = () => {
        const id = 'cia' + Math.random().toString(36).slice(2, 12);
        this._env(0x10, [...this._str('MQTT'), 4, 0x02, 0, 60], this._str(id));
      };
      ws.onmessage = ev => { const b = new Uint8Array(ev.data), j = new Uint8Array(this.buf.length + b.length); j.set(this.buf); j.set(b, this.buf.length); this.buf = j; this._ler(); };
      ws.onclose = ws.onerror = () => { if (this.ws !== ws) return; this.ws = null; this.ok = false; clearInterval(this.ping); this._aviso(false); this._depois(); };
    }
    _depois() { this.tent++; clearTimeout(this.tr); this.tr = setTimeout(() => this.ligar(), Math.min(15000, 1500 * this.tent)); }
    _aviso(on) { for (const f of this.ouvintes) try { f(on); } catch (e) {} }
    _str(s) { const b = te.encode(s); return [b.length >> 8, b.length & 255, ...b]; }
    _env(tipo, cab, carga) {
      const corpo = new Uint8Array(cab.length + carga.length); corpo.set(cab); corpo.set(carga, cab.length);
      const tam = []; let x = corpo.length; do { let d = x % 128; x = Math.floor(x / 128); if (x > 0) d |= 128; tam.push(d); } while (x > 0);
      const pk = new Uint8Array(1 + tam.length + corpo.length); pk[0] = tipo; pk.set(tam, 1); pk.set(corpo, 1 + tam.length);
      try { this.ws.send(pk); } catch (e) {}
    }
    _ler() {
      while (this.buf.length >= 2) {
        let mult = 1, tam = 0, i = 1, d;
        do { if (i >= this.buf.length) return; d = this.buf[i++]; tam += (d & 127) * mult; mult *= 128; } while (d & 128);
        if (this.buf.length < i + tam) return;
        const tipo = this.buf[0] >> 4, fl = this.buf[0] & 15, c = this.buf.slice(i, i + tam); this.buf = this.buf.slice(i + tam);
        if (tipo === 2) {   // CONNACK
          if (c[1] !== 0) { this.ws.close(); return; }
          this.ok = true; this.tent = 0; let pid = 1;
          for (const t of this.subs.keys()) this._env(0x82, [0, pid++], [...this._str(t), 0]);
          for (const [t, m, r] of this.fila.splice(0)) this.pub(t, m, r);
          clearInterval(this.ping); this.ping = setInterval(() => this._env(0xC0, [], []), 30000);
          this._aviso(true);
        } else if (tipo === 3) {   // PUBLISH
          const tl = (c[0] << 8) | c[1], topico = td.decode(c.slice(2, 2 + tl)); let p = 2 + tl; if ((fl >> 1) & 3) p += 2;
          const txt = td.decode(c.slice(p));
          for (const [filtro, fns] of this.subs) if (this._casa(filtro, topico)) for (const f of fns) try { f(topico.slice(RAIZ.length), txt, !!(fl & 1)); } catch (e) { console.warn(e); }
        }
      }
    }
    _casa(f, t) { if (f.endsWith('/#')) return t.startsWith(f.slice(0, -1)) || t === f.slice(0, -2); const a = f.split('/'), b = t.split('/'); return a.length === b.length && a.every((x, i) => x === '+' || x === b[i]); }
    ouvir(topico, fn) { const t = RAIZ + topico; if (!this.subs.has(t)) { this.subs.set(t, []); if (this.ok) this._env(0x82, [0, 9], [...this._str(t), 0]); } this.subs.get(t).push(fn); }
    pub(topico, msg, reter = false) {
      if (!this.ok) { if (reter || this.fila.length < 50) this.fila.push([topico, msg, reter]); return; }
      const carga = typeof msg === 'string' ? te.encode(msg) : te.encode(JSON.stringify(msg));
      this._env(0x30 | (reter ? 1 : 0), this._str(RAIZ + topico), carga);
    }
    apagar(topico) { if (this.ok) this._env(0x31, this._str(RAIZ + topico), []); }
  }

  // ---------- assinatura digital
  const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const deB64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
  const ALG = { name: 'ECDSA', namedCurve: 'P-256' }, HASH = { name: 'ECDSA', hash: 'SHA-256' };
  const cacheChaves = new Map();
  async function chavePub(jwk) { const k = jwk.x + jwk.y; if (!cacheChaves.has(k)) cacheChaves.set(k, crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, ALG, false, ['verify'])); return cacheChaves.get(k); }
  async function assinar(priv, texto) { return b64(await crypto.subtle.sign(HASH, priv, te.encode(texto))); }
  async function conferir(jwk, texto, sig) { try { return await crypto.subtle.verify(HASH, await chavePub(jwk), deB64(sig), te.encode(texto)); } catch (e) { return false; } }
  async function idDe(jwk) { const h = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(jwk.x + '.' + jwk.y))); return [...h.slice(0, 5)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  async function hmacK(chave, texto) { const k = await crypto.subtle.importKey('raw', chave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return b64(await crypto.subtle.sign('HMAC', k, te.encode(texto))); }

  // conta do jogador: um par de chaves guardado no aparelho (dá pra levar pra outro aparelho com o código da conta)
  const CONTA_K = 'cidadeia_conta_v1';
  async function carregarConta() {
    let c; try { c = JSON.parse(localStorage.getItem(CONTA_K) || 'null'); } catch (e) {}
    if (!c) return null;
    const priv = await crypto.subtle.importKey('jwk', c.jwk, ALG, false, ['sign']);
    return { nome: c.nome, jwk: c.jwk, pub: { x: c.jwk.x, y: c.jwk.y }, priv, id: await idDe(c.jwk), criada: c.criada };
  }
  async function criarConta(nome) {
    const par = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
    localStorage.setItem(CONTA_K, JSON.stringify({ nome, jwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }, criada: Date.now() }));
    return carregarConta();
  }
  function renomearConta(nome) { const c = JSON.parse(localStorage.getItem(CONTA_K)); c.nome = nome; localStorage.setItem(CONTA_K, JSON.stringify(c)); }
  function codigoConta() { return btoa(localStorage.getItem(CONTA_K) || ''); }
  async function entrarComCodigo(cod) { const c = JSON.parse(atob(cod.trim())); if (!c.jwk?.d) throw new Error('código inválido'); localStorage.setItem(CONTA_K, JSON.stringify(c)); return carregarConta(); }

  // cofre do dono (abre com a senha, no app de moderação)
  async function abrirCofre(cofre, senha) {
    const sal = deB64(cofre.s), ct = deB64(cofre.c);
    const base = await crypto.subtle.importKey('raw', te.encode(senha), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: sal, iterations: 200000, hash: 'SHA-256' }, base, 512));
    const kEnc = await crypto.subtle.importKey('raw', bits.slice(0, 32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const kMac = await crypto.subtle.importKey('raw', bits.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const j = new Uint8Array(sal.length + ct.length); j.set(sal); j.set(ct, sal.length);
    if (b64(await crypto.subtle.sign('HMAC', kMac, j)) !== cofre.m) throw new Error('senha errada');
    const claro = new Uint8Array(ct.length);
    for (let i = 0; i * 32 < ct.length; i++) {
      const ks = new Uint8Array(await crypto.subtle.sign('HMAC', kEnc, new Uint8Array([i >>> 24, (i >>> 16) & 255, (i >>> 8) & 255, i & 255])));
      for (let k = 0; k < 32 && i * 32 + k < ct.length; k++) claro[i * 32 + k] = ct[i * 32 + k] ^ ks[k];
    }
    return JSON.parse(td.decode(claro));
  }

  // ---------- bans: só vale ban assinado pela chave do dono
  const textoBan = b => [b.id, b.ate, b.motivo, b.t].join('|');
  async function banValido(b, pubDono) { return !!(b && b.id && b.sig && await conferir(pubDono, textoBan(b), b.sig)); }
  const banAtivo = b => b && (b.ate === 0 || b.ate > Date.now());

  // ---------- filtro de palavrões (troca por ***)
  const RUINS = ['porra', 'caralho', 'merda', 'puta', 'puto', 'fdp', 'vsf', 'vtnc', 'buceta', 'cu', 'cuzao', 'arrombado', 'viado', 'otario', 'desgraca', 'bosta', 'piranha', 'vagabunda', 'corno', 'pqp', 'krl', 'prr', 'fuck', 'shit', 'bitch', 'nigga', 'macaco'];
  const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const junta = w => w.replace(/(.)\1+/g, '$1'), RUINS_J = new Set(RUINS.map(junta));
  function filtrar(txt) { return txt.split(/(\s+)/).map(p => { const w = junta(semAcento(p).replace(/[^a-z0-9]/g, '')); return RUINS_J.has(w) ? '*'.repeat(p.length) : p; }).join(''); }
  const temPalavrao = txt => filtrar(txt) !== txt;

  window.CIA_REDE = { MQ, assinar, conferir, idDe, hmacK, b64, deB64, carregarConta, criarConta, renomearConta, codigoConta, entrarComCodigo, abrirCofre, textoBan, banValido, banAtivo, filtrar, temPalavrao };
})();
