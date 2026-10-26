"use client";

import sodium from "libsodium-wrappers-sumo";

export type EncryptionKeyPair = {
  publicKey: string;
  privateKey: string;
};

export type EncryptedMessage = {
  version: 1;
  senderPublicKey: string;
  recipientPublicKey: string;
  nonce: string;
  ciphertext: string;
};

const BASE64 = sodium.base64_variants.URLSAFE_NO_PADDING;

export async function generateEncryptionKeyPair(): Promise<EncryptionKeyPair> {
  await sodium.ready;

  const pair = sodium.crypto_box_keypair();

  return {
    publicKey: sodium.to_base64(pair.publicKey, BASE64),
    privateKey: sodium.to_base64(pair.privateKey, BASE64),
  };
}

export async function encryptMessage(
  plaintext: string,
  senderKeys: EncryptionKeyPair,
  recipientPublicKey: string,
): Promise<EncryptedMessage> {
  await sodium.ready;

  if (!plaintext.trim()) {
    throw new Error("Message cannot be empty.");
  }

  const senderPublicKey = sodium.from_base64(senderKeys.publicKey, BASE64);
  const senderPrivateKey = sodium.from_base64(senderKeys.privateKey, BASE64);
  const recipientKey = sodium.from_base64(recipientPublicKey, BASE64);

  if (
    senderPublicKey.length !== sodium.crypto_box_PUBLICKEYBYTES ||
    senderPrivateKey.length !== sodium.crypto_box_SECRETKEYBYTES ||
    recipientKey.length !== sodium.crypto_box_PUBLICKEYBYTES
  ) {
    throw new Error("Invalid encryption key.");
  }

  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);

  const ciphertext = sodium.crypto_box_easy(
    sodium.from_string(plaintext),
    nonce,
    recipientKey,
    senderPrivateKey,
  );

  return {
    version: 1,
    senderPublicKey: senderKeys.publicKey,
    recipientPublicKey,
    nonce: sodium.to_base64(nonce, BASE64),
    ciphertext: sodium.to_base64(ciphertext, BASE64),
  };
}

export async function decryptMessage(
  encrypted: EncryptedMessage,
  myKeys: EncryptionKeyPair,
): Promise<string> {
  await sodium.ready;

  const myPublicKey = sodium.from_base64(myKeys.publicKey, BASE64);
  const myPrivateKey = sodium.from_base64(myKeys.privateKey, BASE64);
  const senderPublicKey = sodium.from_base64(encrypted.senderPublicKey, BASE64);
  const recipientPublicKey = sodium.from_base64(
    encrypted.recipientPublicKey,
    BASE64,
  );

  let peerPublicKey: Uint8Array;

  if (sodium.memcmp(myPublicKey, senderPublicKey)) {
    peerPublicKey = recipientPublicKey;
  } else if (sodium.memcmp(myPublicKey, recipientPublicKey)) {
    peerPublicKey = senderPublicKey;
  } else {
    throw new Error("Your key is not authorized to read this message.");
  }

  const plaintext = sodium.crypto_box_open_easy(
    sodium.from_base64(encrypted.ciphertext, BASE64),
    sodium.from_base64(encrypted.nonce, BASE64),
    peerPublicKey,
    myPrivateKey,
  );

  return sodium.to_string(plaintext);
}

export async function decodeEncryptionBytes(
  value: string,
): Promise<Uint8Array> {
  await sodium.ready;

  return sodium.from_base64(value, BASE64);
}

export async function encodeEncryptionBytes(
  value: Uint8Array,
): Promise<string> {
  await sodium.ready;

  return sodium.to_base64(value, BASE64);
}
