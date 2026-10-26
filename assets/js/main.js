/* Fujiyama Étoile — langue, horaires, rendu des menus. Aucune dépendance. */
(function () {
  'use strict';

  var MENUS = window.MENUS || [];

  // Textes d'interface. Le français est déjà dans le HTML ; on le relit au chargement
  // pour pouvoir revenir au FR après un passage en EN.
  var EN = {
    skip: 'Skip to content',
    delivery_short: 'Free evening delivery from €20',
    menu_open: 'Open menu',
    nav_menus: 'Our menus',
    nav_desserts: 'Desserts',
    nav_drinks: 'Drinks',
    nav_info: 'Visit us',
    order: 'Order',
    hero_kicker: 'Japanese restaurant · Paris 17',
    hero_title: 'Sushi, sashimi &amp; yakitori, steps from the Étoile.',
    hero_lead: 'Over 70 set menus served with miso soup, salad and rice. Dine in, take away or delivered, 7 days a week.',
    see_menus: 'See the menus',
    book_phone: 'Book by phone',
    mode_dine: 'Dine in',
    mode_take: 'Take away',
    mode_deliv: 'Evening delivery',
    mode_deliv_title: 'Delivery',
    hero_alt: 'Salmon sashimi on slate',
    from: 'Menus from',
    included: 'soup, salad and rice included',
    hours: 'Opening hours',
    hours_text: 'Daily · 11:30–14:30 and 18:30–22:30<br>Closed Saturday and Sunday lunch',
    address: 'Address',
    directions: 'Directions →',
    directions_btn: 'Directions',
    delivery: 'Delivery &amp; take away',
    delivery_text: 'Free delivery in the evening only,<br>for orders from €20',
    featured_kicker: 'Favourites',
    featured_title: 'A selection of our menus',
    all_cats: 'All 11 categories →',
    served_with: 'Set menus come with 1 miso soup, 1 salad and 1 rice.',
    chef_alt: 'The chef plating sushi',
    ways_title: 'At the restaurant, the office or at home.',
    way1: 'Lunch and dinner, except Saturday and Sunday lunch.',
    way2: 'Order by phone and pick up.',
    way3: 'Free in the evening for orders from €20.',
    call: 'Call',
    call_short: 'Call',
    drinks_kicker: 'To go with it',
    drinks_title: 'Sake, Japanese beer &amp; wine',
    drinks_text: 'Hakutsuru sake served hot or cold, Asahi and Kirin, and a selection of Loire, Burgundy and Provence wines.',
    all_drinks: 'All drinks →',
    visit_title: 'Visit Fujiyama',
    hours_caption: 'Opening hours',
    weekdays: 'Monday – Friday',
    saturday: 'Saturday',
    sunday: 'Sunday',
    allergens: 'Allergen information on request',
    menus_kicker: 'The menu',
    menus_title: 'Our menus',
    menus_sub: 'Prices include tax and service. Set menus come with 1 miso soup, 1 salad and 1 rice.'
  };
  var FR = {};

  var UI = {
    fr: { open: 'Ouvert · ferme à ', opens: 'Fermé · ouvre à ', opensTomorrow: 'Fermé · ouvre demain à ', setNote: 'Servi avec soupe, crudité et riz', aLaCarte: 'À la carte', for2: 'Pour 2', enlarge: 'Agrandir la photo :', close: 'Fermer', prev: 'Photo précédente', next: 'Photo suivante' },
    en: { open: 'Open · closes at ', opens: 'Closed · opens at ', opensTomorrow: 'Closed · opens tomorrow at ', setNote: 'Served with soup, salad and rice', aLaCarte: 'À la carte', for2: 'For 2', enlarge: 'Enlarge photo:', close: 'Close', prev: 'Previous photo', next: 'Next photo' }
  };

  var FEATURED = ['Menu F1', 'Menu A1', 'Menu Bateau', 'Menu Fujiyama 1'];
  var FEATURED_DRINKS = ['Hakutsuru premium 18cl', 'Hakutsuru draft 30cl', 'Bière japonaise ASAHI 33cl', 'Bière japonaise Kirin 50cl', 'Limonade japonaise 20cl', 'Sancerre 75cl', 'Chablis 75cl', 'Champagne (Nicolas Feuillatte) 75cl'];
  var A_LA_CARTE = ['desserts', 'boissons'];

  // Créneaux par jour (0 = dimanche), en minutes depuis minuit.
  var LUNCH = [690, 870], DINNER = [1110, 1350];
  var SLOTS = [[DINNER], [LUNCH, DINNER], [LUNCH, DINNER], [LUNCH, DINNER], [LUNCH, DINNER], [LUNCH, DINNER], [DINNER]];

  var lang = 'fr';

  function store(key, value) {
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  function price(p) {
    return lang === 'fr' ? p + ' €' : '€' + p.replace(',', '.');
  }

  function catLabel(c) { return lang === 'fr' ? c.fr : c.en; }

  function itemDesc(it) {
    if (lang === 'en' && it.en) return it.en;
    return it.fr;
  }

  function hhmm(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return lang === 'fr' ? h + 'h' + (m ? String(m).padStart(2, '0') : '') : h + ':' + String(m).padStart(2, '0');
  }

  // Heure de Paris, quel que soit le fuseau du visiteur.
  function parisNow() {
    var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    var get = function (t) { return parts.find(function (p) { return p.type === t; }).value; };
    var day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    return { day: day, min: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10) };
  }

  function renderStatus() {
    var el = document.querySelector('[data-status]');
    if (!el) return;
    var now = parisNow(), t = UI[lang], text, open = false;
    var today = SLOTS[now.day];
    for (var i = 0; i < today.length; i++) {
      if (now.min >= today[i][0] && now.min < today[i][1]) { open = true; text = t.open + hhmm(today[i][1]); break; }
      if (now.min < today[i][0]) { text = t.opens + hhmm(today[i][0]); break; }
    }
    if (!text) text = t.opensTomorrow + hhmm(SLOTS[(now.day + 1) % 7][0][0]);
    el.setAttribute('data-open', open);
    el.querySelector('[data-status-text]').textContent = text;

    document.querySelectorAll('.hours tr[data-days]').forEach(function (tr) {
      tr.setAttribute('data-today', tr.getAttribute('data-days').split(',').indexOf(String(now.day)) !== -1);
    });
  }

  function findItem(name) {
    for (var i = 0; i < MENUS.length; i++) {
      for (var j = 0; j < MENUS[i].items.length; j++) {
        if (MENUS[i].items[j].name === name) return { cat: MENUS[i], item: MENUS[i].items[j] };
      }
    }
    return null;
  }

  function renderHome() {
    var chips = document.querySelector('[data-cat-chips]');
    if (chips) {
      chips.innerHTML = MENUS.map(function (c) {
        return '<li><a class="chip" href="menus.html#' + c.id + '">' + esc(catLabel(c)) + '</a></li>';
      }).join('');
    }

    var featured = document.querySelector('[data-featured]');
    if (featured) {
      featured.innerHTML = FEATURED.map(findItem).filter(Boolean).map(function (f) {
        var it = f.item;
        return '<article class="card">' +
          '<button type="button" class="zoom" data-zoom="' + f.cat.id + ':' + f.cat.items.indexOf(it) + '" aria-label="' + esc(UI[lang].enlarge + ' ' + it.name) + '">' +
            '<img src="' + esc(it.img) + '" alt="" width="640" height="410" loading="lazy">' +
            '<span class="zoom__icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/></svg></span>' +
          '</button>' +
          '<div class="card__body">' +
            '<div class="card__top"><h3>' + esc(it.name) + '</h3><span class="card__price">' + price(it.price) + '</span></div>' +
            '<span class="card__cat">' + esc(it.pour2 ? UI[lang].for2 : catLabel(f.cat)) + '</span>' +
            '<p>' + esc(itemDesc(it)) + '</p>' +
          '</div></article>';
      }).join('');
    }

    var drinks = document.querySelector('[data-drinks]');
    if (drinks) {
      drinks.innerHTML = FEATURED_DRINKS.map(findItem).filter(Boolean).map(function (f) {
        var it = f.item, label = it.name + (it.fr ? ' — ' + it.fr : '');
        return '<li><span>' + esc(label) + '</span><span class="pricelist__dots" aria-hidden="true"></span><span class="pricelist__price">' + price(it.price) + '</span></li>';
      }).join('');
    }

    var min = document.querySelector('[data-min-price]');
    if (min) {
      var lowest = Infinity, label = '';
      MENUS.forEach(function (c) {
        if (A_LA_CARTE.indexOf(c.id) !== -1) return;
        c.items.forEach(function (it) {
          var v = parseFloat(it.price.replace(',', '.'));
          if (/^Menu /.test(it.name) && v < lowest) { lowest = v; label = it.price; }
        });
      });
      if (label) min.textContent = price(label);
    }
  }

  function renderMenus() {
    var sections = document.querySelector('[data-menu-sections]');
    if (!sections) return;
    var t = UI[lang];

    var links = MENUS.map(function (c) {
      return { id: c.id, label: esc(catLabel(c)), count: c.items.length };
    });
    document.querySelector('[data-menu-nav]').innerHTML = links.map(function (l) {
      return '<a href="#' + l.id + '" data-cat-link="' + l.id + '"><span>' + l.label + '</span><span class="menu-nav__count">' + l.count + '</span></a>';
    }).join('');
    document.querySelector('[data-menu-chips]').innerHTML = links.map(function (l) {
      return '<a class="chip" href="#' + l.id + '" data-cat-link="' + l.id + '">' + l.label + '</a>';
    }).join('');

    sections.innerHTML = MENUS.map(function (c) {
      var note = A_LA_CARTE.indexOf(c.id) !== -1 ? t.aLaCarte : t.setNote;
      return '<section class="menu-cat" id="' + c.id + '" aria-labelledby="h-' + c.id + '">' +
        '<div class="menu-cat__banner">' +
          '<div><h2 id="h-' + c.id + '">' + esc(catLabel(c)) + '</h2><p>' + esc(note) + '</p></div>' +
        '</div>' +
        '<ul class="menu-list">' + c.items.map(function (it, i) {
          var desc = itemDesc(it);
          return '<li class="menu-item">' +
            (it.img
              ? '<button type="button" class="zoom" data-zoom="' + c.id + ':' + i + '" aria-label="' + esc(t.enlarge + ' ' + it.name) + '">' +
                  '<img src="' + esc(it.img) + '" alt="" width="640" height="410" loading="lazy">' +
                  '<span class="zoom__icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/></svg></span>' +
                '</button>'
              : '') +
            '<div class="menu-item__body">' +
              '<div class="menu-item__top"><div class="menu-item__name">' + esc(it.name) + (it.pour2 ? ' <span class="badge">' + t.for2 + '</span>' : '') + '</div>' +
              '<span class="menu-item__price">' + price(it.price) + '</span></div>' +
              (desc ? '<div class="menu-item__desc">' + esc(desc) + '</div>' : '') +
            '</div>' +
          '</li>';
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

  var currentId = null, watching = false, ticking = false;
  function setCurrent(id) {
    if (id === currentId) return;
    currentId = id;
    document.querySelectorAll('[data-cat-link]').forEach(function (a) {
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

  function applyLang(next) {
    lang = next === 'en' ? 'en' : 'fr';
    document.documentElement.lang = lang;
    var dict = lang === 'en' ? EN : FR;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (dict[k] != null) el.innerHTML = dict[k];
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-alt');
      if (dict[k] != null) el.alt = dict[k];
    });
    document.querySelectorAll('[data-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang);
    });
    renderStatus();
    renderHome();
    renderMenus();
    store('fujiyama-lang', lang);
  }

  function init() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) { FR[el.getAttribute('data-i18n')] = el.innerHTML; });
    document.querySelectorAll('[data-i18n-alt]').forEach(function (el) { FR[el.getAttribute('data-i18n-alt')] = el.alt; });

    document.querySelectorAll('[data-lang]').forEach(function (b) {
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

    document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

    applyLang(store('fujiyama-lang') || (navigator.language || 'fr').slice(0, 2));
    if (location.hash) {
      var target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView();
    }
    setInterval(renderStatus, 60000);
  }

  init();
})();
