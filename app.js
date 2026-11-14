/* Portal SparkSales · casca pública. Não contém dados: o conteúdo vem do servidor depois do e-mail + palavra-passe.
   Prévia local (desenvolvimento): ?local=1 lê conteudo/*.json desta pasta (ignorada pelo git). */
"use strict";

const API = "https://zxrpkorjfojnzgcgxwvi.supabase.co/functions/v1/portal";
const QS = new URLSearchParams(location.search);
const LOCAL = QS.has("local");
const DOC = QS.get("d") || (location.pathname.match(/\/p\/([A-Za-z0-9_-]+)/) || [])[1] || "";
const FONTE = { conteudo: "conteudo/conteudo.json", carteira: "conteudo/carteira.json" };

/* ---------------- sessão (token curto guardado neste navegador) ---------------- */
const S = (() => {
  const CH = "portal.sessao." + DOC;
  let s = null;
  try { s = JSON.parse(localStorage.getItem(CH) || "null"); } catch (e) { s = null; }
  if (s && (!s.token || new Date(s.expira_em) < new Date())) s = null;
  return {
    token: () => s && s.token, email: () => s && s.email,
    guardar(v) { s = v; try { localStorage.setItem(CH, JSON.stringify(v)); } catch (e) {} },
    sair() { s = null; try { localStorage.removeItem(CH); } catch (e) {} },
  };
})();
class SemSessao extends Error {}
async function api(rota, corpo = {}) {
  // Corpo em text/plain (padrão do fetch com string): pedido simples, sem pré-checagem de CORS.
  const r = await fetch(API + "/" + rota, { method: "POST", body: JSON.stringify({ ...corpo, token: S.token() }), cache: "no-store" });
  let d = {}; try { d = await r.json(); } catch (e) {}
  if (r.status === 401 && rota !== "entrar") { S.sair(); throw new SemSessao(d.erro || "Sessão expirada."); }
  if (!r.ok) { const e = new Error(d.erro || "HTTP " + r.status); e.status = r.status; throw e; }
  return d;
}
const PERCURSO = ["toc", "bpmmm", "dados", "carteira"];
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const brl = v => v == null ? "—" : (Math.abs(v) >= 1e6 ? "R$ " + (v / 1e6).toFixed(2).replace(".", ",") + " mi"
  : Math.abs(v) >= 1e3 ? "R$ " + Math.round(v / 1e3) + " mil" : "R$ " + Math.round(v));
const pct = v => v == null ? "—" : (v > 0 ? "+" : "−") + Math.abs(Math.round(v * 100)) + "%";
const semAcento = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ---------------- telemetria ----------------
   Fila local com identificador por evento (para deduplicar) e envio em lote. Sem destino configurado,
   os eventos ficam só na fila desta aba (modo de desenvolvimento). Falha de telemetria nunca trava a página. */
const T = (() => {
  const sessao = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
  const fila = [];
  let destino = null, ativo = 0, ultimoMov = Date.now(), visivel = !document.hidden;
  function evento(tipo, dados = {}) {
    try {
      fila.push({ id: (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2), tipo, v: 1,
        ts: new Date().toISOString(), sessao, rota: location.hash || "#/", ...dados });
      if (fila.length >= 20) enviar();
    } catch (e) { /* nunca quebra a página */ }
  }
  async function enviar(final = false) {
    if (!destino || !fila.length || !S.token()) return;
    const lote = fila.splice(0, 200);
    try {
      const corpo = JSON.stringify({ token: S.token(), eventos: lote });
      if (final && navigator.sendBeacon) { if (!navigator.sendBeacon(destino, corpo)) throw new Error("beacon"); }
      else { const r = await fetch(destino, { method: "POST", body: corpo, keepalive: corpo.length < 60000 }); if (r.status >= 500) throw new Error("HTTP " + r.status); }
    } catch (e) { if (fila.length < 500) fila.unshift(...lote); }
  }
  ["mousemove", "keydown", "scroll", "touchstart"].forEach(ev => addEventListener(ev, () => { ultimoMov = Date.now(); }, { passive: true }));
  document.addEventListener("visibilitychange", () => { visivel = !document.hidden; if (!visivel) enviar(true); });
  setInterval(() => {   // tempo ativo: aba visível e com movimento nos últimos 60 s
    if (visivel && Date.now() - ultimoMov < 60000) { ativo += 15; evento("tempo_ativo", { segundos: 15 }); }
  }, 15000);
  setInterval(() => enviar(), 30000);
  addEventListener("pagehide", () => enviar(true));
  return { evento, configurar: d => { destino = d; enviar(); }, fila, sessao };
})();
window.addEventListener("error", e => T.evento("erro", { mensagem: String(e.message).slice(0, 200) }));

