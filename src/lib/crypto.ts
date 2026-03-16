import { openDB } from 'idb';

const DB_NAME = 'mango_crypto';
const STORE_NAME = 'keys';

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME);
    },
  });
}

export async function saveKeyToDB(name: string, key: CryptoKey | any) {
  const db = await getDB();
  await db.put(STORE_NAME, key, name);
}

export async function getKeyFromDB(name: string) {
  const db = await getDB();
  return await db.get(STORE_NAME, name);
}

export async function generateKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveKey", "deriveBits"]
  );
  return keyPair;
}

export async function exportPublicKey(key: CryptoKey) {
  const exported = await window.crypto.subtle.exportKey("spki", key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function importPublicKey(base64: string) {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return await window.crypto.subtle.importKey(
      "spki",
      bytes.buffer,
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      []
    );
  } catch (e) {
    console.error("Failed to import public key", e);
    throw e;
  }
}

export async function deriveSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey) {
  return await window.crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: publicKey,
    },
    privateKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptMessage(key: CryptoKey, message: string) {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    enc.encode(message)
  );
  return {
    encryptedPayload: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

export async function decryptMessage(key: CryptoKey, encryptedPayload: string, ivBase64: string) {
  try {
    const binaryEnc = atob(encryptedPayload);
    const bytesEnc = new Uint8Array(binaryEnc.length);
    for (let i = 0; i < binaryEnc.length; i++) {
      bytesEnc[i] = binaryEnc.charCodeAt(i);
    }

    const binaryIv = atob(ivBase64);
    const bytesIv = new Uint8Array(binaryIv.length);
    for (let i = 0; i < binaryIv.length; i++) {
      bytesIv[i] = binaryIv.charCodeAt(i);
    }

    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytesIv,
      },
      key,
      bytesEnc.buffer
    );
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (e) {
    console.error("Decryption failed", e);
    return "[Decryption Failed]";
  }
}

// For Main Room, we use a symmetric key directly
export async function generateSymmetricKey() {
  return await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportSymmetricKey(key: CryptoKey) {
  const exported = await window.crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function importSymmetricKey(base64: string) {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return await window.crypto.subtle.importKey(
      "raw",
      bytes.buffer,
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );
  } catch (e) {
    console.error("Failed to import symmetric key", e);
    throw e;
  }
}
