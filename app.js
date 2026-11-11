/* Portal SparkSales · casca pública. Não contém dados: o conteúdo vem de FONTE (local no desenvolvimento,
   Supabase depois da palavra-passe na versão publicada). */
"use strict";

const FONTE = { conteudo: "conteudo/conteudo.json", carteira: "conteudo/carteira.json" };
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
    if (!destino || !fila.length) return;
    const lote = fila.splice(0, fila.length);
    try {
      const corpo = JSON.stringify({ eventos: lote });
      if (final && navigator.sendBeacon) navigator.sendBeacon(destino, corpo);
      else await fetch(destino, { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo, keepalive: true });
    } catch (e) { if (fila.length < 500) fila.unshift(...lote); }
  }
  ["mousemove", "keydown", "scroll", "touchstart"].forEach(ev => addEventListener(ev, () => { ultimoMov = Date.now(); }, { passive: true }));
  document.addEventListener("visibilitychange", () => { visivel = !document.hidden; if (!visivel) enviar(true); });
  setInterval(() => {   // tempo ativo: aba visível e com movimento nos últimos 60 s
    if (visivel && Date.now() - ultimoMov < 60000) { ativo += 15; evento("tempo_ativo", { segundos: 15 }); }
  }, 15000);
  setInterval(() => enviar(), 30000);
  addEventListener("pagehide", () => enviar(true));
  return { evento, configurar: d => { destino = d; }, fila, sessao };
})();
window.addEventListener("error", e => T.evento("erro", { mensagem: String(e.message).slice(0, 200) }));

/* ---------------- progresso (local nesta versão; servidor na publicada) ---------------- */
const P = (() => {
  const CH = "portal.progresso.v1";
  let d = {};
  try { d = JSON.parse(localStorage.getItem(CH) || "{}"); } catch (e) { d = {}; }
  d.vistos = d.vistos || {};
  const salvar = () => { try { localStorage.setItem(CH, JSON.stringify(d)); } catch (e) {} };
  return {
    marcar(caminho, cartao) { if (!d.vistos[caminho]) d.vistos[caminho] = {}; if (!d.vistos[caminho][cartao]) { d.vistos[caminho][cartao] = 1; salvar(); } },
    fracao(caminho, total) { return total ? Math.min(1, Object.keys(d.vistos[caminho] || {}).length / total) : 0; },
    ultimo(caminho, v) { if (v === undefined) return (d.ultimo || {})[caminho]; d.ultimo = d.ultimo || {}; d.ultimo[caminho] = v; salvar(); },
    carteira(v) { if (v === undefined) return !!d.carteira; d.carteira = v; salvar(); },
  };
})();

/* ---------------- dados ---------------- */
let C = null, CART = null;
async function carregar(url) {
  const r = await fetch(url, { cache: "no-store" });
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
  if (a && !e.defaultPrevented) { e.preventDefault(); posicoes[location.hash || "#/"] = scrollY; profundidade++; location.hash = a.getAttribute("href"); }
});

const app = () => $("#app");
function render() {
  const h = location.hash || "#/";
  const anterior = rotaAtual; rotaAtual = h;
  fecharFolha();
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
  const hrefProx = !proximo ? "#/c/toc" : proximo === "carteira" ? "#/carteira" : "#/c/" + proximo;
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
    <footer class="rodape"><div>Diagnóstico comercial · ${C.cliente} · ${C.data}</div><div>SparkSales · Alan Mansim</div></footer>
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
      <p class="rotulo">${n} de ${total} · ${ct.titulo}</p>
      <h3>${ct.tese}</h3>
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
  fecharFolha();
  const v = document.createElement("div"); v.className = "veu"; v.onclick = fecharFolha;
  const f = document.createElement("aside"); f.className = "folha"; f.setAttribute("role", "dialog"); f.setAttribute("aria-modal", "true"); f.innerHTML = html;
  document.body.append(v, f);
  f.querySelector("[data-fechar]").onclick = fecharFolha;
  f.querySelector("[data-fechar]").focus();
  document.addEventListener("keydown", escFecha);
}
function escFecha(e) { if (e.key === "Escape") fecharFolha(); }
function fecharFolha() { document.querySelectorAll(".veu,.folha").forEach(x => x.remove()); document.removeEventListener("keydown", escFecha); }

