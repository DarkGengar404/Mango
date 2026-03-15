import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'mango_crypto';
const STORE_NAME = 'keys';

export async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME);
    },
  });
}

export async function saveKeyPair(keyPair: CryptoKeyPair) {
  const db = await getDB();
  await db.put(STORE_NAME, keyPair.publicKey, 'publicKey');
  await db.put(STORE_NAME, keyPair.privateKey, 'privateKey');
}

export async function loadKeyPair(): Promise<CryptoKeyPair | null> {
  try {
    const db = await getDB();
    const publicKey = await db.get(STORE_NAME, 'publicKey');
    const privateKey = await db.get(STORE_NAME, 'privateKey');
    if (publicKey && privateKey) {
      return { publicKey, privateKey };
    }
  } catch (e) {
    console.error('Failed to load key pair from IndexedDB', e);
  }
  return null;
}
