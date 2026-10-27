/* =========================================================
   НАСТРОЙКИ — поменяйте перед публикацией
   ========================================================= */
const CONFIG = {
  // Личка в Telegram, куда приходит заявка. Посетителю откроется чат
  // с готовым текстом заявки, останется нажать «Отправить»
  telegramUrl: 'https://t.me/smitAnin',
  // Первая строка сообщения, по ней заявку видно среди других чатов
  telegramMark: 'Заявка с сайта',
  // Дополнительно слать заявку ботом через send.php (нужен PHP хостинг
  // и токен бота в send.php). Пустая строка — не слать
  endpoint: '',
  // Яндекс Метрика: номер счётчика и цель (если счётчик подключён)
  metrikaId: null,
  metrikaGoal: 'lead_form',
};

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Ссылка вида t.me/user?text=... открывает чат с заполненным сообщением
  const tgLink = (data) => {
    const lines = [
      CONFIG.telegramMark,
      `Компания: ${data.company.trim()}`,
      `Почта: ${data.email.trim()}`,
      `Телефон: ${data.phone.trim()}`,
    ];
    if (data.package) lines.push(`Интерес: ${data.package}`);
    return `${CONFIG.telegramUrl}?text=${encodeURIComponent(lines.join('\n'))}`;
  };

  /* ---------- Плавный скролл на компьютере (Lenis) ---------- */
  // На телефонах остаётся родной скролл: он и так плавный и не тратит батарею.
  let lenis = null;
  if (!reduceMotion && window.matchMedia('(pointer: fine) and (min-width: 1024px)').matches) {
    const s = document.createElement('script');
    s.src = 'assets/js/vendor/lenis.min.js';
    s.async = true;
    s.onload = () => {
      lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
      document.documentElement.classList.add('lenis');
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
      // якорные ссылки едут плавно и с тем же замедлением
      $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        const target = id.length > 1 ? $(id) : null;
        if (!target && id !== '#top') return;
        e.preventDefault();
        lenis.scrollTo(target || 0, { offset: -24, duration: 1.4 });
      }));
    };
    document.head.appendChild(s);
  }

  // Меню или форма закрывают страницу: блокируем скролл и ставим частицы на паузу
  const lockPage = (on) => {
    document.body.style.overflow = on ? 'hidden' : '';
    document.documentElement.dataset.overlay = on ? 'on' : 'off';
    if (lenis) { if (on) lenis.stop(); else lenis.start(); }
  };

  /* ---------- Мобильное меню ---------- */
  const burger = $('#burger');
  const menu = $('#mobile-menu');
  const setMenu = (open) => {
    document.documentElement.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    menu.setAttribute('aria-hidden', String(!open));
    lockPage(open);
    // Ссылки появляются по очереди: шаг 60 мс, вся цепочка не дольше 400 мс
    const links = $$('a, button', menu);
    const step = Math.min(60, 400 / links.length);
    links.forEach((a, i) => { a.style.transitionDelay = open ? `${i * step}ms` : '0ms'; });
  };
  burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));

  /* ---------- Появление секций ---------- */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  $$('.reveal').forEach((el) => revealIO.observe(el));

  /* ---------- Заголовки: слова поднимаются из-под маски ---------- */
  const splitWords = (node, list) => {
    Array.from(node.childNodes).forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const outer = document.createElement('span');
          outer.className = 'wrd';
          const inner = document.createElement('span');
          inner.className = 'wi';
          inner.textContent = part;
          outer.appendChild(inner);
          frag.appendChild(outer);
          list.push(inner);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') {
        splitWords(n, list);
      }
    });
  };
  const splitIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-split-in'); splitIO.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -12% 0px' });
  $$('main h1, main h2.h-section, main h2.h-display').forEach((h) => {
    if (h.closest('#lead-modal')) return;
    const words = [];
    splitWords(h, words);
    // шаг 45 мс между словами, вся цепочка не дольше 700 мс
    const step = Math.min(45, 700 / words.length);
    words.forEach((w, i) => { w.style.transitionDelay = `${120 + i * step}ms`; });
    h.classList.add('split');
    splitIO.observe(h);
  });

  /* ---------- Метки: янтарная черта вырастает слева ---------- */
  const labelIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); labelIO.unobserve(e.target); }
    });
  });
  $$('main p.label').forEach((l) => { l.classList.add('label-line'); labelIO.observe(l); });

  /* ---------- Счётчики: 25+, 500+, 7 набегают от нуля ---------- */
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      countIO.unobserve(e.target);
      const el = e.target;
      const m = el.textContent.trim().match(/^(\d+)(.*)$/);
      if (!m || reduceMotion) return;
      const target = Number(m[1]), suffix = m[2], dur = 1600, t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 4))) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.6 });
  $$('[data-countup]').forEach((el) => countIO.observe(el));

  /* ---------- Магнитные кнопки: тянутся за курсором ---------- */
  if (!reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    $$('.btn-iris').forEach((b) => {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) * 0.22;
        const dy = (e.clientY - (r.top + r.height / 2)) * 0.35;
        b.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
  }

  /* ---------- Подсветка текущего раздела в меню ---------- */
  const spyLinks = $$('[data-spy]');
  const spyIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      spyLinks.forEach((l) => {
        const on = l.getAttribute('href') === `#${e.target.id}`;
        l.classList.toggle('is-current', on);
        if (on) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  spyLinks.forEach((l) => { const s = $(l.getAttribute('href')); if (s) spyIO.observe(s); });

  /* ---------- Слоган: слова загораются по одному ---------- */
  const tagline = $('[data-tagline]');
  if (tagline) {
    const wrapWords = (node, accent) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement('span');
            s.className = accent ? 'w accent' : 'w';
            s.textContent = part;
            frag.appendChild(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') {
          wrapWords(n, accent || n.hasAttribute('data-accent'));
        }
      });
    };
    wrapWords(tagline, false);
    const words = $$('.w', tagline);
    if (reduceMotion) {
      words.forEach((w) => w.classList.add('is-on'));
    } else {
      // Слово активируется, когда пересекает линию на 65% высоты экрана
      let ticking = false;
      const update = () => {
        const line = window.innerHeight * 0.65;
        words.forEach((w) => w.classList.toggle('is-on', w.getBoundingClientRect().top < line));
        ticking = false;
      };
      const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
      const active = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { window.addEventListener('scroll', onScroll, { passive: true }); onScroll(); }
          else window.removeEventListener('scroll', onScroll);
        });
      });
      active.observe(tagline);
      update();
    }
  }

  /* ---------- FAQ: разметка schema.org из списка вопросов ---------- */
  const faqItems = $$('#faq-list details');
  if (faqItems.length) {
    $('#faq-schema').textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqItems.map((d) => ({
        '@type': 'Question',
        name: d.querySelector('summary').textContent.trim(),
        acceptedAnswer: { '@type': 'Answer', text: d.querySelector('div').textContent.trim() },
      })),
    });
  }

  /* ---------- Модальная форма ---------- */
  const modal = $('#lead-modal');
  const form = $('#lead-form');
  const submit = $('#lead-submit');
  const formError = $('#form-error');
  let lastFocus = null;

  const openForm = (pkg) => {
    lastFocus = document.activeElement;
    setMenu(false);
    $('#lead-package').value = pkg || '';
    $('#lead-form-wrap').classList.remove('hidden');
    $('#lead-success').classList.add('hidden');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    lockPage(true);
    setTimeout(() => $('#lead-company').focus(), 50);
  };
  const closeForm = () => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    lockPage(false);
    if (lastFocus) lastFocus.focus();
  };
  $$('[data-open-form]').forEach((b) => b.addEventListener('click', () => openForm(b.dataset.package)));
  $$('[data-close-form]').forEach((b) => b.addEventListener('click', closeForm));
  modal.addEventListener('click', (e) => { if (e.target === modal) closeForm(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modal.classList.contains('is-open')) closeForm();
    else if (document.documentElement.classList.contains('menu-open')) setMenu(false);
  });
  // Фокус не уходит за пределы открытого окна
  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = $$('button, a[href], input:not([type=hidden]), [tabindex]:not([tabindex="-1"])', modal)
      .filter((el) => el.offsetParent !== null);
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  const rules = {
    company: (v) => v.trim().length >= 2,
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
    phone: (v) => v.replace(/\D/g, '').length >= 10,
  };
  const showError = (name, bad) => {
    const input = form.elements[name];
    $(`#err-${name}`).classList.toggle('is-visible', bad);
    if (input.type !== 'checkbox') input.setAttribute('aria-invalid', String(bad));
    input.setAttribute('aria-describedby', bad ? `err-${name}` : '');
  };
  const validate = () => {
    let firstBad = null;
    Object.keys(rules).forEach((name) => {
      const bad = !rules[name](form.elements[name].value);
      showError(name, bad);
      if (bad && !firstBad) firstBad = form.elements[name];
    });
    const noConsent = !form.elements.consent.checked;
    showError('consent', noConsent);
    if (noConsent && !firstBad) firstBad = form.elements.consent;
    if (firstBad) firstBad.focus();
    return !firstBad;
  };
  // Ошибка исчезает, как только поле исправлено
  ['company', 'email', 'phone'].forEach((name) => {
    form.elements[name].addEventListener('input', (e) => {
      if (e.target.getAttribute('aria-invalid') === 'true' && rules[name](e.target.value)) showError(name, false);
    });
  });
  form.elements.consent.addEventListener('change', (e) => { if (e.target.checked) showError('consent', false); });

  const sendLead = async (data) => {
    if (!CONFIG.endpoint) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.classList.add('hidden');
    if (!validate()) return;

    const data = Object.fromEntries(new FormData(form));
    if (data.website) return; // бот заполнил скрытое поле
    data.consent = true;
    data.page = location.href;
    data.utm = location.search;

    submit.disabled = true;
    submit.classList.add('is-loading');
    let delivered = true;
    try { await sendLead(data); } catch (err) { delivered = false; console.warn('Заявка не отправлена на сервер:', err); }
    submit.disabled = false;
    submit.classList.remove('is-loading');

    if (CONFIG.metrikaId && typeof window.ym === 'function') window.ym(CONFIG.metrikaId, 'reachGoal', CONFIG.metrikaGoal);

    // Если запасная отправка ботом не удалась, заявка всё равно уйдёт сообщением в личку
    if (!delivered) console.warn('Отправка через send.php не удалась, остаётся сообщение в Telegram');

    const link = tgLink(data);
    $('#lead-tg-link').href = link;
    $('#lead-success-text').textContent = `Открываем Telegram с готовой заявкой от «${data.company.trim()}». Нажмите в чате «Отправить». Если Telegram не открылся, нажмите кнопку ниже.`;
    $('#lead-form-wrap').classList.add('hidden');
    $('#lead-success').classList.remove('hidden');
    $('#lead-tg-link').focus();
    form.reset();
    setTimeout(() => { window.location.href = link; }, 1200);
  });

  /* ---------- Cookies ---------- */
  const cookie = $('#cookie');
  let seen = false;
  try { seen = localStorage.getItem('cz-cookie') === '1'; } catch (_) {}
  if (!seen) cookie.classList.replace('hidden', 'flex');
  $('#cookie-ok').addEventListener('click', () => {
    try { localStorage.setItem('cz-cookie', '1'); } catch (_) {}
    cookie.classList.replace('flex', 'hidden');
  });
})();
