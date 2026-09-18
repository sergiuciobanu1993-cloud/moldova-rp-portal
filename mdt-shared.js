// Cod comun pentru toate paginile MDT FIB (mdt-fib, mdt-dosar, mdt-rapoarte,
// mdt-raport) — randare Markdown, listă de etichete/nume ("chips"), editor
// de descriere cu formatare + previzualizare, și secțiunea de rapoarte
// legate (căutare + leagă/dezleagă). Încărcat după auth-client.js (folosește
// apiFetch, definit acolo) și înainte de scriptul propriu al fiecărei pagini.
window.MDT = (function () {
  function escapeHtml(s) {
    return (s ?? '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Randare Markdown minimală, fără librărie externă — extinde dialectul deja
  // folosit la regulamente (regulament.html) cu link/imagine/cod inline, ca
  // să acopere și butoanele din toolbar-ul de mai jos. Textul e escapat
  // ÎNTÂI, deci descrierea unui dosar/raport/mandat nu poate injecta HTML.
  function inlineMd(s) {
    return s
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  }

  function mdToHtml(md) {
    const lines = escapeHtml(md).replace(/\r\n/g, '\n').split('\n');
    let html = '', inList = false, inOList = false, inQuote = false;
    const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
    const closeOList = () => { if (inOList) { html += '</ol>'; inOList = false; } };
    const closeQuote = () => { if (inQuote) { html += '</blockquote>'; inQuote = false; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (/^\s*$/.test(line)) { closeList(); closeOList(); closeQuote(); continue; }
      if (/^-{3,}$/.test(line.trim())) { closeList(); closeOList(); closeQuote(); html += '<hr>'; continue; }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        closeList(); closeOList(); closeQuote();
        const level = Math.min(h[1].length + 1, 6);
        html += `<h${level}>${inlineMd(h[2])}</h${level}>`;
        continue;
      }
      if (/^&gt;\s?/.test(line)) {
        if (!inQuote) { closeList(); closeOList(); html += '<blockquote>'; inQuote = true; }
        html += `<p>${inlineMd(line.replace(/^&gt;\s?/, ''))}</p>`;
        continue;
      }
      if (/^\d+\.\s+/.test(line)) {
        if (!inOList) { closeList(); closeQuote(); html += '<ol>'; inOList = true; }
        html += `<li>${inlineMd(line.replace(/^\d+\.\s+/, ''))}</li>`;
        continue;
      }
      if (/^[*-]\s+/.test(line)) {
        if (!inList) { closeOList(); closeQuote(); html += '<ul>'; inList = true; }
        html += `<li>${inlineMd(line.replace(/^[*-]\s+/, ''))}</li>`;
        continue;
      }
      closeList(); closeOList(); closeQuote();
      html += `<p>${inlineMd(line)}</p>`;
    }
    closeList(); closeOList(); closeQuote();
    return html;
  }

  // Șabloane precompletate la crearea unui dosar/mandat/raport nou — golite
  // de-adevăratelea abia când agentul le completează, dar dau structura din
  // prima, ca un formular oficial pe hârtie.
  const TEMPLATES = {
    dosar:
`**Data deschiderii:**
**Depus de:** (Nume și rang)

**Detalii incident:**


**Probe cheie:**


**Progresul anchetei:**


**Note suplimentare:**
`,
    mandat:
`**Data emiterii:**
**Solicitat de:** (Nume și rang)

**Motiv:**


**Locație / țintă:**


**Detalii executare:**


**Note suplimentare:**
`,
    raport:
`**Data:**
**Raportat de:** (Nume și rang)

**Detalii incident:**


**Probe colectate:**


**Acțiuni întreprinse:**


**Note suplimentare:**
`,
  };

  // Listă liberă de text-uri scurte ("chips") — etichete, polițiști/civili/
  // suspecți implicați, vehicule, arme. containerEl e golit și populat cu
  // markup-ul complet; întoarce { getValues() }.
  function createChipInput(containerEl, initialValues, placeholder) {
    const values = Array.isArray(initialValues) ? initialValues.slice() : [];
    containerEl.innerHTML = `
      <div class="chip-list"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input type="text" class="filter-select chip-input-field" style="flex:1" placeholder="${escapeHtml(placeholder || 'scrie și apasă Enter')}">
        <button type="button" class="btn-ghost chip-add-btn" style="padding:8px 14px;font-size:12px">+ Adaugă</button>
      </div>`;
    const listEl = containerEl.querySelector('.chip-list');
    const inputEl = containerEl.querySelector('.chip-input-field');
    const addBtn = containerEl.querySelector('.chip-add-btn');

    function render() {
      listEl.innerHTML = values.length
        ? values.map((v, i) => `<span class="chip-item">${escapeHtml(v)}<button type="button" data-chip-remove="${i}" aria-label="Șterge">✕</button></span>`).join('')
        : '<span class="muted" style="font-size:12px">nimic adăugat</span>';
      listEl.querySelectorAll('[data-chip-remove]').forEach(btn => {
        btn.addEventListener('click', () => { values.splice(Number(btn.dataset.chipRemove), 1); render(); });
      });
    }
    function addFromInput() {
      const v = inputEl.value.trim();
      if (v) { values.push(v); inputEl.value = ''; render(); }
    }
    addBtn.addEventListener('click', addFromInput);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addFromInput(); }
    });
    render();
    return { getValues: () => values.slice() };
  }

  // Editor de text cu formatare Markdown (bold/italic/titlu/citat/liste/
  // link/cod) + previzualizare — un textarea simplu cu o bară de butoane
  // care înfășoară selecția curentă în sintaxa potrivită, plus un buton de
  // ochi care comută la randarea prin mdToHtml de mai sus.
  function createMarkdownEditor(containerEl, initialValue) {
    containerEl.innerHTML = `
      <div class="md-toolbar">
        <button type="button" data-md="bold" title="Bold (**text**)"><b>B</b></button>
        <button type="button" data-md="italic" title="Italic (*text*)"><i>I</i></button>
        <button type="button" data-md="h" title="Titlu (#)">H</button>
        <button type="button" data-md="quote" title="Citat (&gt;)">&rdquo;</button>
        <button type="button" data-md="ul" title="Listă (-)">•</button>
        <button type="button" data-md="ol" title="Listă numerotată (1.)">1.</button>
        <button type="button" data-md="link" title="Link">🔗</button>
        <button type="button" data-md="code" title="Cod">&lt;/&gt;</button>
        <button type="button" data-md="preview" title="Previzualizare" class="md-preview-btn" style="margin-left:auto">👁</button>
      </div>
      <textarea class="md-textarea">${escapeHtml(initialValue || '')}</textarea>
      <div class="md-preview" hidden></div>`;
    const textarea = containerEl.querySelector('.md-textarea');
    const preview = containerEl.querySelector('.md-preview');
    const toolbar = containerEl.querySelector('.md-toolbar');
    const previewBtn = containerEl.querySelector('.md-preview-btn');

    function wrap(before, after) {
      after = after === undefined ? before : after;
      const start = textarea.selectionStart, end = textarea.selectionEnd;
      const value = textarea.value;
      const selected = value.slice(start, end) || 'text';
      textarea.value = value.slice(0, start) + before + selected + after + value.slice(end);
      textarea.focus();
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = start + before.length + selected.length;
    }
    function linePrefix(prefix) {
      const start = textarea.selectionStart;
      const value = textarea.value;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      textarea.value = value.slice(0, lineStart) + prefix + value.slice(lineStart);
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + prefix.length;
    }
    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-md]');
      if (!btn) return;
      switch (btn.dataset.md) {
        case 'bold': wrap('**'); break;
        case 'italic': wrap('*'); break;
        case 'h': linePrefix('# '); break;
        case 'quote': linePrefix('> '); break;
        case 'ul': linePrefix('- '); break;
        case 'ol': linePrefix('1. '); break;
        case 'link': wrap('[', '](https://)'); break;
        case 'code': wrap('`'); break;
        case 'preview': {
          const goingToPreview = textarea.hidden === false;
          textarea.hidden = goingToPreview;
          preview.hidden = !goingToPreview;
          if (goingToPreview) preview.innerHTML = mdToHtml(textarea.value) || '<p class="muted">Fără conținut.</p>';
          previewBtn.classList.toggle('active', goingToPreview);
          break;
        }
      }
    });
    return {
      getValue: () => textarea.value,
      setValue: (v) => { textarea.value = v; },
    };
  }

  // Un link extern de probă poate fi o poză SAU un video (YouTube,
  // Streamable, un fișier .mp4 direct de pe Discord CDN etc.) — proiectul nu
  // are storage separat pentru fișiere video mari, deci uploadul rămâne doar
  // pentru poze (vezi MDT_ALLOWED_MIME în server.js), iar pentru video mizăm
  // pe linkuri externe cu un mic preview încorporat, ca să nu fie doar un
  // link sec de deschis într-un tab nou. Întoarce null dacă linkul nu se
  // potrivește cu niciun tipar cunoscut — atunci rămâne doar link-ul simplu.
  function mediaEmbedHtml(url) {
    if (!url) return null;
    const box = 'style="width:100%;max-width:420px;aspect-ratio:16/9;border:0;border-radius:8px;margin-top:10px;display:block"';
    let m;
    if ((m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/i))) {
      return `<iframe src="https://www.youtube.com/embed/${m[1]}" ${box} allowfullscreen loading="lazy"></iframe>`;
    }
    if ((m = url.match(/streamable\.com\/(?!e\/)([a-z0-9]+)/i))) {
      return `<iframe src="https://streamable.com/e/${m[1]}" ${box} allowfullscreen loading="lazy"></iframe>`;
    }
    if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url)) {
      return `<video controls preload="metadata" style="width:100%;max-width:420px;border-radius:8px;margin-top:10px;display:block" src="${escapeHtml(url)}"></video>`;
    }
    if (/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(url)) {
      return `<img src="${escapeHtml(url)}" alt="" style="max-width:100%;width:260px;border-radius:8px;border:1px solid var(--line);margin-top:10px;display:block">`;
    }
    return null;
  }

  function reportLinkBaseUrl(kind, parentId) {
    return kind === 'dosar' ? `/api/mdt/dosare/${parentId}/rapoarte` : `/api/mdt/mandate/${parentId}/rapoarte`;
  }
  function raportNumber(r) {
    if (!r.seq) return '';
    const year = new Date(r.created_at || Date.now()).getFullYear();
    return `RAP-${year}-${String(r.seq).padStart(4, '0')}`;
  }

  // Secțiunea "Rapoarte legate" a unui dosar sau mandat: listă de rapoarte
  // deja legate (cu buton de dezlegare) + o căutare live peste rapoartele
  // existente ca să legi unul nou, fără să navighezi în altă parte.
  // kind: 'dosar' | 'mandat'. initialItems: rapoartele deja legate (din
  // răspunsul GET /api/mdt/dosare/:id).
  function createReportLinker(containerEl, kind, parentId, initialItems) {
    let items = (initialItems || []).slice();
    let searchTimer = null;

    containerEl.innerHTML = `
      <div class="linked-reports-list"></div>
      <div style="position:relative;margin-top:8px">
        <input type="text" class="filter-select report-search-input" style="width:100%" placeholder="Caută un raport existent după titlu, ca să-l legi aici...">
        <div class="report-search-dropdown" hidden></div>
      </div>`;
    const listEl = containerEl.querySelector('.linked-reports-list');
    const searchInput = containerEl.querySelector('.report-search-input');
    const dropdown = containerEl.querySelector('.report-search-dropdown');

    function render() {
      listEl.innerHTML = items.length
        ? items.map(r => `
          <div class="linked-item">
            <a href="mdt-raport.html?id=${r.id}">${raportNumber(r) ? `<span class="case-no">${raportNumber(r)}</span> ` : ''}${escapeHtml(r.title)}</a>
            <button type="button" class="icon-btn" data-unlink="${r.id}" aria-label="Dezleagă">✕</button>
          </div>`).join('')
        : '<p class="muted" style="font-size:12px;margin:0">Niciun raport legat încă.</p>';
      listEl.querySelectorAll('[data-unlink]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const raportId = btn.dataset.unlink;
          try {
            const res = await apiFetch(`${reportLinkBaseUrl(kind, parentId)}/${raportId}`, { method: 'DELETE' });
            if (!res.ok && res.status !== 204) throw new Error();
            items = items.filter(r => r.id !== raportId);
            render();
          } catch { alert('Nu am putut dezlega raportul.'); }
        });
      });
    }
    render();

    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = searchInput.value.trim();
      if (!q) { dropdown.hidden = true; return; }
      searchTimer = setTimeout(async () => {
        try {
          const res = await apiFetch(`/api/mdt/rapoarte?q=${encodeURIComponent(q)}`);
          if (!res.ok) return;
          const all = await res.json();
          const results = all.filter(r => !items.some(i => i.id === r.id)).slice(0, 8);
          dropdown.innerHTML = results.length
            ? results.map(r => `<button type="button" class="report-search-item" data-pick="${r.id}">${escapeHtml(raportNumber(r))} — ${escapeHtml(r.title)}</button>`).join('')
            : '<div class="report-search-item muted">Niciun rezultat.</div>';
          dropdown.hidden = false;
          dropdown.querySelectorAll('[data-pick]').forEach(btn => {
            btn.addEventListener('click', async () => {
              const raportId = btn.dataset.pick;
              const picked = results.find(r => r.id === raportId);
              try {
                const res2 = await apiFetch(reportLinkBaseUrl(kind, parentId), { method: 'POST', body: JSON.stringify({ raport_id: raportId }) });
                if (!res2.ok) throw new Error();
                items.push(picked);
                render();
              } catch { alert('Nu am putut lega raportul.'); }
              searchInput.value = '';
              dropdown.hidden = true;
            });
          });
        } catch {}
      }, 250);
    });
    document.addEventListener('click', (e) => {
      if (!containerEl.contains(e.target)) dropdown.hidden = true;
    });

    return { getItems: () => items.slice() };
  }

  // Export/printare: deschide o fereastră nouă, complet separată de tema
  // închisă a site-ului (fundal alb, tipar de citit pe hârtie), scrie acolo
  // documentul deja formatat și declanșează dialogul de printare al
  // browserului — de acolo utilizatorul alege "Salvează ca PDF". Nu ținem
  // fișiere generate pe server (proiectul n-are storage separat pe Railway),
  // deci PDF-ul e mereu creat client-side, la cerere.
  function printDocument(title, bodyHtml) {
    const win = window.open('', '_blank');
    if (!win) {
      alert('Browserul a blocat fereastra de printare — permite pop-up-urile pentru acest site și încearcă din nou.');
      return;
    }
    win.document.write(`<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Georgia,'Times New Roman',serif;color:#181818;max-width:760px;margin:36px auto;padding:0 24px 60px;line-height:1.65;font-size:14px}
  h1{font-size:22px;margin:0 0 10px;font-family:Arial,Helvetica,sans-serif}
  h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.07em;color:#555;margin:26px 0 10px;border-top:1px solid #ddd;padding-top:16px;font-family:Arial,Helvetica,sans-serif}
  .meta{color:#555;font-size:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #ddd}
  .chip{display:inline-block;border:1px solid #999;border-radius:999px;padding:3px 11px;font-size:11px;margin:2px 5px 2px 0;font-family:Arial,Helvetica,sans-serif}
  .tag{display:inline-block;border:1px solid #999;border-radius:5px;padding:2px 8px;font-size:10px;font-weight:700;margin-left:8px;vertical-align:middle;font-family:Arial,Helvetica,sans-serif}
  .small{color:#777;font-size:11px;margin:2px 0 8px}
  .mandat,.proba{border:1px solid #ddd;border-radius:8px;padding:14px 16px;margin-bottom:12px;break-inside:avoid}
  blockquote{border-left:3px solid #999;margin:0;padding:2px 14px;color:#444}
  code{background:#f2f2f2;padding:1px 5px;border-radius:4px;font-size:.92em}
  img{max-width:100%;border-radius:6px;display:block;margin:10px 0}
  a{color:#8a4b00}
  ul,ol{padding-left:22px}
  em{color:#777}
  @media print{body{margin:0;padding:18px 22px}}
</style></head>
<body>${bodyHtml}
<script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script>
</body></html>`);
    win.document.close();
  }

  return { escapeHtml, mdToHtml, TEMPLATES, createChipInput, createMarkdownEditor, createReportLinker, raportNumber, mediaEmbedHtml, printDocument };
})();
