/* Fujiyama Étoile — espace restaurant.
 * Application d'une page, sans dépendance. Les modifications sont enregistrées dans un
 * brouillon côté serveur, puis rendues visibles aux clients avec « Publier sur le site ». */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var toastEl = document.querySelector('.toast');

  var state = { published: null, work: null };
  var ui = { q: '', addingCat: false, edit: null, editCat: null, dirty: false };

  var DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  var ICON = {
    carte: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h10"/></svg>',
    infos: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    accueil: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 4l9 7v9H3z"/><path d="M9 20v-6h6v6"/></svg>',
    up: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>'
  };

  // ---------- Outils ----------

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function imgUrl(p) { return p ? '/' + p : ''; }
  function $(sel, root) { return (root || app).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || app).querySelectorAll(sel)); }

  var toastTimer;
  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.setAttribute('data-kind', kind || 'ok');
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, kind === 'error' ? 6000 : 2600);
  }

  function api(method, url, body, contentType) {
    var opts = { method: method, credentials: 'same-origin', headers: { 'X-Fujiyama': '1' } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = contentType || 'application/json';
      opts.body = contentType ? body : JSON.stringify(body);
    }
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.status === 401 && url !== '/api/login') { showLogin('Votre session a expiré, reconnectez-vous.'); throw new Error('Session expirée'); }
        if (!r.ok) throw new Error(data.error || 'Erreur ' + r.status);
        return data;
      });
    });
  }

  function slug(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'article';
  }
  function allIds() {
    var ids = {};
    state.work.categories.forEach(function (c) { ids[c.id] = 1; c.items.forEach(function (it) { ids[it.id] = 1; }); });
    return ids;
  }
  function uniqueId(name) {
    var ids = allIds(), base = slug(name), id = base, n = 2;
    while (ids[id]) id = base + '-' + n++;
    return id;
  }

  // « 15 », « 15.5 », « 15,50 € » → « 15,50 ». Renvoie null si illisible.
  function normalizePrice(v) {
    var m = /^\s*(\d{1,4})(?:[.,](\d{1,2}))?\s*€?\s*$/.exec(v || '');
    if (!m) return null;
    return m[1] + ',' + ((m[2] || '') + '00').slice(0, 2);
  }

  function findItem(id) {
    var cats = state.work.categories;
    for (var i = 0; i < cats.length; i++) {
      for (var j = 0; j < cats[i].items.length; j++) if (cats[i].items[j].id === id) return { cat: cats[i], item: cats[i].items[j], index: j };
    }
    return null;
  }

  // Nombre de modifications entre le brouillon et la version publiée.
  function pendingCount() {
    var pub = state.published, work = state.work, n = 0;
    if (!pub || !work) return 0;
    ['name', 'address', 'postalCity', 'phone', 'hours', 'delivery', 'message', 'links'].forEach(function (k) { if (!same(pub.info[k], work.info[k])) n++; });
    ['heroImg', 'kicker', 'title', 'lead'].forEach(function (k) { if (!same(pub.home[k], work.home[k])) n++; });
    var pubCats = {}, pubItems = {}, workItems = {};
    pub.categories.forEach(function (c) { pubCats[c.id] = c; c.items.forEach(function (it) { pubItems[it.id] = { cat: c.id, it: it }; }); });
    if (!same(pub.categories.map(function (c) { return c.id; }), work.categories.map(function (c) { return c.id; }))) n++;
    work.categories.forEach(function (c) {
      var p = pubCats[c.id];
      if (!p) n++;
      else {
        if (p.fr !== c.fr || p.en !== c.en || p.servedWith !== c.servedWith) n++;
        if (!same(p.items.map(function (i) { return i.id; }), c.items.map(function (i) { return i.id; }))) n++;
      }
      c.items.forEach(function (it) {
        workItems[it.id] = 1;
        var old = pubItems[it.id];
        if (!old || old.cat !== c.id || !same(old.it, it)) n++;
      });
    });
    Object.keys(pubItems).forEach(function (id) { if (!workItems[id]) n++; });
    pub.categories.forEach(function (c) { if (!work.categories.some(function (w) { return w.id === c.id; })) n++; });
    return n;
  }

  // ---------- Données ----------

  function loadState() {
    return api('GET', '/api/state').then(function (r) {
      state.published = r.published;
      state.work = r.draft || clone(r.published);
    });
  }

  function save(message) {
    return api('PUT', '/api/draft', state.work).then(function () {
      if (message !== false) toast(message || 'Enregistré — pensez à publier');
      renderStatus();
    }).catch(function (e) {
      toast(e.message, 'error');
      throw e;
    });
  }

  function publish() {
    var n = pendingCount();
    if (!n) return toast('Tout est déjà publié');
    if (!confirm('Publier ' + n + ' modification' + (n > 1 ? 's' : '') + ' ? Elles seront visibles immédiatement par les clients.')) return;
    api('PUT', '/api/draft', state.work)
      .then(function () { return api('POST', '/api/publish'); })
      .then(loadState)
      .then(function () { toast('Publié sur le site'); route(); })
      .catch(function (e) { toast(e.message, 'error'); });
  }

  function discard() {
    if (!confirm('Annuler toutes les modifications non publiées ? Le site reviendra à la version actuellement en ligne.')) return;
    api('DELETE', '/api/draft').then(loadState).then(function () { ui.dirty = false; toast('Modifications annulées'); route(); })
      .catch(function (e) { toast(e.message, 'error'); });
  }

  // ---------- Photos ----------

  // Réduit la photo dans le navigateur (1600 px max, WebP) avant l'envoi : rapide même depuis un téléphone.
  function resizeImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error('Choisissez un fichier image (JPG, PNG…).'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('Conversion de la photo impossible.')); }, 'image/webp', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Cette photo n\'a pas pu être lue. Essayez en JPG.')); };
      img.src = url;
    });
  }

  function uploadPhoto(file) {
    toast('Envoi de la photo…');
    return resizeImage(file)
      .then(function (blob) { return api('POST', '/api/upload', blob, blob.type); })
      .then(function (r) { toast('Photo ajoutée'); return r.path; })
      .catch(function (e) { toast(e.message, 'error'); throw e; });
  }

  function bindDrop(zone, input, onFile) {
    input.addEventListener('change', function () { if (input.files[0]) onFile(input.files[0]); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); zone.setAttribute('data-over', 'true'); }); });
    ['dragleave', 'drop'].forEach(function (t) { zone.addEventListener(t, function () { zone.setAttribute('data-over', 'false'); }); });
    zone.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer.files[0]; if (f) onFile(f); });
  }

  function photoBlock(path, idPrefix) {
    return '<div class="photo">' +
      (path ? '<img class="photo__current" src="' + esc(imgUrl(path)) + '" alt="Photo actuelle">' : '<div class="photo__empty">Pas de photo</div>') +
      '<div class="drop" data-drop>' +
        '<span>Glissez une photo ici</span>' +
        '<span class="hint">JPG, PNG ou photo du téléphone. Elle est allégée automatiquement.</span>' +
        '<div class="drop__actions">' +
          '<label class="btn btn--outline btn--small" for="' + idPrefix + '-file">Choisir une photo</label>' +
          '<input class="visually-hidden" id="' + idPrefix + '-file" type="file" accept="image/*" data-file>' +
          (path ? '<button type="button" class="btn btn--ghost btn--small" data-action="remove-photo">Retirer</button>' : '') +
        '</div>' +
      '</div></div>';
  }

  // ---------- Mise en page ----------

  function layout(opts) {
    var route = opts.nav;
    app.innerHTML =
      '<div class="shell">' +
        '<aside class="sidebar">' +
          '<div class="brand"><span class="brand__mark" aria-hidden="true">富</span><span class="brand__text"><strong>Fujiyama</strong><span>Espace restaurant</span></span></div>' +
          '<nav class="nav" aria-label="Espace restaurant">' +
            '<a href="#/carte"' + (route === 'carte' ? ' aria-current="page"' : '') + '>' + ICON.carte + '<span>La carte</span></a>' +
            '<a href="#/infos"' + (route === 'infos' ? ' aria-current="page"' : '') + '>' + ICON.infos + '<span>Infos pratiques</span></a>' +
            '<a href="#/accueil"' + (route === 'accueil' ? ' aria-current="page"' : '') + '>' + ICON.accueil + '<span>Page d\'accueil</span></a>' +
          '</nav>' +
          '<div class="sidebar__foot">' +
            '<a href="/" target="_blank" rel="noopener">Voir le site ↗</a>' +
            '<button type="button" data-action="logout">Se déconnecter</button>' +
          '</div>' +
        '</aside>' +
        '<div class="main">' +
          '<header class="topbar">' +
            '<div>' + (opts.back ? '<a class="topbar__back" href="' + opts.back.href + '">← ' + esc(opts.back.label) + '</a>' : '') +
              '<h1>' + esc(opts.title) + '</h1>' + (opts.sub ? '<div class="topbar__sub">' + esc(opts.sub) + '</div>' : '') + '</div>' +
            '<div class="topbar__actions">' +
              '<span data-status></span>' +
              '<a class="btn btn--ghost" href="/?apercu" target="_blank" rel="noopener">Aperçu</a>' +
              '<button type="button" class="btn btn--accent" data-action="publish">Publier sur le site</button>' +
            '</div>' +
          '</header>' +
          '<div class="content">' + opts.body + '</div>' +
        '</div>' +
      '</div>';
    renderStatus();
  }

  function renderStatus() {
    var el = $('[data-status]');
    if (!el) return;
    var n = pendingCount();
    el.innerHTML = n
      ? '<span class="status-pill status-pill--warn">' + n + ' modification' + (n > 1 ? 's' : '') + ' non publiée' + (n > 1 ? 's' : '') + '</span> <button type="button" class="btn btn--ghost btn--small" data-action="discard">Tout annuler</button>'
      : '<span class="status-pill status-pill--ok">Tout est publié</span>';
    var btn = $('[data-action="publish"]');
    if (btn) btn.disabled = !n;
  }

  // ---------- Vue : la carte ----------

  function viewCarte(catId) {
    var cats = state.work.categories;
    var cat = cats.filter(function (c) { return c.id === catId; })[0] || cats[0];
    var total = cats.reduce(function (s, c) { return s + c.items.length; }, 0);
    var idx = cats.indexOf(cat);
    var q = ui.q.trim().toLowerCase();
    var items = cat ? cat.items.filter(function (it) { return !q || (it.name + ' ' + it.fr).toLowerCase().indexOf(q) !== -1; }) : [];

    var catsHtml = cats.map(function (c) {
      return '<a class="cat-link" href="#/carte/' + c.id + '"' + (c === cat ? ' aria-current="page"' : '') + '><span>' + esc(c.fr) + '</span><span>' + c.items.length + '</span></a>';
    }).join('');

    var addCat = ui.addingCat
      ? '<form class="cats__add" data-form="add-cat"><label class="field">Nom de la catégorie<input name="fr" required maxlength="80" autofocus></label>' +
        '<div class="toolbar"><button class="btn btn--ink btn--small">Ajouter</button><button type="button" class="btn btn--ghost btn--small" data-action="cancel-cat">Annuler</button></div></form>'
      : '<button type="button" class="dashed" data-action="add-cat" style="margin-top:8px">+ Nouvelle catégorie</button>';

    var body = '<div class="carte">' +
      '<section class="panel cats" aria-label="Catégories"><div class="cats__label">Catégories</div><div class="cats__list">' + catsHtml + '</div>' + addCat + '</section>';

    if (!cat) {
      body += '<section class="panel"><p class="empty">Aucune catégorie. Créez-en une pour commencer.</p></section></div>';
    } else {
      body += '<section class="panel" aria-labelledby="cat-title">' +
        '<div class="panel__head"><h2 class="panel__title" id="cat-title">' + esc(cat.fr) + '</h2>' +
          '<div class="toolbar">' +
            '<label class="search">' + ICON.search + '<span class="visually-hidden">Rechercher un plat</span><input type="search" placeholder="Rechercher un plat" value="' + esc(ui.q) + '" data-search></label>' +
            '<a class="btn btn--ink" href="#/nouveau/' + cat.id + '">+ Ajouter un plat</a>' +
          '</div></div>' +
        '<details class="cat-details"' + (ui.catOpen ? ' open' : '') + '><summary>Réglages de la catégorie <span class="hint">nom, ordre, mention « servi avec »</span></summary>' +
        '<form class="cat-settings" data-form="cat">' +
          '<label class="field">Nom de la catégorie<input name="fr" value="' + esc(cat.fr) + '" required maxlength="80"></label>' +
          '<label class="field">Nom en anglais <small>(facultatif)</small><input name="en" value="' + esc(cat.en) + '" maxlength="80"></label>' +
          '<div class="cat-settings__row">' +
            '<label class="inline-check"><input type="checkbox" name="servedWith"' + (cat.servedWith ? ' checked' : '') + '> Afficher « Servi avec soupe, crudité et riz »</label>' +
            '<div class="toolbar">' +
              '<button type="button" class="icon-btn" data-action="cat-up" aria-label="Monter la catégorie"' + (idx === 0 ? ' disabled' : '') + '>' + ICON.up + '</button>' +
              '<button type="button" class="icon-btn" data-action="cat-down" aria-label="Descendre la catégorie"' + (idx === cats.length - 1 ? ' disabled' : '') + '>' + ICON.down + '</button>' +
              '<button type="button" class="btn btn--danger btn--small" data-action="delete-cat"' + (cat.items.length ? ' disabled title="Videz d\'abord la catégorie"' : '') + '>Supprimer la catégorie</button>' +
            '</div>' +
          '</div>' +
        '</form></details>' +
        (items.length ? '<ul class="items">' + items.map(function (it) {
          var i = cat.items.indexOf(it);
          return '<li class="item" data-hidden="' + !it.visible + '">' +
            (q ? '' : '<div class="item__order">' +
              '<button type="button" class="icon-btn" data-action="item-up" data-id="' + it.id + '" aria-label="Monter ' + esc(it.name) + '"' + (i === 0 ? ' disabled' : '') + '>' + ICON.up + '</button>' +
              '<button type="button" class="icon-btn" data-action="item-down" data-id="' + it.id + '" aria-label="Descendre ' + esc(it.name) + '"' + (i === cat.items.length - 1 ? ' disabled' : '') + '>' + ICON.down + '</button></div>') +
            (it.img ? '<img class="item__thumb" src="' + esc(imgUrl(it.img)) + '" alt="" loading="lazy">' : '<span class="item__thumb item__thumb--empty">Sans photo</span>') +
            '<div class="item__text"><strong>' + esc(it.name) + (it.featured ? '<span class="tag">Accueil</span>' : '') + (it.pour2 ? '<span class="tag">Pour 2</span>' : '') + '</strong><span>' + esc(it.fr || '—') + '</span></div>' +
            '<span class="item__price">' + esc(it.price) + ' €</span>' +
            '<button type="button" class="pill" data-action="toggle-visible" data-id="' + it.id + '" aria-pressed="' + it.visible + '" aria-label="Visible sur le site : ' + esc(it.name) + '">' + (it.visible ? 'Visible' : 'Masqué') + '</button>' +
            '<a class="item__edit" href="#/plat/' + it.id + '">Modifier</a>' +
          '</li>';
        }).join('') + '</ul>' : '<p class="empty">' + (q ? 'Aucun plat ne correspond à « ' + esc(ui.q) + ' ».' : 'Cette catégorie est vide.') + '</p>') +
        '</section></div>';
    }

    layout({ nav: 'carte', title: 'La carte', sub: cats.length + ' catégories · ' + total + ' articles', body: body });

    var search = $('[data-search]');
    if (search) search.addEventListener('input', function () {
      ui.q = search.value;
      var pos = search.selectionStart;
      viewCarte(cat.id);
      var s = $('[data-search]'); s.focus(); s.setSelectionRange(pos, pos);
    });

    var details = $('.cat-details');
    if (details) details.addEventListener('toggle', function () { ui.catOpen = details.open; });

    var catForm = $('[data-form="cat"]');
    if (catForm) catForm.addEventListener('change', function (e) {
      var f = e.target;
      if (f.name === 'fr') { if (!f.value.trim()) return toast('Le nom de la catégorie est obligatoire', 'error'); cat.fr = f.value.trim(); }
      if (f.name === 'en') cat.en = f.value.trim();
      if (f.name === 'servedWith') cat.servedWith = f.checked;
      save().then(function () { viewCarte(cat.id); });
    });

    var addForm = $('[data-form="add-cat"]');
    if (addForm) {
      addForm.querySelector('input').focus();
      addForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = addForm.elements.fr.value.trim();
        if (!name) return;
        var c = { id: uniqueId(name), fr: name, en: '', servedWith: false, items: [] };
        state.work.categories.push(c);
        ui.addingCat = false;
        save('Catégorie créée').then(function () { location.hash = '#/carte/' + c.id; });
      });
    }

    app.onclick = function (e) {
      var b = e.target.closest('[data-action]');
      if (!b || b.disabled) return;
      var a = b.getAttribute('data-action'), id = b.getAttribute('data-id');
      if (a === 'add-cat') { ui.addingCat = true; return viewCarte(cat && cat.id); }
      if (a === 'cancel-cat') { ui.addingCat = false; return viewCarte(cat && cat.id); }
      if (a === 'cat-up' || a === 'cat-down') {
        var to = idx + (a === 'cat-up' ? -1 : 1);
        cats.splice(to, 0, cats.splice(idx, 1)[0]);
        return save().then(function () { viewCarte(cat.id); });
      }
      if (a === 'delete-cat') {
        if (!confirm('Supprimer la catégorie « ' + cat.fr + ' » ?')) return;
        cats.splice(idx, 1);
        return save('Catégorie supprimée').then(function () { location.hash = '#/carte'; route(); });
      }
      if (a === 'toggle-visible') {
        var f = findItem(id); f.item.visible = !f.item.visible;
        return save(f.item.visible ? f.item.name + ' est visible' : f.item.name + ' est masqué').then(function () { viewCarte(cat.id); });
      }
      if (a === 'item-up' || a === 'item-down') {
        var g = findItem(id), j = g.index + (a === 'item-up' ? -1 : 1);
        g.cat.items.splice(j, 0, g.cat.items.splice(g.index, 1)[0]);
        return save(false).then(function () { viewCarte(cat.id); });
      }
      commonActions(a);
    };
  }

  // ---------- Vue : modifier un plat ----------

  function viewPlat(id, newInCat) {
    var found = id ? findItem(id) : null;
    if (id && !found) { toast('Ce plat n\'existe plus', 'error'); location.hash = '#/carte'; return; }
    var isNew = !found;
    if (!ui.edit || ui.edit._key !== (id || 'new:' + newInCat)) {
      ui.edit = isNew
        ? { name: '', price: '', fr: '', en: '', img: '', pour2: false, visible: true, featured: false }
        : clone(found.item);
      ui.edit._key = id || 'new:' + newInCat;
      ui.editCat = isNew ? newInCat : found.cat.id;
      ui.dirty = false;
    }
    var it = ui.edit;
    var cats = state.work.categories;
    var homeCat = cats.filter(function (c) { return c.id === ui.editCat; })[0] || cats[0];

    var body = '<div class="edit">' +
      '<form class="edit__form" data-form="plat" novalidate>' +
        '<fieldset class="fieldset"><legend>Photo</legend><div data-photo>' + photoBlock(it.img, 'plat') + '</div></fieldset>' +
        '<fieldset class="fieldset"><legend>Informations</legend><div class="form-grid">' +
          '<label class="field">Nom du plat<input name="name" value="' + esc(it.name) + '" required maxlength="100" placeholder="Menu F1"></label>' +
          '<label class="field">Prix<span class="suffix"><input name="price" value="' + esc(it.price) + '" inputmode="decimal" required placeholder="14,90"><span>€</span></span></label>' +
          '<label class="field">Catégorie<select name="cat">' + cats.map(function (c) {
            return '<option value="' + c.id + '"' + (c === homeCat ? ' selected' : '') + '>' + esc(c.fr) + '</option>';
          }).join('') + '</select></label>' +
          '<label class="field field--wide">Composition<textarea name="fr" rows="3" maxlength="600" placeholder="6 california maki, 4 brochettes…">' + esc(it.fr) + '</textarea></label>' +
          '<label class="field field--wide"><span>Composition en anglais <small>(facultatif, affichée dans la version EN du site)</small></span><textarea name="en" rows="2" maxlength="600">' + esc(it.en) + '</textarea></label>' +
        '</div></fieldset>' +
        '<fieldset class="fieldset"><legend>Affichage</legend>' +
          '<label class="check"><span class="check__text"><span>Visible sur le site</span><span>Décochez pour masquer temporairement (rupture, saison…)</span></span><input type="checkbox" name="visible"' + (it.visible ? ' checked' : '') + '></label>' +
          '<label class="check"><span class="check__text"><span>Menu pour 2 personnes</span></span><input type="checkbox" name="pour2"' + (it.pour2 ? ' checked' : '') + '></label>' +
          '<label class="check"><span class="check__text"><span>Mettre en avant sur l\'accueil</span><span>4 plats maximum, plus les boissons dans leur propre bloc</span></span><input type="checkbox" name="featured"' + (it.featured ? ' checked' : '') + '></label>' +
        '</fieldset>' +
        '<div class="form-actions">' +
          (isNew ? '<span></span>' : '<button type="button" class="btn btn--danger" data-action="delete-item">Supprimer ce plat</button>') +
          '<div class="toolbar"><a class="btn btn--ghost" href="#/carte/' + homeCat.id + '">Annuler</a><button class="btn btn--ink">Enregistrer</button></div>' +
        '</div>' +
      '</form>' +
      '<aside class="preview" aria-label="Aperçu"><span class="preview__label">Aperçu sur le site</span><div data-preview></div>' +
        '<p class="hint">Rien n\'est visible des clients avant « Publier sur le site ».</p></aside>' +
    '</div>';

    layout({
      nav: 'carte', title: isNew ? 'Nouveau plat' : 'Modifier « ' + it.name + ' »',
      back: { href: '#/carte/' + homeCat.id, label: 'La carte · ' + homeCat.fr }, body: body
    });

    function renderPreview() {
      var p = normalizePrice(it.price);
      $('[data-preview]').innerHTML = '<div class="preview__card">' +
        (it.img ? '<img src="' + esc(imgUrl(it.img)) + '" alt="">' : '<div class="preview__noimg"></div>') +
        '<div class="preview__body"><div class="preview__top"><span class="preview__name">' + esc(it.name || 'Nom du plat') + '</span>' +
        '<span class="preview__price">' + esc(p || it.price || '0,00') + ' €</span></div>' +
        (it.fr ? '<p class="preview__desc">' + esc(it.fr) + '</p>' : '') + '</div></div>';
    }
    function renderPhoto() {
      $('[data-photo]').innerHTML = photoBlock(it.img, 'plat');
      bindDrop($('[data-drop]'), $('[data-file]'), function (file) {
        uploadPhoto(file).then(function (path) { it.img = path; ui.dirty = true; renderPhoto(); renderPreview(); });
      });
    }
    renderPreview();
    renderPhoto();

    var form = $('[data-form="plat"]');
    form.addEventListener('input', function (e) {
      var f = e.target;
      if (!f.name || f.name === 'cat') return;
      it[f.name] = f.type === 'checkbox' ? f.checked : f.value;
      ui.dirty = true;
      renderPreview();
    });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'cat') { ui.editCat = e.target.value; ui.dirty = true; }
      if (e.target.type === 'checkbox') { it[e.target.name] = e.target.checked; ui.dirty = true; }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = it.name.trim(), price = normalizePrice(it.price);
      if (!name) { form.elements.name.focus(); return toast('Indiquez le nom du plat', 'error'); }
      if (!price) { form.elements.price.focus(); return toast('Prix invalide : écrivez par exemple 14,90', 'error'); }
      var data = { id: isNew ? uniqueId(name) : found.item.id, name: name, price: price, fr: it.fr.trim(), en: it.en.trim(), img: it.img, pour2: !!it.pour2, visible: !!it.visible, featured: !!it.featured };
      var target = cats.filter(function (c) { return c.id === ui.editCat; })[0];
      if (isNew) target.items.push(data);
      else if (found.cat === target) found.cat.items[found.index] = data;
      else { found.cat.items.splice(found.index, 1); target.items.push(data); }
      ui.dirty = false; ui.edit = null;
      save(name + ' enregistré — pensez à publier').then(function () { location.hash = '#/carte/' + target.id; });
    });

    app.onclick = function (e) {
      var b = e.target.closest('[data-action]');
      if (!b) return;
      var a = b.getAttribute('data-action');
      if (a === 'remove-photo') { it.img = ''; ui.dirty = true; renderPhoto(); renderPreview(); return; }
      if (a === 'delete-item') {
        if (!confirm('Supprimer « ' + found.item.name + ' » de la carte ?')) return;
        found.cat.items.splice(found.index, 1);
        ui.dirty = false; ui.edit = null;
        save('Plat supprimé').then(function () { location.hash = '#/carte/' + found.cat.id; });
        return;
      }
      commonActions(a);
    };
  }

  // ---------- Vue : infos pratiques ----------

  function viewInfos() {
    var info = state.work.info, d = info.delivery, m = info.message;

    function slot(i, key, s) {
      var label = key === 'lunch' ? 'Midi' : 'Soir', name = 'h' + i + key;
      return '<div class="slot" data-slot="' + i + ':' + key + '">' +
        '<label class="inline-check"><input type="checkbox" name="' + name + 'on"' + (s ? ' checked' : '') + '> Ouvert</label>' +
        '<label><span class="visually-hidden">' + DAYS[i] + ' ' + label + ', ouverture</span><input type="time" name="' + name + 'open" value="' + (s ? s.open : (key === 'lunch' ? '11:30' : '18:30')) + '"' + (s ? '' : ' disabled') + '></label>' +
        '<span aria-hidden="true">–</span>' +
        '<label><span class="visually-hidden">' + DAYS[i] + ' ' + label + ', fermeture</span><input type="time" name="' + name + 'close" value="' + (s ? s.close : (key === 'lunch' ? '14:30' : '22:30')) + '"' + (s ? '' : ' disabled') + '></label>' +
      '</div>';
    }

    var body = '<form class="infos" data-form="infos" novalidate>' +
      '<section class="panel infos__full"><div class="panel__body stack" style="gap:14px">' +
        '<div class="form-actions"><div><h2 class="panel__title">Message temporaire</h2><p class="hint">Bandeau en haut de toutes les pages : fermeture exceptionnelle, congés, nouveauté…</p></div>' +
        '<label class="inline-check"><input type="checkbox" name="msgOn"' + (m.enabled ? ' checked' : '') + '> Afficher le message</label></div>' +
        '<div class="form-grid">' +
          '<label class="field field--wide">Texte<input name="msgFr" value="' + esc(m.fr) + '" maxlength="200" placeholder="Fermeture exceptionnelle le jeudi 24 décembre au soir."></label>' +
          '<label class="field">Texte en anglais <small>(facultatif)</small><input name="msgEn" value="' + esc(m.en) + '" maxlength="200"></label>' +
          '<label class="field">Afficher jusqu\'au <small>(inclus, facultatif)</small><input type="date" name="msgUntil" value="' + esc(m.until) + '"></label>' +
        '</div></div></section>' +

      '<section class="panel"><div class="panel__body">' +
        '<h2 class="panel__title">Horaires d\'ouverture</h2>' +
        '<p class="hint" style="margin:4px 0 14px">Le site affiche automatiquement « Ouvert » ou « Fermé » selon ces horaires.</p>' +
        '<div class="hours"><span class="hours__head"></span><span class="hours__head">Midi</span><span class="hours__head">Soir</span>' +
          info.hours.map(function (h, i) { return '<span class="hours__day">' + DAYS[i] + '</span>' + slot(i, 'lunch', h.lunch) + slot(i, 'dinner', h.dinner); }).join('') +
        '</div></div></section>' +

      '<div class="stack">' +
        '<section class="panel"><div class="panel__body"><h2 class="panel__title" style="margin-bottom:16px">Coordonnées</h2><div class="form-grid">' +
          '<label class="field field--wide">Adresse<input name="address" value="' + esc(info.address) + '" required maxlength="120"></label>' +
          '<label class="field">Code postal et ville<input name="postalCity" value="' + esc(info.postalCity) + '" required maxlength="80"></label>' +
          '<label class="field">Téléphone<input name="phone" value="' + esc(info.phone) + '" inputmode="tel" required maxlength="30"></label>' +
        '</div></div></section>' +

        '<section class="panel"><div class="panel__body"><h2 class="panel__title" style="margin-bottom:8px">Livraison &amp; commande</h2>' +
          '<label class="check"><span class="check__text"><span>Livraison proposée</span></span><input type="checkbox" name="delOn"' + (d.enabled ? ' checked' : '') + '></label>' +
          '<div class="form-grid" style="margin-top:12px">' +
            '<label class="field">Gratuite dès<span class="suffix"><input name="freeFrom" value="' + esc(d.freeFrom) + '" inputmode="numeric" maxlength="3"><span>€</span></span></label>' +
            '<label class="field">Quand<select name="when"><option value="soir"' + (d.when === 'soir' ? ' selected' : '') + '>Le soir uniquement</option><option value="midi-soir"' + (d.when === 'midi-soir' ? ' selected' : '') + '>Midi et soir</option></select></label>' +
            '<label class="field field--wide"><span>Lien de commande en ligne <small>(Uber Eats, Deliveroo… facultatif)</small></span><input name="orderUrl" value="' + esc(d.orderUrl) + '" placeholder="https://" maxlength="300"></label>' +
          '</div></div></section>' +

        '<section class="panel"><div class="panel__body"><h2 class="panel__title" style="margin-bottom:16px">Réseaux et avis</h2><div class="form-grid">' +
          '<label class="field field--wide">Instagram<input name="instagram" value="' + esc(info.links.instagram) + '" placeholder="https://instagram.com/…" maxlength="300"></label>' +
          '<label class="field field--wide">Fiche Google (avis)<input name="google" value="' + esc(info.links.google) + '" placeholder="https://g.page/…" maxlength="300"></label>' +
        '</div></div></section>' +
      '</div>' +

      '<div class="infos__full form-actions"><span></span><button class="btn btn--ink">Enregistrer les infos</button></div>' +
    '</form>';

    layout({ nav: 'infos', title: 'Infos pratiques', sub: 'Horaires, adresse, livraison et liens affichés sur tout le site', body: body });

    var form = $('[data-form="infos"]');
    form.addEventListener('input', function () { ui.dirty = true; });
    form.addEventListener('change', function (e) {
      ui.dirty = true;
      var m2 = /^h(\d)(lunch|dinner)on$/.exec(e.target.name);
      if (m2) $$('[data-slot="' + m2[1] + ':' + m2[2] + '"] input[type="time"]').forEach(function (t) { t.disabled = !e.target.checked; });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements, next = clone(info), err = null;
      next.message = { enabled: f.msgOn.checked, fr: f.msgFr.value.trim(), en: f.msgEn.value.trim(), until: f.msgUntil.value };
      if (next.message.enabled && !next.message.fr) err = 'Écrivez le texte du message, ou décochez « Afficher le message ».';
      next.hours = info.hours.map(function (h, i) {
        function read(key) {
          if (!f['h' + i + key + 'on'].checked) return null;
          var o = f['h' + i + key + 'open'].value, c = f['h' + i + key + 'close'].value;
          if (!o || !c || o >= c) err = err || DAYS[i] + ' ' + (key === 'lunch' ? 'midi' : 'soir') + ' : l\'heure de fin doit suivre l\'heure de début.';
          return { open: o, close: c };
        }
        return { day: h.day, lunch: read('lunch'), dinner: read('dinner') };
      });
      next.address = f.address.value.trim();
      next.postalCity = f.postalCity.value.trim();
      next.phone = f.phone.value.trim();
      if (!next.address || !next.postalCity || !next.phone) err = err || 'L\'adresse, la ville et le téléphone sont obligatoires.';
      var free = parseInt(f.freeFrom.value || '0', 10);
      if (isNaN(free) || free < 0) err = err || 'Montant de livraison invalide.';
      next.delivery = { enabled: f.delOn.checked, freeFrom: free, when: f.when.value, orderUrl: f.orderUrl.value.trim() };
      next.links = { instagram: f.instagram.value.trim(), google: f.google.value.trim() };
      [next.delivery.orderUrl, next.links.instagram, next.links.google].forEach(function (u) {
        if (u && !/^https:\/\//.test(u)) err = err || 'Les liens doivent commencer par https://';
      });
      if (err) return toast(err, 'error');
      var before = state.work.info;
      state.work.info = next;
      save('Infos enregistrées — pensez à publier')
        .then(function () { ui.dirty = false; viewInfos(); })
        .catch(function () { state.work.info = before; });
    });

    app.onclick = function (e) {
      var b = e.target.closest('[data-action]');
      if (b) commonActions(b.getAttribute('data-action'));
    };
  }

  // ---------- Vue : page d'accueil ----------

  function viewAccueil() {
    var home = state.work.home;
    var featured = [];
    state.work.categories.forEach(function (c) { c.items.forEach(function (it) { if (it.featured) featured.push({ cat: c, it: it }); }); });
    var dishes = featured.filter(function (f) { return f.cat.id !== 'boissons'; });
    var drinks = featured.filter(function (f) { return f.cat.id === 'boissons'; });

    function pairFields(key, label, multiline, max) {
      var tag = function (lang) {
        return multiline
          ? '<textarea name="' + key + lang + '" rows="3" maxlength="' + max + '">' + esc(home[key][lang]) + '</textarea>'
          : '<input name="' + key + lang + '" value="' + esc(home[key][lang]) + '" maxlength="' + max + '">';
      };
      return '<label class="field">' + label + tag('fr') + '</label><label class="field">' + label + ' <small>(anglais)</small>' + tag('en') + '</label>';
    }
    function list(items, empty) {
      if (!items.length) return '<p class="empty">' + empty + '</p>';
      return '<ul class="items">' + items.map(function (f) {
        return '<li class="item">' +
          (f.it.img ? '<img class="item__thumb" src="' + esc(imgUrl(f.it.img)) + '" alt="">' : '<span class="item__thumb item__thumb--empty">Sans photo</span>') +
          '<div class="item__text"><strong>' + esc(f.it.name) + '</strong><span>' + esc(f.cat.fr) + (f.it.visible ? '' : ' · masqué') + '</span></div>' +
          '<span class="item__price">' + esc(f.it.price) + ' €</span>' +
          '<button type="button" class="btn btn--ghost btn--small" data-action="unfeature" data-id="' + f.it.id + '">Retirer</button>' +
        '</li>';
      }).join('') + '</ul>';
    }

    var body = '<div class="infos">' +
      '<form class="panel infos__full" data-form="home"><div class="panel__body stack" style="gap:20px">' +
        '<div><h2 class="panel__title">Haut de la page d\'accueil</h2><p class="hint">Le premier texte que voient les visiteurs.</p></div>' +
        '<div class="form-grid">' +
          pairFields('kicker', 'Accroche', false, 300) +
          pairFields('title', 'Titre', false, 300) +
          pairFields('lead', 'Texte d\'introduction', true, 300) +
        '</div>' +
        '<fieldset class="fieldset"><legend>Grande photo</legend><div data-photo>' + photoBlock(home.heroImg, 'hero') + '</div></fieldset>' +
        '<div class="form-actions"><span></span><button class="btn btn--ink">Enregistrer</button></div>' +
      '</div></form>' +
      '<section class="panel"><div class="panel__head"><div><h2 class="panel__title">Plats mis en avant</h2><p class="hint">' + (dishes.length > 4 ? 'Seuls les 4 premiers sont affichés. ' : '') + 'Cochez « Mettre en avant » dans la fiche d\'un plat.</p></div></div>' +
        list(dishes, 'Aucun plat mis en avant.') + '</section>' +
      '<section class="panel"><div class="panel__head"><div><h2 class="panel__title">Boissons mises en avant</h2><p class="hint">Affichées dans le bloc « Saké, bières japonaises &amp; vins ».</p></div></div>' +
        list(drinks, 'Aucune boisson mise en avant.') + '</section>' +
    '</div>';

    layout({ nav: 'accueil', title: 'Page d\'accueil', sub: 'Textes, photo et sélection affichés en premier', body: body });

    var heroImg = home.heroImg;
    function renderPhoto() {
      $('[data-photo]').innerHTML = photoBlock(heroImg, 'hero');
      bindDrop($('[data-drop]'), $('[data-file]'), function (file) {
        uploadPhoto(file).then(function (path) { heroImg = path; ui.dirty = true; renderPhoto(); });
      });
    }
    renderPhoto();

    var form = $('[data-form="home"]');
    form.addEventListener('input', function () { ui.dirty = true; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements;
      ['kicker', 'title', 'lead'].forEach(function (k) { home[k] = { fr: f[k + 'fr'].value.trim(), en: f[k + 'en'].value.trim() }; });
      home.heroImg = heroImg;
      save('Page d\'accueil enregistrée — pensez à publier').then(function () { ui.dirty = false; viewAccueil(); });
    });

    app.onclick = function (e) {
      var b = e.target.closest('[data-action]');
      if (!b) return;
      var a = b.getAttribute('data-action');
      if (a === 'remove-photo') { heroImg = ''; ui.dirty = true; return renderPhoto(); }
      if (a === 'unfeature') {
        findItem(b.getAttribute('data-id')).item.featured = false;
        return save('Retiré de l\'accueil').then(viewAccueil);
      }
      commonActions(a);
    };
  }

  // ---------- Actions communes, connexion, navigation ----------

  function commonActions(a) {
    if (a === 'publish') publish();
    if (a === 'discard') discard();
    if (a === 'logout') {
      api('POST', '/api/logout').then(function () { showLogin(); });
    }
  }

  function showLogin(message) {
    app.onclick = null;
    app.innerHTML = '<div class="login"><form data-form="login">' +
      '<div class="brand"><span class="brand__mark" aria-hidden="true">富</span><span class="brand__text"><strong>Fujiyama</strong><span>Espace restaurant</span></span></div>' +
      '<h1>Connexion</h1>' +
      (message ? '<p class="error" role="alert">' + esc(message) + '</p>' : '') +
      '<label class="field">Mot de passe<input type="password" name="password" autocomplete="current-password" required autofocus></label>' +
      '<button class="btn btn--ink">Se connecter</button>' +
    '</form></div>';
    var form = $('[data-form="login"]');
    form.elements.password.focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button');
      btn.disabled = true;
      api('POST', '/api/login', { password: form.elements.password.value })
        .then(loadState)
        .then(function () { if (!location.hash) location.hash = '#/carte'; route(); })
        .catch(function (err) { showLogin(err.message); });
    });
  }

  var lastHash = location.hash;
  function route() {
    if (!state.work) return;
    var parts = (location.hash || '#/carte').slice(2).split('/');
    if (parts[0] !== 'plat' && parts[0] !== 'nouveau') ui.edit = null;
    if (parts[0] === 'plat') return viewPlat(parts[1]);
    if (parts[0] === 'nouveau') return viewPlat(null, parts[1]);
    if (parts[0] === 'infos') return viewInfos();
    if (parts[0] === 'accueil') return viewAccueil();
    if (parts[1] !== ui.lastCat) { ui.q = ''; ui.lastCat = parts[1]; }
    viewCarte(parts[1]);
  }

  window.addEventListener('hashchange', function () {
    if (ui.dirty && !confirm('Quitter sans enregistrer vos modifications ?')) {
      history.replaceState(null, '', lastHash);
      return;
    }
    ui.dirty = false;
    lastHash = location.hash;
    route();
    window.scrollTo(0, 0);
  });
  window.addEventListener('beforeunload', function (e) {
    if (ui.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  api('GET', '/api/session')
    .then(function (s) {
      if (!s.authenticated) return showLogin();
      return loadState().then(route);
    })
    .catch(function (e) { app.innerHTML = '<p class="loading">Impossible de joindre le serveur (' + esc(e.message) + ').</p>'; });
})();