/* ---------------- progresso (neste navegador + no servidor, para continuar em outro aparelho) ---------------- */
const P = (() => {
  const CH = "portal.progresso.v1." + DOC;
  let d = {}, tSrv = null;
  try { d = JSON.parse(localStorage.getItem(CH) || "{}"); } catch (e) { d = {}; }
  d.vistos = d.vistos || {};
  const salvar = () => {
    try { localStorage.setItem(CH, JSON.stringify(d)); } catch (e) {}
    if (!LOCAL && S.token()) { clearTimeout(tSrv); tSrv = setTimeout(() => api("progresso", { dados: d }).catch(() => {}), 3000); }
  };
  return {
    juntar(srv) {   // une o que veio do servidor com o deste navegador (nada se perde)
      if (!srv || typeof srv !== "object") return;
      for (const [cam, cs] of Object.entries(srv.vistos || {})) d.vistos[cam] = { ...(cs || {}), ...(d.vistos[cam] || {}) };
      d.ultimo = { ...(srv.ultimo || {}), ...(d.ultimo || {}) };
      d.carteira = d.carteira || srv.carteira;
      if ((srv.conversaDesde || "") > (d.conversaDesde || "")) d.conversaDesde = srv.conversaDesde;
      salvar();
    },
    // "Nova conversa": a partir daqui a caixa mostra e considera só as perguntas novas (nada é apagado)
    conversaDesde(v) { if (v === undefined) return d.conversaDesde || null; d.conversaDesde = v; salvar(); },
    marcar(caminho, cartao) { if (!d.vistos[caminho]) d.vistos[caminho] = {}; if (!d.vistos[caminho][cartao]) { d.vistos[caminho][cartao] = 1; salvar(); } },
    fracao(caminho, total) { return total ? Math.min(1, Object.keys(d.vistos[caminho] || {}).length / total) : 0; },
    ultimo(caminho, v) { if (v === undefined) return (d.ultimo || {})[caminho]; d.ultimo = d.ultimo || {}; d.ultimo[caminho] = v; salvar(); },
    carteira(v) { if (v === undefined) return !!d.carteira; d.carteira = v; salvar(); },
  };
})();

