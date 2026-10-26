"use client";

import sodium from "libsodium-wrappers-sumo";
import type { EncryptionKeyPair } from "@/lib/encryption";

const BASE64 = sodium.base64_variants.URLSAFE_NO_PADDING;
const DOMAIN = "PDA-CHAT-KEY-STORAGE-V1";
const ITERATIONS = 600_000;

type StoredKeyRecord = {
  version: 1;
  salt: string;
  iv: string;
  ciphertext: string;
};

function getDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("pda-chat-key-store", 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("keys")) {
        db.createObjectStore("keys");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deriveStorageKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: Uint8Array.from(salt),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function saveEncryptionKeys(
  walletAddress: string,
  keys: EncryptionKeyPair,
  passphrase: string,
): Promise<void> {
  if (!walletAddress.trim()) throw new Error("Wallet address is required.");
  if (passphrase.length < 12) {
    throw new Error("Use a passphrase with at least 12 characters.");
  }

  await sodium.ready;

  const publicKey = sodium.from_base64(keys.publicKey, BASE64);
  const privateKey = sodium.from_base64(keys.privateKey, BASE64);

  if (
    publicKey.length !== sodium.crypto_box_PUBLICKEYBYTES ||
    privateKey.length !== sodium.crypto_box_SECRETKEYBYTES
  ) {
    throw new Error("Invalid encryption key pair.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const storageKey = await deriveStorageKey(passphrase, salt);

  const plaintext = new TextEncoder().encode(
    JSON.stringify({ publicKey: keys.publicKey, privateKey: keys.privateKey }),
  );

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(`${DOMAIN}:${walletAddress}`),
    },
    storageKey,
    plaintext,
  );

  const record: StoredKeyRecord = {
    version: 1,
    salt: sodium.to_base64(salt, BASE64),
    iv: sodium.to_base64(iv, BASE64),
    ciphertext: sodium.to_base64(new Uint8Array(encrypted), BASE64),
  };

  const db = await getDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite");
      tx.objectStore("keys").put(record, walletAddress);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadEncryptionKeys(
  walletAddress: string,
  passphrase: string,
): Promise<EncryptionKeyPair | null> {
  await sodium.ready;

  const db = await getDatabase();
  let record: StoredKeyRecord | undefined;

  try {
    record = await new Promise<StoredKeyRecord | undefined>((resolve, reject) => {
      const tx = db.transaction("keys", "readonly");
      const request = tx.objectStore("keys").get(walletAddress);
      request.onsuccess = () => resolve(request.result as StoredKeyRecord | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }

  if (!record) return null;
  if (record.version !== 1) throw new Error("Unsupported stored-key version.");

  try {
    const salt = Uint8Array.from(sodium.from_base64(record.salt, BASE64));
    const iv = Uint8Array.from(sodium.from_base64(record.iv, BASE64));
    const ciphertext = Uint8Array.from(sodium.from_base64(record.ciphertext, BASE64));
    const storageKey = await deriveStorageKey(passphrase, salt);

    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv.buffer as ArrayBuffer,
        additionalData: new TextEncoder().encode(`${DOMAIN}:${walletAddress}`).buffer as ArrayBuffer,
      },
      storageKey,
      ciphertext.buffer as ArrayBuffer,
    );

    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as EncryptionKeyPair;
    const publicKey = sodium.from_base64(parsed.publicKey, BASE64);
    const privateKey = sodium.from_base64(parsed.privateKey, BASE64);

    if (
      publicKey.length !== sodium.crypto_box_PUBLICKEYBYTES ||
      privateKey.length !== sodium.crypto_box_SECRETKEYBYTES
    ) {
      throw new Error("Stored encryption keys are invalid.");
    }

    return parsed;
  } catch {
    throw new Error("Could not unlock keys. Check your passphrase or stored data.");
  }
}
