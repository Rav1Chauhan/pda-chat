import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import idl from "@/idl/pda_chat.json";

export const PROGRAM_ID = new PublicKey(
  "HGVJnqBu9BEaer3dfT2X3h4h3fG3VhoTMWzBamTUUTdS"
);

export const connection = new Connection(
  clusterApiUrl("devnet"),
  "confirmed"
);

export type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: AnchorProvider["wallet"]["signTransaction"];
  signAllTransactions: AnchorProvider["wallet"]["signAllTransactions"];
  signMessage?: (message: Uint8Array) => Promise<{ signature: Uint8Array }>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    callback: (...args: unknown[]) => void
  ) => void;
};

export function getProgram(provider: AnchorProvider) {
  return new Program(idl as any, provider);
}
