import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";

function getKey() {
  const raw =
    process.env.ENCRYPTION_KEY || "flash_print_encrypt_key_32bytes!";
  return Buffer.from(raw, "utf-8").slice(0, 32);
}

/**
 * Matnni AES-256-CBC bilan shifrlash
 * @param {string} text - Shifrlash kerak bo'lgan matn
 * @returns {{ iv: string, encryptedData: string }}
 */
export function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return {
    iv: iv.toString("hex"),
    encryptedData: encrypted,
  };
}

/**
 * Shifrlangan matnni deshifrlash
 * @param {{ iv: string, encryptedData: string }} hash
 * @returns {string}
 */
export function decrypt(hash) {
  if (!hash || !hash.iv || !hash.encryptedData) return null;
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(hash.iv, "hex")
  );
  let decrypted = decipher.update(hash.encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
