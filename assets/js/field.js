/* =========================================================
   Единое 3D поле из контурных треугольников на всю страницу.
   Холст закреплён за контентом. Элементы с data-formation задают,
   какую фигуру частицы собирают рядом с ними:
     atom | core | ring | lattice | perimeter — фигура в рамке элемента
     scatter — облако на весь экран, сквозь которое летит камера
   data-alpha — яркость фигуры (0…1).
   При скролле частицы плавно перетекают от фигуры к фигуре,
   каждая фигура медленно вращается в 3D.
   На телефонах частиц меньше, а если кадры не успевают
   отрисовываться, качество снижается само.
   ========================================================= */
(function () {
  const anchors = Array.from(document.querySelectorAll('[data-formation]'));
  if (!anchors.length) return;

  const PALETTE = ['#8052FF', '#B49BFF', '#FFB829', '#2DD4AE', '#15846E', '#FF5FD2', '#4D7CFF', '#FFFFFF'];
  const WEIGHTS = [4.5, 2.6, 3.4, 1.5, 0.8, 1.2, 1.8, 1.2];
  const BUCKETS = 6;
  const TAU = Math.PI * 2;
  const CAM = 3; // расстояние камеры до центра фигуры
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const small = window.matchMedia('(max-width: 640px)').matches;
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;

  const rand = (a, b) => a + Math.random() * (b - a);
  const gauss = () => {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  const pick = () => {
    let r = Math.random() * WEIGHTS.reduce((s, w) => s + w, 0);
    for (let i = 0; i < WEIGHTS.length; i++) { r -= WEIGHTS[i]; if (r <= 0) return i; }
    return 0;
  };
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeInOut = (v) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);
  const easeOut = (v) => 1 - Math.pow(1 - v, 3);
  // сглаживание, не зависящее от частоты кадров: k — «жёсткость» в 1/с
  const follow = (k, dt) => 1 - Math.exp(-k * dt);

  /* ---------- Холст ---------- */
  const canvas = document.createElement('canvas');
  canvas.className = 'particle-field';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  let W = 0, H = 0, dpr = 1, dprCap = small || lowEnd ? 1.25 : 1.5;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  };

  /* ---------- Частицы: у каждой свой набор случайных чисел ---------- */
  const N = small ? (lowEnd ? 450 : 650) : (lowEnd ? 1300 : 2000);
  const P = [];
  for (let i = 0; i < N; i++) {
    P.push({
      r: [Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random()],
      g: [gauss(), gauss(), gauss()],
      size: rand(1.4, 3.4) * (small ? 1.15 : 1), color: pick(), alpha: rand(0.55, 1),
      tw: rand(0.6, 2.2), tp: rand(0, TAU), rot: rand(0, TAU), rs: rand(-0.5, 0.5),
      delay: Math.random(), ox: 0, oy: 0, sx: NaN, sy: NaN, sk: 1, sa: 0, lite: Math.random() < 0.5,
    });
  }
  P.sort((a, b) => a.color - b.color);

  /* ---------- Подписи: модели и технологии летят вместе с частицами ---------- */
  const LABELS = [
    'LLM', 'RAG', 'ChatGPT', 'DeepSeek', 'Qwen', 'LLaMA', 'Mistral', 'vLLM',
    'pgvector', 'Qdrant', 'Milvus', 'PostgreSQL', 'AI Gateway', 'DLP', 'RBAC', 'SSO',
    'SIEM', 'Edge AI', 'Computer Vision', 'Air‑Gap', 'Zero Trust', 'NVIDIA H100', 'DGX',
    'RTX 6000', 'CUDA', 'Embeddings', 'Fine‑tuning', 'AI Agents', 'Python', '152‑ФЗ',
  ];
  const LABEL_COLORS = ['#FFFFFF', '#FFB829', '#B49BFF', '#2DD4AE'];
  const labelled = [];
  {
    // подписи вешаем на частицы орбит, чтобы они кружили по фигуре
    const pool = P.filter((q) => q.r[0] < 0.6 && !q.lite).sort(() => Math.random() - 0.5);
    const count = small ? 10 : LABELS.length;
    for (let i = 0; i < count && i < pool.length; i++) {
      pool[i].label = LABELS[i];
      pool[i].labelColor = LABEL_COLORS[i % LABEL_COLORS.length];
      labelled.push(pool[i]);
    }
  }

  const dirOf = (g) => { const l = Math.hypot(g[0], g[1], g[2]) || 1; return [g[0] / l, g[1] / l, g[2] / l]; };

  /* ---------- Фигуры: (частица, время) → [x, y, z, яркость] ---------- */
  const FORMS = {
    atom(q, T) {
      const [u, r1, r2, r3] = q.r;
      if (u < 0.6) { // три орбиты, как в знаке бренда
        const k = Math.floor(r1 * 3);
        const tilt = [0.21, 1.26, 2.30][k];
        const phi = r2 * TAU + T * 0.16 * (k % 2 ? 1 : -1);
        const x = 0.95 * Math.cos(phi), y = 0.34 * Math.sin(phi) + q.g[0] * 0.028;
        const c = Math.cos(tilt), s = Math.sin(tilt);
        return [x * c - y * s, x * s + y * c, 0.32 * Math.sin(phi) + q.g[1] * 0.02, 1];
      }
      if (u < 0.85) { // ядро
        const d = dirOf(q.g), r = 0.26 * Math.cbrt(r3);
        return [d[0] * r, d[1] * r, d[2] * r, 1];
      }
      const d = dirOf(q.g), r = 1.15 + r3 * 0.6; // редкая оболочка
      return [d[0] * r, d[1] * r * 0.8, d[2] * r, 0.3];
    },
    core(q, T) {
      const [u, , r2] = q.r;
      if (u < 0.75) return [q.g[0] * 0.27, q.g[1] * 0.27, q.g[2] * 0.27, 1];
      const phi = r2 * TAU + T * 0.12;
      return [0.85 * Math.cos(phi), q.g[0] * 0.03 + 0.12 * Math.sin(phi), 0.85 * Math.sin(phi), 0.8];
    },
    ring(q, T) {
      const [u, , r2] = q.r;
      const torus = (R, tilt, dir) => {
        const phi = r2 * TAU + T * 0.12 * dir;
        const x = (R + q.g[0] * 0.04) * Math.cos(phi), z = (R + q.g[0] * 0.04) * Math.sin(phi), y = q.g[1] * 0.035;
        const c = Math.cos(tilt), s = Math.sin(tilt);
        return [x, y * c - z * s, y * s + z * c, 1];
      };
      if (u < 0.55) return torus(0.9, 1.15, 1);
      if (u < 0.8) return torus(0.55, -0.7, -1);
      return [q.g[0] * 0.12, q.g[1] * 0.12, q.g[2] * 0.12, 1];
    },
    lattice(q) {
      // кластер 3×3×3: при вращении видно, что это объёмная серверная стойка узлов
      const [u, r1, r2, r3] = q.r;
      const S = 0.5;
      if (u < 0.85) {
        const n = Math.floor(r1 * 27);
        return [((n % 3) - 1) * S + q.g[0] * 0.05, (Math.floor(n / 3) % 3 - 1) * S + q.g[1] * 0.05, (Math.floor(n / 9) - 1) * S + q.g[2] * 0.05, 1];
      }
      // связи вдоль осей
      const axis = Math.floor(r1 * 3), a = Math.floor(r3 * 3) - 1, b = Math.floor(((r3 * 3) % 1) * 3) - 1;
      const t = (r2 * 2 - 1) * S;
      if (axis === 0) return [t, a * S, b * S, 0.55];
      if (axis === 1) return [a * S, t, b * S, 0.55];
      return [a * S, b * S, t, 0.55];
    },
    perimeter(q, T) {
      const [u, , r2] = q.r;
      if (u < 0.62) {
        // равномерно по сторонам квадрата, частицы медленно обходят контур
        const s = (r2 * 4 + T * 0.03) % 4, side = Math.floor(s), v = (s - side) * 1.72 - 0.86;
        const k = 0.86 + q.g[0] * 0.018;
        const pts = [[v, -k], [k, v], [-v, k], [-k, -v]];
        return [pts[side][0], pts[side][1], q.g[1] * 0.06, 1];
      }
      if (u < 0.92) return [q.g[0] * 0.15, q.g[1] * 0.15, q.g[2] * 0.15, 1];
      const d = dirOf(q.g), r = 1.35 + q.r[3] * 0.3; // за периметром почти пусто
      return [d[0] * r, d[1] * r, d[2] * 0.3, 0.15];
    },
    scatter(q, T) {
      // Фон под текстом: редкое медленное облако, прижатое к краям экрана.
      // Участвует только треть частиц, остальные гаснут, чтобы не спорить с текстом.
      if (q.r[5] > 0.33) return [0, 0, 0, 0];
      const [, r1, r2, r3] = q.r;
      const span = 5.2;
      const z = ((r3 * span - T * 0.05) % span + span) % span - 2.2;
      const fade = clamp01((2.9 - z) * 1.2) * clamp01((z + 2.2) * 2);
      const sx = r1 * 2 - 1;
      const x = Math.sign(sx) * (0.55 + Math.abs(sx) * 1.35); // центр колонки текста свободен
      return [x, (r2 * 2 - 1) * 1.15, z, fade];
    },
  };

  /* ---------- Вращение фигур: (время, мышь) → [rx, ry, rz] ---------- */
  const SPIN = {
    // знак бренда не крутится полностью, иначе плоские орбиты схлопнутся в линию:
    // он медленно вращается в своей плоскости и покачивается в объёме
    atom: (T, mx, my) => [0.15 + my * 0.35 + Math.sin(T * 0.21) * 0.12, Math.sin(T * 0.27) * 0.6 + mx * 0.6, T * 0.07],
    core: (T, mx, my) => [0.3 + my * 0.3, T * 0.35 + mx * 0.5, 0],
    ring: (T, mx, my) => [0.2 + my * 0.3, T * 0.3 + mx * 0.5, Math.sin(T * 0.2) * 0.25],
    lattice: (T, mx, my) => [0.5 + Math.sin(T * 0.19) * 0.25 + my * 0.3, T * 0.28 + mx * 0.5, 0.12],
    perimeter: (T, mx, my) => [0.18 + my * 0.3 + Math.sin(T * 0.23) * 0.15, Math.sin(T * 0.31) * 0.55 + mx * 0.4, T * 0.06],
    scatter: (T, mx, my) => [my * 0.1, mx * 0.15, 0],
  };

  /* ---------- Указатель ---------- */
  let mx = 0, my = 0, tmx = 0, tmy = 0, px = -9999, py = -9999;
  if (finePointer && !reduceMotion) {
    window.addEventListener('pointermove', (e) => {
      tmx = e.clientX / W - 0.5; tmy = e.clientY / H - 0.5;
      px = e.clientX; py = e.clientY;
    }, { passive: true });
    document.addEventListener('pointerleave', () => { px = py = -9999; });
  }

  /* ---------- Геометрия якорей ---------- */
  const anchorInfo = () => anchors.map((el) => {
    const r = el.getBoundingClientRect();
    const name = el.dataset.formation;
    const fixed = name === 'scatter';
    return {
      form: FORMS[name] || FORMS.atom,
      spin: SPIN[name] || SPIN.atom,
      fixed,
      alpha: el.dataset.alpha ? Number(el.dataset.alpha) : 1,
      // под текстом: мелкие треугольники, без подписей и без мерцания
      cap: fixed ? 7 : 26,
      labels: fixed ? 0 : 1,
      twinkle: fixed ? 0.15 : 0.45,
      center: r.top + r.height / 2,
      cx: fixed ? W / 2 : r.left + r.width / 2,
      cy: fixed ? H / 2 : r.top + r.height / 2,
      S: fixed ? Math.max(W, H) * 0.5 : Math.min(r.width, r.height) * 0.46,
    };
  });

  // поворот (в плоскости, вокруг вертикали, вокруг горизонтали) и перспектива
  const project = (p, A, rot, out) => {
    const [rx, ry, rz] = rot;
    let x = p[0], y = p[1];
    const z = p[2];
    if (rz) { const c = Math.cos(rz), s = Math.sin(rz); const nx = x * c - y * s; y = x * s + y * c; x = nx; }
    const cy_ = Math.cos(ry), sy_ = Math.sin(ry);
    const x1 = x * cy_ + z * sy_, z1 = -x * sy_ + z * cy_;
    const cx_ = Math.cos(rx), sx_ = Math.sin(rx);
    const y1 = y * cx_ - z1 * sx_, z2 = y * sx_ + z1 * cx_;
    const zc = z2 + CAM;
    if (zc < 0.35) { out[3] = 0; return; }
    const k = CAM / zc;
    out[0] = A.cx + x1 * A.S * k;
    out[1] = A.cy + y1 * A.S * k;
    out[2] = k;
    // ближние ярче, дальние тонут в темноте: при вращении это даёт ощущение объёма
    out[3] = p[3] * A.alpha * Math.min(1, Math.max(0.2, 1.5 - (zc - CAM) * 0.4));
  };

  /* ---------- Качество: само снижается, если кадры тяжёлые ---------- */
  let quality = 2;              // 2 — полное, 1 — половина частиц, 0 — ещё и реже кадры
  let frameAvg = 16, frameCount = 0, skip = false;
  const degrade = () => {
    if (quality === 0) return;
    quality -= 1;
    if (quality === 1) { dprCap = 1; resize(); }
  };

  /* ---------- Кадр ---------- */
  let T = 0, last = 0, introT = reduceMotion ? 99 : 0, running = false, raf = 0;
  let gS = NaN; // сглаженная позиция «между якорями»
  const pa = [0, 0, 0, 0], pb = [0, 0, 0, 0];

  const draw = (dt) => {
    const info = anchorInfo();
    const ref = H * 0.5;
    // непрерывная позиция: целая часть — индекс якоря, дробная — путь до следующего
    let g = 0;
    const lastI = info.length - 1;
    if (ref >= info[lastI].center) g = lastI;
    else if (ref > info[0].center) {
      for (let i = 0; i < lastI; i++) {
        if (ref >= info[i].center && ref < info[i + 1].center) {
          g = i + (ref - info[i].center) / (info[i + 1].center - info[i].center); break;
        }
      }
    }
    gS = Number.isNaN(gS) || dt === 0 ? g : gS + (g - gS) * follow(5, dt);
    const a = Math.min(lastI, Math.floor(gS)), b = Math.min(lastI, a + 1), t = gS - a;
    const A = info[a], B = info[b];
    // перетекание занимает середину пути между якорями, чтобы частицы недолго висели над текстом
    const morph = clamp01((t - 0.28) / 0.44);

    const fm = follow(2.5, dt);
    mx += (tmx - mx) * fm; my += (tmy - my) * fm;
    const rotA = A.spin(T, mx, my), rotB = B.spin(T, mx, my);
    const R = 120, R2 = R * R;
    const inertia = dt === 0 ? 1 : follow(small ? 16 : 11, dt);
    const repel = follow(6, dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = small ? 1.2 : 1.1;

    for (const q of P) {
      if (quality < 2 && q.lite) { q.b = -1; continue; }
      const tt = A === B ? 0 : easeInOut(clamp01(morph * 1.6 - q.delay * 0.6));
      project(A.form(q, T), A, rotA, pa);
      let x = pa[0], y = pa[1], k = pa[2], al = pa[3];
      if (tt > 0) {
        project(B.form(q, T), B, rotB, pb);
        if (al === 0) { x = pb[0]; y = pb[1]; k = pb[2]; }
        else if (pb[3] !== 0) { x += (pb[0] - x) * tt; y += (pb[1] - y) * tt; k += (pb[2] - k) * tt; }
        al += (pb[3] - al) * tt;
      }
      // в полёте между фигурами частицы приглушены, подписи скрыты
      const flight = Math.sin(Math.PI * tt);
      al *= 1 - 0.75 * flight;

      // сборка при загрузке: частицы слетаются издалека
      if (introT < 3) {
        const it = easeOut(clamp01((introT - q.delay * 0.9) / 1.9));
        const ang = q.r[4] * TAU, far = Math.max(W, H) * (0.7 + q.r[5] * 0.6);
        x = W / 2 + Math.cos(ang) * far * (1 - it) + (x - W / 2) * it;
        y = H / 2 + Math.sin(ang) * far * (1 - it) + (y - H / 2) * it;
        al *= it;
      }

      // инерция: частица догоняет цель, а не прыгает в неё — отсюда плавность при скролле
      if (Number.isNaN(q.sx) || introT < 3) { q.sx = x; q.sy = y; q.sk = k; q.sa = al; }
      else {
        q.sx += (x - q.sx) * inertia; q.sy += (y - q.sy) * inertia;
        q.sk += (k - q.sk) * inertia; q.sa += (al - q.sa) * inertia;
      }

      // частицы расступаются вокруг курсора и вспыхивают
      let tox = 0, toy = 0, boost = 1;
      const dx = q.sx - px, dy = q.sy - py, d2 = dx * dx + dy * dy;
      if (d2 < R2) {
        const d = Math.sqrt(d2) || 1, f = 1 - d / R;
        tox = (dx / d) * f * f * 46; toy = (dy / d) * f * f * 46; boost = 1 + f * 1.4;
      }
      q.ox += (tox - q.ox) * repel; q.oy += (toy - q.oy) * repel;

      q.px = q.sx + q.ox; q.py = q.sy + q.oy;
      const cap = A.cap + (B.cap - A.cap) * tt;
      const tw = A.twinkle + (B.twinkle - A.twinkle) * tt;
      q.ps = Math.min(cap, q.size * q.sk);
      q.pk = q.sk;
      q.pa = q.sa * boost * (A.labels + (B.labels - A.labels) * tt) * (1 - flight);
      const a2 = q.sa * q.alpha * boost * (1 - tw + tw * Math.sin(T * q.tw + q.tp));
      q.b = a2 <= 0.02 || q.px < -40 || q.px > W + 40 || q.py < -40 || q.py > H + 40
        ? -1 : Math.min(BUCKETS - 1, Math.floor(a2 * BUCKETS));
      q.pr = q.rot + T * q.rs;
    }

    // отрисовка пачками: цвет × уровень прозрачности
    let start = 0;
    while (start < P.length) {
      const color = P[start].color;
      let end = start;
      while (end < P.length && P[end].color === color) end++;
      ctx.strokeStyle = PALETTE[color];
      for (let bk = 0; bk < BUCKETS; bk++) {
        ctx.globalAlpha = (bk + 1) / BUCKETS;
        ctx.beginPath();
        for (let i = start; i < end; i++) {
          const q = P[i];
          if (q.b !== bk) continue;
          const r = q.ps, a0 = q.pr;
          ctx.moveTo(q.px + Math.cos(a0) * r, q.py + Math.sin(a0) * r);
          ctx.lineTo(q.px + Math.cos(a0 + 2.094) * r, q.py + Math.sin(a0 + 2.094) * r);
          ctx.lineTo(q.px + Math.cos(a0 + 4.189) * r, q.py + Math.sin(a0 + 4.189) * r);
          ctx.closePath();
        }
        ctx.stroke();
      }
      start = end;
    }

    // подписи: размер растёт с приближением к камере, как у треугольников
    if (quality > 0) {
      ctx.textBaseline = 'middle';
      let lastFont = '';
      for (const q of labelled) {
        if (q.b < 0 || q.pa <= 0.03) continue;
        const fs = Math.round(Math.max(10, Math.min(30, 12 * q.pk)));
        const font = `300 ${fs}px Unbounded, Onest, system-ui, sans-serif`;
        if (font !== lastFont) { ctx.font = font; lastFont = font; }
        ctx.globalAlpha = Math.min(0.9, q.pa * 0.85);
        ctx.fillStyle = q.labelColor;
        ctx.fillText(q.label, q.px + q.ps + 6, q.py);
      }
    }
    ctx.globalAlpha = 1;
  };

  // открыты меню или форма: поле закрыто, рисовать незачем
  const covered = () => document.documentElement.dataset.overlay === 'on';

  const frame = (now) => {
    const raw = now - last;
    const dt = Math.min(0.05, raw / 1000 || 0);
    last = now;
    if (!covered()) {
      // на слабом устройстве рисуем через кадр, но время идёт честно
      skip = quality === 0 ? !skip : false;
      T += dt; introT += dt;
      if (!skip) {
        const t0 = performance.now();
        draw(quality === 0 ? dt * 2 : dt);
        // среднее время отрисовки; после сборки при загрузке проверяем, тянет ли устройство
        frameAvg += (performance.now() - t0 - frameAvg) * 0.05;
        if (introT > 3 && ++frameCount % 90 === 0 && frameAvg > 9) degrade();
      }
    }
    if (running) raf = requestAnimationFrame(frame);
  };
  const play = () => { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); };
  const pause = () => { running = false; cancelAnimationFrame(raf); };

  resize();
  window.addEventListener('resize', () => { resize(); if (!running) draw(0); });
  if (reduceMotion) {
    // без анимации: фигура просто следует за скроллом, без вращения и мерцания
    let pending = false;
    window.addEventListener('scroll', () => {
      if (pending) return; pending = true;
      requestAnimationFrame(() => { pending = false; draw(0); });
    }, { passive: true });
    draw(0);
  } else {
    document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
    play();
  }
})();
