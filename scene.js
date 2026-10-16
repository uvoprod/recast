/* Recast hero scene.
   Sheets stand on a machine bed and pass, one at a time, through a scanning gate at x = 0.
   Every sheet carries two textures; a shader shows the input texture on the near side of the
   gate and the output texture past it, so a sheet is rewritten exactly where it crosses the light.
   The page drives it through window.Stage: setFormats(), pulse() on real progress, state(). */
(() => {
  const host = document.getElementById('stage');
  const cvs = document.getElementById('gl');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const labelFns = [];
  const Stage = window.Stage = {setFormats() {}, pulse() {}, state() {}, onLabel(fn) { labelFns.push(fn); }};

  let gl = false;
  try { gl = !!(cvs.getContext('webgl2') || cvs.getContext('webgl')); } catch {}
  if (!window.THREE || !gl) { document.documentElement.classList.add('no-gl'); return; }
  const T = THREE;

  /* ---------------------------------------------------------- palette (matches the page tokens) */
  const C = {paper: 0xe8e9e4, ink: 0x141614, signal: new T.Color('#2338f5'), error: new T.Color('#c2321f'), frame: 0x8a8f89};

  /* ---------------------------------------------------------- renderer, camera, lights */
  const renderer = new T.WebGLRenderer({canvas: cvs, antialias: true, alpha: true, powerPreference: 'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 1.75));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const scene = new T.Scene();
  scene.fog = new T.Fog(C.paper, 13, 24);
  const camera = new T.PerspectiveCamera(28, 1, 0.1, 60);
  const camRest = new T.Vector3(0, 1.35, 10.5);
  let lookY = 0.6; // looking above the bed drops the machine into the lower half of the hero

  scene.add(new T.HemisphereLight(0xffffff, 0xd9dcd4, 0.95));
  const sun = new T.DirectionalLight(0xffffff, 1.25);
  sun.position.set(-3.5, 6.5, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left: -6, right: 6, top: 4, bottom: -3, near: 1, far: 20});
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const gateLight = new T.PointLight(C.signal, 0, 3.2, 2);
  gateLight.position.set(0, 0.2, 0.9);
  scene.add(gateLight);

  /* ---------------------------------------------------------- machine bed */
  const FLOOR = -0.93;
  const floor = new T.Mesh(new T.PlaneGeometry(40, 40), new T.ShadowMaterial({opacity: 0.15}));
  floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR; floor.receiveShadow = true;
  scene.add(floor);
  const grid = [];
  for (let x = -7; x <= 7.001; x += 0.5) grid.push(x, FLOOR + 0.001, -4, x, FLOOR + 0.001, 2.5);
  for (let z = -4; z <= 2.501; z += 0.5) grid.push(-7, FLOOR + 0.001, z, 7, FLOOR + 0.001, z);
  const gridGeo = new T.BufferGeometry();
  gridGeo.setAttribute('position', new T.Float32BufferAttribute(grid, 3));
  scene.add(new T.LineSegments(gridGeo, new T.LineBasicMaterial({color: C.ink, transparent: true, opacity: 0.075})));
  const rails = new T.BufferGeometry();
  rails.setAttribute('position', new T.Float32BufferAttribute([-7, FLOOR + 0.002, 0.42, 7, FLOOR + 0.002, 0.42, -7, FLOOR + 0.002, -1.6, 7, FLOOR + 0.002, -1.6], 3));
  scene.add(new T.LineSegments(rails, new T.LineBasicMaterial({color: C.ink, transparent: true, opacity: 0.22})));

  /* ---------------------------------------------------------- the gate */
  const gate = new T.Group();
  scene.add(gate);
  const frameMat = new T.MeshStandardMaterial({color: C.frame, roughness: 0.45, metalness: 0.55});
  const H = 2.75, D = 2.6;
  const post = new T.Mesh(new T.BoxGeometry(0.045, H, 0.045), frameMat);
  post.position.set(0, FLOOR + H / 2, -D / 2 - 0.55); post.castShadow = true; gate.add(post);
  const beam = new T.Mesh(new T.BoxGeometry(0.045, 0.045, D + 0.045), frameMat);
  beam.position.set(0, FLOOR + H, -0.55); beam.castShadow = true; gate.add(beam);
  const curtainU = {uTime: {value: 0}, uColor: {value: C.signal.clone()}, uGlow: {value: 1}, uGrow: {value: 0}};
  const curtain = new T.Mesh(new T.PlaneGeometry(D, H), new T.ShaderMaterial({
    uniforms: curtainU, transparent: true, depthWrite: false, side: T.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime, uGlow, uGrow; uniform vec3 uColor;
      void main(){
        if (vUv.y > uGrow) discard;
        float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
        float a = 0.05 + 0.20 * pow(1.0 - vUv.y, 2.2);
        a += 0.045 * step(0.62, fract(vUv.y * 70.0 - uTime * 0.35));
        a += 0.35 * smoothstep(0.012, 0.0, abs(vUv.y - uGrow + 0.004));
        gl_FragColor = vec4(uColor, a * edge * uGlow);
      }`,
  }));
  curtain.rotation.y = Math.PI / 2; curtain.position.set(0, FLOOR + H / 2, -0.55);
  gate.add(curtain);
  const sillMat = new T.MeshBasicMaterial({color: C.signal.clone(), fog: false});
  const edge = new T.Mesh(new T.BoxGeometry(0.014, H, 0.014), sillMat); // the leading edge of the light
  edge.position.set(0, FLOOR + H / 2, D / 2 - 0.55);
  gate.add(edge);
  // a soft haze around the beam, facing the viewer; it brightens while a sheet is being rewritten
  const haze = new T.Mesh(new T.PlaneGeometry(0.9, H), new T.ShaderMaterial({
    uniforms: curtainU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uGlow, uGrow; uniform vec3 uColor;
      void main(){
        if (vUv.y > uGrow) discard;
        float a = exp(-abs(vUv.x - 0.5) * 16.0) * (0.35 + 0.65 * (1.0 - vUv.y)) * 0.16 * uGlow;
        gl_FragColor = vec4(uColor, a);
      }`,
  }));
  haze.position.set(0, FLOOR + H / 2, D / 2 - 0.5);
  gate.add(haze);
  const sill = new T.Mesh(new T.BoxGeometry(0.018, 0.006, D), sillMat);
  sill.position.set(0, FLOOR + 0.003, -0.55);
  gate.add(sill);

  /* ---------------------------------------------------------- sheet faces, drawn per format */
  const KIND = {png: 'image', jpg: 'image', webp: 'image', gif: 'image', bmp: 'image', tiff: 'image', ico: 'image', heic: 'image', avif: 'image', image: 'image',
    svg: 'vector', pdf: 'pdf', docx: 'doc', odt: 'doc', pptx: 'slides', html: 'markup', md: 'markup', txt: 'markup',
    xlsx: 'sheet', ods: 'sheet', csv: 'sheet', tsv: 'sheet', json: 'code', epub: 'book'};
  const texCache = new Map();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function rng(seed) { let s = seed * 7919 + 13; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function face(fmt, seed, out) {
    const key = `${fmt}|${seed}|${out}`;
    if (texCache.has(key)) return texCache.get(key);
    const W = 512, Hh = 724, c = document.createElement('canvas');
    c.width = W; c.height = Hh;
    const kind = KIND[fmt] || 'doc', x = c.getContext('2d'), r = rng(seed * 31 + kind.length);
    const ink = '#1b1e1b', mid = '#b6bab3', soft = '#e2e4df', sig = '#2338f5';
    const bar = (X, Y, w, h, col) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
    const lines = (X, Y, w, n, gap = 19, h = 7, col = mid) => { for (let i = 0; i < n; i++) bar(X, Y + i * gap, i === n - 1 ? w * (0.3 + r() * 0.4) : w * (0.84 + r() * 0.16), h, col); return Y + n * gap; };
    x.fillStyle = '#fbfbf8'; x.fillRect(0, 0, W, Hh);
    if (kind === 'image') {
      const hue = Math.floor(r() * 360);
      const g = x.createLinearGradient(0, 24, 0, 700);
      g.addColorStop(0, `hsl(${hue},48%,80%)`); g.addColorStop(0.58, `hsl(${(hue + 28) % 360},58%,63%)`); g.addColorStop(1, `hsl(${(hue + 190) % 360},30%,24%)`);
      x.fillStyle = g; x.fillRect(24, 24, 464, 676);
      x.fillStyle = `hsl(${(hue + 45) % 360},85%,90%)`; x.beginPath(); x.arc(140 + r() * 230, 300 + r() * 80, 54 + r() * 36, 0, 7); x.fill();
      x.fillStyle = `hsl(${(hue + 190) % 360},28%,19%)`; x.beginPath(); x.moveTo(24, 540);
      for (let i = 0; i <= 8; i++) x.lineTo(24 + i * 58, 470 + r() * 100);
      x.lineTo(488, 700); x.lineTo(24, 700); x.fill();
    } else if (kind === 'vector') {
      x.strokeStyle = ink; x.lineWidth = 6;
      x.beginPath(); x.arc(256, 300, 140, 0, 7); x.stroke();
      x.fillStyle = sig; x.beginPath(); x.moveTo(256, 190); x.lineTo(370, 400); x.lineTo(142, 400); x.closePath(); x.fill();
      bar(96, 520, 320, 6, ink); bar(96, 548, 220, 6, mid);
    } else if (kind === 'sheet') {
      const cols = 4, rows = 16, cw = 400 / cols, rh = 36;
      bar(56, 64, 400, rh, soft);
      x.strokeStyle = '#c9ccc5'; x.lineWidth = 2;
      for (let i = 0; i <= rows; i++) { x.beginPath(); x.moveTo(56, 64 + i * rh); x.lineTo(456, 64 + i * rh); x.stroke(); }
      for (let j = 0; j <= cols; j++) { x.beginPath(); x.moveTo(56 + j * cw, 64); x.lineTo(56 + j * cw, 64 + rows * rh); x.stroke(); }
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) bar(56 + j * cw + 10, 64 + i * rh + 14, (j ? 30 + r() * 50 : 50 + r() * 30), 8, i ? mid : ink);
    } else if (kind === 'markup' || kind === 'code') {
      x.font = '600 24px ui-monospace, Menlo, monospace';
      let y = 76;
      const glyph = (s, X, col) => { x.fillStyle = col; x.fillText(s, X, y); };
      if (kind === 'code') {
        glyph('{', 48, ink); y += 34;
        for (let i = 0; i < 12; i++) { bar(84, y - 14, 70 + r() * 60, 9, sig); bar(190 + r() * 20, y - 14, 80 + r() * 140, 9, mid); y += 34; }
        glyph('}', 48, ink);
      } else {
        glyph('#', 48, sig); bar(84, y - 16, 230, 14, ink); y += 52;
        for (let k = 0; k < 3; k++) {
          for (let i = 0; i < 4; i++) { bar(48, y - 12, 400 * (0.8 + r() * 0.2), 8, mid); y += 24; }
          y += 16;
          if (k === 0) { for (let i = 0; i < 3; i++) { glyph('-', 48, sig); bar(78, y - 12, 180 + r() * 160, 8, mid); y += 28; } y += 14; }
          if (k === 1) { glyph('##', 48, sig); bar(100, y - 14, 170, 12, ink); y += 44; }
        }
      }
    } else if (kind === 'book') {
      bar(196, 92, 120, 6, mid); bar(126, 120, 260, 18, ink);
      bar(56, 190, 56, 56, ink);
      let y = 194;
      for (let i = 0; i < 22; i++) { const X = i < 3 ? 126 : 56; bar(X, y, 456 - X, 7, mid); y += 21; }
      bar(244, 680, 24, 6, mid);
    } else if (kind === 'slides') {
      for (let i = 0; i < 3; i++) {
        const Y = 48 + i * 214; x.strokeStyle = '#c9ccc5'; x.lineWidth = 3; x.strokeRect(48, Y, 416, 190);
        bar(72, Y + 28, 220, 14, ink); lines(72, Y + 66, 260, 4, 22, 7);
        bar(352, Y + 66, 88, 96, i === 1 ? sig : soft);
      }
    } else { // doc / pdf
      let y = 76;
      bar(56, y, 240, 22, ink); y += 50;
      y = lines(56, y, 400, 5) + 22;
      if (r() > 0.35) { bar(56, y, 400, 150, soft); bar(56, y + 150, 400, 4, mid); y += 176; }
      bar(56, y, 160, 12, ink); y += 30;
      y = lines(56, y, 400, 6) + 22;
      lines(56, y, 400, 3);
      if (kind === 'pdf') bar(244, 682, 24, 6, mid);
    }
    if (out) bar(0, 0, 6, Hh, sig); // converted sheets carry a blue registration edge
    // format stamp: graphite on raw input, signal blue once converted
    const tag = '.' + fmt.toUpperCase();
    x.font = '600 26px "Martian Mono", ui-monospace, Menlo, monospace';
    const tw = x.measureText(tag).width + 24;
    x.fillStyle = out ? sig : ink; x.fillRect(W - 24 - tw, Hh - 64, tw, 40);
    x.fillStyle = '#ffffff'; x.textBaseline = 'middle'; x.fillText(tag, W - 24 - tw + 12, Hh - 43);
    x.textBaseline = 'alphabetic';
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding; t.anisotropy = maxAniso;
    texCache.set(key, t);
    return t;
  }

  /* ---------------------------------------------------------- sheets */
  const shared = {gateX: {value: 0}, glow: {value: 1}, gateColor: {value: C.signal.clone()}};
  const SW = 1.3, SH = 1.84, N_IN = 5, N_OUT = 4;
  const sheetGeo = new T.BoxGeometry(SW, SH, 0.012);
  function sheetMaterial(mapA, mapB) {
    const m = new T.MeshStandardMaterial({map: mapA, roughness: 0.82, metalness: 0});
    m.userData.mapB = {value: mapB};
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, shared, {mapB: m.userData.mapB});
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform sampler2D mapB; uniform float gateX, glow; uniform vec3 gateColor;')
        .replace('#include <map_fragment>', `#ifdef USE_MAP
            float past = step(gateX, vWPos.x);
            diffuseColor *= mix(texture2D(map, vUv), texture2D(mapB, vUv), past);
          #endif`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float gd = abs(vWPos.x - gateX);
            totalEmissiveRadiance += gateColor * (smoothstep(0.03, 0.0, gd) * 1.6 + smoothstep(0.22, 0.0, gd) * 0.12) * glow;`);
    };
    return m;
  }
  const slotIn = i => ({x: -2.75 - i * 0.17, y: 0, z: -i * 0.34, ry: 0.4, rz: (i % 2 ? -1 : 1) * 0.01});
  const slotOut = i => ({x: 2.75 + i * 0.17, y: 0, z: -i * 0.34, ry: -0.4, rz: (i % 2 ? 1 : -1) * 0.01});

  const IDLE_PAIRS = [['heic', 'jpg'], ['docx', 'pdf'], ['pdf', 'png'], ['xlsx', 'csv'], ['md', 'epub'], ['pdf', 'docx'], ['png', 'webp'], ['pptx', 'pdf']];
  let pairIdx = 0, userPair = null, recycled = 0;
  const pairNow = () => userPair || IDLE_PAIRS[pairIdx];

  const sheets = [], inQ = [], outQ = [];
  for (let i = 0; i < N_IN + N_OUT; i++) {
    const pair = i < N_IN ? IDLE_PAIRS[0] : IDLE_PAIRS[IDLE_PAIRS.length - 1];
    const s = {seed: i % 3, pair, anim: null, scale: 1};
    s.mesh = new T.Mesh(sheetGeo, sheetMaterial(face(pair[0], s.seed, false), face(pair[1], s.seed, true)));
    s.mesh.castShadow = true;
    scene.add(s.mesh);
    sheets.push(s);
    (i < N_IN ? inQ : outQ).push(s);
  }
  function dress(s, pair) {
    s.pair = pair;
    s.mesh.material.map = face(pair[0], s.seed, false);
    s.mesh.material.userData.mapB.value = face(pair[1], s.seed, true);
  }
  function place(s, p) {
    s.mesh.position.set(p.x, p.y, p.z);
    s.mesh.rotation.set(0, p.ry, p.rz || 0);
  }
  const slotOf = s => { const i = inQ.indexOf(s); if (i >= 0) return slotIn(i); const o = outQ.indexOf(s); return o >= 0 ? slotOut(o) : null; };
  inQ.forEach((s, i) => place(s, slotIn(i)));
  outQ.forEach((s, i) => place(s, slotOut(i)));

  /* ---------------------------------------------------------- motion */
  const ease = {
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: t => { const c = 1.35; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  };
  // travel curve: smooth start and stop, deliberately slow while the sheet crosses the gate
  const travel = p => { const u = ease.inOutSine(p); return u + 0.62 * Math.sin(2 * Math.PI * u) / (2 * Math.PI); };
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

  let mode = 'idle', pending = 0, lastStart = -1e9, nextIdle = 0, flare = 0, errAt = -1e9;
  const START = performance.now();
  const ENTRANCE = reduce ? 0 : 2300;

  function startTransit(now) {
    const s = inQ.shift();
    if (!s) return;
    const a = {x: s.mesh.position.x, y: s.mesh.position.y, z: s.mesh.position.z, ry: s.mesh.rotation.y};
    const b = slotOut(0);
    s.anim = {kind: 'transit', t0: now, dur: mode === 'work' ? 950 : 1900, a, b};
    lastStart = now;
    labelFns.forEach(fn => fn(s.pair[0], s.pair[1]));
  }
  function land(s, now) {
    outQ.unshift(s);
    if (outQ.length > N_OUT) {
      const old = outQ.pop();
      old.anim = {kind: 'leave', t0: now, dur: 520};
    }
  }
  function recycle(s, now) {
    recycled++;
    if (!userPair && recycled % 3 === 0) pairIdx = (pairIdx + 1) % IDLE_PAIRS.length;
    dress(s, pairNow());
    inQ.push(s);
    place(s, slotIn(inQ.length - 1));
    s.anim = {kind: 'enter', t0: now, dur: 560};
  }

  const ptr = {x: 0, y: 0}, ptrT = {x: 0, y: 0};
  let scrollK = 0;
  const finePointer = matchMedia('(pointer: fine)').matches;
  if (finePointer && !reduce) addEventListener('pointermove', e => { ptrT.x = e.clientX / innerWidth * 2 - 1; ptrT.y = -(e.clientY / innerHeight * 2 - 1); }, {passive: true});

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now - START;
    curtainU.uTime.value = now / 1000;

    // camera: cinematic arrival, then pointer parallax and a scroll pull-back
    const arrive = ENTRANCE ? ease.outCubic(Math.min(1, t / 1900)) : 1;
    ptr.x = damp(ptr.x, ptrT.x, 3.2, dt); ptr.y = damp(ptr.y, ptrT.y, 3.2, dt);
    camera.position.set(
      camRest.x + ptr.x * 0.85,
      camRest.y + (1 - arrive) * 3.4 + ptr.y * 0.4 + scrollK * 1.1,
      camRest.z + (1 - arrive) * 4.5 + scrollK * 2.4);
    camera.lookAt(0, lookY - scrollK * 0.35, 0);

    // the gate draws itself upward during the entrance
    curtainU.uGrow.value = ENTRANCE ? ease.outCubic(Math.min(1, Math.max(0, (t - 250) / 900))) : 1;
    edge.scale.y = Math.max(0.001, curtainU.uGrow.value); edge.position.y = FLOOR + H * curtainU.uGrow.value / 2;
    sill.scale.z = Math.max(0.001, ENTRANCE ? ease.outCubic(Math.min(1, Math.max(0, (t - 150) / 700))) : 1);

    // schedule passes: a slow cadence when idle, driven by real progress while converting
    if (t > ENTRANCE) {
      if (mode === 'work') { if (pending > 0 && now - lastStart > 360 && inQ.length) { pending--; startTransit(now); } }
      else if (now > nextIdle && now - lastStart > 1900 && inQ.length) { startTransit(now); nextIdle = now + 2700; }
    }

    let nearest = 9;
    for (const [i, s] of sheets.entries()) {
      const m = s.mesh, A = s.anim;
      if (A) {
        const p = Math.min(1, (now - A.t0) / A.dur);
        if (A.kind === 'transit') {
          const u = travel(p), lift = Math.sin(Math.PI * p);
          m.position.set(A.a.x + (A.b.x - A.a.x) * u, A.a.y + lift * 0.3, A.a.z + (A.b.z - A.a.z) * u + lift * 0.45);
          m.rotation.set(0, A.a.ry + (A.b.ry - A.a.ry) * u, lift * 0.015);
          nearest = Math.min(nearest, Math.abs(m.position.x));
          if (p >= 1) { s.anim = null; land(s, now); }
        } else if (A.kind === 'leave') {
          s.scale = 1 - ease.outCubic(p); m.position.y = damp(m.position.y, -0.3, 6, dt);
          if (p >= 1) { s.scale = 0; s.anim = null; recycle(s, now); }
        } else if (A.kind === 'enter') {
          s.scale = ease.outCubic(p);
          if (p >= 1) { s.scale = 1; s.anim = null; }
        }
      }
      const target = (!s.anim || s.anim.kind !== 'transit') && slotOf(s);
      if (target) { // settle into slot
        if (t < ENTRANCE) { // sheets fall onto the bed one after another
          const q = Math.min(1, Math.max(0, (t - 480 - i * 85) / 720));
          place(s, {...target, y: target.y + (1 - ease.outBack(q)) * 3.2});
        } else {
          m.position.x = damp(m.position.x, target.x, 7, dt);
          m.position.y = damp(m.position.y, target.y, 9, dt);
          m.position.z = damp(m.position.z, target.z, 7, dt);
          m.rotation.y = damp(m.rotation.y, target.ry, 7, dt);
          m.rotation.z = damp(m.rotation.z, target.rz, 7, dt);
        }
      }
      m.scale.setScalar(Math.max(0.0001, s.scale));
      // idle breath: the decks never sit perfectly still
      if (!reduce && !s.anim) m.position.y += Math.sin(now / 1400 + i * 0.9) * 0.0035;
    }

    // gate response: brightens as a sheet crosses, flares on completion, turns red on an error
    flare = damp(flare, 0, 1.6, dt);
    const crossing = Math.max(0, 1 - nearest / 0.9);
    const errK = Math.max(0, 1 - (now - errAt) / 1100);
    const col = C.signal.clone().lerp(C.error, errK);
    shared.gateColor.value.copy(col); curtainU.uColor.value.copy(col); sillMat.color.copy(col); gateLight.color.copy(col);
    shared.glow.value = 0.75 + crossing * 0.6 + flare * 0.8;
    curtainU.uGlow.value = 0.8 + crossing * 0.7 + flare;
    gateLight.intensity = crossing * 1.6 + flare * 1.2;

    renderer.render(scene, camera);
  }

  /* ---------------------------------------------------------- sizing and the render loop */
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep both decks in frame on narrow screens
    camRest.z = Math.max(10.5, 4.45 / (Math.tan(T.MathUtils.degToRad(14)) * camera.aspect));
    lookY = camera.aspect < 1 ? 0.15 : h < 480 ? 0.55 : 1.05 + Math.min(0.35, Math.max(0, (h - 640) / 900));
    camera.updateProjectionMatrix();
    if (!running) frame(performance.now());
  }
  let running = false, visible = true;
  function loop(now) { if (!running) return; frame(now); requestAnimationFrame(loop); }
  function setRunning() {
    const want = !reduce && visible && !document.hidden;
    if (want && !running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
    if (!want) running = false;
  }
  new ResizeObserver(resize).observe(host);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; setRunning(); }, {threshold: 0}).observe(host);
  document.addEventListener('visibilitychange', setRunning);
  addEventListener('scroll', () => { scrollK = Math.min(1, Math.max(0, scrollY / Math.max(1, host.offsetHeight))); }, {passive: true});

  if (reduce) { // one composed still frame: a sheet halfway through the gate
    const s = inQ.shift();
    place(s, {x: 0.05, y: 0.25, z: 0.4, ry: 0, rz: 0});
    s.anim = null; sheets.splice(sheets.indexOf(s), 1);
    setTimeout(() => labelFns.forEach(fn => fn(s.pair[0], s.pair[1]))); // after the page has subscribed
  }
  resize();
  setRunning();
  document.fonts?.ready.then(() => { texCache.forEach(t => t.dispose()); texCache.clear(); sheets.forEach(s => dress(s, s.pair)); if (!running) frame(performance.now()); });
  document.documentElement.classList.add('gl');

  /* ---------------------------------------------------------- page API */
  Stage.setFormats = (from, to) => {
    userPair = from && to ? [from, to] : null;
    if (userPair) { inQ.forEach(s => dress(s, userPair)); nextIdle = 0; }
    if (!running) frame(performance.now());
  };
  Stage.pulse = () => { if (mode === 'work') pending = Math.min(pending + 1, 3); };
  Stage.state = st => {
    if (st === 'working') { mode = 'work'; pending = Math.max(pending, 1); }
    else { mode = 'idle'; pending = 0; nextIdle = performance.now() + 900; }
    if (st === 'done') flare = 1;
    if (st === 'error') errAt = performance.now();
    if (!running) frame(performance.now());
  };
})();
