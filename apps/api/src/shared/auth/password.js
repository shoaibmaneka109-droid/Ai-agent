const crypto = require("crypto");

const SALT_LENGTH = 16;
const ITERATIONS = 210000;
const KEY_LENGTH = 32;
const DIGEST = "sha512";

function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH).toString("base64");
  const derivedKey = crypto
    .pbkdf2Sync(String(password), salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("base64");

  return `pbkdf2$${DIGEST}$${ITERATIONS}$${salt}$${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, digest, iterations, salt, originalHash] = String(storedHash).split("$");

  if (scheme !== "pbkdf2" || !digest || !iterations || !salt || !originalHash) {
    return false;
  }

  const derivedKey = crypto
    .pbkdf2Sync(String(password), salt, Number(iterations), KEY_LENGTH, digest)
    .toString("base64");

  return crypto.timingSafeEqual(
    Buffer.from(originalHash, "utf8"),
    Buffer.from(derivedKey, "utf8"),
  );
}

module.exports = {
  hashPassword,
  verifyPassword,
};
