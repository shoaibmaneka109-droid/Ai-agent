module.exports = {
  algorithm: 'aes-256-gcm',
  keyHex: process.env.ENCRYPTION_KEY,   // 64 hex chars = 32 raw bytes
  ivLength: 16,                          // 128-bit IV
  authTagLength: 16,                     // 128-bit GCM auth tag
};
