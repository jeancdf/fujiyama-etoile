/* Génère l'empreinte à mettre dans ADMIN_PASSWORD_HASH.
 *   node server/hash-password.js "mon mot de passe"
 */
'use strict';

const { hashPassword } = require('./password');

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Usage : node server/hash-password.js "mot de passe d\'au moins 10 caractères"');
  process.exit(1);
}
hashPassword(password).then((h) => console.log(h));
