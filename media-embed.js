// (06.11.2026) Dovezile din tichete (linkuri) arătate direct în pagină: player pentru
// YouTube, Streamable, Twitch, Vimeo, TikTok, Google Drive și fișiere video (.mp4/.webm/.mov),
// poză pentru imagini (.png/.jpg/.gif/.webp, Imgur). Orice alt link apare ca un card cu
// „Deschide ↗". Folosit de admin-tichete.html și tichet.html: MediaEmbed.html(url).
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const VIDEO = /\.(mp4|webm|mov|m4v)$/i, IMAGE = /\.(png|jpe?g|gif|webp|avif)$/i;
  const ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>',
  };
  function secs(t) {
    if (!t) return 0;
    if (/^\d+$/.test(t)) return +t;
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
    return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  }
  // ce fel de dovadă e linkul: { kind: 'iframe'|'video'|'image'|'link', src, tall }
  function parse(raw) {
    let u;
    try { u = new URL(String(raw || "").trim()); } catch { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.replace(/^www\.|^m\./, "").toLowerCase();
    const path = u.pathname;
    let m;
    if (host === "youtu.be" && (m = /^\/([\w-]{6,})/.exec(path)))
      return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0${secs(u.searchParams.get("t")) ? "&start=" + secs(u.searchParams.get("t")) : ""}`, label: "YouTube" };
    if (/(^|\.)youtube\.com$/.test(host)) {
      const id = u.searchParams.get("v") || ((m = /^\/(?:shorts|embed|live)\/([\w-]{6,})/.exec(path)) && m[1]);
      if (id) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0${secs(u.searchParams.get("t")) ? "&start=" + secs(u.searchParams.get("t")) : ""}`, label: "YouTube", tall: /^\/shorts\//.test(path) };
    }
    if (host === "streamable.com" && (m = /^\/(?:e\/|o\/)?([a-z0-9]{4,})/i.exec(path)))
      return { kind: "iframe", src: `https://streamable.com/e/${m[1]}`, label: "Streamable" };
    if ((host === "clips.twitch.tv" && (m = /^\/([\w-]+)/.exec(path))) || (/(^|\.)twitch\.tv$/.test(host) && (m = /\/clip\/([\w-]+)/.exec(path))))
      return { kind: "iframe", src: `https://clips.twitch.tv/embed?clip=${encodeURIComponent(m[1])}&parent=${encodeURIComponent(location.hostname)}`, label: "Twitch" };
    if (host === "vimeo.com" && (m = /^\/(\d+)/.exec(path)))
      return { kind: "iframe", src: `https://player.vimeo.com/video/${m[1]}`, label: "Vimeo" };
    if (/(^|\.)tiktok\.com$/.test(host) && (m = /\/video\/(\d+)/.exec(path)))
      return { kind: "iframe", src: `https://www.tiktok.com/embed/v2/${m[1]}`, label: "TikTok", tall: true };
    if (host === "drive.google.com" && (m = /\/file\/d\/([\w-]+)/.exec(path)))
      return { kind: "iframe", src: `https://drive.google.com/file/d/${m[1]}/preview`, label: "Google Drive" };
    if (host === "i.imgur.com" && /\.gifv$/i.test(path))
      return { kind: "video", src: `https://i.imgur.com${path.replace(/\.gifv$/i, ".mp4")}`, label: "Imgur" };
    if (host === "imgur.com" && (m = /^\/([a-z0-9]{5,8})$/i.exec(path)))
      return { kind: "image", src: `https://i.imgur.com/${m[1]}.jpg`, label: "Imgur", fallback: true };
    if (VIDEO.test(path)) return { kind: "video", src: u.href, label: host };
    if (IMAGE.test(path)) return { kind: "image", src: u.href, label: host };
    return { kind: "link", src: u.href, label: host };
  }
  function fileName(url) {
    try { const p = decodeURIComponent(new URL(url).pathname.split("/").pop() || ""); return p.length > 2 ? p : ""; } catch { return ""; }
  }
  // un card de dovadă; title = textul de sub player (ex. „Dovada tichetului", „Răspunsul lui X")
  function html(url, title) {
    const p = parse(url);
    if (!p) return "";
    const open = `<a class="me-open" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Deschide ↗</a>`;
    const foot = `<div class="me-foot"><span class="me-src">${p.kind === "link" ? ICON.link : ICON.play}<b>${esc(title || fileName(url) || p.label)}</b><small>${esc(p.label)}</small></span>${open}</div>`;
    let body;
    if (p.kind === "iframe") body = `<div class="me-frame${p.tall ? " tall" : ""}"><iframe src="${esc(p.src)}" title="${esc(p.label)}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    else if (p.kind === "video") body = `<div class="me-frame"><video src="${esc(p.src)}" controls preload="metadata" playsinline></video></div>`;
    else if (p.kind === "image") body = `<a class="me-frame me-img" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(p.src)}" alt="" loading="lazy" onerror="this.closest('.me-box').classList.add('me-broken')"></a>`;
    else body = `<a class="me-frame me-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${ICON.link}<span>${esc(p.label)}</span><small>${esc(url.length > 70 ? url.slice(0, 67) + "…" : url)}</small></a>`;
    return `<div class="me-box me-${p.kind}">${body}${foot}</div>`;
  }
  // stilul, o singură dată pe pagină
  const css = `.me-box{border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.09);background:#121418;min-width:0;display:flex;flex-direction:column}
.me-frame{position:relative;display:block;aspect-ratio:16/9;background:#07080a}
.me-frame.tall{aspect-ratio:9/14;max-height:620px}
.me-frame iframe,.me-frame video{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}
.me-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.me-broken .me-img{display:grid;place-items:center}.me-broken .me-img img{display:none}.me-broken .me-img::after{content:'Poza nu se poate încărca aici. Deschide linkul.';color:#8d939b;font-size:12px;padding:12px;text-align:center}
.me-link{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:16px;text-align:center;color:#d6d9dd;text-decoration:none;background:radial-gradient(circle at 50% 40%,rgba(255,138,31,.14),transparent 60%),#0c0d10}
.me-link svg{width:30px;height:30px;color:#ffa24a}.me-box .me-link span{display:block;font-weight:800;font-size:14px;white-space:normal}.me-link small{color:#8d939b;font-size:11px;word-break:break-all}
.me-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.07)}
.me-box .me-src{display:flex;white-space:normal;align-items:center;gap:8px;min-width:0}
.me-src svg{width:16px;height:16px;flex:none;color:#ffa24a;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.me-video .me-src svg,.me-iframe .me-src svg{fill:currentColor;stroke:none}
.me-src b{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.me-src small{color:#8d939b;font-size:11px;white-space:nowrap}
.me-open{flex:none;color:#ffa24a;font-weight:800;font-size:12px;text-decoration:none}
.me-open:hover{text-decoration:underline}`;
  if (!document.getElementById("me-css")) {
    const st = document.createElement("style"); st.id = "me-css"; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }
  window.MediaEmbed = { html, parse };
})();