/* ---------------- perguntas ---------------- */
function blocoPergunte() {
  return `<section class="pergunte" id="pergunte" aria-label="Pergunte ao diagnóstico">
    <span class="selo">Pergunte ao diagnóstico</span>
    <h2>Não entendeu algo? <em class="s">Pergunte.</em></h2>
    <p>As respostas vêm só das análises deste projeto, com a fonte ao lado. Se não estiver nelas, a resposta diz.</p>
    <div class="lentes"><span><i>●</i>Teoria das Restrições</span><span><i>●</i>Maturidade de processos</span><span><i>●</i>Dados</span></div>
    <form class="campo" data-pergunta><label class="sr" for="pq">Sua pergunta</label>
      <input id="pq" type="text" maxlength="400" placeholder="${esc((C.perguntas||{}).exemplo||"Escreva sua pergunta")}" autocomplete="off">
      <button type="submit" aria-label="Enviar pergunta">↑</button></form>
    <div class="sugestoes">${((C.perguntas||{}).sugestoes||[]).map(s => `<button type="button" data-sug>${s}</button>`).join("")}</div>
    <div class="conversa" id="conversa" aria-live="polite"></div>
  </section>`;
}
function ligarPergunte(raiz) {
  const f = raiz.querySelector("[data-pergunta]"); if (!f) return;
  const inp = f.querySelector("input"), conv = raiz.querySelector("#conversa");
  raiz.querySelectorAll("[data-sug]").forEach(b => b.onclick = () => { inp.value = b.textContent; f.requestSubmit(); });
  f.onsubmit = async e => {
    e.preventDefault();
    const q = inp.value.trim(); if (!q) return;
    inp.value = "";
    conv.insertAdjacentHTML("beforeend", `<div class="msg-eu">${esc(q)}</div>`);
    T.evento("pergunta_feita", { caracteres: q.length });
    const r = await perguntar(q);
    conv.insertAdjacentHTML("beforeend", r);
  };
}
async function perguntar(q) {
  // Na versão publicada, a pergunta vai para a função no servidor, que responde só com o conteúdo do projeto.
  return `<div class="msg-ia aviso"><div class="lente">Versão local</div><p>A caixa de perguntas responde quando o portal estiver conectado ao servidor. Nesta prévia, ela só registra a pergunta.</p></div>`;
}

/* ---------------- início ---------------- */
async function iniciar() {
  try {
    C = await carregar(FONTE.conteudo);
    render();
    carregar(FONTE.carteira).then(d => { CART = d; if ((location.hash || "").startsWith("#/carteira") || !location.hash || location.hash === "#/") render(); })
      .catch(() => { CART = { clientes: [], atualizado: "" }; });
  } catch (e) {
    app().innerHTML = `<div class="estado"><div><h1>Não foi possível carregar o conteúdo</h1><p>Verifique a conexão e tente de novo.</p><p><button class="btn btn-tinta" type="button" onclick="location.reload()">Tentar de novo</button></p></div></div>`;
    T.evento("erro", { mensagem: "conteudo: " + e.message });
  }
}
document.addEventListener("click", e => {
  const el = e.target.closest("[data-ev]");
  if (el) T.evento("cta_clicado", { alvo: el.dataset.ev, caminho: el.dataset.caminho });
  if (e.target.closest("[data-perguntar]")) {
    e.preventDefault();
    if (!$("#pergunte")) { irPara("#/"); setTimeout(() => { const s = $("#pergunte"); s && s.scrollIntoView(); $("#pq") && $("#pq").focus(); }, 200); }
    else { $("#pergunte").scrollIntoView({ behavior: "smooth" }); $("#pq").focus(); }
  }
});
T.evento("sessao_inicio", { largura: innerWidth, toque: "ontouchstart" in window });
iniciar();
