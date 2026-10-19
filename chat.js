/* Recast chat: attach files, then say what you want in plain words.
   A small rule-based reader (no AI, nothing leaves the tab) turns the request into a job, and the
   engine runs it: convert each file, combine several into one, make a contact sheet or an animated GIF.
   Every progress step and result shown here comes from the engine actually doing the work. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const log = $('log'), say = $('say'), trayEl = $('tray'), pickC = $('chat-pick'), sendBtn = $('send');
  const S = {files: [], uid: 0, jobs: 0, busy: false, last: null};

  /* ---------------------------------------------------------- the Chat tab is its own view */
  function setView(v) {
    document.body.dataset.view = v;
    document.querySelectorAll('[data-tab]').forEach(a => a.setAttribute('aria-current', a.dataset.tab === v ? 'page' : 'false'));
    try { history.replaceState(null, '', v === 'chat' ? '#chat' : location.pathname + location.search); } catch {}
    if (v === 'chat') { scrollTo(0, 0); say.focus({preventScroll: true}); }
  }
  document.addEventListener('click', e => { // runs before the page's own link handler
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    if (a.getAttribute('href') === '#chat') { e.preventDefault(); e.stopPropagation(); setView('chat'); }
    else if (document.body.dataset.view === 'chat') setView('home');
  }, true);
  setView(location.hash === '#chat' ? 'chat' : 'home');
  if (location.hash !== '#chat') try { history.replaceState(null, '', location.pathname + location.search + location.hash); } catch {}

  /* ---------------------------------------------------------- words */
  const NOUN = {image: 'image', heic: 'photo', tiff: 'image', pdf: 'PDF', docx: 'Word file', odt: 'document', pptx: 'PowerPoint deck',
    html: 'web page', md: 'Markdown file', txt: 'text file', sheet: 'spreadsheet', epub: 'ebook'};
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  function describe(items) {
    const counts = new Map();
    for (const it of items) { const w = NOUN[F[it.fmt].k] || 'file'; counts.set(w, (counts.get(w) || 0) + 1); }
    const parts = [...counts].map(([w, n]) => plural(n, w));
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts.at(-1) : parts[0] || 'nothing';
  }
  const label = f => F[f]?.l || f.toUpperCase();
  const kindOf = it => F[it.fmt].k;
  const isImg = it => IMG_KINDS.includes(kindOf(it));
  const isSheet = it => kindOf(it) === 'sheet';

  /* ---------------------------------------------------------- reading a request */
  const ALIAS = [
    ['md', ['markdown', 'md']], ['docx', ['word document', 'word doc', 'word file', 'microsoft word', 'docx', 'word']],
    ['pdf', ['pdfs', 'pdf']], ['txt', ['plain text', 'plaintext', 'text file', 'txt', 'text']],
    ['html', ['web page', 'webpage', 'website', 'html', 'htm']], ['epub', ['e-book', 'ebook', 'epub']],
    ['png', ['pngs', 'png']], ['jpg', ['jpegs', 'jpeg', 'jpgs', 'jpg']], ['webp', ['webp']],
    ['gif', ['gifs', 'gif', 'animation', 'animated']], ['bmp', ['bitmap', 'bmp']], ['tiff', ['tiff', 'tif']],
    ['ico', ['favicon', 'icon', 'ico']], ['xlsx', ['spreadsheet', 'excel', 'xlsx', 'xls']], ['csv', ['csv']], ['json', ['json']],
  ];
  const UNWRITABLE = [['heic', ['heic', 'heif']], ['avif', ['avif']], ['svg', ['svg']], ['pptx', ['powerpoint', 'pptx', 'slides']], ['odt', ['odt', 'opendocument']]];
  const CATS_WORDS = [[IMG_KINDS, /\b(images?|photos?|pictures?|pics|screenshots?)\b/], [['pdf'], /\bpdfs?\b/], [['sheet'], /\b(spreadsheets|sheets)\b/],
    [['docx', 'odt', 'md', 'txt', 'html', 'pptx', 'epub'], /\b(documents|docs|notes)\b/]];
  const CONNECT = /(?:\bto|\binto|\bas|\bin|->|\u2192|\bmake(?: it| them| these| this| me)?|\bturn(?: it| them| these| this)? into|\bsave(?: it| them)? as|\bexport(?: it| them)? (?:as|to))\s+(?:an?\s+|one\s+|a single\s+|single\s+|1\s+|the\s+|some\s+)?(?:big\s+|combined\s+|merged\s+|nice\s+|small(?:er)?\s+)?$/;
  const NUM = {one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10};

  function mentions(text, table) {
    const found = [];
    for (const [fmt, words] of table)
      for (const w of words) {
        const re = new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}(?=$|[^a-z0-9])`, 'g');
        for (const m of text.matchAll(re)) { const start = m.index + m[1].length; found.push({fmt, start, end: start + w.length}); }
      }
    found.sort((a, b) => a.start - b.start || b.end - a.end);
    return found.filter((m, i) => !found.slice(0, i).some(o => m.start < o.end && o.start < m.end));
  }

  function parse(raw) {
    let t = ' ' + raw.toLowerCase().replace(/\s+/g, ' ').trim() + ' ';
    const r = {raw, o: {}};
    if (/^\s*(help|\?|what can you do|how does (this|it) work|commands)\b/.test(t)) return {...r, cmd: 'help'};
    if (/^\s*(hi|hey|hello|yo|sup|hiya)\b[\s!.]*$/.test(t)) return {...r, cmd: 'hi'};
    if (/^\s*(thanks|thank you|ty|cheers|nice|cool|great|perfect)\b/.test(t)) return {...r, cmd: 'thanks'};
    if (/\b(clear|start over|reset|remove all|delete all|forget (it|them|everything))\b/.test(t)) return {...r, cmd: 'clear'};
    const rm = t.match(/^\s*(?:remove|delete|drop|take out|get rid of)\s+(.+?)\s*$/);
    if (rm) return {...r, cmd: 'remove', what: rm[1]};

    // special jobs first, so "contact sheet" isn't read as a spreadsheet
    if (/\b(contact sheet|collage|grid|mood ?board|overview image)\b/.test(t)) { r.mode = 'contact'; t = t.replace(/contact sheet|collage|grid|mood ?board|overview image/g, ' '); }

    const named = raw.match(/\b(?:call(?:ed)?|name(?:d)?|title(?:d)?)\s+(?:it\s+|the file\s+|them\s+|that\s+)?["\u201c'\u2018]?([^"\u201d'\u2019\n]{1,60}?)["\u201d'\u2019]?\s*(?:$|[.,!])/i);
    if (named) { r.name = named[1].replace(/[\\/:*?"<>|]+/g, '').trim(); t = t.replace(named[0].toLowerCase(), ' '); }

    const ms = mentions(t, ALIAS), bad = mentions(t, UNWRITABLE);
    let target = null;
    for (const m of [...ms, ...bad]) if (CONNECT.test(t.slice(0, m.start))) target = m;
    if (!target && ms.length) target = ms[ms.length - 1];
    if (target && UNWRITABLE.some(([f]) => f === target.fmt)) r.unwritable = target.fmt;
    else if (target) r.target = target.fmt;
    r.sourceFmts = ms.filter(m => m !== target).map(m => m.fmt);
    r.sourceKinds = CATS_WORDS.filter(([, re]) => re.test(t.replace(target ? t.slice(target.start, target.end) : '\0', ' '))).flatMap(([k]) => k);

    const timing = /(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)\s*(?:each|per|a frame|per frame|between)|\beach frame\b/;
    const each = !timing.test(t) && /\b(each|separate(ly)?|individual(ly)?|one by one|one each|every one)\b/.test(t);
    r.merge = !each && /\b(combine[ds]?|merge[ds]?|join|stitch|together|concat\w*|one big|into one|in one|as one|a single|single|all in one|one file|one document|1 file)\b/.test(t);
    if (r.target === 'gif' && !each && (S.files.length > 1 || /\b(a gif|one gif|animat\w*|slideshow|flipbook)\b/.test(t))) r.mode = r.mode || 'anim';
    if (/\b(slideshow|flipbook|animate)\b/.test(t) && !r.target) { r.target = 'gif'; r.mode = 'anim'; }

    const fl = t.match(/\b(first|last)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
    if (fl) r.slice = {from: fl[1], n: +fl[2] || NUM[fl[2]]};

    // options
    const q = t.match(/(\d{2,3})\s*%?\s*quality|quality\s*(?:of|at|to|=)?\s*(\d{2,3})/);
    if (q) r.o.quality = Math.min(100, Math.max(10, +(q[1] || q[2])));
    const px = t.match(/(\d{3,5})\s*(?:px|pixels?)\b|(?:max|resize(?: it| them)? to|width|wide|longest side)\D{0,12}(\d{3,5})/);
    if (px) r.o.max = +(px[1] || px[2]);
    const dpi = t.match(/(\d{2,3})\s*dpi/);
    if (dpi) r.o.dpi = Math.min(600, Math.max(36, +dpi[1]));
    if (/\b(tiny|super small|really small|very small|even smaller|smaller still)\b/.test(t)) { r.small = r.tiny = true; r.o.quality ??= 60; r.o.max ??= 1024; }
    else if (/\b(smaller|small|shrink|compress\w*|email|lighter|reduce|lightweight|for (the )?web)\b/.test(t)) { r.small = true; r.o.quality ??= 72; r.o.max ??= 1920; }
    if (/\b(high quality|best quality|sharp(er)?|hi-?res|high res(olution)?|crisp|print)\b/.test(t)) { r.o.dpi ??= 300; r.o.quality ??= 95; }
    if (/\blow res(olution)?\b/.test(t)) r.o.dpi ??= 72;
    const sp = t.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)\s*(?:each|per|a frame|per frame|between)/);
    r.speed = /\b(fast(er)?|quick(er)?|slow(er)?)\b/.test(t);
    r.delay = sp ? Math.round(+sp[1] * 100) : /\b(fast(er)?|quick(er)?)\b/.test(t) ? 35 : /\bslow(er)?\b/.test(t) ? 150 : 70;
    r.again = /\b(again|same|redo|retry|instead|actually)\b/.test(t);
    return r;
  }

  /* ---------------------------------------------------------- messages */
  const now = () => new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  function stick(force) {
    const near = innerHeight + scrollY > document.body.scrollHeight - 220;
    if (force || near) requestAnimationFrame(() => scrollTo({top: document.body.scrollHeight, behavior: reduce ? 'auto' : 'smooth'}));
  }
  function me(text) {
    $('chat-intro').hidden = true;
    const d = document.createElement('div');
    d.className = 'msg me';
    d.textContent = text;
    log.append(d); stick(true);
  }
  function bot(parts, chips = []) {
    $('chat-intro').hidden = true;
    const d = document.createElement('div');
    d.className = 'msg bot';
    d.innerHTML = `<div class="who mono">Recast <time>${now()}</time></div><div class="body"></div>`;
    const body = d.querySelector('.body');
    for (const p of [].concat(parts)) {
      if (typeof p === 'string') { const el = document.createElement('p'); el.innerHTML = p; body.append(el); } else body.append(p);
    }
    if (chips.length) body.append(chipRow(chips));
    log.append(d); stick(true);
    return d;
  }
  function chipRow(list) {
    const row = document.createElement('div');
    row.className = 'saychips';
    for (const c of list) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'saychip'; b.textContent = c;
      b.onclick = () => submit(c);
      row.append(b);
    }
    return row;
  }
  const B = s => `<b>${esc(s)}</b>`;

  /* ---------------------------------------------------------- attached files */
  function attach(list, quiet) {
    const added = [], bad = [];
    for (const file of list) {
      const ext = (file.name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
      const fmt = EXT[ext] && F[EXT[ext]].k ? EXT[ext] : (file.type.startsWith('image/') ? 'image' : null);
      if (!fmt) { bad.push(file.name); continue; }
      const it = {id: ++S.uid, file, name: file.name, stem: file.name.replace(/\.[^.]+$/, '') || 'file', fmt};
      S.files.push(it); added.push(it);
    }
    renderTray();
    if (quiet) return added;
    const lines = [];
    if (added.length) lines.push(`Got ${B(describe(added))} (${size(added.reduce((a, i) => a + i.file.size, 0))}). What should I make?`);
    if (bad.length) lines.push(`I can't read ${bad.map(esc).join(', ')}. ${bad.length > 1 ? 'Those types aren\u2019t' : 'That type isn\u2019t'} supported.`);
    if (lines.length) bot(lines, added.length ? suggestions(S.files) : []);
    return added;
  }
  function renderTray() {
    trayEl.innerHTML = '';
    trayEl.hidden = !S.files.length;
    if (!S.files.length) return;
    const head = document.createElement('div');
    head.className = 'tray-h mono';
    head.innerHTML = `<span>${S.files.length} attached \u00b7 ${size(S.files.reduce((a, i) => a + i.file.size, 0))}</span>`;
    const clr = document.createElement('button');
    clr.type = 'button'; clr.className = 'linkish'; clr.textContent = 'Clear';
    clr.onclick = () => { if (!S.busy) { S.files = []; renderTray(); } };
    head.append(clr);
    const row = document.createElement('div');
    row.className = 'tray-row';
    for (const it of S.files) {
      const c = document.createElement('span');
      c.className = 'tchip';
      c.innerHTML = '<code></code><span></span><button type="button">\u00d7</button>';
      c.querySelector('code').textContent = it.fmt === 'image' ? 'img' : it.fmt;
      c.querySelector('span').textContent = it.name;
      c.title = it.name;
      const x = c.querySelector('button');
      x.setAttribute('aria-label', 'Remove ' + it.name);
      x.onclick = () => { if (!S.busy) { S.files = S.files.filter(f => f !== it); renderTray(); } };
      row.append(c);
    }
    trayEl.append(head, row);
  }
  function suggestions(items) {
    const n = items.length, imgs = items.filter(isImg).length, sheets = items.filter(isSheet).length, pdfs = items.filter(i => i.fmt === 'pdf').length;
    const docs = n - imgs - sheets, out = [];
    if (n > 1 && (pdfs || docs)) out.push(`Combine ${n === 2 ? 'both' : 'them'} into one Markdown file`);
    if (n > 1) out.push('Combine everything into one PDF');
    if (n === 1 && (pdfs || docs)) out.push('Turn it into Markdown');
    if (pdfs) out.push(n > 1 ? 'Make each one a Word file' : 'Make it a Word file');
    if (docs && !pdfs) out.push(n > 1 ? 'Make each one a PDF' : 'Make it a PDF');
    if (imgs) out.push(imgs > 1 ? 'Shrink the photos for email' : 'Shrink this photo for email');
    if (imgs > 1) out.push('Make a contact sheet of the photos', 'Make a GIF from the photos');
    if (sheets) out.push(sheets > 1 ? 'Combine the spreadsheets into one Excel file' : 'Turn the spreadsheet into JSON');
    return [...new Set(out)].slice(0, 5);
  }

  /* ---------------------------------------------------------- picking which files a request means */
  function choose(r) {
    let list = [...S.files];
    const lower = r.raw.toLowerCase();
    const byName = list.filter(it => it.stem.length > 3 && !EXT[it.stem.toLowerCase()] && lower.includes(it.stem.toLowerCase()));
    if (byName.length) list = byName;
    else {
      const f = list.filter(it => r.sourceFmts.includes(it.fmt) || r.sourceKinds.includes(kindOf(it)) || (r.sourceFmts.includes('jpg') && it.fmt === 'jpg'));
      if (f.length && f.length < list.length) list = f;
    }
    if (r.slice) list = r.slice.from === 'first' ? list.slice(0, r.slice.n) : list.slice(-r.slice.n);
    return list;
  }
  function plan(r, list) {
    const t = r.target;
    if (r.mode === 'contact') {
      const ok = list.filter(isImg), to = ['jpg', 'pdf', 'webp'].includes(t) ? t : 'png';
      return {mode: 'contact', to, ok, skip: list.filter(i => !isImg(i)), title: `CONTACT SHEET \u00b7 ${ok.length} \u2192 1 .${to.toUpperCase()}`};
    }
    if (r.mode === 'anim') {
      const ok = list.filter(isImg);
      return {mode: 'anim', to: 'gif', ok, skip: list.filter(i => !isImg(i)), title: `ANIMATE \u00b7 ${ok.length} \u2192 1 .GIF`};
    }
    if (r.merge && list.length > 1) {
      if (t === 'pdf') {
        const ok = list.filter(i => i.fmt === 'pdf' || targetsOf(i.fmt).includes('pdf'));
        return {mode: 'merge-pdf', to: t, ok, skip: list.filter(i => !ok.includes(i)), title: `COMBINE \u00b7 ${ok.length} \u2192 1 .PDF`};
      }
      if (['md', 'html', 'txt', 'docx', 'epub'].includes(t)) {
        const ok = list.filter(i => isImg(i) || targetsOf(i.fmt).includes('html'));
        return {mode: 'merge-doc', to: t, ok, skip: list.filter(i => !ok.includes(i)), title: `COMBINE \u00b7 ${ok.length} \u2192 1 .${t.toUpperCase()}`};
      }
      if (SHEET_OUT.includes(t)) {
        const ok = list.filter(isSheet);
        return {mode: 'merge-sheet', to: t, ok, skip: list.filter(i => !ok.includes(i)), title: `COMBINE \u00b7 ${ok.length} \u2192 1 .${t.toUpperCase()}`};
      }
      if (IMG_OUT.includes(t)) return plan({...r, mode: t === 'gif' ? 'anim' : 'contact'}, list);
    }
    const ok = list.filter(i => targetsOf(i.fmt).includes(t) || (i.fmt === t && isImg(i) && IMG_OUT.includes(t)));
    return {mode: 'each', to: t, ok, skip: list.filter(i => !ok.includes(i)), title: `CONVERT \u00b7 ${ok.length} \u2192 .${t.toUpperCase()}`};
  }

  /* ---------------------------------------------------------- handling a message */
  function submit(text) {
    text = text.trim();
    if (!text) return;
    if (S.busy) { bot('Still working on the last job. Give me a moment.'); return; }
    me(text);
    say.value = ''; grow();
    handle(parse(text));
  }
  function handle(r) {
    if (r.cmd === 'help') return help();
    if (r.cmd === 'hi') return bot(S.files.length ? 'Hey. Tell me what these should become.' : 'Hey. Attach some files, or try the demo pack, then tell me what you want.', S.files.length ? suggestions(S.files) : []);
    if (r.cmd === 'thanks') return bot('Any time.');
    if (r.cmd === 'clear') { S.files = []; S.last = null; renderTray(); return bot('Cleared. Attach new files whenever you\u2019re ready.'); }
    if (r.cmd === 'remove') {
      const w = r.what.replace(/^(the|all|my)\s+/, '');
      const pr = parse('to ' + w), before = S.files.length;
      S.files = S.files.filter(it => !(it.name.toLowerCase().includes(w) || pr.target === it.fmt || pr.sourceKinds.includes(kindOf(it)) || (/images?|photos?|pictures?/.test(w) && isImg(it))));
      renderTray();
      const gone = before - S.files.length;
      return bot(gone ? `Removed ${plural(gone, 'file')}. ${S.files.length ? `${plural(S.files.length, 'file')} still attached.` : 'Nothing attached now.'}` : `I couldn\u2019t find \u201c${esc(r.what)}\u201d among the attached files.`);
    }
    if (!S.files.length) return bot('Attach some files first: drop them here, paste them, or use the paperclip. Then tell me what you want.', []);
    if (r.unwritable) {
      const alt = {heic: 'JPG or PNG', avif: 'WebP or JPG', svg: 'PNG', pptx: 'PDF', odt: 'Word'}[r.unwritable];
      return bot(`I can read ${label(r.unwritable)} files but can\u2019t write them, because browsers have no way to create that format. ${alt} would work.`,
        alt.split(' or ').map(a => `Make ${S.files.length > 1 ? 'them' : 'it'} ${a}`));
    }
    // a follow-up ("make it faster", "even smaller", "again") names no files, so it reuses the last job's files
    const followUp = !r.target && S.last && !r.sourceFmts.length && !r.sourceKinds.length && (r.small || r.again || r.speed || Object.keys(r.o).length > 0);
    if (!r.target) {
      if (followUp && r.small && S.last.target && IMG_OUT.includes(S.last.target)) { r.target = S.last.target; r.mode = r.mode || S.last.mode; }
      else if (r.small && S.files.some(isImg)) r.target = 'keep';
      else if (followUp) { r.target = S.last.target; r.merge = r.merge || S.last.merge; r.mode = r.mode || S.last.mode; }
      else if (r.mode === 'contact') r.target = 'png';
      else return bot('Which format should they become? Say it like \u201cmake them PDFs\u201d or \u201ccombine into one Word file\u201d.', suggestions(S.files));
    }
    const prev = followUp ? S.files.filter(f => S.last.ids.includes(f.id)) : [];
    const list = prev.length ? prev : choose(r);
    if (r.target === 'keep') { // shrink images in their own format where possible
      const imgs = list.filter(isImg);
      if (!imgs.length) return bot('None of the attached files are images, so there\u2019s nothing to shrink.');
      return run({mode: 'shrink', to: 'keep', ok: imgs, skip: list.filter(i => !isImg(i)), title: `SHRINK \u00b7 ${imgs.length} IMAGE${imgs.length > 1 ? 'S' : ''}`}, r);
    }
    if (!r.merge && !r.mode && list.length && list.every(i => i.fmt === r.target) && !r.small)
      return bot(`${list.length > 1 ? 'These are' : 'That\u2019s'} already ${label(r.target)}.${list.length > 1 && r.target === 'pdf' ? ' Want me to combine them into one?' : ''}`,
        list.length > 1 && r.target === 'pdf' ? ['Combine them into one PDF'] : []);
    const p = plan(r, list);
    if (!p.ok.length) {
      const why = p.mode === 'merge-sheet' ? 'Only spreadsheets can be combined into a spreadsheet.' : p.mode === 'contact' || p.mode === 'anim' ? 'That needs images.' : `${list.length > 1 ? 'None of these' : 'This file'} can become ${label(r.target)}.`;
      return bot(why, suggestions(S.files));
    }
    run(p, r);
  }
  function help() {
    bot([
      'Attach files, then tell me what you want. I understand things like:',
      '<span class="eg">\u201ccombine these PDFs into one Markdown file\u201d</span><span class="eg">\u201cmake each one a Word file\u201d</span><span class="eg">\u201cshrink the photos for email\u201d</span><span class="eg">\u201cturn the images into one PDF\u201d</span><span class="eg">\u201cmake a contact sheet\u201d</span><span class="eg">\u201cmake a GIF, 0.5 seconds each\u201d</span><span class="eg">\u201cjust the first 3, as PNG at 1200px\u201d</span><span class="eg">\u201ccall it Trip notes\u201d</span>',
      'You can also say <b>remove the images</b>, <b>clear</b>, or follow up with <b>actually make it Word</b>. I read your words with simple rules on this device; I\u2019m not an AI and nothing you type is sent anywhere.',
    ]);
  }

  /* ---------------------------------------------------------- the job card */
  function jobCard(p) {
    const el = document.createElement('div');
    el.className = 'job';
    el.innerHTML = `<div class="job-h mono"><span></span><span class="job-t"></span></div>
      <div class="strip"><div class="q"></div><div class="gate" aria-hidden="true"></div><div class="d"></div></div>
      <div class="job-s" role="status"></div><ul class="job-r"></ul><div class="job-a"></div>`;
    el.querySelector('.job-h span').textContent = `JOB ${String(++S.jobs).padStart(2, '0')} \u00b7 ${p.title}`;
    const q = el.querySelector('.q'), d = el.querySelector('.d'), chips = new Map(), CAP = 40;
    p.ok.forEach((it, i) => {
      if (i >= CAP) return;
      const c = document.createElement('span');
      c.className = 'fchip'; c.textContent = '.' + (it.fmt === 'image' ? 'img' : it.fmt);
      c.title = it.name;
      q.append(c); chips.set(it.id, c);
    });
    let more = null;
    if (p.ok.length > CAP) { more = document.createElement('span'); more.className = 'fchip ghost'; q.append(more); }
    let hidden = Math.max(0, p.ok.length - CAP);
    const setMore = () => { if (more) { more.textContent = `+${hidden}`; more.hidden = !hidden; } };
    setMore();
    const outExt = p.to === 'keep' ? null : p.to;
    function move(c, text, cls) {
      const a = c.getBoundingClientRect();
      d.append(c);
      c.textContent = text; c.classList.remove('active'); c.classList.add(cls);
      if (reduce) return;
      const b = c.getBoundingClientRect();
      c.animate([{transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)`}, {transform: 'none'}], {duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)'});
    }
    return {
      el,
      status(text) { el.querySelector('.job-s').textContent = text; },
      start(it) { el.classList.add('working'); chips.get(it.id)?.classList.add('active'); },
      done(it) {
        const c = chips.get(it.id);
        if (c) move(c, '.' + (outExt || it.fmt).replace('image', 'img'), 'out'); else { hidden--; setMore(); }
      },
      fail(it) { const c = chips.get(it.id); if (c) { c.classList.remove('active'); c.classList.add('fail'); } else { hidden--; setMore(); } },
      collapse(name) { // several sheets become one
        const all = [...d.children];
        const one = document.createElement('span');
        one.className = 'fchip out one'; one.textContent = name;
        if (reduce || !all.length) { d.replaceChildren(one); return; }
        const anims = all.map((c, i) => c.animate([{transform: 'none', opacity: 1}, {transform: `translateX(${-i * 6}px) scale(.6)`, opacity: 0}], {duration: 380, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards'}));
        Promise.all(anims.map(a => a.finished)).then(() => { d.replaceChildren(one); one.animate([{transform: 'scale(.6)', opacity: 0}, {transform: 'none', opacity: 1}], {duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)'}); });
      },
      finish(outs, sub, follow) {
        el.classList.remove('working'); el.classList.add('finished');
        const ul = el.querySelector('.job-r');
        for (const o of outs) {
          const li = document.createElement('li');
          li.innerHTML = '<span class="chipx"></span><div class="fmeta"><div class="fname"></div><div class="fsub"></div></div><button class="btn" type="button">Save</button>';
          li.querySelector('.chipx').textContent = o.name.split('.').pop();
          li.querySelector('.fname').textContent = o.name;
          li.querySelector('.fname').title = o.name;
          li.querySelector('.fsub').textContent = o.sub || size(o.blob.size);
          const b = li.querySelector('.btn');
          b.setAttribute('aria-label', 'Save ' + o.name);
          b.onclick = () => saveOne(b, o, li);
          ul.append(li);
        }
        const a = el.querySelector('.job-a');
        if (outs.length > 1) {
          const z = document.createElement('button');
          z.type = 'button'; z.className = 'btn solid'; z.textContent = 'Save all as .zip';
          z.onclick = () => saveOne(z, async () => ({name: `Recast job ${String(S.jobs).padStart(2, '0')}.zip`, blob: await zipOf(outs)}), a);
          a.append(z);
        }
        this.status(sub);
        if (follow.length) el.append(chipRow(follow));
        stick();
      },
      error(msg) { el.classList.remove('working'); el.classList.add('failed'); this.status(msg); },
    };
  }
  async function saveOne(btn, o, holder) {
    btn.disabled = true;
    try {
      let f = typeof o === 'function' ? await o() : o;
      if (!SAVEABLE.has(f.name.split('.').pop())) f = {name: f.name.replace(/\.[^.]+$/, '') + '.zip', blob: await zipOf([f])};
      if (await saveFile(f.name, f.blob)) { btn.textContent = 'Saved'; btn.classList.add('saved'); }
    } catch (e) {
      const s = holder.querySelector?.('.fsub');
      if (s) { s.textContent = e.message; s.classList.add('st-err'); } else bot(esc(e.message));
    }
    btn.disabled = false;
  }

  /* ---------------------------------------------------------- running jobs */
  const opts = r => ({quality: 90, dpi: 150, max: 0, ...r.o});
  const stemFor = (r, fallback) => r.name || fallback;
  async function run(p, r) {
    S.busy = true; sendBtn.disabled = true;
    const card = jobCard(p), o = opts(r), t0 = performance.now(), notes = [], outs = [];
    const m = bot(p.skip.length ? `${p.ok.length === 1 ? 'Working on 1 file' : `Working on ${p.ok.length} files`}. Skipping ${p.skip.map(i => esc(i.name)).join(', ')}: ${skipWhy(p, p.skip.length > 1)}.` : '');
    if (!p.skip.length) m.querySelector('.body').replaceChildren();
    m.querySelector('.body').append(card.el);
    Stage.state?.('working');
    let failed = 0;
    const each = async (fn) => {
      for (const [i, it] of p.ok.entries()) {
        card.start(it);
        card.status(`${it.name} \u00b7 ${i + 1} of ${p.ok.length}`);
        try { await fn(it, (msg, frac) => card.status(`${it.name} \u00b7 ${msg}${frac != null ? ` (${Math.round(frac * 100)}%)` : ''}`)); card.done(it); }
        catch (e) { console.error(e); failed++; card.fail(it); notes.push(`${it.name}: ${e.message}`); }
        Stage.pulse?.();
        await tick();
      }
    };
    try {
      if (p.mode === 'each') {
        await each(async (it, prog) => {
          if (isImg(it) && IMG_OUT.includes(p.to) && (it.fmt === p.to || r.small)) { // re-encode directly with the requested settings
            const [c] = await readImage(it), blob = await encode(c, p.to, {...o, max: shrinkTo(c, o, r)});
            const px = Math.min(1, (shrinkTo(c, o, r) || Infinity) / Math.max(c.width, c.height));
            outs.push({name: `${it.stem}${r.small ? '-small' : ''}.${p.to}`, blob,
              sub: it.fmt === p.to ? `${size(it.file.size)} \u2192 ${size(blob.size)}` : `${size(blob.size)} \u00b7 ${Math.round(c.width * px)} \u00d7 ${Math.round(c.height * px)}`});
            return;
          }
          const res = await convert(it, p.to, o, prog);
          notes.push(...res.notes.map(n => `${it.name}: ${n}`));
          if (res.outs.length > 1) outs.push({name: `${it.stem} (${p.to.toUpperCase()} pages).zip`, blob: await zipOf(res.outs), sub: `${res.outs.length} pages`});
          else outs.push(res.outs[0]);
        });
      } else if (p.mode === 'shrink') {
        await each(async it => {
          const [c] = await readImage(it), to = ['jpg', 'webp', 'png'].includes(it.fmt) ? it.fmt : 'jpg';
          const blob = await encode(c, to, {...o, max: shrinkTo(c, o, r)});
          outs.push({name: `${it.stem}-small.${to}`, blob, sub: `${size(it.file.size)} \u2192 ${size(blob.size)}`});
        });
      } else if (p.mode === 'merge-pdf') {
        let cur = null;
        const blob = await mergeAll(p.ok, o, (it, msg) => {
          if (cur && cur !== it) card.done(cur);
          if (cur !== it) card.start(it);
          cur = it; card.status(`${it.name} \u00b7 ${msg}`); Stage.pulse?.();
        });
        if (cur) card.done(cur);
        outs.push({name: `${stemFor(r, 'Combined')}.pdf`, blob});
      } else if (p.mode === 'merge-doc') {
        let body = '';
        await each(async (it, prog) => {
          let html;
          if (isImg(it)) { const [c] = await readImage(it); html = `<p><img src="${flat(fit(c, 1600)).toDataURL('image/jpeg', 0.86)}" alt="${esc(it.name)}"></p>`; }
          else html = await htmlFor(it, prog);
          // the file name becomes the heading only when the document doesn't open with one; files are split by a rule
          body += (body ? '<hr>\n' : '') + (/^\s*<h[12][\s>]/i.test(html) ? '' : `<h1>${esc(it.stem)}</h1>\n`) + html + '\n';
        });
        if (!body) throw new Error('None of the files could be read.');
        card.status(`Writing one ${label(p.to)} file`);
        const title = stemFor(r, 'Combined');
        const blob = p.to === 'html' ? new Blob([htmlPage(body, title)], {type: 'text/html'})
          : p.to === 'md' ? new Blob([await toMarkdown(body)], {type: 'text/markdown'})
          : p.to === 'txt' ? new Blob([blocksText(blocksOf(body))], {type: 'text/plain'})
          : p.to === 'docx' ? await toDocx(blocksOf(body)) : await toEpub(body, title);
        if (p.to === 'md' && p.ok.some(isImg)) notes.push('pictures aren\u2019t included in Markdown');
        outs.push({name: `${title}.${p.to}`, blob});
      } else if (p.mode === 'merge-sheet') {
        await need('xlsx');
        const books = [];
        await each(async it => { books.push([it, await workbook(it)]); });
        if (!books.length) throw new Error('None of the spreadsheets could be read.');
        card.status(`Writing one ${label(p.to)} file`);
        const title = stemFor(r, 'Combined');
        if (p.to === 'xlsx') {
          const wb = XLSX.utils.book_new(), used = new Set();
          for (const [it, src] of books) for (const n of src.SheetNames) {
            let name = (src.SheetNames.length > 1 ? `${it.stem} ${n}` : it.stem).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet', k = 2;
            while (used.has(name)) name = name.slice(0, 27) + ` (${k++})`;
            used.add(name); XLSX.utils.book_append_sheet(wb, src.Sheets[n], name);
          }
          outs.push({name: `${title}.xlsx`, blob: new Blob([XLSX.write(wb, {type: 'array', bookType: 'xlsx'})]), sub: `${plural(wb.SheetNames.length, 'sheet')}`});
        } else if (p.to === 'csv') {
          let rows = [], head = null;
          for (const [, src] of books) {
            const r2 = sheetRows(src.Sheets[src.SheetNames[0]]);
            if (head && JSON.stringify(r2[0]) === JSON.stringify(head)) r2.shift(); else if (!head) head = r2[0];
            rows = rows.concat(r2);
          }
          outs.push({name: `${title}.csv`, blob: new Blob(['\ufeff' + XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows))], {type: 'text/csv'}), sub: `${plural(rows.length, 'row')}`});
        } else {
          const data = Object.fromEntries(books.map(([it, src]) => [it.stem, XLSX.utils.sheet_to_json(src.Sheets[src.SheetNames[0]], {defval: ''})]));
          outs.push({name: `${title}.json`, blob: new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})});
        }
      } else if (p.mode === 'contact' || p.mode === 'anim') {
        const pics = [];
        await each(async it => { const [c] = await readImage(it); pics.push({c, name: it.name}); });
        if (!pics.length) throw new Error('None of the images could be read.');
        if (p.mode === 'contact') {
          card.status('Laying out the contact sheet');
          const sheet = contactSheet(pics);
          const blob = p.to === 'pdf' ? await pagesToPdf([sheet], {...o, max: 0}) : await encode(sheet, p.to, {...o, max: 0});
          outs.push({name: `${stemFor(r, 'Contact sheet')}.${p.to}`, blob, sub: `${size(blob.size)} \u00b7 ${plural(pics.length, 'image')}, ${sheet.width} \u00d7 ${sheet.height}`});
        } else {
          card.status('Building the animation');
          await need('gif');
          const frames = framesFor(pics, o.max || 720);
          const blob = gifFrames(frames, r.delay);
          outs.push({name: `${stemFor(r, 'Animation')}.gif`, blob, sub: `${size(blob.size)} \u00b7 ${plural(frames.length, 'frame')}, ${(r.delay / 100).toFixed(2).replace(/0$/, '')} s each`});
        }
      }
      if (!outs.length) throw new Error(notes[0] || 'Nothing could be converted.');
      if (/^merge|contact|anim/.test(p.mode)) card.collapse(outs[0].name.replace(/^.*(\.[^.]+)$/, '1 \u00d7 $1').toUpperCase());
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      const sub = `${failed ? `${p.ok.length - failed} of ${p.ok.length} done` : 'Done'} in ${secs} s${notes.length ? ' \u00b7 ' + notes.join('; ') : ''}`;
      card.finish(outs, sub, followUps(p));
      S.last = {target: p.to === 'keep' ? null : p.to, merge: /^merge/.test(p.mode), mode: /contact|anim/.test(p.mode) ? p.mode : null, ids: p.ok.map(i => i.id)};
      Stage.state?.(failed ? 'error' : 'done');
    } catch (e) {
      console.error(e);
      card.error(e.message || 'That didn\u2019t work.');
      Stage.state?.('error');
    }
    S.busy = false; sendBtn.disabled = false;
    stick();
  }
  // "smaller" always shrinks the pixels too, so lossless formats like PNG really get smaller
  function shrinkTo(c, o, r) {
    if (!r.small) return o.max;
    return Math.min(o.max || Infinity, Math.round(Math.max(c.width, c.height) * (r.tiny ? 0.5 : 0.75)));
  }
  function skipWhy(p, many) {
    if (p.mode === 'contact' || p.mode === 'anim' || p.mode === 'shrink') return many ? 'they aren\u2019t images' : 'it isn\u2019t an image';
    if (/^merge/.test(p.mode)) return `${many ? 'they' : 'it'} can\u2019t go into one ${label(p.to)} file`;
    return `${many ? 'they' : 'it'} can\u2019t become ${label(p.to)}`;
  }
  function followUps(p) {
    const docs = ['pdf', 'docx', 'md'], imgs = ['jpg', 'png', 'webp'], f = [];
    if (/^merge/.test(p.mode) && DOC_OUT.includes(p.to)) docs.filter(x => x !== p.to).slice(0, 2).forEach(x => f.push(`Same, but as one ${label(x)} file`));
    if (/^merge/.test(p.mode)) f.push(`Make each one ${p.to === 'pdf' ? 'a PDF' : label(p.to)} instead`);
    if (p.mode === 'each' && DOC_OUT.includes(p.to) && p.ok.length > 1) f.push(`Combine them into one ${label(p.to)} file`);
    if (p.mode === 'each' && IMG_OUT.includes(p.to)) { imgs.filter(x => x !== p.to).slice(0, 1).forEach(x => f.push(`Make them ${label(x)} instead`)); f.push('Make them smaller'); }
    if (p.mode === 'shrink') f.push('Even smaller', 'Combine them into one PDF');
    if (p.mode === 'contact') f.push('Make the contact sheet a PDF', 'Make a GIF from them');
    if (p.mode === 'anim') f.push('Make it faster', 'Make it slower', 'Make a contact sheet');
    return f.slice(0, 3);
  }
  function contactSheet(pics) {
    const n = pics.length, cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), cell = 460, pad = 28, cap = 34, head = 92;
    const W = cols * cell + (cols + 1) * pad, H = head + rows * (cell + cap) + rows * pad + pad;
    const c = canvas(W, H), x = ctx(c);
    x.fillStyle = '#f6f6f2'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#2338f5'; x.fillRect(0, 0, 6, H);
    x.fillStyle = '#141614'; x.font = '700 34px Archivo, Helvetica, Arial, sans-serif';
    x.fillText('Contact sheet', pad, 54);
    x.fillStyle = '#4a4f4b'; x.font = '500 15px "Martian Mono", Menlo, monospace';
    x.fillText(`${plural(n, 'image')} \u00b7 ${new Date().toLocaleDateString()} \u00b7 Recast`, pad, 78);
    pics.forEach(({c: im, name}, i) => {
      const cx = pad + (i % cols) * (cell + pad), cy = head + Math.floor(i / cols) * (cell + cap + pad);
      x.fillStyle = '#ffffff'; x.fillRect(cx, cy, cell, cell);
      x.strokeStyle = 'rgba(20,22,20,.25)'; x.lineWidth = 1; x.strokeRect(cx + .5, cy + .5, cell - 1, cell - 1);
      const s = Math.min((cell - 16) / im.width, (cell - 16) / im.height), w = im.width * s, h = im.height * s;
      x.imageSmoothingQuality = 'high';
      x.drawImage(im, cx + (cell - w) / 2, cy + (cell - h) / 2, w, h);
      x.fillStyle = '#141614'; x.font = '500 14px "Martian Mono", Menlo, monospace';
      let label2 = `${String(i + 1).padStart(2, '0')}  ${name}`;
      while (x.measureText(label2).width > cell && label2.length > 6) label2 = label2.slice(0, -2) + '\u2026';
      x.fillText(label2, cx, cy + cell + 22);
    });
    return c;
  }
  function framesFor(pics, max) {
    const a = pics[0].c, s = Math.min(1, max / Math.max(a.width, a.height)), W = Math.round(a.width * s), H = Math.round(a.height * s);
    return pics.map(({c: im}) => {
      const f = canvas(W, H), x = ctx(f), k = Math.min(W / im.width, H / im.height), w = im.width * k, h = im.height * k;
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
      x.imageSmoothingQuality = 'high';
      x.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
      return f;
    });
  }

  /* ---------------------------------------------------------- demo pack: three small PDFs and two photos, made on the spot */
  async function demoPack() {
    const btn = $('demo');
    btn.disabled = true; btn.textContent = 'Making the demo files\u2026';
    try {
      const docs = [
        ['Week 1 - Kickoff', '# Week 1: Kickoff\n\nWe agreed on the goal: a converter that never uploads a file.\n\n## Decisions\n\n- Everything runs in the browser\n- No accounts, no limits\n- Start with PDFs, images and Word files\n'],
        ['Week 2 - Prototype', '# Week 2: Prototype\n\nThe first version converts PNG to JPG and PDF to images.\n\n## What broke\n\n- Tables came out stacked\n- Big PDFs were slow on phones\n\n> Fix tables before adding formats.\n'],
        ['Week 3 - Launch', '# Week 3: Launch\n\nShipped with 23 formats and a format matrix.\n\n| Metric | Value |\n|---|---|\n| Formats | 23 |\n| Files uploaded | 0 |\n'],
      ];
      const files = [];
      for (const [name, md] of docs) {
        const it = {file: new File([md], name + '.md'), name: name + '.md', stem: name, fmt: 'md'};
        const res = await convert(it, 'pdf', {quality: 90, dpi: 150, max: 0}, () => {});
        files.push(new File([res.outs[0].blob], name + '.pdf', {type: 'application/pdf'}));
      }
      for (const [name, hue] of [['Harbour at dusk', 18], ['Ridge line', 200]]) {
        const c = canvas(1200, 800), x = ctx(c), g = x.createLinearGradient(0, 0, 0, 800);
        g.addColorStop(0, `hsl(${hue},70%,72%)`); g.addColorStop(.6, `hsl(${hue + 25},60%,52%)`); g.addColorStop(1, `hsl(${hue + 200},40%,20%)`);
        x.fillStyle = g; x.fillRect(0, 0, 1200, 800);
        x.fillStyle = `hsl(${hue + 40},90%,88%)`; x.beginPath(); x.arc(380 + hue, 430, 120, 0, 7); x.fill();
        x.fillStyle = `hsl(${hue + 200},35%,14%)`; x.beginPath(); x.moveTo(0, 600);
        for (let i = 0; i <= 12; i++) x.lineTo(i * 100, 520 + Math.sin(i * 1.7 + hue) * 60);
        x.lineTo(1200, 800); x.lineTo(0, 800); x.fill();
        files.push(new File([await toBlob(c, 'image/jpeg', 0.9)], name + '.jpg', {type: 'image/jpeg'}));
      }
      const added = attach(files, true);
      bot([`Here\u2019s a demo pack: ${B(describe(added))}. Try one of these:`], ['Combine the PDFs into one Markdown file', 'Make a contact sheet of the photos', 'Make a GIF from the photos', 'Combine everything into one PDF']);
    } catch (e) { bot(`I couldn\u2019t make the demo files: ${esc(e.message)}`); }
    btn.disabled = false; btn.textContent = 'Try the demo pack';
  }

  /* ---------------------------------------------------------- composer */
  function grow() { say.style.height = 'auto'; say.style.height = Math.min(say.scrollHeight, 180) + 'px'; }
  say.addEventListener('input', grow);
  addEventListener('resize', grow);
  grow();
  say.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(say.value); } });
  $('composer').addEventListener('submit', e => { e.preventDefault(); submit(say.value); });
  $('attach').onclick = () => pickC.click();
  pickC.onchange = () => { attach(pickC.files); pickC.value = ''; };
  $('demo').onclick = demoPack;
  document.querySelectorAll('#chat-intro .saychip').forEach(b => b.onclick = () => {
    if (S.files.length) submit(b.textContent);
    else { say.value = b.textContent; grow(); say.focus(); bot('Attach files first, then press Enter. Or try the demo pack.'); }
  });
  say.addEventListener('paste', e => { const f = e.clipboardData?.files; if (f?.length) { e.preventDefault(); attach(f); } });
  // files dropped anywhere while the chat is open go to the chat, not the converter
  const over = $('chat-over');
  let depth = 0;
  const inChat = () => document.body.dataset.view === 'chat';
  document.addEventListener('dragenter', e => { if (inChat() && e.dataTransfer?.types.includes('Files')) { depth++; over.hidden = false; e.stopImmediatePropagation(); } }, true);
  document.addEventListener('dragleave', e => { if (inChat()) { depth = Math.max(0, depth - 1); if (!depth) over.hidden = true; e.stopImmediatePropagation(); } }, true);
  document.addEventListener('drop', e => {
    if (!inChat()) return;
    e.preventDefault(); e.stopImmediatePropagation(); depth = 0; over.hidden = true;
    if (e.dataTransfer?.files.length) attach(e.dataTransfer.files);
  }, true);
})();
