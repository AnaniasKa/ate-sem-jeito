(() => {
  const app = document.getElementById("app");
  const stage = document.getElementById("stage");
  const store = document.getElementById("pages");
  const btnPrev = document.getElementById("prev");
  const btnNext = document.getElementById("next");
  const where = document.getElementById("where");

  const wide = matchMedia("(min-width:700px) and (min-aspect-ratio:1/1)");
  const calm = matchMedia("(prefers-reduced-motion:reduce)");

  const coverFront = store.querySelector(".cover-front");
  const coverOpen = coverFront.querySelector(".cover-open") || coverFront;
  const coverBack = store.querySelector(".endpaper");
  const pages = [...store.querySelectorAll(".page.paper")];

  let sheets = [];   // folhas na ordem; cada uma tem frente e verso
  let turned = 0;    // quantas folhas já foram viradas
  let spread = null; // true = duas páginas (PC), false = uma (celular)
  let busy = false;

  const blank = () => {
    const s = document.createElement("section");
    s.className = "page paper blank";
    s.innerHTML = '<div class="inner"></div>';
    return s;
  };

  // posição de leitura (0 = capa, 1..N = página) para manter o lugar ao girar o aparelho
  const pageNow = () => spread ? (turned <= 1 ? turned : 2 * turned - 2) : turned;

  function build() {
    const keep = spread === null ? 0 : pageNow();
    spread = wide.matches;
    app.classList.toggle("spread", spread);

    const defs = [[coverFront, coverBack]];
    if (spread) for (let i = 0; i < pages.length; i += 2) defs.push([pages[i], pages[i + 1] || blank()]);
    else for (const p of pages) defs.push([p, blank()]);

    const old = sheets.map(s => s.el);
    sheets = defs.map(([front, back], i) => {
      const el = document.createElement("div");
      el.className = "sheet" + (i === 0 ? " cover" : "");
      const f = document.createElement("div"); f.className = "face front"; f.append(front);
      const b = document.createElement("div"); b.className = "face back"; b.append(back);
      el.append(f, b);
      stage.append(el);
      return { el, f, b };
    });
    old.forEach(el => el.remove());

    turned = Math.min(sheets.length - 1, spread ? (keep === 0 ? 0 : Math.floor(keep / 2) + 1) : keep);
    render();
    fit();
  }

  function visibleFaces() {
    const v = [sheets[turned].f];
    if (spread && turned > 0) v.push(sheets[turned - 1].b);
    return v;
  }

  function render() {
    const n = sheets.length;
    sheets.forEach((s, i) => {
      const isTurned = i < turned;
      const moving = s.el.classList.contains("moving");
      s.el.classList.toggle("turned", isTurned);
      s.el.style.zIndex = moving ? 100 : isTurned ? (i + 1) * 2 : (n - i) * 2;
      const near = (i >= turned - 2 && i <= turned + 1) || (spread && i === 0);
      // no celular a folha virada sai de cena; no PC ela fica deitada à esquerda
      s.el.classList.toggle("away", !moving && (!near || (!spread && isTurned)));
      // qual lado da folha aparece: não dependemos só do backface-visibility, porque o Firefox
      // deixa vazar (espelhado) o que tem transformação própria — fotos inclinadas, textos, botões
      if (!moving) s.lado = isTurned ? "b" : "f";
      mostrarLado(s);
    });
    const vis = visibleFaces();
    for (const s of sheets) for (const face of [s.f, s.b]) face.inert = !vis.includes(face);
    document.querySelectorAll("audio,video").forEach(m => { if (m.closest("[inert]")) m.pause(); });

    app.classList.toggle("closed", turned === 0);
    app.classList.toggle("thick-left", turned >= 2);

    const last = sheets.length - 1;
    btnPrev.disabled = turned === 0;
    btnNext.disabled = turned === last;
    btnPrev.textContent = turned === 1 ? "‹ Fechar" : "‹ Voltar";
    btnNext.textContent = turned === 0 ? "Abrir ›" : "Virar ›";
    if (turned === 0) where.textContent = "";
    else if (!spread) where.textContent = `${turned} de ${pages.length}`;
    else {
      const l = 2 * turned - 2, r = Math.min(2 * turned - 1, pages.length);
      where.textContent = l < 1 || l === r ? `${r} de ${pages.length}` : `${l}–${r} de ${pages.length}`;
    }
  }

  function mostrarLado(s) {
    s.f.style.visibility = s.lado === "b" ? "hidden" : "";
    s.b.style.visibility = s.lado === "b" ? "" : "hidden";
  }
  // momento em que a folha passa de lado (90°) na curva da virada: cubic-bezier(.38,.06,.22,1)
  const MEIO = (() => {
    const bz = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
    let lo = 0, hi = 1;
    for (let k = 0; k < 40; k++) {          // acha o tempo em que o giro chega à metade
      const mid = (lo + hi) / 2, x = bz(mid, .38, .22), y = bz(mid, .06, 1);
      if (y < 0.5) lo = mid; else hi = mid;
    }
    return bz((lo + hi) / 2, .38, .22);      // fração do tempo da animação
  })();

  function go(dir) {
    if (busy) return;
    const next = Math.max(0, Math.min(sheets.length - 1, turned + dir));
    if (next === turned) return;
    const sheet = sheets[dir > 0 ? turned : next];
    const ms = calm.matches ? 0 : 900;
    if (ms) {
      busy = true;
      sheet.el.classList.add("moving");
      sheet.el.classList.remove("away");
      stage.classList.remove("turning"); void stage.offsetWidth; stage.classList.add("turning");
    }
    if (turned === 0 && dir > 0) startMusic();  // abre a capa: a música começa
    // foco do teclado: quem estava na capa (ou no "Fechar") não pode ficar num elemento que some
    const lost = document.activeElement && (coverFront.contains(document.activeElement) || (next === 0 && document.activeElement === btnPrev));
    turned = next;
    render();
    if (lost) (next === 0 ? coverOpen : btnNext).focus({ preventScroll: true });
    if (ms) {
      const dur = parseFloat(getComputedStyle(sheet.el).transitionDuration) * 1000 || ms;
      setTimeout(() => { sheet.lado = dir > 0 ? "b" : "f"; mostrarLado(sheet); }, dur * MEIO);
    }
    if (ms) setTimeout(() => {
      sheet.el.classList.remove("moving");
      stage.classList.remove("turning");
      busy = false;
      render();
    }, ms);
  }

  // ── papel pautado: escala da arte e posição das linhas ──
  // A arte (assets/papel/) tem faixa de cima de 110px, faixa de linhas de 170px (4 pautas) que se
  // repete, e faixa de baixo de 233px. Escolhemos a escala para a faixa do meio caber um número
  // inteiro de vezes: assim as pautas ficam com espaçamento exato e dá para saber onde cada uma está.
  const PAUTA = { topo: 88.6, faixa: [21.5, 64.6, 107.3, 149.4], baixo: [22.3, 64.5, 107.6, 150.5] };
  let pautas = [], P = 0;
  function papel() {
    const pg = document.querySelector(".sheet .page.paper");
    if (!pg || !pg.clientHeight) return;
    const H = pg.clientHeight, W = pg.clientWidth;
    // no celular a página é estreita: escala um pouco maior para a pauta caber uma linha de texto legível
    const alvo = spread ? Math.min(W / 765, H / 1024) : Math.min(H / 1024, W / 600);
    let n = Math.max(1, Math.round((H / alvo - 343) / 170)), u = H / (343 + 170 * n);
    while (340 * u > W * 0.62 && n < 20) u = H / (343 + 170 * ++n);   // cantos não podem engolir a página
    pautas = [PAUTA.topo * u];
    for (let j = 0; j < n; j++) for (const o of PAUTA.faixa) pautas.push(u * (110 + 170 * j + o));
    for (const o of PAUTA.baixo) pautas.push(u * (110 + 170 * n + o));
    P = 42.55 * u;
    app.style.setProperty("--pu", u + "px");
    app.style.setProperty("--P", P + "px");
    desenharPapel(W, H, u, n);
  }

  // ── o papel é montado aqui, peça por peça, no tamanho exato da página ──
  // (o border-image do CSS fica só de reserva: o Safari/iPhone arredonda as repetições de outro jeito
  //  e as linhas da coluna de fora saíam desalinhadas das do meio)
  const ARTE = { dir: { src: "assets/papel/papel-dir.jpg", cols: [130, 86, 210] },
                 esq: { src: "assets/papel/papel-esq.jpg", cols: [210, 86, 130] } };
  const ROWS = [110, 170, 233];
  let papelFeito = "", papelURLs = [];
  const carregar = src => new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = src; });
  const arteCarregada = Promise.all([carregar(ARTE.dir.src), carregar(ARTE.esq.src)]).catch(() => null);

  async function desenharPapel(W, H, u, n) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const chave = [W, H, u.toFixed(5), n, dpr].join("|");
    if (chave === papelFeito) return;
    papelFeito = chave;
    const imgs = await arteCarregada;
    if (!imgs || chave !== papelFeito) return;
    const urls = await Promise.all([ARTE.dir, ARTE.esq].map((arte, k) => {
      const img = imgs[k], c = document.createElement("canvas");
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
      const [cl, cm, cr] = arte.cols, sx = [0, cl, cl + cm, cl + cm + cr];
      const L = cl * u, R = cr * u, Mw = W - L - R, k2 = Math.max(1, Math.round(Mw / (cm * u))), tw = Mw / k2;
      // posições de destino: colunas (x) e linhas (y), em px da página
      const xs = [[0, L, 0]]; for (let i = 0; i < k2; i++) xs.push([L + i * tw, L + (i + 1) * tw, 1]); xs.push([W - R, W, 2]);
      const ys = [[0, ROWS[0] * u, 0]];
      for (let j = 0; j < n; j++) ys.push([u * (ROWS[0] + ROWS[1] * j), u * (ROWS[0] + ROWS[1] * (j + 1)), 1]);
      ys.push([H - ROWS[2] * u, H, 2]);
      const sy = [0, ROWS[0], ROWS[0] + ROWS[1], ROWS[0] + ROWS[1] + ROWS[2]];
      const px = v => Math.round(v * dpr);
      for (const [y0, y1, r] of ys) for (const [x0, x1, cIdx] of xs) {
        const dx = px(x0), dy = px(y0);
        // +1px de sobra para não sobrar fresta entre as peças
        g.drawImage(img, sx[cIdx], sy[r], sx[cIdx + 1] - sx[cIdx], sy[r + 1] - sy[r],
                    dx, dy, px(x1) - dx + 1, px(y1) - dy + 1);
      }
      return new Promise(ok => c.toBlob(b => ok(b ? URL.createObjectURL(b) : null), "image/jpeg", 0.92));
    }));
    if (chave !== papelFeito || urls.includes(null)) return;
    papelURLs.forEach(URL.revokeObjectURL); papelURLs = urls;
    app.style.setProperty("--papel-dir", `url("${urls[0]}")`);
    app.style.setProperty("--papel-esq", `url("${urls[1]}")`);
    app.classList.add("papel-pronto");
  }

  // posição de um elemento dentro da página, sem contar transformações (inclinação, virada 3D)
  function pos(el, page) {
    let x = 0, y = 0, e = el;
    while (e && e !== page) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }

  // algo invade a margem? (costura, linha vertical, corações) — inclui o canto das fotos inclinadas
  function invade(inner) {
    const page = inner.parentElement, cs = getComputedStyle(inner);
    const pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
    const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight);
    const W = inner.clientWidth, H = inner.clientHeight;
    const kids = [...inner.children].filter(k => k.offsetHeight > 0);
    if (!kids.length) return false;
    const top = Math.min(...kids.map(k => pos(k, page).y)), bot = Math.max(...kids.map(k => { const r = pos(k, page); return r.y + r.h; }));
    if (top < pt - 1 || bot > H - pb + 1) return true;
    for (const ph of inner.querySelectorAll(".photo")) {
      const r = pos(ph, page), t = Math.abs(parseFloat(ph.style.getPropertyValue("--tilt")) || 0) * Math.PI / 180;
      const ex = (r.w * Math.cos(t) + r.h * Math.sin(t) - r.w) / 2, ey = (r.w * Math.sin(t) + r.h * Math.cos(t) - r.h) / 2;
      if (r.x - ex < pl - 2 || r.x + r.w + ex > W - pr + 2 || r.y - ey < pt - 2 || r.y + r.h + ey > H - pb + 2) return true;
    }
    return false;
  }

  // encaixa a primeira linha de cada bloco de texto na pauta mais próxima;
  // as linhas seguintes já caem nas pautas porque a altura de linha é exatamente P
  function pautar(inner) {
    const page = inner.parentElement;
    if (!page.classList.contains("paper") || !P) return;
    for (const el of inner.querySelectorAll("h2, .note, .verses, .signature")) {
      el.style.translate = "";
      if (el.tagName === "H2") {        // título que quebra em duas linhas: cada linha numa pauta (2 pautas por linha)
        el.style.lineHeight = "";
        const lh = parseFloat(getComputedStyle(el).lineHeight);
        if (el.offsetHeight > lh * 1.5) el.style.lineHeight = Math.ceil(lh / P) * P + "px";
      }
      const alvo =el.classList.contains("verses") ? el.querySelector(".v") || el : el;
      let bl = alvo.querySelector(":scope > .bl");
      if (!bl) { bl = document.createElement("span"); bl.className = "bl"; bl.setAttribute("aria-hidden", "true"); alvo.prepend(bl); }
      const y = pos(bl, page).y + 0.07 * P;        // a letra fica apoiada logo acima da linha
      // pauta mais próxima, sem empurrar o bloco para dentro da margem de cima ou de baixo
      const r = pos(el, page), cs = getComputedStyle(inner);
      const min = parseFloat(cs.paddingTop) - r.y, max = inner.clientHeight - parseFloat(cs.paddingBottom) - (r.y + r.h);
      const opcoes = pautas.map(l => l - y).filter(d => Math.abs(d) < P * 1.05).sort((a, b) => Math.abs(a) - Math.abs(b));
      const best = opcoes.find(d => d >= min - 1 && d <= max + 1) ?? opcoes[0];
      if (best !== undefined) el.style.translate = `0 ${best.toFixed(2)}px`;
    }
  }

  // ── ajuste fino: se algum conteúdo não couber dentro das margens, encolhe só aquela página ──
  function fit() {
    papel();
    for (const inner of document.querySelectorAll(".page > .inner")) {
      let f = 1;
      inner.style.setProperty("--fit", f);
      while ((inner.scrollHeight > inner.clientHeight + 1 || invade(inner)) && f > 0.5) {
        f = +(f - 0.03).toFixed(2);
        inner.style.setProperty("--fit", f);
      }
      pautar(inner);
    }
  }

  // ── navegação: botões, teclado, gesto ──
  const inMedia = t => !!(t && t.closest && t.closest(".media"));

  btnPrev.addEventListener("click", () => go(-1));
  btnNext.addEventListener("click", () => go(1));
  coverFront.addEventListener("click", () => { if (turned === 0) go(1); });

  addEventListener("keydown", e => {
    if (e.altKey || e.ctrlKey || e.metaKey || inMedia(e.target)) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
  });

  let start = null;
  stage.addEventListener("pointerdown", e => {
    start = e.isPrimary && !inMedia(e.target) ? [e.clientX, e.clientY] : null;
  });
  stage.addEventListener("pointercancel", () => { start = null; });
  stage.addEventListener("pointerup", e => {
    if (!start) return;
    const dx = e.clientX - start[0], dy = e.clientY - start[1];
    start = null;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
  });

  // ── mídia: só aparece quando o arquivo existe ──
  const cfg = window.MIDIA || {};

  function exists(url, kind) {
    if (!url) return Promise.resolve(false);
    if (/^https?:$/.test(location.protocol)) {
      return fetch(url, { method: "HEAD", cache: "no-store" })
        .then(r => r.ok && !/text\/html/i.test(r.headers.get("content-type") || ""))
        .catch(() => false);
    }
    // aberto direto do arquivo (file://): pergunta ao próprio player
    return new Promise(done => {
      const m = document.createElement(kind);
      m.preload = "metadata";
      m.onloadedmetadata = () => done(true);
      m.onerror = () => done(false);
      m.src = url;
    });
  }

  const pauseOthers = me => document.querySelectorAll("audio,video").forEach(m => { if (m !== me) m.pause(); });

  function mountAudio(box, url) {
    const a = document.createElement("audio");
    a.preload = "metadata"; a.src = url;
    const b = document.createElement("button");
    b.type = "button"; b.className = "play";
    const ico = document.createElement("span"); ico.className = "ico";
    const lbl = document.createElement("span"); lbl.textContent = box.dataset.label;
    const bar = document.createElement("span"); bar.className = "bar";
    const fill = document.createElement("i"); bar.append(fill);
    b.append(ico, lbl, bar);
    const sync = () => { b.classList.toggle("playing", !a.paused); b.setAttribute("aria-pressed", String(!a.paused)); };
    b.addEventListener("click", () => {
      if (a.paused) { pauseOthers(a); a.play().catch(() => {}); } else a.pause();
    });
    a.addEventListener("play", sync); a.addEventListener("pause", sync);
    a.addEventListener("ended", () => { a.currentTime = 0; fill.style.width = "0"; sync(); });
    a.addEventListener("timeupdate", () => { if (a.duration) fill.style.width = (a.currentTime / a.duration * 100) + "%"; });
    a.addEventListener("error", () => { box.hidden = true; fit(); });
    box.replaceChildren(b, a);
    box.hidden = false;
  }

  function mountVideo(box, url) {
    const frame = document.createElement("div"); frame.className = "frame";
    const v = document.createElement("video");
    v.preload = "metadata"; v.playsInline = true; v.setAttribute("playsinline", ""); v.src = url;
    const b = document.createElement("button");
    b.type = "button"; b.className = "start";
    const ico = document.createElement("span"); ico.className = "ico";
    const lbl = document.createElement("span"); lbl.textContent = box.dataset.label;
    b.append(ico, lbl);
    v.addEventListener("loadedmetadata", () => {
      if (v.videoWidth && v.videoHeight) frame.style.setProperty("--var", v.videoWidth / v.videoHeight);
    });
    b.addEventListener("click", () => {  // o vídeo só começa quando ela tocar
      pauseOthers(v); b.hidden = true; v.controls = true; v.play().catch(() => {});
    });
    v.addEventListener("error", () => { box.hidden = true; });
    frame.append(v, b);
    box.replaceChildren(frame);
    box.hidden = false;
  }

  for (const box of document.querySelectorAll(".media[data-media]")) {
    const url = cfg[box.dataset.media];
    const video = box.classList.contains("video");
    exists(url, video ? "video" : "audio").then(ok => {
      if (!ok) return;
      (video ? mountVideo : mountAudio)(box, url);
      fit();
    });
  }

  // ── música de fundo com player no rodapé ──
  // cfg.musica pode ser um arquivo (assets/musica.mp4) ou um link do SoundCloud (toca pelo player oficial).
  // Quando um áudio ou o vídeo toca, a música fica bem baixinha no fundo e volta ao normal depois.
  // No iPhone o site não consegue mexer no volume, então lá ela pausa e volta sozinha.
  const VOL = 60, VOL_BAIXO = 7;   // volume normal e volume de fundo (0 a 100)
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let music = null, musicAuto = false, ducking = false;
  function startMusic() {
    if (!music || musicAuto) return;
    musicAuto = true;               // só começa sozinha uma vez; depois quem manda é ela
    music.play();
  }
  const setMeta = (t, a) => {
    document.getElementById('mt').textContent = t || 'Nossa música';
    document.getElementById('ma').textContent = a || '';
  };

  function fileMusic(url) {
    const m = new Audio();          // fora da página: virar a folha não pausa a música
    m.preload = 'auto'; m.loop = true; m.volume = VOL / 100; m.src = url;
    let held = false, ramp;
    const fade = to => {            // muda o volume aos poucos, sem tranco
      clearInterval(ramp);
      ramp = setInterval(() => {
        const d = to - m.volume;
        if (Math.abs(d) < 0.04) { m.volume = to; clearInterval(ramp); } else m.volume += Math.sign(d) * 0.04;
      }, 30);
    };
    const c = {
      get paused() { return m.paused; },
      play() { m.play().catch(() => {}); },
      pause() { m.pause(); },
      duck(on) {
        if (IOS) {
          if (on && !m.paused) { held = true; m.pause(); }
          else if (!on && held) { held = false; m.play().catch(() => {}); }
        } else fade((on ? VOL_BAIXO : VOL) / 100);
      }
    };
    const st = () => c.onstate && c.onstate();
    m.addEventListener('play', st); m.addEventListener('pause', st);
    m.addEventListener('timeupdate', () => { if (m.duration && c.onprogress) c.onprogress(m.currentTime / m.duration); });
    m.addEventListener('error', () => c.onfail && c.onfail());
    return c;
  }

  function soundcloudMusic(url) {
    return new Promise((done, fail) => {
      const s = document.createElement('script');
      s.src = 'https://w.soundcloud.com/player/api.js';
      s.onerror = fail;
      s.onload = () => {
        const panel = document.getElementById('scpanel');
        const f = document.createElement('iframe');
        f.title = 'Player do SoundCloud'; f.allow = 'autoplay'; f.height = 166;
        f.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) +
          '&auto_play=false&color=%23d64672&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false';
        panel.append(f);
        const w = window.SC.Widget(f), E = window.SC.Widget.Events;
        let paused = true, want = false, held = false, timer;
        const c = {
          get paused() { return paused; },
          play() {
            want = true; w.play();
            clearTimeout(timer);    // se o aparelho barrar o play remoto (iPhone), mostra o player oficial pra ela tocar nele
            timer = setTimeout(() => { if (paused && want) panel.classList.add('open'); }, 1800);
          },
          pause() { want = false; w.pause(); },
          duck(on) {
            if (IOS) {
              if (on && !paused) { held = true; w.pause(); }
              else if (!on && held) { held = false; w.play(); }
            } else w.setVolume(on ? VOL_BAIXO : VOL);
          },
          toggleOfficial() { panel.classList.toggle('open'); }
        };
        w.bind(E.PLAY, () => { paused = false; want = true; panel.classList.remove('open'); c.onstate && c.onstate(); });
        w.bind(E.PAUSE, () => { paused = true; c.onstate && c.onstate(); });
        w.bind(E.FINISH, () => { w.seekTo(0); w.play(); });
        w.bind(E.PLAY_PROGRESS, e => c.onprogress && c.onprogress(e.relativePosition || 0));
        w.bind(E.READY, () => {
          w.setVolume(VOL);
          if (!cfg.musicaTitulo) w.getCurrentSound(snd => { if (snd) setMeta(snd.title, snd.user && snd.user.username); });
          done(c);
        });
      };
      document.head.append(s);
    });
  }

  function wireMusic(c) {
    const box = document.getElementById('player'), pp = document.getElementById('pp'), fill = box.querySelector('.bar i');
    const others = () => [...document.querySelectorAll('audio,video')];
    c.onstate = () => {
      box.classList.toggle('playing', !c.paused);
      pp.setAttribute('aria-label', c.paused ? 'Tocar a música' : 'Pausar a música');
    };
    c.onprogress = p => { fill.style.width = (p * 100) + '%'; };
    c.onfail = () => { box.hidden = true; app.classList.remove('has-music'); music = null; };
    pp.addEventListener('click', () => {
      musicAuto = true;
      if (c.paused) c.play(); else c.pause();
    });
    if (c.toggleOfficial) {
      const meta = box.querySelector('.meta');
      meta.classList.add('tap'); meta.addEventListener('click', () => c.toggleOfficial());
      document.getElementById('scclose').addEventListener('click', () => c.toggleOfficial());
    }
    // áudio ou vídeo tocando: a música vai pro fundo; quando eles param, ela volta
    document.addEventListener('play', () => { if (!ducking) { ducking = true; c.duck(true); } }, true);
    const back = () => {
      if (!ducking || others().some(x => !x.paused)) return;
      ducking = false; c.duck(false);
    };
    document.addEventListener('pause', back, true);
    document.addEventListener('ended', back, true);
    music = c; box.hidden = false; app.classList.add('has-music'); c.onstate();
    window.__musica = c;   // só para conferência/teste
  }

  if (/^https:\/\/(on\.|m\.)?soundcloud\.com\//.test(cfg.musica || '')) {
    setMeta(cfg.musicaTitulo, cfg.musicaArtista);
    soundcloudMusic(cfg.musica).then(wireMusic).catch(() => {});   // sem internet: o player só não aparece
  } else {
    exists(cfg.musica, 'audio').then(ok => {
      if (!ok) return;
      setMeta(cfg.musicaTitulo, cfg.musicaArtista);
      wireMusic(fileMusic(cfg.musica));
    });
  }

  // ── início ──
  build();
  wide.addEventListener("change", build);
  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(fit, 120); });
  document.querySelectorAll("img").forEach(i => i.addEventListener("load", fit));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
