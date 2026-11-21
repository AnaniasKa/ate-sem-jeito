// Servidor do presente.
//   node server.js            -> rede de casa (iniciar.bat), porta 8123, serve a pasta toda
//   node server.js --publico  -> para a internet (publicar.bat), porta 8124, só no próprio PC:
//                                o túnel é quem leva para fora, e só os arquivos do caderno saem
// Suporta Range (necessário para vídeo/áudio no iPhone).
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");

const ROOT = __dirname;
const PUBLICO = process.argv.includes("--publico");
const PORT = Number(process.env.PORT) || (PUBLICO ? 8124 : 8123);
const HOST = PUBLICO ? "127.0.0.1" : "0.0.0.0";

// No modo público só saem as páginas e as mídias do caderno: nada de backup/, fonte-capa/,
// .zip, scripts de apoio ou a música de fundo (faixa de terceiros: use o link do SoundCloud no config.js).
const LIBERADO = /^\/(index\.html|style\.css|script\.js|config\.js|assets\/(papel\/)?[^/]+\.(jpe?g|png|webp|mp4))$/i;
const SEGURANCA = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; media-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' https://w.soundcloud.com; frame-src https://w.soundcloud.com; connect-src 'self'; base-uri 'none'; form-action 'none'"
};
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm"
};

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch { res.writeHead(400); return res.end(); }
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  const hidden = p.split("/").some(s => s.startsWith("."));
  if (!file.startsWith(ROOT + path.sep) || hidden || !["GET", "HEAD"].includes(req.method)) {
    res.writeHead(403); return res.end();
  }
  if (PUBLICO) {
    for (const [k, v] of Object.entries(SEGURANCA)) res.setHeader(k, v);
    if (!LIBERADO.test(p)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      return res.end("Não encontrado");
    }
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      return res.end("Não encontrado");
    }
    const head = {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
      "Last-Modified": st.mtime.toUTCString()
    };
    let start = 0, end = st.size - 1, code = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (m && st.size > 0 && (m[1] || m[2])) {
      if (m[1] === "") { start = Math.max(0, st.size - Number(m[2])); }
      else { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); }
      if (start > end || start >= st.size) {
        res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end();
      }
      code = 206;
      head["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
    }
    head["Content-Length"] = st.size === 0 ? 0 : end - start + 1;
    res.writeHead(code, head);
    if (req.method === "HEAD" || st.size === 0) return res.end();
    fs.createReadStream(file, { start, end }).on("error", () => res.destroy()).pipe(res);
  });
}).listen(PORT, HOST, () => {
  if (PUBLICO) {
    console.log(`\n  Até sem jeito — modo público (só os arquivos do caderno), em http://localhost:${PORT}/\n`);
    return;
  }
  console.log(`\n  Até sem jeito — servidor no ar\n\n  No PC:       http://localhost:${PORT}/`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const n of list || [])
      if (n.family === "IPv4" && !n.internal) console.log(`  No celular:  http://${n.address}:${PORT}/   (mesmo Wi-Fi)`);
  console.log("\n  Deixe esta janela aberta. Ctrl+C para encerrar.\n");
});
