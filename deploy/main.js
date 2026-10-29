/* Supermuebles Cuenca: interacciones */
(function () {
  'use strict';

  var doc = document.documentElement;
  var body = document.body;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var WHATSAPP = '593999880023';

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ---------- Revelado escalonado (primero, para que nada quede oculto) ---------- */
  var revealEls = $$('[data-r]');
  var counts = new Map();
  revealEls.forEach(function (el) {
    var parent = el.parentElement;
    var n = counts.get(parent) || 0;
    el.style.setProperty('--i', String(Math.min(n, 6)));
    counts.set(parent, n + 1);
  });

  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    /* Los elementos con clip-path no se observan con IntersectionObserver (Chrome los
       mide ya recortados): se revisan al hacer scroll. */
    var wipes = [];
    revealEls.forEach(function (el) {
      if (el.dataset.r === 'wipe') wipes.push(el); else io.observe(el);
    });
    var checkWipes = function () {
      wipes = wipes.filter(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.9 && r.bottom > 0) { el.classList.add('in'); return false; }
        return true;
      });
      if (!wipes.length) window.removeEventListener('scroll', checkWipes);
    };
    window.addEventListener('scroll', checkWipes, { passive: true });
    window.addEventListener('resize', checkWipes);
    checkWipes();
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Medición sin cookies (se activa con ANALYTICS en config.py) ---------- */
  function track(name, props) {
    try { if (window.va) window.va('event', Object.assign({ name: name }, props || {})); } catch (e) { /* sin medición */ }
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var h = a.getAttribute('href') || '';
    var page = (document.body.className.match(/page-([\w-]+)/) || [])[1] || '';
    if (h.indexOf('wa.me/') > -1) track('whatsapp_click', { page: page });
    else if (h.indexOf('tel:') === 0) track('llamada_click', { page: page });
    else if (h.indexOf('maps/dir') > -1) track('como_llegar_click', { page: page });
  });

  /* ---------- Cabecera, menú móvil y barra inferior ---------- */
  var bar = $('.bar');
  var burger = $('.burger');
  var menu = $('#menu');
  var ticking = false;

  var lastY = 0;
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    var dk = document.getElementById('dock');
    if (dk) {
      if (y > 160 && y - lastY > 4) dk.classList.add('is-away');
      else if (y - lastY < -4 || y <= 160) dk.classList.remove('is-away');
    }
    lastY = y;
    bar.classList.toggle('is-solid', y > 24);
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  function setMenu(open) {
    body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    menu.inert = !open;
  }
  burger.addEventListener('click', function () { setMenu(!body.classList.contains('menu-open')); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && body.classList.contains('menu-open')) { setMenu(false); burger.focus(); }
  });
  window.matchMedia('(min-width: 1100px)').addEventListener('change', function (e) { if (e.matches) setMenu(false); });

  /* ---------- La barra móvil se esconde cuando el pie ya está a la vista ---------- */
  var dockEl = $('#dock');
  var footEl = $('.footer');
  if (dockEl && footEl && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      dockEl.classList.toggle('is-foot', entries[0].isIntersecting);
    }, { threshold: 0.05 }).observe(footEl);
  }

  /* ---------- Hileras que se deslizan: botones, arrastre con mouse y progreso ---------- */
  function setupRun(run) {
    var barEl = run.id ? document.getElementById(run.id + '-bar') : null;

    function step(dir) {
      run.scrollBy({ left: dir * run.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' });
    }
    $$('[data-prev="#' + run.id + '"]').forEach(function (b) { b.addEventListener('click', function () { step(-1); }); });
    $$('[data-next="#' + run.id + '"]').forEach(function (b) { b.addEventListener('click', function () { step(1); }); });

    if (barEl) {
      var upd = function () {
        var total = run.scrollWidth;
        var view = run.clientWidth;
        var w = Math.min(1, view / total);
        var maxLeft = Math.max(1, total - view);
        var left = (run.scrollLeft / maxLeft) * (1 - w);
        barEl.style.width = (w * 100) + '%';
        barEl.style.transform = 'translateX(' + (left / w * 100) + '%)';
      };
      run.addEventListener('scroll', function () { requestAnimationFrame(upd); }, { passive: true });
      window.addEventListener('resize', upd);
      upd();
    }

    /* Arrastre con el mouse (en pantallas táctiles el scroll nativo ya funciona) */
    var down = false, moved = false, startX = 0, startLeft = 0;
    run.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; moved = false; startX = e.clientX; startLeft = run.scrollLeft;
    });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 6) { moved = true; run.style.scrollSnapType = 'none'; run.style.cursor = 'grabbing'; }
      if (moved) run.scrollLeft = startLeft - dx;
    });
    window.addEventListener('pointerup', function () {
      if (!down) return;
      down = false;
      run.style.scrollSnapType = '';
      run.style.cursor = '';
    });
    run.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    run.addEventListener('dragstart', function (e) { e.preventDefault(); });

    run.addEventListener('keydown', function (e) {
      if (e.target !== run) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    });
  }
  $$('.run, .row, .qrow').forEach(setupRun);

  /* ---------- Animación del boceto al sofá ---------- */
  var vid = $('#boceto-video');
  if (vid) {
    var tog = $('#boceto-toggle');
    var chaps = $$('.chap');
    var userPaused = false;
    var full = $('#boceto-full');
    var cap = $('#boceto-cap');
    /* En pantallas chicas se carga la versión liviana (menos de 1 MB) */
    if (window.matchMedia('(max-width: 859px)').matches) vid.src = 'video/boceto-a-sofa-m.mp4';
    var saver = navigator.connection && navigator.connection.saveData;
    var play = function () { var p = vid.play(); if (p && p.catch) p.catch(function () {}); };
    var sync = function () {
      var on = !vid.paused;
      tog.dataset.state = on ? 'playing' : 'paused';
      tog.setAttribute('aria-label', on ? 'Pausar animación' : 'Reproducir animación');
    };
    tog.addEventListener('click', function () {
      if (vid.paused) { userPaused = false; play(); } else { userPaused = true; vid.pause(); }
    });
    vid.addEventListener('play', sync);
    vid.addEventListener('pause', sync);
    chaps.forEach(function (b) {
      b.addEventListener('click', function () { vid.currentTime = parseFloat(b.dataset.t); userPaused = false; play(); });
    });
    vid.addEventListener('timeupdate', function () {
      var cur = -1;
      chaps.forEach(function (b, i) { if (vid.currentTime + 0.2 >= parseFloat(b.dataset.t)) cur = i; });
      chaps.forEach(function (b, i) { if (i === Math.max(cur, 0)) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      if (cap) { var t = chaps[Math.max(cur, 0)].dataset.cap; if (cap.textContent !== t) cap.textContent = t; }
    });
    if (full) {
      full.addEventListener('click', function () {
        if (vid.requestFullscreen) {
          vid.requestFullscreen().then(function () {
            if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
            play();
          }).catch(function () {});
        } else if (vid.webkitEnterFullscreen) { vid.webkitEnterFullscreen(); play(); }
      });
    }
    if (!reduce && !saver && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { if (!userPaused) play(); } else if (!document.fullscreenElement) { vid.pause(); }
      }, { threshold: 0.4 }).observe(vid);
    }
    sync();
  }

  /* ---------- Video de portada en bucle con pausa ---------- */
  $$('video[data-ambient]').forEach(function (v) {
    var wrap = v.closest('.hero');
    var btn = wrap && $('.vista-toggle', wrap);
    var paused = false;
    var saver = navigator.connection && navigator.connection.saveData;
    if (v.dataset.srcM && window.matchMedia('(max-width: 859px)').matches) v.src = v.dataset.srcM;
    var play = function () { var p = v.play(); if (p && p.catch) p.catch(function () {}); };
    var sync = function () {
      if (!btn) return;
      var on = !v.paused;
      btn.dataset.state = on ? 'playing' : 'paused';
      btn.setAttribute('aria-label', on ? 'Pausar video de portada' : 'Reproducir video de portada');
    };
    if (btn) btn.addEventListener('click', function () {
      if (v.paused) { paused = false; play(); } else { paused = true; v.pause(); }
    });
    v.addEventListener('play', sync);
    v.addEventListener('pause', sync);
    v.addEventListener('playing', function () { v.classList.add('is-on'); });
    /* Portada de Fábrica: el texto se cuenta con el video. Cada [data-at] aparece al llegar a ese segundo, solo en la primera pasada.
       Sin video (ahorro de datos, poco movimiento, pausa o carga lenta) todo aparece de inmediato. */
    if (wrap && wrap.classList.contains('hero--fab')) {
      $$('.ph', wrap).forEach(function (ph) {
        var words = ph.textContent.trim().split(/\s+/);
        ph.textContent = '';
        words.forEach(function (word, i) {
          if (i) ph.appendChild(document.createTextNode(' '));
          var w = document.createElement('span');
          w.className = 'w';
          w.style.setProperty('--i', i);
          w.textContent = word;
          ph.appendChild(w);
        });
        ph.classList.add('is-split');
      });
      var beats = $$('[data-at]', wrap).map(function (el) { return { el: el, at: parseFloat(el.dataset.at), on: false }; });
      var show = function (b) { if (!b.on) { b.on = true; b.el.classList.add('in'); } };
      var revealAll = function () { beats.forEach(show); };
      var onTime = function (t) { beats.forEach(function (b) { if (t >= b.at) show(b); }); };
      if (reduce || saver) revealAll();
      else {
        var started = false;
        v.addEventListener('playing', function () { started = true; onTime(v.currentTime); }, { once: true });
        v.addEventListener('pause', revealAll);
        setTimeout(function () { if (!started) revealAll(); }, 2500);
        if (v.requestVideoFrameCallback) {
          var follow = function (now, meta) { onTime(meta.mediaTime); v.requestVideoFrameCallback(follow); };
          v.requestVideoFrameCallback(follow);
        } else {
          v.addEventListener('timeupdate', function () { onTime(v.currentTime); });
        }
      }
    }
    /* Destello del botón al aparecer el mueble terminado: una vez por vuelta del video, solo mientras se reproduce. */
    var glintAt = parseFloat(v.dataset.glintAt);
    var cta = wrap && $('.hero-actions .btn', wrap);
    if (cta && glintAt > 0 && !reduce) {
      var fired = false;
      var check = function (t) {
        if (t < glintAt - 4) { fired = false; return; }
        if (fired || t < glintAt || t > glintAt + 2) return;
        fired = true;
        cta.classList.remove('is-glint');
        void cta.offsetWidth;
        cta.classList.add('is-glint');
        setTimeout(function () { cta.classList.remove('is-glint'); }, 1700);
      };
      if (v.requestVideoFrameCallback) {
        var tick = function (now, meta) { check(meta.mediaTime); v.requestVideoFrameCallback(tick); };
        v.requestVideoFrameCallback(tick);
      } else {
        v.addEventListener('timeupdate', function () { check(v.currentTime); });
      }
    }
    if (!reduce && !saver && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { if (!paused) play(); } else { v.pause(); }
      }, { threshold: 0.35 }).observe(v);
    }
    sync();
  });

  /* ---------- Tríptico que sube con el scroll ---------- */
  var rise = $('.rise');
  if (rise && !reduce) {
    var stage = $('.rise-stage', rise);
    var head = $('.rise-head', rise);
    var pl = $('.rp--l', rise), pc = $('.rp--c', rise), pr = $('.rp--r', rise);
    var m = {};
    var live = false;

    var measure = function () {
      m.vh = window.innerHeight;
      m.cw = pc.offsetWidth; m.ch = pc.offsetHeight;
      m.ow = pl.offsetWidth; m.oh = pl.offsetHeight;
      m.headBottom = head.getBoundingClientRect().bottom - stage.getBoundingClientRect().top;
      m.top = rise.getBoundingClientRect().top + (window.scrollY || window.pageYOffset);
      m.total = Math.max(1, rise.offsetHeight - m.vh);
    };
    var lerp = function (a, b, t) { return a + (b - a) * t; };

    var place = function () {
      var y = window.scrollY || window.pageYOffset;
      var p = Math.min(1, Math.max(0, (y - m.top) / m.total));
      var s = lerp(0.82, 1, p);
      var cy0 = m.vh - m.ch * 0.82 * 0.26;
      var cy1 = m.headBottom + 40;
      var cy = lerp(cy0, cy1, p);
      var oy1 = cy1 + 55;
      var oyL0 = m.vh - m.oh * 0.12, oyR0 = m.vh - m.oh * 0.05;
      var oyL = lerp(oyL0, oy1, Math.pow(p, 0.8));
      var oyR = lerp(oyR0, oy1, Math.pow(p, 1.25));
      var x = m.cw * s / 2 + 10 + m.ow / 2;
      pc.style.transform = 'translate3d(-50%,' + cy.toFixed(1) + 'px,0) scale(' + s.toFixed(4) + ')';
      pl.style.transform = 'translate3d(calc(-50% - ' + x.toFixed(1) + 'px),' + oyL.toFixed(1) + 'px,0)';
      pr.style.transform = 'translate3d(calc(-50% + ' + x.toFixed(1) + 'px),' + oyR.toFixed(1) + 'px,0)';
    };

    var rising = false;
    var onRise = function () {
      if (!rising) { rising = true; requestAnimationFrame(function () { place(); rising = false; }); }
    };
    /* En pantallas bajas (laptops) la foto central se ajusta al alto; si ni así cabe, queda fija */
    var start = function () {
      rise.style.removeProperty('--cw');
      rise.classList.add('is-live');
      pl.style.transform = pc.style.transform = pr.style.transform = '';
      var vh = window.innerHeight;
      var hb = head.getBoundingClientRect().bottom - stage.getBoundingClientRect().top;
      if (window.innerWidth > 700) {
        var fit = (vh - hb - 64) * 0.8;
        if (fit < 300) { rise.classList.remove('is-live'); live = false; return; }
        if (fit < pc.offsetWidth) rise.style.setProperty('--cw', fit.toFixed(0) + 'px');
      }
      measure(); place(); live = true;
    };
    start();
    window.addEventListener('scroll', function () { if (live) onRise(); }, { passive: true });
    window.addEventListener('resize', function () { start(); });
    window.addEventListener('load', function () { start(); });
  }

  /* ---------- Orden de trabajo: el formulario escribe la hoja y el mensaje ---------- */
  var form = $('#quote-form');
  if (form) {
    var nameInput = form.elements.nombre;

    var pick = function (name) { return form.querySelector('input[name="' + name + '"]:checked'); };
    var put = function (id, text, empty) {
      var el = document.getElementById(id);
      el.textContent = text || empty;
      el.classList.toggle('is-empty', !text);
    };

    var update = function () {
      var tipo = pick('tipo');
      var madera = pick('tono');
      put('s-name', nameInput.value.trim(), 'Tu nombre');
      document.getElementById('s-tipo').textContent = tipo ? tipo.value : '';
      put('s-modelo', form.elements.modelo.value.trim(), 'Por definir');
      document.getElementById('s-tono-t').textContent = madera ? madera.value : '';
      document.getElementById('s-tone').style.setProperty('--tone', madera ? madera.dataset.tone : '#e4dac6');
      put('s-ciudad', form.elements.ciudad.value.trim(), 'Por definir');
      put('s-size', form.elements.medidas.value.trim(), 'Por definir');
      put('s-notes', form.elements.notas.value.trim(), 'Sin notas');
    };

    var message = function () {
      var phone = form.elements.telefono.value.trim();
      var model = form.elements.modelo.value.trim();
      var city = form.elements.ciudad.value.trim();
      var size = form.elements.medidas.value.trim();
      var notes = form.elements.notas.value.trim();
      var lines = [
        'Hola, Supermuebles Cuenca. Soy ' + nameInput.value.trim() + '.',
        'Quiero cotizar:',
        '- Mueble: ' + pick('tipo').value
      ];
      if (model) lines.push('- Diseño: ' + model);
      lines.push('- Tono: ' + pick('tono').value);
      if (city) lines.push('- Ciudad: ' + city);
      if (size) lines.push('- Medidas aproximadas: ' + size);
      if (notes) lines.push('- Notas: ' + notes);
      if (phone) lines.push('Mi teléfono: ' + phone);
      lines.push('(Orden armada desde la web)');
      return lines.join('\n');
    };

    form.addEventListener('input', function () { nameInput.setCustomValidity(''); nameInput.classList.remove('is-bad'); update(); });
    form.addEventListener('change', update);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!nameInput.value.trim()) {
        nameInput.classList.add('is-bad');
        nameInput.setCustomValidity('Escribe tu nombre para que la asesora sepa a quién responder.');
        nameInput.reportValidity();
        nameInput.focus();
        return;
      }
      track('cotizacion_enviada', { tipo: form.elements.tipo ? (pick('tipo') || {}).value : '' });
      window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(message()), '_blank', 'noopener');
    });
    update();
  }


  /* ---------- Catálogo: filtros por tipo, madera, puestos y precio ---------- */
  var catalog = $('#catalog');
  if (catalog) {
    var items = $$('.item', catalog);
    var emptyEl = $('#empty');
    var state = { cat: 'todos', puestos: 'todos', acabado: 'todos', precio: 'todos' };

    var tokens = function (s) { return (s || '').split(/\s+/).filter(Boolean); };
    var priceOf = function (it) { var n = parseFloat(it.dataset.precio); return isNaN(n) ? null : n; };
    var matches = function (it) {
      if (state.cat !== 'todos' && tokens(it.dataset.cat).indexOf(state.cat) < 0) return false;
      if (state.acabado !== 'todos' && tokens(it.dataset.acabado).indexOf(state.acabado) < 0) return false;
      if (state.puestos !== 'todos' && it.dataset.puestos !== state.puestos) return false;
      if (state.precio !== 'todos') {
        var p = priceOf(it);
        if (p === null) return false;
        var r = state.precio;
        if (r === 'hasta-500' && !(p <= 500)) return false;
        if (r === '500-1000' && !(p > 500 && p <= 1000)) return false;
        if (r === '1000+' && !(p > 1000)) return false;
      }
      return true;
    };

    var render = function (animate) {
      var n = 0;
      items.forEach(function (it) {
        var ok = matches(it);
        var was = !it.hidden;
        it.hidden = !ok;
        if (ok) n++;
        if (ok && !was && animate && !reduce) {
          it.classList.remove('enter'); void it.offsetWidth; it.classList.add('enter');
        }
      });
      emptyEl.hidden = n > 0;
    };

    var pressed = function (key, value) {
      state[key] = value;
      $$('[data-filter="' + key + '"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.value === value)); });
    };

    $('#filters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-filter]');
      if (!b) return;
      pressed(b.dataset.filter, b.dataset.value);
      render(true);
    });

    /* El filtro de precio aparece solo cuando hay precios cargados en data-precio */
    if (items.some(function (it) { return priceOf(it) !== null; })) {
      var box = $('#precio-chips');
      [['todos', 'Todos'], ['hasta-500', 'Hasta $500'], ['500-1000', '$500 a $1000'], ['1000+', 'Más de $1000']].forEach(function (o, i) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'chip'; b.dataset.filter = 'precio'; b.dataset.value = o[0];
        b.setAttribute('aria-pressed', String(i === 0)); b.textContent = o[1];
        box.appendChild(b);
      });
      $('#f-precio').hidden = false;
    }

    var fromHash = function () {
      var h = decodeURIComponent(location.hash.slice(1));
      if (['salas', 'comedores', 'dormitorios', 'infantil'].indexOf(h) >= 0) { pressed('cat', h); render(false); }
    };
    window.addEventListener('hashchange', function () { fromHash(); });
    fromHash();
    render(false);
  }

  /* ---------- Agenda de visita: el formulario escribe la hoja y el mensaje ---------- */
  var vform = $('#visit-form');
  if (vform) {
    var vName = vform.elements.nombre;
    var daySel = vform.elements.dia;

    /* Horario de Turi: lunes a viernes 8:00-12:00 y 13:30-17:00; sábado 8:00-14:00; domingo solo con cita previa.
       Guayaquil no cambia: sus días se arman solo de lunes a viernes. */
    var HOURS = ['08:00', '09:00', '10:00', '11:00', '13:30', '14:30', '15:30', '16:00'];
    var HOURS_SAT = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00'];
    var isTuri = function () { return vform.querySelector('input[name="local"]:checked').value === 'Turi, Cuenca'; };
    var buildDays = function (withSat) {
      var out = [];
      var d = new Date();
      var mins = d.getHours() * 60 + d.getMinutes();
      if ((d.getDay() === 6 && withSat) ? mins >= 13 * 60 : mins >= 16 * 60) d.setDate(d.getDate() + 1);
      while (out.length < 7) {
        var wd = d.getDay();
        if (wd !== 0 && (wd !== 6 || withSat)) {
          out.push({ label: d.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' }), sat: wd === 6 });
        }
        d.setDate(d.getDate() + 1);
      }
      return out;
    };
    var fillDays = function () {
      var turi = isTuri();
      var keep = daySel.value;
      daySel.innerHTML = '';
      buildDays(turi).forEach(function (day) {
        var o = document.createElement('option');
        o.value = day.label; o.textContent = day.label.charAt(0).toUpperCase() + day.label.slice(1);
        if (day.sat) o.dataset.sat = '1';
        daySel.appendChild(o);
      });
      if (turi) {
        var s = document.createElement('option');
        s.value = 'domingo, con cita previa'; s.textContent = 'Domingo, con cita previa'; s.dataset.weekend = '1';
        daySel.appendChild(s);
      }
      var idx = Array.prototype.findIndex.call(daySel.options, function (o) { return o.value === keep; });
      daySel.selectedIndex = idx >= 0 ? idx : 0;
    };
    fillDays();
    var hourSel = vform.elements.hora;
    var fillHours = function () {
      var sel = daySel.options[daySel.selectedIndex];
      var list = sel && sel.dataset.weekend ? ['A coordinar con la asesora'] : (sel && sel.dataset.sat ? HOURS_SAT : HOURS);
      var keep = hourSel.value;
      hourSel.innerHTML = '';
      list.forEach(function (h) { var o = document.createElement('option'); o.textContent = h; hourSel.appendChild(o); });
      if (list.indexOf(keep) >= 0) hourSel.value = keep;
    };
    fillHours();
    daySel.addEventListener('change', fillHours);

    /* Al cambiar de local se rearma la lista de días: el sábado y el domingo solo existen en Turi. */
    vform.addEventListener('change', function (e) { if (e.target.name === 'local') { fillDays(); fillHours(); } });

    var vpick = function () { return vform.querySelector('input[name="motivo"]:checked'); };
    var vput = function (id, text, empty) {
      var el = document.getElementById(id);
      el.textContent = text || empty;
      el.classList.toggle('is-empty', !text);
    };
    var vupdate = function () {
      vput('sv-name', vName.value.trim(), 'Tu nombre');
      document.getElementById('sv-local').textContent = vform.querySelector('input[name="local"]:checked').value;
      document.getElementById('sv-motivo').textContent = vpick().value;
      document.getElementById('sv-dia').textContent = daySel.options[daySel.selectedIndex].textContent;
      document.getElementById('sv-hora').textContent = vform.elements.hora.value;
    };
    vform.addEventListener('input', function () { vName.setCustomValidity(''); vName.classList.remove('is-bad'); vupdate(); });
    vform.addEventListener('change', vupdate);
    vform.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!vName.value.trim()) {
        vName.classList.add('is-bad');
        vName.setCustomValidity('Escribe tu nombre para que la asesora sepa a quién esperar.');
        vName.reportValidity();
        vName.focus();
        return;
      }
      var phone = vform.elements.telefono.value.trim();
      var weekend = daySel.options[daySel.selectedIndex].dataset.weekend;
      var when = weekend ? 'un domingo, con cita previa (hora por coordinar)' : 'el ' + daySel.value + ' a las ' + vform.elements.hora.value;
      var msg = 'Hola, Supermuebles Cuenca. Soy ' + vName.value.trim() + '. Quiero visitar el local de ' + vform.querySelector('input[name="local"]:checked').value + ' ' +
        when + '. Motivo: ' + vpick().value + '.' +
        (phone ? ' Mi teléfono: ' + phone + '.' : '') + ' ¿Me confirman?';
      track('visita_agendada');
      window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    });
    vupdate();
  }

})();
