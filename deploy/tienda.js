/* Tienda (fase 1): botón «Agregar al pedido» en el catálogo, página del pedido y seguimiento.
   Todo depende de /api/productos: si la tienda está apagada, si no hay API (sitio sin tienda)
   o si un modelo no tiene precio, el sitio se ve exactamente como antes. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var CLAVE_CARRITO = 'sm_pedido';
  var CLAVE_ENVIO = 'sm_pedido_clave';
  var MAX_CANTIDAD = 20;
  var WA = '593999880023';

  /* ---------- guardado en el navegador (puede fallar en modo privado) ---------- */
  var leer = function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  var guardar = function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  var lineas = function () {
    var d = leer(CLAVE_CARRITO);
    return d && d.v === 1 && Array.isArray(d.lineas) ? d.lineas.filter(function (l) { return l && typeof l.id === 'string'; }) : [];
  };
  var fijarLineas = function (ls) {
    guardar(CLAVE_CARRITO, ls.length ? { v: 1, lineas: ls } : null);
    guardar(CLAVE_ENVIO, null); // si el pedido cambia, el próximo envío es uno nuevo
    pintarContador();
  };
  var cuenta = function () { return lineas().reduce(function (s, l) { return s + (l.qty || 0); }, 0); };

  var dinero = function (c) {
    try { return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(c / 100); }
    catch (e) { return '$' + (c / 100).toFixed(2); }
  };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); };
  var wa = function (texto) { return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(texto); };

  var aviso = (function () {
    var el = document.createElement('p');
    el.className = 'visually-hidden';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    return function (t) { el.textContent = ''; setTimeout(function () { el.textContent = t; }, 50); };
  })();

  /* ---------- catálogo desde la API ---------- */
  var catalogo = null;
  var cargarCatalogo = function () {
    if (catalogo) return catalogo;
    catalogo = fetch('/api/productos', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { activa: false, productos: [] }; })
      .then(function (d) {
        var porId = {};
        (d.productos || []).forEach(function (p) { porId[p.id] = p; });
        return { activa: d.activa === true, porId: porId };
      })
      .catch(function () { return { activa: false, porId: {} }; });
    return catalogo;
  };

  /* ---------- contador del encabezado ---------- */
  var tiendaActiva = false;
  function pintarContador() {
    var n = cuenta();
    $$('[data-pedido-link]').forEach(function (a) {
      a.hidden = !(tiendaActiva && n > 0);
      a.setAttribute('aria-label', 'Tu pedido: ' + n + (n === 1 ? ' mueble' : ' muebles'));
    });
    $$('[data-pedido-n]').forEach(function (s) { s.textContent = n; });
  }

  var agregar = function (id) {
    var ls = lineas();
    var l = ls.filter(function (x) { return x.id === id && !x.nota; })[0];
    if (l) l.qty = Math.min(MAX_CANTIDAD, l.qty + 1);
    else ls.push({ id: id, qty: 1, nota: '' });
    fijarLineas(ls);
  };

  function botonesDelCatalogo(cat) {
    $$('.catalog .item[id]').forEach(function (li) {
      var p = cat.porId[li.id];
      var cta = $('.item-cta', li);
      if (!p || !cta || $('.item-agregar', li)) return;
      var precio = document.createElement('p');
      precio.className = 'item-precio';
      precio.textContent = dinero(p.price_cents);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn--sm item-agregar';
      b.textContent = 'Agregar al pedido';
      b.addEventListener('click', function () {
        agregar(p.id);
        b.textContent = 'Agregado';
        b.classList.add('is-ok');
        aviso(p.name + ' se agregó a tu pedido. Tienes ' + cuenta() + ' en total.');
        clearTimeout(b._t);
        b._t = setTimeout(function () { b.textContent = 'Agregar al pedido'; b.classList.remove('is-ok'); }, 1800);
      });
      li.insertBefore(precio, cta);
      cta.insertBefore(b, cta.firstChild);
    });
  }

  /* ---------- página del pedido ---------- */
  function paginaPedido(cat) {
    var raiz = $('#pedido');
    if (!raiz) return;
    var mostrar = function (id) {
      ['pedido-cargando', 'pedido-vacio', 'pedido-cerrado', 'pedido-cuerpo', 'pedido-listo'].forEach(function (x) { $('#' + x).hidden = x !== id; });
    };
    if (!cat.activa) { mostrar('pedido-cerrado'); return; }

    // Quita del pedido lo que ya no se puede pedir (sin precio o desactivado).
    var ls = lineas();
    var quitados = ls.filter(function (l) { return !cat.porId[l.id]; });
    if (quitados.length) fijarLineas(ls.filter(function (l) { return cat.porId[l.id]; }));

    var lista = $('#lineas');
    var pintar = function () {
      var ls = lineas();
      if (!ls.length) { mostrar('pedido-vacio'); return; }
      mostrar('pedido-cuerpo');
      lista.innerHTML = ls.map(function (l, i) {
        var p = cat.porId[l.id];
        return '<li class="linea" data-i="' + i + '">' +
          (p.image ? '<img class="linea-img" src="' + esc(p.image) + '" width="96" height="96" alt="">' : '<span class="linea-img"></span>') +
          '<div class="linea-info"><p class="linea-nombre">' + esc(p.name) + '</p>' +
          '<p class="linea-precio">' + dinero(p.price_cents) + ' c/u</p>' +
          '<label class="linea-nota"><span>Tela, color o medida (opcional)</span><input type="text" maxlength="300" value="' + esc(l.nota) + '" data-nota></label></div>' +
          '<div class="linea-cant" role="group" aria-label="Cantidad de ' + esc(p.name) + '">' +
          '<button class="sq" type="button" data-menos aria-label="Uno menos"' + (l.qty <= 1 ? ' disabled' : '') + '><svg class="i" aria-hidden="true"><use href="#i-minus"/></svg></button>' +
          '<output aria-live="polite">' + l.qty + '</output>' +
          '<button class="sq" type="button" data-mas aria-label="Uno más"' + (l.qty >= MAX_CANTIDAD ? ' disabled' : '') + '><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg></button></div>' +
          '<p class="linea-total">' + dinero(p.price_cents * l.qty) + '</p>' +
          '<button class="ulink linea-quitar" type="button" data-quitar>Quitar</button></li>';
      }).join('');
      var sub = ls.reduce(function (s, l) { return s + cat.porId[l.id].price_cents * l.qty; }, 0);
      $('#pedido-subtotal').textContent = dinero(sub);
      if (quitados.length) {
        error('Quitamos ' + quitados.length + (quitados.length === 1 ? ' mueble que ya no está' : ' muebles que ya no están') + ' disponible para pedir en línea.');
        quitados = [];
      }
    };

    lista.addEventListener('click', function (e) {
      var li = e.target.closest('.linea');
      if (!li) return;
      var i = +li.dataset.i;
      var ls = lineas();
      if (!ls[i]) return;
      if (e.target.closest('[data-mas]')) ls[i].qty = Math.min(MAX_CANTIDAD, ls[i].qty + 1);
      else if (e.target.closest('[data-menos]')) ls[i].qty = Math.max(1, ls[i].qty - 1);
      else if (e.target.closest('[data-quitar]')) { aviso(cat.porId[ls[i].id].name + ' se quitó del pedido.'); ls.splice(i, 1); }
      else return;
      fijarLineas(ls);
      pintar();
    });
    lista.addEventListener('change', function (e) {
      if (!e.target.matches('[data-nota]')) return;
      var i = +e.target.closest('.linea').dataset.i;
      var ls = lineas();
      if (!ls[i]) return;
      ls[i].nota = e.target.value.trim().slice(0, 300);
      fijarLineas(ls);
    });

    /* Turnstile: se carga solo cuando hace falta. */
    var tsToken = '';
    var tsId = null;
    var cargarTurnstile = function () {
      if (window.turnstile || $('script[data-turnstile]')) return;
      window.smTurnstile = function () {
        tsId = window.turnstile.render('#pedido-captcha', {
          sitekey: raiz.dataset.turnstile,
          language: 'es',
          appearance: 'interaction-only',
          callback: function (t) { tsToken = t; },
          'expired-callback': function () { tsToken = ''; },
          'error-callback': function () { tsToken = ''; },
        });
      };
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=smTurnstile';
      s.async = true;
      s.dataset.turnstile = '1';
      document.head.appendChild(s);
    };

    var form = $('#pedido-form');
    var btn = $('#pedido-enviar');
    var errEl = $('#pedido-error');
    function error(t) { errEl.textContent = t; errEl.hidden = !t; }
    var marcar = function (nombre) {
      var f = form.elements[nombre];
      if (f) { f.classList.add('is-bad'); f.setAttribute('aria-invalid', 'true'); f.focus(); }
    };
    form.addEventListener('input', function (e) { e.target.classList.remove('is-bad'); e.target.removeAttribute('aria-invalid'); });

    var datos = function () {
      var v = function (n) { return (form.elements[n].value || '').trim(); };
      return {
        nombre: v('nombre'), telefono: v('telefono'), email: v('email'), cedula: v('cedula'),
        ciudad: v('ciudad'), direccion: v('direccion'), referencia: v('referencia'),
      };
    };
    var revisar = function (c) {
      if (c.nombre.length < 3) return ['nombre', 'Escribe tu nombre completo.'];
      var dig = c.telefono.replace(/\D/g, '');
      if (dig.length < 9 || dig.length > 15) return ['telefono', 'Escribe un número de WhatsApp válido.'];
      if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return ['email', 'Revisa el correo o déjalo vacío.'];
      if (c.ciudad.length < 2) return ['ciudad', 'Escribe tu ciudad.'];
      if (c.cedula && !/^\d{10}(\d{3})?$/.test(c.cedula)) return ['cedula', 'La cédula tiene 10 dígitos y el RUC 13.'];
      if (c.direccion.length < 5) return ['direccion', 'Escribe la dirección de entrega.'];
      return null;
    };

    var enviando = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (enviando) return;
      error('');
      var c = datos();
      var mal = revisar(c);
      if (mal) { marcar(mal[0]); error(mal[1]); return; }
      if (!tsToken) { error('Estamos comprobando que eres una persona. Espera un segundo y vuelve a enviar.'); return; }
      var clave = leer(CLAVE_ENVIO);
      if (!clave) { clave = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); guardar(CLAVE_ENVIO, clave); }
      var ls = lineas();
      enviando = true;
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tienda' },
        body: JSON.stringify({
          clave: clave, turnstile: tsToken, cliente: c, notas: (form.elements.notas.value || '').trim(),
          items: ls.map(function (l) { return { id: l.id, qty: l.qty, nota: l.nota || '' }; }),
        }),
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) {
            if (res.d.campo && form.elements[res.d.campo]) marcar(res.d.campo);
            error(res.d.error || 'No pudimos enviar el pedido. Inténtalo de nuevo.');
            if (res.d.campo === 'turnstile' && window.turnstile && tsId != null) { tsToken = ''; window.turnstile.reset(tsId); }
            return;
          }
          var enlace = 'seguimiento.html#' + res.d.token;
          var resumen = 'Hola Supermuebles Cuenca, envié el pedido ' + res.d.codigo + ' desde la web:\n' +
            ls.map(function (l) { return '- ' + l.qty + ' × ' + cat.porId[l.id].name + (l.nota ? ' (' + l.nota + ')' : ''); }).join('\n') +
            '\nCiudad: ' + c.ciudad + '\nMi nombre: ' + c.nombre;
          guardar(CLAVE_CARRITO, null);
          guardar(CLAVE_ENVIO, null);
          pintarContador();
          $('#listo-codigo').textContent = res.d.codigo;
          $('#listo-seguimiento').href = enlace;
          $('#listo-wa').href = wa(resumen);
          mostrar('pedido-listo');
          var cabeza = $('.page-head');
          if (cabeza) cabeza.hidden = true;
          $('#pedido-listo').focus();
          window.scrollTo(0, 0);
        })
        .catch(function () { error('No hay conexión. Revisa tu internet y vuelve a enviar; tu pedido no se duplicará.'); })
        .then(function () { enviando = false; btn.disabled = false; btn.textContent = 'Enviar pedido'; });
    });

    pintar();
    if (lineas().length) cargarTurnstile();
  }

  /* ---------- página de seguimiento ---------- */
  var PASOS = [
    ['nuevo', 'Recibido', 'Recibimos tu pedido. Una asesora revisa el envío a tu ciudad y te escribe por WhatsApp con el total.'],
    ['por_pagar', 'Listo para pagar', 'Ya está el total con el envío. Te enviamos por WhatsApp cómo pagar.'],
    ['comprobante_recibido', 'Revisando tu pago', 'Recibimos tu comprobante. Lo estamos verificando.'],
    ['confirmado', 'Pago confirmado', 'Tu pago está confirmado. Pronto empezamos a fabricar.'],
    ['en_fabricacion', 'En fabricación', 'Tu mueble se está fabricando en nuestro taller de Turi.'],
    ['listo', 'Listo para enviar', 'Tu mueble está terminado y listo para salir de fábrica.'],
    ['enviado', 'Enviado', 'Tu mueble va en camino.'],
    ['entregado', 'Entregado', 'Tu pedido fue entregado. Gracias por confiar en Supermuebles Cuenca.'],
  ];

  function paginaSeguimiento() {
    var raiz = $('#seguimiento');
    if (!raiz) return;
    var token = (location.hash || '').slice(1);
    var falla = function (t) {
      $('#seg-cargando').hidden = true;
      if (t) $('#seg-error-texto').textContent = t;
      $('#seg-error').hidden = false;
    };
    if (!/^[a-f0-9]{32}$/.test(token)) { falla(); return; }
    fetch('/api/pedidos/' + token, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { falla(res.d.error); return; }
        var d = res.d;
        $('#seg-codigo').textContent = d.codigo;
        var idx = PASOS.map(function (p) { return p[0]; }).indexOf(d.estado);
        if (d.estado === 'cancelado') {
          $('#seg-lead').textContent = 'Este pedido fue cancelado. Si tienes dudas, escríbenos.';
          $('#seg-pasos').hidden = true;
        } else {
          $('#seg-lead').textContent = idx >= 0 ? PASOS[idx][2] : 'Aquí ves en qué va tu pedido.';
          $('#seg-pasos').innerHTML = PASOS.map(function (p, i) {
            var cls = i < idx ? 'is-hecho' : i === idx ? 'is-actual' : '';
            return '<li class="' + cls + '"' + (i === idx ? ' aria-current="step"' : '') + '>' + esc(p[1]) + '</li>';
          }).join('');
        }
        $('#seg-lineas').innerHTML = d.lineas.map(function (l) {
          return '<li class="linea linea--fija"><div class="linea-info"><p class="linea-nombre">' + esc(l.cantidad) + ' × ' + esc(l.nombre) + '</p>' +
            (l.nota ? '<p class="linea-precio">' + esc(l.nota) + '</p>' : '') + '</div>' +
            '<p class="linea-total">' + dinero(l.precio_cents * l.cantidad) + '</p></li>';
        }).join('');
        var filas = [['Subtotal', dinero(d.subtotal_cents)], ['Envío', d.envio_cents == null ? 'Por confirmar' : dinero(d.envio_cents)]];
        if (d.descuento_cents) filas.push(['Descuento', '−' + dinero(d.descuento_cents)]);
        filas.push(['Total', d.total_cents == null ? 'Por confirmar' : dinero(d.total_cents)]);
        if (d.abono_cents != null) filas.push(['Abono para empezar', dinero(d.abono_cents)]);
        $('#seg-totales').innerHTML = filas.map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>'; }).join('');
        $('#seg-wa').href = wa('Hola Supermuebles Cuenca, tengo una consulta sobre mi pedido ' + d.codigo + '.');
        $('#seg-cargando').hidden = true;
        $('#seg-cuerpo').hidden = false;
      })
      .catch(function () { falla('No hay conexión. Revisa tu internet y vuelve a abrir el enlace.'); });
  }

  /* ---------- arranque ---------- */
  paginaSeguimiento();
  var hayCatalogo = $('.catalog .item[id]');
  var esPedido = $('#pedido');
  if (!hayCatalogo && !esPedido && !lineas().length) return; // nada que hacer en esta página
  cargarCatalogo().then(function (cat) {
    tiendaActiva = cat.activa;
    pintarContador();
    if (cat.activa && hayCatalogo) botonesDelCatalogo(cat);
    paginaPedido(cat);
  });
  window.addEventListener('storage', function (e) { if (e.key === CLAVE_CARRITO) pintarContador(); });
})();