/* ---------------- dados ---------------- */
let C = null, CART = null;
async function carregar(tipo) {
  if (!LOCAL) return api("conteudo", { tipo });
  const r = await fetch(FONTE[tipo], { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
const totalCartoes = cam => cam.capitulos.reduce((s, c) => s + c.cartoes.length, 0);
function concluido(id) {
  if (id === "carteira") return P.carteira();
  const cam = C.caminhos.find(c => c.id === id);
  return P.fracao(id, totalCartoes(cam)) >= 0.8;
}

/* ---------------- rotas e "Voltar" no mesmo ponto ---------------- */
const posicoes = {};
let rotaAtual = null, profundidade = 0;
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
function irPara(hash) { if (location.hash === hash) return; posicoes[location.hash || "#/"] = scrollY; profundidade++; location.hash = hash; }
function voltar() { if (profundidade > 0) { profundidade--; history.back(); } else irPara("#/"); }
addEventListener("hashchange", () => { posicoes[rotaAtual] = posicoes[rotaAtual] ?? 0; render(); });
document.addEventListener("click", e => {
  const a = e.target.closest("a[href^='#']");
  if (!a || e.defaultPrevented) return;
  e.preventDefault();
  const destino = a.getAttribute("href");
  // âncora comum (ex.: "Ir para o conteúdo"): só leva o foco, sem trocar de tela
  if (!destino.startsWith("#/")) { const el = document.getElementById(destino.slice(1)); if (el) { el.setAttribute("tabindex", "-1"); el.focus(); } return; }
  // tocar na aba em que já se está leva ao topo dela (como nos apps)
  if (destino === (location.hash || "#/") || (destino === "#/" && !location.hash)) { scrollTo({ top: 0, behavior: "smooth" }); return; }
  posicoes[location.hash || "#/"] = scrollY; profundidade++; location.hash = destino;
});

const app = () => $("#app");
function render() {
  if (!C) return;
  const h = location.hash || "#/";
  const anterior = rotaAtual; rotaAtual = h;
  fecharFolha(true);
  const [, rota, a, b] = h.split("/");
  if (!rota) telaCapa();
  else if (rota === "c") telaCaminho(a, b);
  else if (rota === "carteira") telaCarteira();
  else telaCapa();
  marcarNav(rota || "");
  const y = posicoes[h];
  requestAnimationFrame(() => {
    if (rota === "c" && b && y == null) { const alvo = document.getElementById("cartao-" + b); if (alvo) alvo.scrollIntoView(); }
    else scrollTo(0, y || 0);
  });
  T.evento("tela_vista", { de: anterior, para: h });
}
function marcarNav(rota) {
  document.querySelectorAll("[data-nav]").forEach(el => el.toggleAttribute("aria-current", el.dataset.nav === (rota || "inicio")));
  document.querySelectorAll("[data-nav][aria-current]").forEach(el => el.setAttribute("aria-current", "page"));
}

/* ---------------- capa ---------------- */
function telaCapa() {
  const cp = C.capa;
  const feitos = PERCURSO.filter(concluido).length;
  const proximo = PERCURSO.find(id => !concluido(id));
  const ultimoVisto = proximo && proximo !== "carteira" ? P.ultimo(proximo) : null;   // continua do último cartão visto
  const hrefProx = !proximo ? "#/c/toc" : proximo === "carteira" ? "#/carteira" : "#/c/" + proximo + (ultimoVisto ? "/" + ultimoVisto : "");
  const nomeProx = !proximo ? "Rever o percurso" : feitos === 0 ? "Começar o percurso" : "Continuar o percurso";
  const P1 = CART ? CART.clientes.filter(x => x.p === "1").length : "—";
  app().innerHTML = `
  <div class="wrap">
    <section class="hero">
      <div class="selo">${cp.selo}</div>
      <h1>${cp.manchete.join("<br>")}</h1>
      <div class="fio"></div>
      <p class="lead">${cp.lead} <span>${cp.lead2}</span></p>
      <div class="numeros">${cp.numeros.map(([n, t, l]) => `<div><strong class="${l ? "lar" : ""}">${n}</strong><span>${t}</span></div>`).join("")}</div>
    </section>
    <section class="percurso" aria-label="Percurso guiado">
      <div>
        <div class="selo">${feitos ? "Seu percurso" : "Comece por aqui"}</div>
        <h2>Quatro etapas, do problema à lista de amanhã.</h2>
        <p>O problema e a causa → a maturidade da gestão → a prova nos dados → a sua carteira. Cerca de 20 minutos. Dá para parar e continuar depois.</p>
        <div class="etapas" aria-hidden="true">${PERCURSO.map(id => `<i class="${concluido(id) ? "ok" : ""}"></i>`).join("")}</div>
        <small>${feitos} de 4 concluída${feitos === 1 ? "" : "s"}</small>
      </div>
      <div class="acao"><a class="btn btn-lar" href="${hrefProx}" data-ev="percurso">${nomeProx} →</a></div>
    </section>
    <div class="secao-titulo"><h2>Ou escolha por onde entrar</h2><span>3 caminhos e 1 ferramenta</span></div>
    <div class="caminhos">${C.caminhos.map(cam => {
      const f = P.fracao(cam.id, totalCartoes(cam));
      return `<a class="card" href="#/c/${cam.id}" data-ev="caminho_aberto" data-caminho="${cam.id}">
        <span class="num">${cam.num}</span><h3>${cam.titulo}</h3><p>${cam.descricao}</p>
        <div class="pe"><span class="tag">${cam.tag}</span>${f >= 0.8 ? "<b>Visto ✓</b>" : `<span>${totalCartoes(cam)} pontos</span>`}</div>
        <div class="barrinha" aria-hidden="true"><i style="width:${Math.round(f * 100)}%"></i></div></a>`;
    }).join("")}</div>
    <div class="carteira-chamada">
      <div><span class="selo">Ferramenta · 04</span><h3>A sua carteira, cliente a cliente</h3>
        <p>${CART ? CART.clientes.length.toLocaleString("pt-BR") : "—"} clientes. <strong>${P1} para agir nesta semana.</strong> Busque, filtre e veja a ação de cada um.</p></div>
      <a class="btn btn-tinta" href="#/carteira" data-ev="carteira_aberta">Abrir a carteira →</a>
    </div>
    ${blocoPergunte()}
    <footer class="rodape"><div>Diagnóstico comercial · ${C.cliente} · ${C.data}</div><div>SparkSales · Alan Mansim${!LOCAL && S.email() ? ` · ${esc(S.email())} · <button type="button" class="sair" data-sair>Sair</button>` : ""}</div></footer>
  </div>`;
  ligarPergunte(app());
}

/* ---------------- caminho ---------------- */
let observador = null;
function telaCaminho(id, alvo) {
  const cam = C.caminhos.find(c => c.id === id);
  if (!cam) { irPara("#/"); return; }
  const total = totalCartoes(cam);
  const idx = PERCURSO.indexOf(id);
  const prox = PERCURSO[idx + 1];
  const proxNome = prox === "carteira" ? "A sua carteira" : prox ? C.caminhos.find(c => c.id === prox).titulo : null;
  let n = 0;
  app().innerHTML = `
  <div class="trilho"><div class="wrap">
    <div class="l1"><button class="voltar" type="button" data-voltar>← Voltar</button>
      <span class="nome">Caminho ${cam.num} · ${cam.titulo}</span><span class="pct" id="pct"></span></div>
    <nav class="caps" aria-label="Capítulos">${cam.capitulos.map((cp, i) => `<button type="button" data-cap="${i}">${cp.nome}</button>`).join("")}</nav>
  </div><div class="prog"><i id="barra"></i></div></div>
  <div class="wrap">
    <header class="cab-caminho"><span class="num">${cam.num} · ${cam.tag}</span><h1>${cam.titulo}</h1><p>${cam.descricao}</p></header>
    ${cam.capitulos.map((cp, i) => `<section class="capitulo" id="cap-${i}" data-cap-sec="${i}"><h2>${cp.nome}</h2>
      ${cp.cartoes.map(ct => { n++; return cartaoHTML(cam, ct, n, total); }).join("")}</section>`).join("")}
    <div class="fim-caminho">
      <a class="btn btn-claro" href="#/">← Início</a>
      ${prox ? `<div class="prox"><small>Próximo no percurso</small><a class="btn btn-lar" href="${prox === "carteira" ? "#/carteira" : "#/c/" + prox}">${proxNome} →</a></div>` : ""}
    </div>
  </div>`;
  app().querySelectorAll(".detalhe table").forEach(t => { const w = document.createElement("div"); w.className = "tabela"; t.replaceWith(w); w.appendChild(t); });
  app().querySelectorAll(".graf svg").forEach(s => { s.removeAttribute("width"); s.removeAttribute("height"); });
  $("[data-voltar]").onclick = voltar;
  app().querySelectorAll("[data-cap]").forEach(b => b.onclick = () => {
    document.getElementById("cap-" + b.dataset.cap).scrollIntoView({ behavior: "smooth" });
    T.evento("capitulo_pulado", { caminho: id, capitulo: cam.capitulos[b.dataset.cap].nome });
  });
  app().querySelectorAll("[data-ver]").forEach(b => b.onclick = () => {
    const d = document.getElementById("det-" + b.dataset.ver);
    const abrir = d.hidden; d.hidden = !abrir;
    b.textContent = abrir ? "Fechar o detalhe ↑" : "Ver o detalhe ↓";
    b.setAttribute("aria-expanded", abrir);
    if (abrir) T.evento("detalhe_aberto", { caminho: id, cartao: b.dataset.ver });
  });
  const atualiza = () => {
    const f = P.fracao(id, total);
    $("#barra").style.width = Math.round(f * 100) + "%";
    $("#pct").textContent = Math.round(f * 100) + "%";
  };
  atualiza();
  if (observador) observador.disconnect();
  observador = new IntersectionObserver(ents => ents.forEach(en => {
    const el = en.target;
    if (el.dataset.cartao && en.isIntersecting && en.intersectionRatio > 0.5) {
      if (!el._t) el._t = setTimeout(() => {       // conta como visto após 2 s com mais da metade visível
        P.marcar(id, el.dataset.cartao); P.ultimo(id, el.dataset.cartao); atualiza();
        T.evento("cartao_visto", { caminho: id, cartao: el.dataset.cartao });
      }, 2000);
    } else if (el.dataset.cartao && el._t) { clearTimeout(el._t); el._t = null; }
    if (el.dataset.capSec !== undefined && en.isIntersecting)
      app().querySelectorAll("[data-cap]").forEach(b => b.setAttribute("aria-current", b.dataset.cap === el.dataset.capSec));
  }), { threshold: [0, 0.5, 0.6], rootMargin: "-20% 0px -30% 0px" });
  app().querySelectorAll("[data-cartao],[data-cap-sec]").forEach(el => observador.observe(el));
  T.evento("caminho_aberto", { caminho: id });
}
function cartaoHTML(cam, ct, n, total) {
  const d = ct.destaque;
  return `<article class="tese ${d ? "" : "sem-num"}" id="cartao-${ct.id}" data-cartao="${ct.id}">
    ${d ? `<div class="grande${d.numero.length > 7 ? " longo" : ""}">${esc(d.numero)}<small>${esc(d.legenda)}</small></div>` : ""}
    <div>
      <p class="contador">${n} de ${total}</p>
      <h3>${ct.titulo}</h3>
      <p class="deck">${ct.tese}</p>
      ${ct.resumo ? `<p class="resumo">${ct.resumo}</p>` : ""}
      ${ct.grafico ? `<figure class="graf">${ct.grafico}</figure>` : ""}
      <div class="ver"><button class="btn btn-mini" type="button" data-ver="${ct.id}" aria-expanded="false" aria-controls="det-${ct.id}">Ver o detalhe ↓</button></div>
      <div class="detalhe" id="det-${ct.id}" hidden>${ct.detalhe}</div>
    </div></article>`;
}

/* ---------------- carteira ---------------- */
const filtro = { q: "", p: "1", r: "", cat: "", ord: "p", limite: 40 };
function telaCarteira() {
  if (!CART) { app().innerHTML = `<div class="estado"><div><h1>Carregando a carteira…</h1></div></div>`; return; }
  P.carteira(true);
  const reps = [...new Set(CART.clientes.map(c => c.r).filter(Boolean))].sort((a, b) => (a.startsWith("Vend") ? 0 : 1) - (b.startsWith("Vend") ? 0 : 1) || a.localeCompare(b));
  const cats = [...new Set(CART.clientes.map(c => c.cat).filter(c => c && c !== "0" && c !== "#N/A"))].sort();
  const cont = k => CART.clientes.filter(c => c.p === k).length;
  app().innerHTML = `
  <div class="wrap">
    <div class="trilho" style="position:static;background:none;border:0"><div class="l1"><button class="voltar" type="button" data-voltar>← Voltar</button></div></div>
    <header class="cab-carteira"><span class="selo">Ferramenta · 04</span><h1>Sua carteira</h1>
      <p>${CART.clientes.length.toLocaleString("pt-BR")} clientes com compra desde jan/2024 · faturamento até ${CART.atualizado}. Responsáveis pela função.</p></header>
  </div>
  <div class="filtros"><div class="wrap">
    <label class="busca"><span aria-hidden="true">⌕</span><span class="sr">Buscar cliente</span><input id="q" type="search" placeholder="Buscar cliente pelo nome" value="${esc(filtro.q)}" autocomplete="off"></label>
    <div class="chips" role="group" aria-label="Filtros">
      ${["1", "2", "3", "4", ""].map(k => `<button type="button" data-p="${k}" aria-pressed="${filtro.p === k}">${k === "1" ? '<span class="p1"></span>' : ""}${k ? "Prioridade " + k + " · " + cont(k) : "Todas"}</button>`).join("")}
      <select id="r" aria-label="Responsável"><option value="">Responsável</option>${reps.map(r => `<option ${filtro.r === r ? "selected" : ""}>${esc(r)}</option>`).join("")}</select>
      <select id="cat" aria-label="Categoria"><option value="">Categoria</option>${cats.map(r => `<option ${filtro.cat === r ? "selected" : ""}>${esc(r)}</option>`).join("")}</select>
      <select id="ord" aria-label="Ordenar"><option value="p" ${filtro.ord === "p" ? "selected" : ""}>Ordem: prioridade</option><option value="rb" ${filtro.ord === "rb" ? "selected" : ""}>Ordem: receita</option><option value="t6" ${filtro.ord === "t6" ? "selected" : ""}>Ordem: maior queda</option></select>
    </div>
  </div></div>
  <div class="wrap"><p class="contagem" id="contagem" aria-live="polite"></p><div class="lista" id="lista"></div><div class="mais" id="mais"></div></div>`;
  $("[data-voltar]").onclick = voltar;
  let tq;
  $("#q").oninput = e => { filtro.q = e.target.value; filtro.limite = 40; listar(); clearTimeout(tq); tq = setTimeout(() => T.evento("busca", { caracteres: filtro.q.length }), 800); };
  app().querySelectorAll("[data-p]").forEach(b => b.onclick = () => {
    filtro.p = b.dataset.p; filtro.limite = 40;
    app().querySelectorAll("[data-p]").forEach(x => x.setAttribute("aria-pressed", x === b)); listar();
    T.evento("filtro_usado", { filtro: "prioridade", valor: filtro.p || "todas" });
  });
  ["r", "cat", "ord"].forEach(k => $("#" + k).onchange = e => { filtro[k] = e.target.value; filtro.limite = 40; listar(); T.evento(k === "ord" ? "ordenou" : "filtro_usado", { filtro: k, valor: e.target.value }); });
  listar();
}
function listar() {
  const q = semAcento(filtro.q);
  let l = CART.clientes.filter(c => (!filtro.p || c.p === filtro.p) && (!filtro.r || c.r === filtro.r) && (!filtro.cat || c.cat === filtro.cat) && (!q || semAcento(c.n).includes(q)));
  if (filtro.ord === "rb") l.sort((a, b) => (b.rb || 0) - (a.rb || 0));
  else if (filtro.ord === "t6") l.sort((a, b) => (a.t6 ?? 9) - (b.t6 ?? 9));
  const mostra = l.slice(0, filtro.limite);
  $("#contagem").textContent = l.length ? `${l.length.toLocaleString("pt-BR")} cliente${l.length > 1 ? "s" : ""}` : "";
  $("#lista").innerHTML = l.length ? mostra.map((c, i) => `
    <button class="cli" type="button" data-i="${CART.clientes.indexOf(c)}">
      <div class="l1"><h4>${esc(titulo(c.n))}</h4><span class="badge b${c.p}">P${c.p}</span></div>
      <div class="l2"><span><b>${brl(c.rb)}</b> 12 meses</span>${c.t6 != null ? `<span class="${c.t6 < 0 ? "neg" : "pos"}">${pct(c.t6)} 6m</span>` : ""}<span>Classe ${c.abc || "—"}</span><span>${esc(c.r || "")}</span></div>
      <div class="acao"><b>Ação:</b> ${esc(c.acao)}</div>
    </button>`).join("") : `<div class="estado" style="min-height:0"><div><h1 style="font-size:20px">Nenhum cliente com esse filtro</h1><p>Limpe a busca ou escolha "Todas".</p></div></div>`;
  $("#mais").innerHTML = l.length > filtro.limite ? `<button class="btn btn-claro" type="button" id="vermais">Mostrar mais ${Math.min(40, l.length - filtro.limite)}</button>` : "";
  const vm = $("#vermais"); if (vm) vm.onclick = () => { filtro.limite += 40; listar(); };
  $("#lista").querySelectorAll(".cli").forEach(b => b.onclick = () => abrirCliente(CART.clientes[b.dataset.i]));
}
function titulo(n) { return String(n).toLowerCase().replace(/(^|\s|-|\/)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Ltda|S\/A|Sa|Ss|Me|Eireli)\b/gi, s => s.toUpperCase()); }
function abrirCliente(c) {
  abrirFolha(`<button class="fechar" type="button" data-fechar>✕ Fechar</button>
    <span class="badge b${c.p}" style="display:inline-block;margin-top:12px">Prioridade ${c.p}</span>
    <h2>${esc(titulo(c.n))}</h2>
    <p style="margin:0;color:var(--cinza)">${esc(c.cat || "")} · ${esc(c.r || "")}</p>
    <div class="caixa"><b>Ação recomendada</b>${esc(c.acao)}<br><span style="color:var(--cinza);font-size:14px">Como medir: ${esc(c.kpi || "—")}</span></div>
    ${c.sinal ? `<div class="caixa"><b>Sinal de risco</b>${esc(c.sinal)}</div>` : ""}
    ${c.op ? `<div class="caixa"><b>Oportunidade</b>${esc(c.op)}</div>` : ""}
    <dl>
      <dt>Receita 12 meses</dt><dd>${brl(c.rb)}</dd>
      <dt>12 meses anteriores</dt><dd>${brl(c.ra)} ${c.var != null ? `<span class="${c.var < 0 ? "neg" : "pos"}">(${pct(c.var)})</span>` : ""}</dd>
      <dt>Últimos 6 meses (a/a)</dt><dd>${c.t6 != null ? `<span class="${c.t6 < 0 ? "neg" : "pos"}">${pct(c.t6)}</span>` : "—"}</dd>
      <dt>Meses com compra</dt><dd>${c.mc ?? "—"} de 12</dd>
      <dt>Última compra</dt><dd>${esc(c.ult || "—")}</dd>
      <dt>Famílias</dt><dd>${esc(c.fam || "—")}</dd>
      <dt>Classe ABC · RFV</dt><dd>${esc(c.abc || "—")} · ${esc(c.rfv || "—")}</dd>
    </dl>
    <p style="font-size:12px;color:var(--cinza-claro)">Sinais são indicativos, não probabilidade de perda. Potencial é teto, não meta.</p>`);
  T.evento("cliente_aberto", { prioridade: c.p, responsavel: c.r });
}

/* ---------------- folha lateral ---------------- */
function abrirFolha(html) {
  fecharFolha(true);
  const v = document.createElement("div"); v.className = "veu"; v.onclick = () => fecharFolha();
  const f = document.createElement("aside"); f.className = "folha"; f.setAttribute("role", "dialog"); f.setAttribute("aria-modal", "true"); f.innerHTML = html;
  document.body.append(v, f);
  f.querySelector("[data-fechar]").onclick = () => fecharFolha();
  f.querySelector("[data-fechar]").focus();
  document.addEventListener("keydown", escFecha);
  // o "voltar" do celular/navegador fecha a ficha, em vez de sair da tela
  if (!(history.state && history.state.folha)) history.pushState({ folha: 1 }, "");
}
function escFecha(e) { if (e.key === "Escape") fecharFolha(); }
function fecharFolha(peloHistorico) {
  const aberta = document.querySelector(".folha");
  document.querySelectorAll(".veu,.folha").forEach(x => x.remove()); document.removeEventListener("keydown", escFecha);
  if (aberta && !peloHistorico && history.state && history.state.folha) history.back();   // tira a entrada da ficha do histórico
}
addEventListener("popstate", () => { if (document.querySelector(".folha")) fecharFolha(true); });

/* ---------------- perguntas ---------------- */
function blocoPergunte() {
  return `<section class="pergunte" id="pergunte" aria-label="Pergunte ao diagnóstico">
    <span class="selo">Pergunte ao diagnóstico</span>
    <h2>Não entendeu algo? <em class="s">Pergunte.</em></h2>
    <p>As respostas vêm só das análises deste projeto, com a fonte ao lado. Se não estiver nelas, a resposta diz.</p>
    <div class="lentes"><span><i>●</i>Teoria das Restrições</span><span><i>●</i>Maturidade de processos</span><span><i>●</i>Dados</span></div>
    <div class="conversa-topo" hidden><button type="button" class="ant" data-anteriores hidden></button><button type="button" class="nova" data-nova hidden>Nova conversa</button></div>
    <div class="conversa" id="conversa" aria-live="polite"></div>
    <form class="campo" data-pergunta><label class="sr" for="pq">Sua pergunta</label>
      <textarea id="pq" rows="1" maxlength="400" enterkeyhint="send" placeholder="${esc((C.perguntas||{}).exemplo||"Escreva sua pergunta")}" autocomplete="off"></textarea>
      <button type="submit" aria-label="Enviar pergunta">↑</button></form>
    <div class="sugestoes">${((C.perguntas||{}).sugestoes||[]).map(s => `<button type="button" data-sug>${s}</button>`).join("")}</div>
  </section>`;
}
// texto da resposta: parágrafos, com e-mail e WhatsApp da SparkSales clicáveis
function textoResposta(t) {
  return String(t || "").split(/\n{2,}/).map(par => `<p>${esc(par)
    .replace(/alan@sparksales\.com\.br/g, '<a href="mailto:alan@sparksales.com.br">alan@sparksales.com.br</a>')
    .replace(/\(12\)\s?99175-5717/g, '<a href="https://wa.me/5512991755717" target="_blank" rel="noopener">$&</a>')}</p>`).join("");
}
function htmlResposta(r) {
  const fora = r.lente === "Fora das análises";
  return `<div class="msg-ia${fora ? " aviso" : ""}"><div class="lente">${esc(r.lente)}</div>
    ${textoResposta(r.resposta)}
    ${(r.fontes || []).length && !fora ? `<div class="fonte">Fonte: ${r.fontes.map(x => `<span class="f">${esc(x)}</span>`).join("")}</div>` : ""}
    ${r.restantes != null && r.restantes <= 5 ? `<div class="fonte">Restam ${r.restantes} pergunta${r.restantes === 1 ? "" : "s"} hoje.</div>` : ""}</div>`;
}
let HIST = null;   // última conversa carregada, para redesenhar a capa sem esperar o servidor
const htmlTroca = (it) => `<div class="msg-eu">${esc(it.pergunta)}</div>${htmlResposta(it)}`;

function ligarPergunte(raiz) {
  const f = raiz.querySelector("[data-pergunta]"); if (!f) return;
  const inp = f.querySelector("textarea"), conv = raiz.querySelector("#conversa"), sec = raiz.querySelector("#pergunte");
  const topo = raiz.querySelector(".conversa-topo"), bAnt = raiz.querySelector("[data-anteriores]"), bNova = raiz.querySelector("[data-nova]");
  raiz.querySelectorAll("[data-sug]").forEach(b => b.onclick = () => { inp.value = b.textContent; f.requestSubmit(); });
  const btn = f.querySelector("button");

  // a caixa cresce com o texto (até ~6 linhas; depois rola por dentro). Vazia, mede o exemplo cinza, para ele não sair cortado.
  const ajustar = () => {
    inp.style.height = "auto";
    let h = inp.scrollHeight;
    if (!inp.value && inp.placeholder) { inp.value = inp.placeholder; h = inp.scrollHeight; inp.value = ""; }
    inp.style.height = Math.min(h, 168) + "px";
  };
  inp.addEventListener("input", ajustar);
  requestAnimationFrame(ajustar);
  addEventListener("resize", ajustar);
  // Enter envia; Shift+Enter quebra linha
  inp.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); f.requestSubmit(); } });

  const estado = () => {
    const tem = !!conv.querySelector(".msg-eu");
    sec && sec.classList.toggle("com-conversa", tem);
    bNova.hidden = !tem;
    topo.hidden = bNova.hidden && bAnt.hidden;
  };

  // conversa recente (24 h ou desde "Nova conversa") volta ao abrir a página
  const mostrar = (r) => {
    conv.innerHTML = (r.itens || []).map(htmlTroca).join("");
    bAnt.hidden = !(r.anteriores > 0);
    if (r.anteriores > 0) bAnt.textContent = `Ver perguntas anteriores (${r.anteriores})`;
    estado();
  };
  if (HIST) mostrar(HIST);
  if (!LOCAL) api("historico", { desde: P.conversaDesde() }).then(r => {
    const novo = JSON.stringify(r) !== JSON.stringify(HIST);
    HIST = r;
    if (novo && !btn.disabled) mostrar(r);   // não mexe enquanto uma pergunta está em andamento
  }).catch(() => {});

  bAnt.onclick = async () => {
    bAnt.disabled = true;
    try {
      const r = await api("historico", { desde: P.conversaDesde(), anteriores: true });
      const alt = document.documentElement.scrollHeight;
      const temRecente = !!conv.querySelector(".msg-eu");
      conv.insertAdjacentHTML("afterbegin", (r.itens || []).map(htmlTroca).join("") + (temRecente ? `<div class="divisa">Conversa recente</div>` : ""));
      scrollBy(0, document.documentElement.scrollHeight - alt);   // mantém na tela o que a pessoa estava lendo
      bAnt.hidden = true; estado();
    } catch (e) { bAnt.disabled = false; }
  };
  bNova.onclick = () => {
    P.conversaDesde(new Date().toISOString());
    HIST = null; conv.innerHTML = ""; bAnt.hidden = true; estado();
    T.evento("cta_clicado", { cta: "nova_conversa" });
    inp.focus();
  };

  f.onsubmit = async e => {
    e.preventDefault();
    const q = inp.value.trim(); if (!q || btn.disabled) return;
    inp.value = ""; ajustar(); btn.disabled = true;
    if (matchMedia("(pointer:coarse)").matches) inp.blur();   // no celular, fecha o teclado para a resposta ter espaço
    conv.insertAdjacentHTML("beforeend", `<div class="msg-eu">${esc(q)}</div><div class="msg-ia aviso pensando"><div class="lente">Lendo as análises…</div><p>Isso leva alguns segundos.</p></div>`);
    estado();
    // leva a pergunta nova para o topo da tela: a resposta aparece logo abaixo e é lida de cima para baixo
    const eu = conv.querySelectorAll(".msg-eu"); eu[eu.length - 1].scrollIntoView({ behavior: "smooth", block: "start" });
    T.evento("pergunta_feita", { caracteres: q.length });
    const r = await perguntar(q);
    const p = conv.querySelector(".pensando"); if (p) p.remove();
    conv.insertAdjacentHTML("beforeend", r.html);
    if (r.dados) { HIST = HIST || { itens: [], anteriores: 0 }; HIST.itens = [...(HIST.itens || []), { pergunta: q, ...r.dados }]; }
    btn.disabled = false;
  };
}
async function perguntar(q) {
  if (LOCAL) return { html: `<div class="msg-ia aviso"><div class="lente">Prévia local</div><p>Nesta prévia a caixa não responde. No portal publicado, a resposta vem do servidor, só com o conteúdo do projeto.</p></div>` };
  try {
    const r = await api("perguntar", { pergunta: q, sessao: T.sessao, desde: P.conversaDesde() });
    return { html: htmlResposta(r), dados: { resposta: r.resposta, lente: r.lente, fontes: r.fontes } };
  } catch (e) {
    if (e instanceof SemSessao) { telaEntrada(e.message); return { html: "" }; }
    return { html: `<div class="msg-ia aviso"><div class="lente">Sem resposta</div><p>${esc(e.message || "Não consegui responder agora. Tente de novo em instantes.")}</p></div>` };
  }
}

/* ---------------- entrada (e-mail + palavra-passe) ---------------- */
function telaEntrada(aviso = "") {
  fecharFolha(true);
  document.body.classList.add("sem-sessao");
  app().innerHTML = `
  <div class="entrada"><form class="cx" id="entrar" novalidate>
    <span class="selo">Diagnóstico comercial</span>
    <h1>Entre para ver <em class="s">o diagnóstico.</em></h1>
    <p>Use o seu e-mail e a palavra-passe que veio com o documento impresso.</p>
    <label for="em">E-mail</label>
    <input id="em" type="email" autocomplete="email" inputmode="email" required>
    <label for="pp">Palavra-passe</label>
    <input id="pp" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required>
    <p class="erro" id="erro" role="alert">${esc(aviso)}</p>
    <button class="btn btn-lar" type="submit">Entrar →</button>
  </form></div>`;
  const f = $("#entrar"), b = f.querySelector("button");
  $("#em").focus();
  f.onsubmit = async e => {
    e.preventDefault();
    const email = $("#em").value.trim(), palavra = $("#pp").value.trim();
    if (!email || !palavra) { $("#erro").textContent = "Preencha o e-mail e a palavra-passe."; return; }
    b.disabled = true; b.textContent = "Entrando…"; $("#erro").textContent = "";
    try {
      const r = await api("entrar", { documento: DOC, email, palavra_passe: palavra });
      S.guardar({ token: r.token, email: r.email, expira_em: r.expira_em });
      document.body.classList.remove("sem-sessao");
      iniciar();
    } catch (err) {
      $("#erro").textContent = err.message === "Failed to fetch" ? "Sem conexão. Verifique a internet e tente de novo." : err.message;
      b.disabled = false; b.textContent = "Entrar →";
    }
  };
}

/* ---------------- início ---------------- */
async function iniciar() {
  if (!LOCAL) {
    if (!DOC) { app().innerHTML = `<div class="estado"><div><h1>Link incompleto</h1><p>Abra o endereço completo que veio com o documento.</p></div></div>`; return; }
    if (!S.token()) { telaEntrada(); return; }
    T.configurar(API + "/eventos");
    app().innerHTML = `<div class="estado"><div><h1>Carregando…</h1></div></div>`;
  }
  try {
    if (!LOCAL) api("progresso").then(r => { P.juntar(r.dados); if (C) render(); }).catch(() => {});
    C = await carregar("conteudo");
    render();
    carregar("carteira").then(d => { CART = d; if ((location.hash || "").startsWith("#/carteira") || !location.hash || location.hash === "#/") render(); })
      .catch(() => { CART = { clientes: [], atualizado: "" }; });
  } catch (e) {
    if (e instanceof SemSessao) { telaEntrada("Sua sessão expirou. Entre de novo."); return; }
    app().innerHTML = `<div class="estado"><div><h1>Não foi possível carregar o conteúdo</h1><p>${e.status === 404 ? "O conteúdo ainda não foi publicado." : "Verifique a conexão e tente de novo."}</p><p><button class="btn btn-tinta" type="button" onclick="location.reload()">Tentar de novo</button></p></div></div>`;
    T.evento("erro", { mensagem: "conteudo: " + e.message });
  }
}
document.addEventListener("click", e => {
  if (e.target.closest("[data-sair]")) { S.sair(); C = CART = HIST = null; telaEntrada(); return; }
  const el = e.target.closest("[data-ev]");
  if (el) T.evento("cta_clicado", { alvo: el.dataset.ev, caminho: el.dataset.caminho });
  if (e.target.closest("[data-perguntar]")) {
    e.preventDefault();
    const irCampo = (suave) => { const s = $("#pergunte"), c = $("#pq"); if (!s || !c) return;
      // sem conversa: mostra o bloco desde o título; com conversa: vai direto ao campo, abaixo da última resposta
      (s.classList.contains("com-conversa") ? c : s).scrollIntoView({ behavior: suave ? "smooth" : "auto", block: s.classList.contains("com-conversa") ? "center" : "start" });
      c.focus({ preventScroll: true }); };
    if (!$("#pergunte")) { irPara("#/"); setTimeout(() => irCampo(false), 200); }
    else irCampo(true);
  }
});
T.evento("sessao_inicio", { largura: innerWidth, toque: "ontouchstart" in window });
iniciar();
