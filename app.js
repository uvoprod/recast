/* Recast page logic: the converter bed, the format matrix, and the hooks into the hero scene.
   Conversion itself lives in engine.js; nothing here pretends to work that the engine didn't do. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const Stage = window.Stage || {setFormats() {}, pulse() {}, state() {}, onLabel() {}};
  const bed = $('bed');
  const R = {items: [], target: null, busy: false, uid: 0};
  const describeFmt = f => f === 'image' ? 'Image' : ({image: `${F[f].l} image`, heic: 'HEIC photo', tiff: 'TIFF image', pdf: 'PDF document', docx: 'Word document',
    odt: 'OpenDocument text', pptx: 'PowerPoint deck', html: 'Web page', md: 'Markdown file', txt: 'Text file', sheet: `${F[f].l} spreadsheet`, epub: 'EPUB ebook'})[F[f].k];

  /* ---------------------------------------------------------- hero labels follow the sheet in the gate */
  const extIn = $('ext-in'), extOut = $('ext-out');
  function swapLabel(el, text) {
    if (el.textContent === text) return;
    if (reduce) { el.textContent = text; return; }
    el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap');
    setTimeout(() => { el.textContent = text; }, 280); // swap at the midpoint of the wipe
  }
  Stage.onLabel((a, b) => { swapLabel(extIn, '.' + a.toUpperCase()); swapLabel(extOut, '.' + b.toUpperCase()); });

  /* ---------------------------------------------------------- state */
  const ready = () => R.items.filter(i => i.fmt);
  function bedState() {
    if (!R.items.length) return 'empty';
    if (R.busy) return 'working';
    return R.items.some(i => i.status === 'done' || i.status === 'error') ? 'done' : 'ready';
  }
  function transition(fn) {
    if (document.startViewTransition && !reduce) document.startViewTransition(fn); else fn();
  }
  function syncStage() {
    const r = ready();
    Stage.setFormats(r.length && R.target ? r[0].fmt : null, r.length && R.target ? R.target : null);
  }

  /* ---------------------------------------------------------- adding files */
  function addFiles(list) {
    const files = [...list];
    if (!files.length) return;
    const wasEmpty = !R.items.length;
    for (const file of files) {
        const ext = (file.name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
        const fmt = EXT[ext] && F[EXT[ext]].k ? EXT[ext] : (file.type.startsWith('image/') ? 'image' : null);
        const it = {id: ++R.uid, file, name: file.name, stem: file.name.replace(/\.[^.]+$/, '') || 'file', fmt, status: fmt ? 'ready' : 'error'};
        it.el = fileRow(it);
        R.items.push(it);
        if (!fmt) note(it, ext ? `.${ext} files can't be converted here.` : "This file type isn't supported.", 'err');
        else describe(it);
    }
    wasEmpty ? transition(render) : render(); // state is already updated; only the redraw is animated
  }
  function fileRow(it) {
    const li = document.createElement('li');
    li.className = 'file';
    li.innerHTML = '<span class="chipx"></span><div class="fmeta"><div class="fname"></div><div class="fsub"></div><div class="bar"><i></i></div></div><button class="rm" type="button">\u00d7</button>';
    li.querySelector('.chipx').textContent = it.fmt ? (it.fmt === 'image' ? 'img' : it.fmt) : '?';
    li.querySelector('.fname').textContent = it.name;
    li.querySelector('.fname').title = it.name;
    const rm = li.querySelector('.rm');
    rm.setAttribute('aria-label', 'Remove ' + it.name);
    rm.onclick = () => {
      if (R.busy) return;
      R.items = R.items.filter(x => x !== it);
      li.remove(); it.out?.remove();
      R.items.length ? render() : transition(render);
    };
    $('files').append(li);
    return li;
  }
  function describe(it) {
    it.meta = `${describeFmt(it.fmt)} \u00b7 ${size(it.file.size)}`;
    note(it, it.meta);
    if (['png', 'jpg', 'webp', 'gif', 'bmp', 'avif', 'image'].includes(it.fmt))
      createImageBitmap(it.file).then(b => { it.meta += ` \u00b7 ${b.width} \u00d7 ${b.height}`; b.close(); if (it.status === 'ready') note(it, it.meta); }).catch(() => {});
  }
  function note(it, text, cls = '', frac) {
    const s = it.el.querySelector('.fsub');
    s.textContent = '';
    const span = document.createElement('span');
    if (cls) span.className = 'st-' + cls;
    span.textContent = text;
    s.append(span);
    const bar = it.el.querySelector('.bar');
    it.el.classList.toggle('working', it.status === 'working');
    bar.classList.toggle('indef', frac == null);
    bar.querySelector('i').style.width = frac == null ? '' : Math.round(frac * 100) + '%';
  }

  /* ---------------------------------------------------------- the format picker */
  function common() {
    const r = ready();
    if (!r.length) return [];
    let s = new Set(targetsOf(r[0].fmt));
    for (const it of r.slice(1)) s = new Set(targetsOf(it.fmt).filter(t => s.has(t)));
    if (r.length > 1 && r.every(i => i.fmt === 'pdf' || targetsOf(i.fmt).includes('pdf'))) s.add('pdf');
    return [...s];
  }
  function matches(key, q) {
    if (!q) return true;
    const f = F[key], hay = [key, ...(f.x || '').split(' '), f.l.toLowerCase(), ...(f.kw || '').split(' ')].join(' ');
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w.replace(/^\./, '')));
  }
  function renderPicker() {
    const avail = common(), q = $('q').value.trim(), g = $('grid');
    if (R.target && !avail.includes(R.target)) R.target = null;
    g.innerHTML = '';
    for (const cat of CATS) {
      const keys = Object.keys(F).filter(k => F[k].c === cat && avail.includes(k) && matches(k, q));
      if (!keys.length) continue;
      const d = document.createElement('div');
      d.className = 'cat';
      d.innerHTML = '<h4></h4><div class="chips"></div>';
      d.firstChild.textContent = cat;
      for (const k of keys) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'chip';
        b.setAttribute('aria-pressed', k === R.target);
        b.innerHTML = '<code></code><span></span>';
        b.firstChild.textContent = k;
        b.lastChild.textContent = F[k].l.toUpperCase() === k.toUpperCase() ? '' : F[k].l;
        b.onclick = () => { R.target = k; render(); syncStage(); };
        d.lastChild.append(b);
      }
      g.append(d);
    }
    if (!g.children.length) {
      const p = document.createElement('p');
      p.className = 'none';
      p.textContent = avail.length ? `Nothing matches \u201c${q}\u201d. Try an extension like pdf or a word like photo.`
        : "These files don't share an output format. Remove some, or convert them in separate batches.";
      g.append(p);
    }
  }

  /* ---------------------------------------------------------- render */
  function render() {
    const r = ready(), st = bedState(), t = R.target, img = IMG_OUT.includes(t), fm = r.map(i => F[i.fmt].k);
    bed.dataset.state = st;
    $('in-count').textContent = R.items.length ? `${R.items.length} file${R.items.length > 1 ? 's' : ''} \u00b7 ${size(R.items.reduce((a, i) => a + i.file.size, 0))}` : 'No files yet';
    renderPicker();
    const show = {
      quality: t === 'jpg' || t === 'webp',
      max: img || (t === 'pdf' && fm.some(k => IMG_KINDS.includes(k))),
      dpi: img && fm.some(k => !IMG_KINDS.includes(k)),
      merge: t === 'pdf' && r.length > 1,
    };
    document.querySelectorAll('[data-o]').forEach(l => { l.hidden = !show[l.dataset.o]; });
    $('opts').hidden = !Object.values(show).some(Boolean);
    const go = $('go'), n = r.length;
    go.disabled = !t || R.busy || !n;
    go.textContent = R.busy ? 'Converting\u2026' : !n ? 'Add a file you can convert' : !t ? 'Choose a format'
      : show.merge && $('merge').checked ? `Combine ${n} files into one PDF` : `Convert ${n} file${n > 1 ? 's' : ''} to ${F[t].l}`;
    const outs = R.items.filter(i => i.outs).length + (R.merged ? 1 : 0);
    $('out-count').textContent = st === 'empty' ? 'Waiting for files' : outs ? `${outs} ready to save` : t ? `\u2192 .${t}` : 'Pick a format';
    $('after').hidden = !(st === 'done');
    $('saveall').hidden = R.items.filter(i => i.outs).length < 2;
    R.items.forEach(i => { i.el.querySelector('.rm').disabled = R.busy; });
  }

  /* ---------------------------------------------------------- converting */
  function progressBar(done, total, frac) {
    const p = total ? (done + (frac || 0)) / total : 0;
    const seam = $('seam');
    if (matchMedia('(max-width: 860px)').matches) { seam.style.width = p * 100 + '%'; seam.style.height = ''; }
    else { seam.style.height = p * 100 + '%'; seam.style.width = ''; }
  }
  function resultRow(it, name, file, sub) {
    it.out?.remove();
    const li = document.createElement('li');
    li.className = 'result';
    li.innerHTML = '<span class="chipx"></span><div class="fmeta"><div class="fname"></div><div class="fsub"></div></div><button class="btn" type="button">Save</button>';
    li.querySelector('.chipx').textContent = name.split('.').pop();
    li.querySelector('.fname').textContent = name;
    li.querySelector('.fname').title = name;
    li.querySelector('.fsub').textContent = sub;
    const b = li.querySelector('.btn');
    b.setAttribute('aria-label', 'Save ' + name);
    b.onclick = () => save(b, file, li);
    $('results').append(li);
    return li;
  }
  function failRow(it, msg) {
    it.out?.remove();
    const li = document.createElement('li');
    li.className = 'result failed';
    li.innerHTML = '<span class="chipx">!</span><div class="fmeta"><div class="fname"></div><div class="fsub"><span class="st-err"></span></div></div><button class="btn" type="button">Retry</button>';
    li.querySelector('.fname').textContent = it.name;
    li.querySelector('.st-err').textContent = msg;
    const b = li.querySelector('.btn');
    b.setAttribute('aria-label', 'Retry ' + it.name);
    b.onclick = () => { if (!R.busy && R.target) run([it]); };
    $('results').append(li);
    return li;
  }
  async function save(btn, file, li) {
    btn.disabled = true;
    try {
      const f = typeof file === 'function' ? await file() : file;
      if (await saveFile(f.name, f.blob)) { btn.textContent = 'Saved'; btn.classList.add('saved'); }
    } catch (e) {
      const s = li.querySelector('.fsub');
      if (s) { s.innerHTML = '<span class="st-err"></span>'; s.firstChild.textContent = e.message; }
      else $('overall').textContent = e.message;
    }
    btn.disabled = false;
  }
  async function run(list) {
    const to = R.target;
    const o = {quality: +$('quality').value, dpi: +$('dpi').value, max: +$('max').value || 0};
    R.busy = true;
    R.merged = null;
    list.forEach(it => { it.status = 'queued'; it.outs = null; it.out?.remove(); it.out = null; note(it, 'Waiting'); });
    if (list.length === R.items.filter(i => i.fmt).length) { $('results').innerHTML = ''; $('combined')?.remove(); }
    render();
    Stage.state('working');
    const total = list.length;
    let done = 0, failed = 0;
    progressBar(0, total);

    if (to === 'pdf' && list.length > 1 && $('merge').checked) {
      try {
        const blob = await mergeAll(list, o, (it, msg, frac) => {
          list.forEach(x => { if (x !== it && x.status === 'working') { x.status = 'done'; note(x, 'Added', 'ok'); } });
          it.status = 'working'; note(it, msg); progressBar(0, 1, frac); $('overall').textContent = msg; Stage.pulse();
        });
        list.forEach(it => { it.status = 'done'; note(it, 'Added to Combined.pdf', 'ok'); });
        R.merged = {name: 'Combined.pdf', blob};
        const li = resultRow({}, R.merged.name, R.merged, `${size(blob.size)} \u00b7 ${list.length} files combined`);
        li.id = 'combined';
        done = total;
      } catch (e) {
        failed = total;
        list.forEach(it => { it.status = 'error'; note(it, e.message, 'err'); });
        $('overall').textContent = e.message;
      }
    } else {
      for (const it of list) {
        it.status = 'working';
        note(it, 'Converting\u2026');
        $('overall').textContent = `Converting ${done + failed + 1} of ${total}`;
        try {
          const {outs, notes} = await convert(it, to, o, (msg, frac) => {
            note(it, msg, '', frac);
            progressBar(done + failed, total, frac);
            Stage.pulse();
          });
          it.outs = outs; it.to = to; it.status = 'done';
          const bytes = outs.reduce((a, f) => a + f.blob.size, 0);
          note(it, `Done \u00b7 ${outs.length > 1 ? outs.length + ' files' : outs[0].name}`, 'ok');
          const single = outs.length === 1 && SAVEABLE.has(outs[0].name.split('.').pop());
          const label = single ? outs[0] : {name: `${it.stem} (${to.toUpperCase()}).zip`};
          const sub = `${size(bytes)}${outs.length > 1 ? ` \u00b7 ${outs.length} ${IMG_OUT.includes(to) ? 'pages' : 'files'}, saved as one .zip` : !single ? ' \u00b7 saved inside a .zip' : ''}${notes.length ? ' \u00b7 ' + notes.join('; ') : ''}`;
          it.out = resultRow(it, label.name, single ? outs[0] : async () => ({name: label.name, blob: await zipOf(outs)}), sub);
          done++;
        } catch (e) {
          console.error(e);
          it.status = 'error';
          note(it, 'Failed', 'err');
          it.out = failRow(it, e.message || 'Conversion failed.');
          failed++;
        }
        progressBar(done + failed, total);
        Stage.pulse();
        await tick();
      }
    }
    R.busy = false;
    $('overall').textContent = failed ? `${done} converted, ${failed} failed` : `${done === 1 && !R.merged ? '1 file' : R.merged ? 'Combined PDF' : done + ' files'} ready to save`;
    Stage.state(failed ? 'error' : 'done');
    render();
    $('results').querySelector('.btn')?.focus({preventScroll: true});
  }

  /* ---------------------------------------------------------- wiring */
  const drop = $('drop'), pick = $('pick');
  drop.onclick = () => pick.click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick.click(); } };
  pick.onchange = () => { addFiles(pick.files); pick.value = ''; };
  let depth = 0;
  document.addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); depth++; drop.classList.add('over'); } });
  document.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove('over'); });
  document.addEventListener('drop', e => {
    e.preventDefault(); depth = 0; drop.classList.remove('over');
    if (e.dataTransfer?.files.length) { addFiles(e.dataTransfer.files); $('convert').scrollIntoView({behavior: reduce ? 'auto' : 'smooth', block: 'start'}); }
  });
  $('q').oninput = renderPicker;
  $('q').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); document.querySelector('#grid .chip')?.click(); } };
  $('quality').oninput = e => { $('qv').textContent = e.target.value; };
  $('merge').onchange = render;
  $('go').onclick = () => { if (!R.busy && R.target) run(ready()); };
  $('saveall').onclick = () => save($('saveall'), async () => ({name: 'Recast files.zip', blob: await zipOf(R.items.filter(i => i.outs).flatMap(i => i.outs))}), $('after'));
  $('reset').onclick = () => {
    if (R.busy) return;
    R.items = []; R.target = null; R.merged = null;
    $('files').innerHTML = ''; $('results').innerHTML = ''; $('q').value = ''; $('overall').textContent = '';
    progressBar(0, 0); syncStage();
    transition(render);
    Stage.state('idle');
    drop.focus({preventScroll: true});
  };
  $('samples').onclick = async () => {
    const c = canvas(1200, 800), x = ctx(c), g = x.createLinearGradient(0, 0, 0, 800);
    g.addColorStop(0, '#ffb36b'); g.addColorStop(0.55, '#e0576b'); g.addColorStop(1, '#3b2a6b');
    x.fillStyle = g; x.fillRect(0, 0, 1200, 800);
    x.fillStyle = '#ffe6a8'; x.beginPath(); x.arc(600, 520, 150, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1d1838'; x.fillRect(0, 560, 1200, 240);
    const photo = new File([await toBlob(c, 'image/png')], 'sample-sunset.png', {type: 'image/png'});
    const notes = new File([`# Trip checklist\n\nA sample note for trying Recast.\n\n## Before leaving\n\n- Passport and **printed** tickets\n- Charger, adapter and a spare cable\n- Offline maps downloaded\n\n## Budget\n\n| Item | Cost |\n|---|---|\n| Train | \u20ac48 |\n| Hostel, 3 nights | \u20ac96 |\n| Food | \u20ac60 |\n\n> Pack light: you can buy most things there.\n`], 'sample-trip-checklist.md', {type: 'text/markdown'});
    addFiles([photo, notes]);
  };
  // in-page links scroll inside the frame; the converter link also moves focus there
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1), el = id === 'top' ? document.body : $(id);
    if (!el) return;
    e.preventDefault();
    (id === 'top' ? window : null)?.scrollTo({top: 0, behavior: reduce ? 'auto' : 'smooth'});
    if (id !== 'top') el.scrollIntoView({behavior: reduce ? 'auto' : 'smooth', block: 'start'});
    if (id === 'convert') setTimeout(() => drop.focus({preventScroll: true}), reduce ? 0 : 500);
  }));

  /* ---------------------------------------------------------- format matrix, from the engine's own routing */
  (() => {
    const inputs = Object.keys(F).filter(k => F[k].k && !F[k].hide);
    const outs = CATS.flatMap(c => Object.keys(F).filter(k => F[k].c === c && inputs.concat('json').includes(k) && inputs.some(i => targetsOf(i).includes(k))));
    const groupStart = new Set(CATS.map(c => outs.find(k => F[k].c === c)).filter(Boolean));
    const t = $('matrix');
    let html = '<caption class="sr-only">Supported conversions: rows are input formats, columns are output formats</caption><thead><tr><th scope="col"><span class="sr-only">From</span></th>';
    html += outs.map(k => `<th scope="col" class="${groupStart.has(k) && k !== outs[0] ? 'grp' : ''}" data-col="${k}"><span>${k}</span></th>`).join('') + '</tr></thead><tbody>';
    for (const c of CATS) {
      const rows = inputs.filter(k => F[k].c === c);
      if (!rows.length) continue;
      html += `<tr class="cat-row"><th colspan="${outs.length + 1}" scope="rowgroup">${esc(c)}</th></tr>`;
      for (const k of rows) {
        const tg = targetsOf(k);
        html += `<tr data-row="${k}"><th scope="row"><code>${k}</code><small>${esc(F[k].l)}</small></th>` +
          outs.map((o, ci) => `<td class="${groupStart.has(o) && o !== outs[0] ? 'grp' : ''}" data-col="${o}">${tg.includes(o) ? `<i class="dot" style="--c:${ci}" role="img" aria-label="${k} to ${o}"></i>` : '<span class="sr-only">no</span>'}</td>`).join('') + '</tr>';
      }
    }
    t.innerHTML = html + '</tbody>';
    t.addEventListener('pointerover', e => {
      const col = e.target.closest('[data-col]')?.dataset.col;
      t.querySelectorAll('.col-hl').forEach(c => c.classList.remove('col-hl'));
      if (col) t.querySelectorAll(`td[data-col="${col}"]`).forEach(c => c.classList.add('col-hl'));
    });
    t.addEventListener('pointerleave', () => t.querySelectorAll('.col-hl').forEach(c => c.classList.remove('col-hl')));
    $('mq').oninput = () => {
      const q = $('mq').value.trim();
      t.querySelectorAll('tbody tr[data-row]').forEach(tr => {
        const hit = q && matches(tr.dataset.row, q);
        tr.classList.toggle('hit', !!hit);
        tr.classList.toggle('dim', !!q && !hit);
      });
    };
    const wrap = $('matrix-wrap');
    if (reduce || !('IntersectionObserver' in window)) wrap.classList.add('seen');
    else new IntersectionObserver((es, ob) => { if (es[0].isIntersecting) { wrap.classList.add('seen'); ob.disconnect(); } }, {threshold: 0.25}).observe(wrap);
  })();

  render();
})();
