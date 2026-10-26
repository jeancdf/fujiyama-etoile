/* Valide et nettoie un site.json envoyé par l'admin.
 * Ne garde que les champs connus, borne les longueurs et refuse les valeurs mal formées :
 * le site public peut ensuite afficher ces données sans se méfier.
 */
'use strict';

const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const ID = /^[a-z0-9-]{1,48}$/;
const PRICE = /^\d{1,4}(,\d{2})?$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const IMG = /^(assets\/img\/[a-z0-9/_.-]+\.(webp|jpg|png)|uploads\/[a-z0-9-]+\.(webp|jpg|png))$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

class Invalid extends Error {}

function text(v, max, label) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new Invalid(label + ' : texte attendu');
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  if (s.length > max) throw new Invalid(label + ` : ${max} caractères maximum`);
  return s;
}

function bool(v) { return v === true; }

function url(v, label) {
  const s = text(v, 300, label);
  if (s && !/^https:\/\/[^\s"<>]+$/.test(s)) throw new Invalid(label + ' : adresse commençant par https:// attendue');
  return s;
}

function pair(v, label) {
  v = v || {};
  return { fr: text(v.fr, 300, label + ' (FR)'), en: text(v.en, 300, label + ' (EN)') };
}

function slot(v, label) {
  if (!v) return null;
  if (!TIME.test(v.open) || !TIME.test(v.close)) throw new Invalid(label + ' : heure au format HH:MM attendue');
  if (v.open >= v.close) throw new Invalid(label + ' : l\'heure de fin doit suivre l\'heure de début');
  return { open: v.open, close: v.close };
}

function validateSite(input) {
  try {
    if (!input || typeof input !== 'object') throw new Invalid('Données manquantes');
    const info = input.info || {};
    const hours = Array.isArray(info.hours) ? info.hours : [];
    const delivery = info.delivery || {};
    const message = info.message || {};
    const links = info.links || {};
    const home = input.home || {};

    if (hours.length !== 7) throw new Invalid('Horaires : 7 jours attendus');
    const freeFrom = Number(delivery.freeFrom);
    if (!Number.isFinite(freeFrom) || freeFrom < 0 || freeFrom > 999) throw new Invalid('Livraison : montant invalide');
    if (message.until && !DATE.test(message.until)) throw new Invalid('Message : date invalide');

    const heroImg = text(home.heroImg, 200, 'Photo d\'accueil');
    if (heroImg && !IMG.test(heroImg)) throw new Invalid('Photo d\'accueil invalide');

    if (!Array.isArray(input.categories) || input.categories.length > 40) throw new Invalid('Catégories invalides');
    const ids = new Set();
    const categories = input.categories.map((c, ci) => {
      if (!c || !ID.test(c.id) || ids.has(c.id)) throw new Invalid(`Catégorie n°${ci + 1} : identifiant invalide`);
      ids.add(c.id);
      const label = text(c.fr, 80, 'Nom de catégorie');
      if (!label) throw new Invalid(`Catégorie n°${ci + 1} : nom obligatoire`);
      if (!Array.isArray(c.items) || c.items.length > 300) throw new Invalid(label + ' : articles invalides');
      return {
        id: c.id, fr: label, en: text(c.en, 80, 'Nom de catégorie (EN)'), servedWith: bool(c.servedWith),
        items: c.items.map((it) => {
          if (!it || !ID.test(it.id) || ids.has(it.id)) throw new Invalid(label + ' : identifiant d\'article invalide');
          ids.add(it.id);
          const name = text(it.name, 100, 'Nom du plat');
          if (!name) throw new Invalid(label + ' : un plat n\'a pas de nom');
          const price = text(it.price, 10, name + ' : prix');
          if (!PRICE.test(price)) throw new Invalid(name + ' : prix au format 14,90 attendu');
          const img = text(it.img, 200, name + ' : photo');
          if (img && !IMG.test(img)) throw new Invalid(name + ' : photo invalide');
          return {
            id: it.id, name, price, fr: text(it.fr, 600, name + ' : composition'), en: text(it.en, 600, name + ' : composition EN'),
            img, pour2: bool(it.pour2), visible: bool(it.visible), featured: bool(it.featured)
          };
        })
      };
    });

    return {
      site: {
        version: Number(input.version) || 1,
        info: {
          name: text(info.name, 80, 'Nom du restaurant') || 'Fujiyama Étoile',
          address: text(info.address, 120, 'Adresse'),
          postalCity: text(info.postalCity, 80, 'Code postal et ville'),
          phone: text(info.phone, 30, 'Téléphone'),
          hours: hours.map((h, i) => ({ day: DAYS[i], lunch: slot(h && h.lunch, DAYS[i] + ' midi'), dinner: slot(h && h.dinner, DAYS[i] + ' soir') })),
          delivery: { enabled: bool(delivery.enabled), freeFrom, when: delivery.when === 'midi-soir' ? 'midi-soir' : 'soir', orderUrl: url(delivery.orderUrl, 'Lien de commande') },
          message: { enabled: bool(message.enabled), fr: text(message.fr, 200, 'Message'), en: text(message.en, 200, 'Message (EN)'), until: message.until || '' },
          links: { instagram: url(links.instagram, 'Instagram'), google: url(links.google, 'Fiche Google') }
        },
        home: { heroImg, kicker: pair(home.kicker, 'Accroche'), title: pair(home.title, 'Titre'), lead: pair(home.lead, 'Texte d\'introduction') },
        categories
      }
    };
  } catch (e) {
    if (e instanceof Invalid) return { error: e.message };
    throw e;
  }
}

module.exports = { validateSite };
