/**
 * build-stock-contact-sheet.mjs
 *
 * Reads app/public/library/metadata.json and emits a static contact-sheet
 * HTML (app/public/library/stock-contact-sheet.html) showing every Pexels
 * stock image just seeded, grouped by [category], with credit + a per-image
 * "cut" checkbox + a "copy cut list" button so it can be curated by eye and
 * hand back the ids to drop. Open the file directly from disk (file://) —
 * image paths are relative, no dev server needed.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIBRARY_DIR = path.resolve(__dirname, '..', 'public', 'library');
const META = path.join(LIBRARY_DIR, 'metadata.json');
const OUT = path.join(LIBRARY_DIR, 'stock-contact-sheet.html');

const raw = JSON.parse(await fs.readFile(META, 'utf-8'));
// Curated additions = Pexels stock + AI-generated 3D glass renders.
const stock = raw.images.filter((i) => /\[stock:pexels#|\[glass-gen:/.test(i.prompt || ''));

// Group by leading [category] tag.
const groups = new Map();
for (const img of stock) {
  const m = (img.prompt || '').match(/^\[([a-z0-9-]+)\]/);
  const cat = m ? m[1] : 'other';
  if (!groups.has(cat)) groups.set(cat, []);
  groups.get(cat).push(img);
}

const credit = (p) => {
  const m = (p || '').match(/Photo by (.+?) on Pexels/);
  return m ? m[1] : '';
};

let body = '';
for (const [cat, imgs] of groups) {
  body += `<h2>${cat} <span class="n">${imgs.length}</span></h2><div class="grid">`;
  for (const img of imgs) {
    body += `<figure data-id="${img.id}">
      <label><input type="checkbox" class="cut" value="${img.id}"> cut</label>
      <img loading="lazy" src="images/${img.filename}" alt="">
      <figcaption>${credit(img.prompt)}</figcaption>
    </figure>`;
  }
  body += `</div>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Compose stock library — contact sheet (${stock.length})</title>
<style>
  body{font:14px/1.4 system-ui,sans-serif;margin:0;background:#f7f6fb;color:#1e293b}
  header{position:sticky;top:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:14px 24px;z-index:5;display:flex;gap:16px;align-items:center}
  header h1{font-size:16px;margin:0}
  button{font:inherit;padding:8px 14px;border-radius:10px;border:0;background:linear-gradient(90deg,#E267E4,#9FC7FE,#4198FF);color:#2e1065;font-weight:600;cursor:pointer}
  main{padding:8px 24px 64px}
  h2{margin:28px 0 10px;font-size:15px;text-transform:capitalize}
  h2 .n{color:#94a3b8;font-weight:400;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
  figure{margin:0;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;position:relative}
  figure img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
  figcaption{font-size:11px;color:#64748b;padding:6px 10px}
  label{position:absolute;top:8px;left:8px;background:rgba(255,255,255,.92);border-radius:8px;padding:3px 8px;font-size:11px;cursor:pointer}
  figure:has(.cut:checked){outline:3px solid #ef4444;opacity:.5}
  #out{position:fixed;bottom:0;left:0;right:0;background:#1e293b;color:#fff;font-family:monospace;font-size:12px;padding:10px 24px;max-height:120px;overflow:auto;display:none;white-space:pre-wrap}
</style></head><body>
<header>
  <h1>Compose stock library — ${stock.length} new images</h1>
  <button onclick="copyCuts()">Copy cut list</button>
  <span id="status" style="color:#64748b"></span>
</header>
<main>${body}</main>
<pre id="out"></pre>
<script>
function copyCuts(){
  const ids=[...document.querySelectorAll('.cut:checked')].map(c=>c.value);
  const out=document.getElementById('out');
  out.style.display='block';
  out.textContent=ids.length?ids.join('\\n'):'(no images marked cut)';
  if(ids.length)navigator.clipboard?.writeText(ids.join('\\n'));
  document.getElementById('status').textContent=ids.length+' marked cut'+(ids.length?' — copied':'');
}
</script>
</body></html>`;

await fs.writeFile(OUT, html, 'utf-8');
console.log(`Wrote ${OUT}`);
console.log(`${stock.length} stock images across ${groups.size} categories.`);
