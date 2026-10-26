"use client";

import { useCallback, useEffect, useState } from "react";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, clusterApiUrl, Connection } from "@solana/web3.js";
import { sendMessage, fetchMessages, deleteMessage, type ChatMessage } from "@/lib/messages";
import {
  signEncryptionKeyMessage,
  createAnchorProvider,
} from "@/lib/phantom-wallet";
import {
  generateEncryptionKeyPair,
  decodeEncryptionBytes,
  type EncryptionKeyPair,
} from "@/lib/encryption";
import {
  loadEncryptionKeys,
  saveEncryptionKeys,
} from "@/lib/key-storage";
import {
  createKeyAuthMessage,
  verifyKeyAuthSignature,
} from "@/lib/key-auth";
import {
  fetchEncryptionPublicKey,
  registerEncryptionKey,
  updateEncryptionKey,
} from "@/lib/encryption-registry";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: (tx: any) => Promise<any>;
  signAllTransactions: (txs: any[]) => Promise<any[]>;
  on: (event: string, callback: (...args: any[]) => void) => void;
  removeListener?: (event: string, callback: (...args: any[]) => void) => void;
};

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
  }
}

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

export default function Home() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Checking Devnet...");
  const [error, setError] = useState("");
  const [signature, setSignature] = useState("");
  const [installed, setInstalled] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [deletingAddress, setDeletingAddress] = useState<string | null>(null);
  const [keyPassphrase, setKeyPassphrase] = useState("");
  const [encryptionKeys, setEncryptionKeys] = useState<EncryptionKeyPair | null>(null);
  const [keyStatus, setKeyStatus] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [registryAddress, setRegistryAddress] = useState("");



  async function handleUnlockOrCreateKeys() {
    if (!wallet) {
      setError("Connect Phantom first.");
      return;
    }
    if (keyPassphrase.length < 12) {
      setKeyStatus("Use a passphrase with at least 12 characters.");
      return;
    }

    try {
      setKeyBusy(true);
      setKeyStatus("Checking local encryption-key storage...");
      setError("");

      const stored = await loadEncryptionKeys(wallet, keyPassphrase);
      if (stored) {
        setEncryptionKeys(stored);
        setKeyStatus("Encryption keys unlocked from this browser.");
      } else {
        const generated = await generateEncryptionKeyPair();
        await saveEncryptionKeys(wallet, generated, keyPassphrase);
        setEncryptionKeys(generated);
        setKeyStatus("New encryption keys created and encrypted in local storage. Back up your passphrase safely.");
      }
    } catch (e) {
      setKeyStatus(e instanceof Error ? e.message : "Could not unlock or create encryption keys.");
    } finally {
      setKeyBusy(false);
    }
  }

  async function handleRegisterEncryptionKey() {
    const phantom = window.phantom?.solana;
    if (!wallet || !phantom?.publicKey || !encryptionKeys) {
      setKeyStatus("Connect Phantom and unlock your encryption keys first.");
      return;
    }

    try {
      setKeyBusy(true);
      setKeyStatus("Requesting wallet confirmation...");
      setError("");

      const message = createKeyAuthMessage(wallet, encryptionKeys.publicKey);
      const signature = await signEncryptionKeyMessage(phantom as any, message);
      if (!verifyKeyAuthSignature(wallet, encryptionKeys.publicKey, signature)) {
        throw new Error("Wallet signature verification failed.");
      }

      const provider = createAnchorProvider(phantom as any);
      const publicKeyBytes = await decodeEncryptionBytes(encryptionKeys.publicKey);
      const existing = await fetchEncryptionPublicKey(provider, new PublicKey(wallet));

      const result = existing
        ? await updateEncryptionKey(provider, publicKeyBytes)
        : await registerEncryptionKey(provider, publicKeyBytes);

      setRegistryAddress(result.address);
      setSignature(result.signature);
      setKeyStatus(existing
        ? "Encryption public key updated on Devnet."
        : "Encryption public key registered on Devnet.");
    } catch (e) {
      setKeyStatus(e instanceof Error ? e.message : "Encryption-key registration failed.");
    } finally {
      setKeyBusy(false);
    }
  }

  const connectWallet = useCallback(async () => {
    const phantom = window.phantom?.solana;

    if (!phantom?.isPhantom) {
      window.open("https://phantom.app/", "_blank", "noopener,noreferrer");
      setError("Phantom wallet not detected. Install or unlock Phantom, then retry.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      const result = await phantom.connect();
      setWallet(result.publicKey.toBase58());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connection failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnectWallet = useCallback(async () => {
    try {
      await window.phantom?.solana?.disconnect();
      setWallet(null);
      setSignature("");
      setError("");
    } catch {
      setError("Could not disconnect Phantom.");
    }
  }, []);

  useEffect(() => {
    const phantom = window.phantom?.solana;
    setInstalled(Boolean(phantom?.isPhantom));

    if (phantom?.publicKey) setWallet(phantom.publicKey.toBase58());

    const handleConnect = (...args: any[]) => {
      const key = args[0] as PublicKey | undefined;
      if (key?.toBase58) setWallet(key.toBase58());
    };
    const handleDisconnect = () => setWallet(null);

    phantom?.on("connect", handleConnect);
    phantom?.on("disconnect", handleDisconnect);

    let active = true;
    connection.getVersion()
      .then((v) => {
        if (active) setStatus(`Devnet connected · Solana ${v["solana-core"]}`);
      })
      .catch(() => {
        if (active) setStatus("Devnet connection unavailable");
      });

    return () => {
      active = false;
      phantom?.removeListener?.("connect", handleConnect);
      phantom?.removeListener?.("disconnect", handleDisconnect);
    };
  }, []);

  async function handleSendMessage() {
    const phantom = window.phantom?.solana;
    if (!phantom || !wallet) {
      setError("Connect Phantom first.");
      return;
    }

    const trimmed = message.trim();
    if (!trimmed) {
      setError("Please enter a message.");
      return;
    }

    if (new TextEncoder().encode(trimmed).length > 280) {
      setError("Message must be 280 bytes or less.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSignature("");
      setStatus("Waiting for Phantom signature...");

      const provider = createAnchorProvider(phantom as any);
      const messageId = new BN(Date.now());

      const result = await sendMessage(provider, messageId, trimmed);

      setSignature(result.signature);
      setMessage("");
      setStatus("Message successfully stored on Devnet!");
      await loadMessages();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
      setStatus("Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  const loadMessages = useCallback(async () => {
    const phantom = window.phantom?.solana;

    if (!phantom?.publicKey) {
      setMessages([]);
      return;
    }

    try {
      setHistoryBusy(true);
      setHistoryError("");
      const provider = createAnchorProvider(phantom as any);
      const result = await fetchMessages(provider);
      setMessages(result);
    } catch (e) {
      setHistoryError(
        e instanceof Error ? e.message : "Could not load message history."
      );
    } finally {
      setHistoryBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!wallet) {
      setMessages([]);
      return;
    }

    void loadMessages();

    // Listen for on-chain changes to this Solana program.
    const subscriptionId = connection.onProgramAccountChange(
      new PublicKey("HGVJnqBu9BEaer3dfT2X3h4h3fG3VhoTMWzBamTUUTdS"),
      () => {
        void loadMessages();
      },
      "confirmed"
    );

    return () => {
      void connection.removeProgramAccountChangeListener(subscriptionId);
    };
  }, [wallet, loadMessages]);

  async function handleDeleteMessage(address: string) {
    const phantom = window.phantom?.solana;

    if (!phantom || !wallet) {
      setError("Connect Phantom first.");
      return;
    }

    const confirmed = window.confirm(
      "Delete this message? The transaction will close its PDA account and refund its rent to your wallet."
    );

    if (!confirmed) return;

    try {
      setDeletingAddress(address);
      setError("");
      setHistoryError("");
      setStatus("Waiting for deletion approval in Phantom...");

      const provider = createAnchorProvider(phantom as any);
      const result = await deleteMessage(provider, address);

      setStatus("Message deleted successfully. Rent refunded to your wallet.");
      setSignature(result.signature);
      await loadMessages();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message deletion failed.");
      setStatus("Message deletion failed");
    } finally {
      setDeletingAddress(null);
    }
  }

  const shortAddress = wallet
    ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}`
    : "";

  const byteLength = new TextEncoder().encode(message).length;

  return (
    <main className="min-h-screen bg-[#090d18] px-5 py-8 text-white sm:px-10">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500 text-xl font-bold">P</div>
          <div>
            <h1 className="text-xl font-bold">PDA Chat</h1>
            <p className="text-xs text-slate-400">Decentralized messaging</p>
          </div>
        </a>

        {wallet ? (
          <button onClick={disconnectWallet} disabled={busy}
            className="rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold hover:bg-violet-500/20 disabled:opacity-60">
            {shortAddress} · Disconnect
          </button>
        ) : (
          <button onClick={connectWallet} disabled={busy}
            className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold hover:bg-violet-400 disabled:opacity-60">
            {busy ? "Connecting..." : "Connect Phantom"}
          </button>
        )}
      </header>

      <section className="mx-auto grid max-w-6xl items-start gap-12 py-16 md:grid-cols-2 md:py-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {status}
          </div>
          <h2 className="max-w-xl text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
            Your messages.
            <span className="block text-violet-400">Your wallet.</span>
            Your control.
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-400">
            Send messages to Solana Devnet. Each message is stored in its own
            Program Derived Address (PDA), controlled by the sending wallet.
          </p>
          <a className="mt-8 inline-block rounded-xl border border-white/10 px-5 py-3 font-semibold hover:bg-white/5"
            href="https://explorer.solana.com/address/HGVJnqBu9BEaer3dfT2X3h4h3fG3VhoTMWzBamTUUTdS?cluster=devnet"
            target="_blank" rel="noopener noreferrer">
            View Solana Program ↗
          </a>
          {!installed && (
            <p className="mt-4 text-sm text-amber-300">
              Phantom extension not detected in this browser.
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-cyan-400/20 bg-white/[0.03] p-6 shadow-2xl shadow-cyan-950/20 sm:p-8">
          <h3 className="text-xl font-semibold">Private Messaging Setup</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Create or unlock encryption keys stored encrypted in this browser.
            Your passphrase must contain at least 12 characters.
          </p>

          <label htmlFor="key-passphrase" className="mt-5 block text-sm font-medium text-slate-300">
            Key-storage passphrase
          </label>
          <input
            id="key-passphrase"
            type="password"
            autoComplete="current-password"
            value={keyPassphrase}
            onChange={(e) => setKeyPassphrase(e.target.value)}
            placeholder="At least 12 characters"
            disabled={!wallet || keyBusy}
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#0e1424] p-3 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400 disabled:opacity-50"
          />

          <button
            type="button"
            onClick={() => void handleUnlockOrCreateKeys()}
            disabled={!wallet || keyBusy || keyPassphrase.length < 12}
            className="mt-4 w-full rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-5 py-3 font-semibold hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {keyBusy ? "Please wait..." : encryptionKeys ? "Unlock/Create Keys Again" : "Unlock or Create Encryption Keys"}
          </button>

          {encryptionKeys && (
            <>
              <p className="mt-4 break-all text-xs text-slate-400">
                Local encryption public key: {encryptionKeys.publicKey}
              </p>
              <button
                type="button"
                onClick={() => void handleRegisterEncryptionKey()}
                disabled={!wallet || keyBusy}
                className="mt-4 w-full rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {keyBusy ? "Waiting..." : "Verify with Phantom & Register Public Key"}
              </button>
            </>
          )}

          {registryAddress && (
            <a
              className="mt-3 block break-all text-xs text-cyan-300 underline"
              href={`https://explorer.solana.com/address/${registryAddress}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View encryption-key registry PDA ↗
            </a>
          )}

          {keyStatus && (
            <p role="status" className="mt-4 break-words rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-sm text-cyan-200">
              {keyStatus}
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-violet-950/20 sm:p-8">
          <h3 className="text-xl font-semibold">Send a message</h3>
          <p className="mt-2 text-sm text-slate-400">
            Solana Devnet · Transaction requires wallet approval and a small amount of devnet SOL.
          </p>

          <label htmlFor="message" className="mt-6 block text-sm font-medium text-slate-300">
            Message content
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={280}
            rows={5}
            placeholder="Write your message..."
            disabled={!wallet || busy}
            className="mt-2 w-full resize-y rounded-2xl border border-white/10 bg-[#0e1424] p-4 text-white outline-none placeholder:text-slate-600 focus:border-violet-400 disabled:opacity-50"
          />
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>{wallet ? shortAddress : "Connect your wallet to send"}</span>
            <span>{byteLength}/280 bytes</span>
          </div>

          <button
            onClick={handleSendMessage}
            disabled={!wallet || busy || !message.trim() || byteLength > 280}
            className="mt-5 w-full rounded-xl bg-violet-500 px-5 py-3 font-semibold transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Waiting for transaction..." : "Send on Solana"}
          </button>

          {error && (
            <p role="alert" className="mt-4 break-words rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300">
              {error}
            </p>
          )}

          {signature && (
            <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
              <p className="text-sm font-semibold text-emerald-300">Transaction submitted successfully!</p>
              <a className="mt-2 block break-all text-sm text-violet-300 underline"
                href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
                target="_blank" rel="noopener noreferrer">
                View transaction in Solana Explorer ↗
              </a>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl pb-16">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-semibold">Message History</h3>
              <p className="mt-2 text-sm text-slate-400">
                Messages stored in PDA accounts on Solana Devnet.
              </p>
            </div>
            <button
              onClick={() => void loadMessages()}
              disabled={!wallet || historyBusy}
              className="rounded-xl border border-violet-400/40 px-4 py-2.5 text-sm font-semibold hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {historyBusy ? "Refreshing..." : "Refresh Messages"}
            </button>
          </div>

          {!wallet && (
            <p className="mt-6 rounded-xl bg-white/5 p-4 text-sm text-slate-400">
              Connect Phantom to load message history.
            </p>
          )}

          {historyError && (
            <p role="alert" className="mt-6 break-words rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">
              {historyError}
            </p>
          )}

          {wallet && !historyBusy && !historyError && messages.length === 0 && (
            <p className="mt-6 rounded-xl bg-white/5 p-4 text-sm text-slate-400">
              No messages found yet. Send a message to get started.
            </p>
          )}

          <div className="mt-6 max-h-[600px] space-y-5 overflow-y-auto rounded-2xl bg-[#090d18] p-4 sm:p-6">
            {messages.map((item) => {
              const isMine = item.sender === wallet;
              const timestamp = item.timestamp;
              const date =
                timestamp !== null ? new Date(timestamp * 1000) : null;
              const validDate =
                date !== null && Number.isFinite(date.getTime());

              return (
                <div
                  key={item.address}
                  className={`flex w-full ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <article
                    className={`max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[75%] ${
                      isMine
                        ? "rounded-br-sm bg-violet-600 text-white"
                        : "rounded-bl-sm border border-white/10 bg-[#151c2e] text-white"
                    }`}
                  >
                    <p className={`mb-1 text-xs font-medium ${isMine ? "text-violet-200" : "text-sky-300"}`}>
                      {isMine ? "You" : `${item.sender.slice(0, 6)}...${item.sender.slice(-6)}`}
                    </p>

                    <p className="whitespace-pre-wrap break-words">{item.content}</p>

                    <div className={`mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] ${isMine ? "text-violet-200" : "text-slate-400"}`}>
                      <span>
                        {validDate
                          ? date.toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : `Time unavailable · Message #${item.messageId}`}
                      </span>
                      <div className="flex items-center gap-3">
                        <a
                          href={`https://explorer.solana.com/address/${item.address}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 hover:opacity-80"
                        >
                          PDA ↗
                        </a>

                        {isMine && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteMessage(item.address)}
                            disabled={deletingAddress !== null}
                            className="font-semibold text-red-300 underline underline-offset-2 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingAddress === item.address ? "Deleting..." : "Delete"}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl border-t border-white/10 py-6 text-center text-sm text-slate-500">
        Built on Solana · PDA Chat · Devnet
      </footer>
    </main>
  );
}
