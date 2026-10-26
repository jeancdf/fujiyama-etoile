/* Fujiyama Étoile — site public. Tout le contenu modifiable vient de data/site.json
 * (édité depuis l'espace admin). Le HTML contient une version française de secours,
 * remplacée dès que les données sont chargées. Aucune dépendance. */
(function () {
  'use strict';

  var SITE = null;   // site.json tel que publié (ou brouillon en mode aperçu)
  var MENUS = [];    // catégories avec seulement les articles visibles

  // Textes d'interface fixes. Le français est dans le HTML ; on le relit au chargement
  // pour pouvoir revenir au FR après un passage en EN.
  var EN = {
    skip: 'Skip to content',
    menu_open: 'Open menu',
    nav_menus: 'Our menus',
    nav_desserts: 'Desserts',
    nav_drinks: 'Drinks',
    nav_info: 'Visit us',
    order: 'Order',
    see_menus: 'See the menus',
    book_phone: 'Book by phone',
    mode_dine: 'Dine in',
    mode_take: 'Take away',
    mode_deliv: 'Delivery',
    mode_deliv_title: 'Delivery',
    hero_alt: 'Salmon sashimi on slate',
    from: 'Menus from',
    included: 'soup, salad and rice included',
    hours: 'Opening hours',
    address: 'Address',
    directions: 'Directions →',
    directions_btn: 'Directions',
    delivery: 'Delivery &amp; take away',
    featured_kicker: 'Favourites',
    featured_title: 'A selection of our menus',
    all_cats: 'The full menu →',
    served_with: 'Set menus come with 1 miso soup, 1 salad and 1 rice.',
    chef_alt: 'The chef plating sushi',
    ways_title: 'At the restaurant, the office or at home.',
    way1: 'Lunch and dinner, see opening hours.',
    way2: 'Order by phone and pick up.',
    call: 'Call',
    call_short: 'Call',
    drinks_kicker: 'To go with it',
    drinks_title: 'Sake, Japanese beer &amp; wine',
    drinks_text: 'Hakutsuru sake served hot or cold, Asahi and Kirin, and a selection of Loire, Burgundy and Provence wines.',
    all_drinks: 'All drinks →',
    visit_title: 'Visit Fujiyama',
    hours_caption: 'Opening hours',
    allergens: 'Allergen information on request',
    menus_kicker: 'The menu',
    menus_title: 'Our menus',
    menus_sub: 'Prices include tax and service. Set menus come with 1 miso soup, 1 salad and 1 rice.',
    preview: 'Preview — not published yet'
  };
  var FR = {};

  var UI = {
    fr: {
      open: 'Ouvert · ferme à ', opens: 'Fermé · ouvre à ', opensDay: 'Fermé · ouvre ', at: ' à ', closedToday: 'Fermé',
      setNote: 'Servi avec soupe, crudité et riz', aLaCarte: 'À la carte', for2: 'Pour 2',
      enlarge: 'Agrandir la photo :', close: 'Fermer', prev: 'Photo précédente', next: 'Photo suivante',
      days: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], tomorrow: 'demain',
      closed: 'Fermé', and: ' et ', freeDelivery: 'Livraison gratuite', evening: ' le soir', from: ' dès ',
      deliveryLong: function (d) { return 'Livraison gratuite' + (d.when === 'soir' ? ' le soir uniquement' : '') + (d.freeFrom ? ',<br>dès ' + money(d.freeFrom) + ' de commande' : ''); },
      way3: function (d) { return 'Gratuite' + (d.when === 'soir' ? ' le soir' : '') + (d.freeFrom ? ' dès ' + money(d.freeFrom) + ' de commande.' : '.'); }
    },
    en: {
      open: 'Open · closes at ', opens: 'Closed · opens at ', opensDay: 'Closed · opens ', at: ' at ', closedToday: 'Closed',
      setNote: 'Served with soup, salad and rice', aLaCarte: 'À la carte', for2: 'For 2',
      enlarge: 'Enlarge photo:', close: 'Close', prev: 'Previous photo', next: 'Next photo',
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], tomorrow: 'tomorrow',
      closed: 'Closed', and: ' and ', freeDelivery: 'Free delivery', evening: ' in the evening', from: ' from ',
      deliveryLong: function (d) { return 'Free delivery' + (d.when === 'soir' ? ' in the evening only' : '') + (d.freeFrom ? ',<br>for orders from ' + money(d.freeFrom) : ''); },
      way3: function (d) { return 'Free' + (d.when === 'soir' ? ' in the evening' : '') + (d.freeFrom ? ' for orders from ' + money(d.freeFrom) + '.' : '.'); }
    }
  };

  var lang = 'fr';

  function store(key, value) {
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  function price(p) { return lang === 'fr' ? p + ' €' : '€' + p.replace(',', '.'); }
  function money(n) { return price(String(n).replace('.', ',')); }
  function catLabel(c) { return (lang === 'en' && c.en) || c.fr; }
  function itemDesc(it) { return (lang === 'en' && it.en) || it.fr; }
  function tr(pair) { return pair ? (lang === 'en' && pair.en) || pair.fr || '' : ''; }

  function each(sel, fn) { document.querySelectorAll(sel).forEach(fn); }

  // ---------- Horaires ----------

  function toMin(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }
  function fmt(t) {
    var p = t.split(':');
    return lang === 'fr' ? +p[0] + 'h' + (p[1] === '00' ? '' : p[1]) : +p[0] + ':' + p[1];
  }
  function slotText(s) { return fmt(s.open) + '–' + fmt(s.close); }

  // Créneaux du jour i (0 = lundi), en minutes.
  function slotsOf(i) {
    var h = SITE.info.hours[i];
    return [h.lunch, h.dinner].filter(Boolean).map(function (s) { return [toMin(s.open), toMin(s.close)]; });
  }
  function dayText(i) {
    var h = SITE.info.hours[i], parts = [h.lunch, h.dinner].filter(Boolean).map(slotText);
    return parts.length ? parts.join(' · ') : UI[lang].closed;
  }

  // Regroupe les jours consécutifs aux horaires identiques : « Lundi – vendredi ».
  function hourGroups() {
    var groups = [];
    for (var i = 0; i < 7; i++) {
      var text = dayText(i), last = groups[groups.length - 1];
      if (last && last.text === text) last.days.push(i); else groups.push({ days: [i], text: text });
    }
    var names = UI[lang].days;
    groups.forEach(function (g) {
      var first = names[g.days[0]], end = names[g.days[g.days.length - 1]];
      var label = g.days.length === 1 ? first : first + ' – ' + end;
      g.label = label.charAt(0).toUpperCase() + label.slice(1);
    });
    return groups;
  }

  // Heure de Paris, quel que soit le fuseau du visiteur. Jour : 0 = lundi.
  function parisNow() {
    var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    var get = function (t) { return parts.find(function (p) { return p.type === t; }).value; };
    return { day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')), min: +get('hour') * 60 + +get('minute') };
  }

  function hhmm(min) { return fmt(Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0')); }

  function renderStatus() {
    var el = document.querySelector('[data-status]');
    if (!el || !SITE) return;
    var now = parisNow(), t = UI[lang], text = null, open = false, today = slotsOf(now.day);
    for (var i = 0; i < today.length; i++) {
      if (now.min >= today[i][0] && now.min < today[i][1]) { open = true; text = t.open + hhmm(today[i][1]); break; }
      if (now.min < today[i][0]) { text = t.opens + hhmm(today[i][0]); break; }
    }
    for (var d = 1; !text && d <= 7; d++) {
      var next = slotsOf((now.day + d) % 7);
      if (next.length) text = t.opensDay + (d === 1 ? t.tomorrow : t.days[(now.day + d) % 7]) + t.at + hhmm(next[0][0]);
    }
    el.setAttribute('data-open', open);
    el.querySelector('[data-status-text]').textContent = text || t.closedToday;
    each('.hours tr[data-days]', function (row) {
      row.setAttribute('data-today', row.getAttribute('data-days').split(',').indexOf(String(now.day)) !== -1);
    });
  }

  // ---------- Infos pratiques ----------

  function telHref(phone) {
    var d = phone.replace(/[^\d+]/g, '');
    if (/^0\d{9}$/.test(d)) d = '+33' + d.slice(1);
    return 'tel:' + d;
  }

  function renderInfo() {
    var info = SITE.info, t = UI[lang], d = info.delivery;
    var full = info.address + ', ' + info.postalCity;
    var q = encodeURIComponent(full);

    each('[data-bind="phone"]', function (el) { el.textContent = info.phone; });
    each('[data-tel]', function (el) { el.href = telHref(info.phone); });
    each('[data-bind="address"]', function (el) { el.textContent = info.address; });
    each('[data-bind="postalCity"]', function (el) { el.textContent = info.postalCity; });
    each('[data-directions]', function (el) { el.href = 'https://www.google.com/maps/dir/?api=1&destination=' + q; });
    each('[data-map]', function (el) {
      var src = 'https://www.google.com/maps?q=' + q + '&output=embed';
      if (el.getAttribute('src') !== src) el.src = src;
    });
    // « Commander » mène à la plateforme de commande si elle est renseignée, sinon au téléphone.
    each('[data-order]', function (el) {
      if (d.enabled && d.orderUrl) { el.href = d.orderUrl; el.target = '_blank'; el.rel = 'noopener'; }
      else { el.href = telHref(info.phone); el.removeAttribute('target'); }
    });

    var groups = hourGroups();
    each('[data-bind="hoursText"]', function (el) {
      el.innerHTML = groups.map(function (g) { return esc(g.label + ' · ' + g.text); }).join('<br>');
    });
    each('[data-hours-table]', function (tbody) {
      tbody.innerHTML = groups.map(function (g) {
        return '<tr data-days="' + g.days.join(',') + '"><th scope="row">' + esc(g.label) + '</th><td>' + esc(g.text) + '</td></tr>';
      }).join('');
    });

    each('[data-if-delivery]', function (el) { el.hidden = !d.enabled; });
    each('[data-bind="deliveryShort"]', function (el) {
      el.textContent = t.freeDelivery + (d.when === 'soir' ? t.evening : '') + (d.freeFrom ? t.from + money(d.freeFrom) : '');
    });
    each('[data-bind="deliveryLong"]', function (el) { el.innerHTML = t.deliveryLong(d); });
    each('[data-bind="way3"]', function (el) { el.textContent = t.way3(d).replace(/<br>/g, ' '); });

    var msg = info.message, today = new Date().toISOString().slice(0, 10);
    var showMsg = msg.enabled && tr(msg) && (!msg.until || today <= msg.until);
    each('[data-announce]', function (el) {
      el.hidden = !showMsg;
      if (showMsg) el.querySelector('[data-announce-text]').textContent = tr(msg);
    });

    each('[data-social]', function (el) {
      var links = [];
      if (info.links.instagram) links.push('<a href="' + esc(info.links.instagram) + '" target="_blank" rel="noopener">Instagram</a>');
      if (info.links.google) links.push('<a href="' + esc(info.links.google) + '" target="_blank" rel="noopener">Google</a>');
      el.innerHTML = links.join(' · ');
      el.hidden = !links.length;
    });

    var ld = document.querySelector('script[type="application/ld+json"]');
    if (ld) {
      try {
        var data = JSON.parse(ld.textContent), en = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        data.telephone = info.phone;
        data.address.streetAddress = info.address;
        data.openingHoursSpecification = [];
        info.hours.forEach(function (h, i) {
          [h.lunch, h.dinner].filter(Boolean).forEach(function (s) {
            data.openingHoursSpecification.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: en[i], opens: s.open, closes: s.close });
          });
        });
        ld.textContent = JSON.stringify(data);
      } catch (e) { /* données structurées laissées telles quelles */ }
    }
  }

  // ---------- Accueil ----------

  function zoomButton(cat, it) {
    return '<button type="button" class="zoom" data-zoom="' + cat.id + ':' + cat.items.indexOf(it) + '" aria-label="' + esc(UI[lang].enlarge + ' ' + it.name) + '">' +
      '<img src="' + esc(it.img) + '" alt="" width="640" height="410" loading="lazy">' +
      '<span class="zoom__icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/></svg></span>' +
    '</button>';
  }

  function renderHome() {
    var home = SITE.home;
    each('[data-home]', function (el) {
      var v = tr(home[el.getAttribute('data-home')]);
      if (v) el.textContent = v;
    });
    each('[data-home-img]', function (el) { if (home.heroImg) el.src = home.heroImg; });

    var chips = document.querySelector('[data-cat-chips]');
    if (chips) {
      chips.innerHTML = MENUS.map(function (c) {
        return '<li><a class="chip" href="menus.html#' + c.id + '">' + esc(catLabel(c)) + '</a></li>';
      }).join('');
    }

    // Plats mis en avant : 4 au plus, hors boissons (affichées dans leur propre bloc).
    var picks = [], drinks = [];
    MENUS.forEach(function (c) {
      c.items.forEach(function (it) {
        if (!it.featured) return;
        if (c.id === 'boissons') drinks.push(it); else if (picks.length < 4) picks.push({ cat: c, item: it });
      });
    });

    var featured = document.querySelector('[data-featured]');
    if (featured) {
      featured.innerHTML = picks.map(function (f) {
        var it = f.item;
        return '<article class="card">' + (it.img ? zoomButton(f.cat, it) : '') +
          '<div class="card__body">' +
            '<div class="card__top"><h3>' + esc(it.name) + '</h3><span class="card__price">' + price(it.price) + '</span></div>' +
            '<span class="card__cat">' + esc(it.pour2 ? UI[lang].for2 : catLabel(f.cat)) + '</span>' +
            '<p>' + esc(itemDesc(it)) + '</p>' +
          '</div></article>';
      }).join('');
    }

    var list = document.querySelector('[data-drinks]');
    if (list) {
      list.innerHTML = drinks.map(function (it) {
        var desc = itemDesc(it), label = it.name + (desc ? ' — ' + desc : '');
        return '<li><span>' + esc(label) + '</span><span class="pricelist__dots" aria-hidden="true"></span><span class="pricelist__price">' + price(it.price) + '</span></li>';
      }).join('');
    }

    var min = document.querySelector('[data-min-price]');
    if (min) {
      var lowest = Infinity, label = '';
      MENUS.forEach(function (c) {
        if (!c.servedWith) return;
        c.items.forEach(function (it) {
          var v = parseFloat(it.price.replace(',', '.'));
          if (v < lowest) { lowest = v; label = it.price; }
        });
      });
      if (label) min.textContent = price(label);
    }
  }

  // ---------- Carte ----------

  function renderMenus() {
    var sections = document.querySelector('[data-menu-sections]');
    if (!sections) return;
    var t = UI[lang];

    var links = MENUS.map(function (c) { return { id: c.id, label: esc(catLabel(c)), count: c.items.length }; });
    document.querySelector('[data-menu-nav]').innerHTML = links.map(function (l) {
      return '<a href="#' + l.id + '" data-cat-link="' + l.id + '"><span>' + l.label + '</span><span class="menu-nav__count">' + l.count + '</span></a>';
    }).join('');
    document.querySelector('[data-menu-chips]').innerHTML = links.map(function (l) {
      return '<a class="chip" href="#' + l.id + '" data-cat-link="' + l.id + '">' + l.label + '</a>';
    }).join('');

    sections.innerHTML = MENUS.map(function (c) {
      return '<section class="menu-cat" id="' + c.id + '" aria-labelledby="h-' + c.id + '">' +
        '<div class="menu-cat__banner"><div><h2 id="h-' + c.id + '">' + esc(catLabel(c)) + '</h2><p>' + esc(c.servedWith ? t.setNote : t.aLaCarte) + '</p></div></div>' +
        '<ul class="menu-list">' + c.items.map(function (it) {
          var desc = itemDesc(it);
          return '<li class="menu-item">' + (it.img ? zoomButton(c, it) : '') +
            '<div class="menu-item__body">' +
              '<div class="menu-item__top"><div class="menu-item__name">' + esc(it.name) + (it.pour2 ? ' <span class="badge">' + t.for2 + '</span>' : '') + '</div>' +
              '<span class="menu-item__price">' + price(it.price) + '</span></div>' +
              (desc ? '<div class="menu-item__desc">' + esc(desc) + '</div>' : '') +
            '</div></li>';
        }).join('') + '</ul></section>';
    }).join('');

    watchSections();
  }

  // ---------- Visionneuse photo ----------
  var box = { el: null, cat: null, index: 0 };

  function buildLightbox() {
    var d = document.createElement('dialog');
    d.className = 'lightbox';
    d.innerHTML =
      '<figure class="lightbox__figure"><img alt="" data-lb-img>' +
        '<figcaption class="lightbox__caption"><div><div class="lightbox__name" data-lb-name></div><div class="lightbox__desc" data-lb-desc></div></div>' +
        '<span class="lightbox__price" data-lb-price></span></figcaption></figure>' +
      '<span class="lightbox__count" data-lb-count></span>' +
      '<button type="button" class="lightbox__btn lightbox__close" data-lb-close><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '<button type="button" class="lightbox__btn lightbox__prev" data-lb-step="-1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '<button type="button" class="lightbox__btn lightbox__next" data-lb-step="1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>';
    document.body.appendChild(d);

    d.addEventListener('click', function (e) {
      if (e.target === d || e.target.closest('[data-lb-close]')) return d.close();
      var step = e.target.closest('[data-lb-step]');
      if (step) showPhoto(box.index + parseInt(step.getAttribute('data-lb-step'), 10));
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') showPhoto(box.index - 1);
      if (e.key === 'ArrowRight') showPhoto(box.index + 1);
    });
    var startX = null;
    d.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
    d.addEventListener('touchend', function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) showPhoto(box.index + (dx < 0 ? 1 : -1));
      startX = null;
    });
    box.el = d;
  }

  // Photos de la catégorie ouverte (les articles sans photo sont sautés).
  function photos() { return box.cat.items.filter(function (it) { return it.img; }); }

  function showPhoto(i) {
    var list = photos(), n = list.length, t = UI[lang];
    box.index = (i + n) % n;
    var it = list[box.index], d = box.el;
    d.querySelector('[data-lb-img]').src = it.img;
    d.querySelector('[data-lb-img]').alt = it.name;
    d.querySelector('[data-lb-name]').textContent = it.name;
    d.querySelector('[data-lb-desc]').textContent = itemDesc(it);
    d.querySelector('[data-lb-price]').textContent = price(it.price);
    d.querySelector('[data-lb-count]').textContent = (box.index + 1) + ' / ' + n;
    d.querySelector('[data-lb-close]').setAttribute('aria-label', t.close);
    d.querySelector('.lightbox__prev').setAttribute('aria-label', t.prev);
    d.querySelector('.lightbox__next').setAttribute('aria-label', t.next);
    d.querySelectorAll('[data-lb-step]').forEach(function (b) { b.hidden = n < 2; });
  }

  function openPhoto(key) {
    var parts = key.split(':');
    var cat = MENUS.filter(function (c) { return c.id === parts[0]; })[0];
    if (!cat) return;
    if (!box.el) buildLightbox();
    box.cat = cat;
    showPhoto(photos().indexOf(cat.items[parseInt(parts[1], 10)]));
    if (!box.el.open) box.el.showModal();
  }

  document.addEventListener('click', function (e) {
    var z = e.target.closest('[data-zoom]');
    if (z) openPhoto(z.getAttribute('data-zoom'));
  });

  // ---------- Catégorie active dans la navigation de la carte ----------
  var currentId = null, watching = false, ticking = false;
  function setCurrent(id) {
    if (id === currentId) return;
    currentId = id;
    each('[data-cat-link]', function (a) {
      var on = a.getAttribute('data-cat-link') === id;
      a.setAttribute('aria-current', on ? 'true' : 'false');
      if (on && a.classList.contains('chip')) {
        // Pas de défilement animé ici : il annulerait celui de la page dans Chrome.
        var bar = a.parentElement;
        bar.scrollLeft = a.offsetLeft - bar.clientWidth / 2 + a.clientWidth / 2;
      }
    });
  }
  // Catégorie active = la dernière dont le haut a passé l'en-tête collant.
  function syncCurrent() {
    ticking = false;
    var sections = document.querySelectorAll('.menu-cat');
    if (!sections.length) return;
    var id = sections[0].id;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= 170) id = sections[i].id;
    }
    setCurrent(id);
  }
  function watchSections() {
    currentId = null;
    syncCurrent();
    if (watching) return;
    watching = true;
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(syncCurrent); }
    }, { passive: true });
  }

  // ---------- Langue et chargement ----------

  function render() {
    if (!SITE) return;
    renderInfo();
    renderStatus();
    renderHome();
    renderMenus();
  }

  function applyLang(next) {
    lang = next === 'en' ? 'en' : 'fr';
    document.documentElement.lang = lang;
    var dict = lang === 'en' ? EN : FR;
    each('[data-i18n]', function (el) {
      var k = el.getAttribute('data-i18n');
      if (dict[k] != null) el.innerHTML = dict[k];
    });
    each('[data-i18n-alt]', function (el) {
      var k = el.getAttribute('data-i18n-alt');
      if (dict[k] != null) el.alt = dict[k];
    });
    each('[data-lang]', function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang); });
    render();
    store('fujiyama-lang', lang);
  }

  function setSite(site) {
    SITE = site;
    MENUS = site.categories.map(function (c) {
      return Object.assign({}, c, { items: c.items.filter(function (it) { return it.visible; }) });
    }).filter(function (c) { return c.items.length; });
    render();
    if (location.hash) {
      var target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView();
    }
  }

  // ?apercu : l'admin connecté voit le brouillon avant de le publier.
  function load() {
    var preview = /[?&]apercu\b/.test(location.search);
    var url = preview ? '/api/state' : 'data/site.json';
    return fetch(url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        if (preview) {
          each('[data-preview]', function (el) { el.hidden = false; });
          return data.draft || data.published;
        }
        return data;
      });
  }

  function init() {
    each('[data-i18n]', function (el) { FR[el.getAttribute('data-i18n')] = el.innerHTML; });
    each('[data-i18n-alt]', function (el) { FR[el.getAttribute('data-i18n-alt')] = el.alt; });

    each('[data-lang]', function (b) {
      b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
    });

    var toggle = document.querySelector('[data-nav-toggle]'), nav = document.getElementById('nav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', open);
        nav.setAttribute('data-open', open);
      });
      nav.addEventListener('click', function (e) {
        if (e.target.closest('a')) { toggle.setAttribute('aria-expanded', 'false'); nav.setAttribute('data-open', 'false'); }
      });
    }

    each('[data-year]', function (el) { el.textContent = new Date().getFullYear(); });

    applyLang(store('fujiyama-lang') || (navigator.language || 'fr').slice(0, 2));
    load().then(setSite).catch(function (e) { console.error('Données du site indisponibles', e); });
    setInterval(renderStatus, 60000);
  }

  init();
})();
