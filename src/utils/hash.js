const bcrypt = require('bcrypt');

const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

exports.hashPassword = (plain) => bcrypt.hash(plain, rounds);
exports.comparePassword = (plain, hash) => bcrypt.compare(plain, hash);
