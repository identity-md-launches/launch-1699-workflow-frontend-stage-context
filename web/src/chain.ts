import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { getAccount, getWalletClient } from "@wagmi/core";
import {
  createPublicClient,
  custom,
  zeroAddress,
  type Abi,
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import type { Runtime } from "./config";
import { errorMessage, same, short, type TokenMeta } from "./utils";
export type Tombstone = {
  token: Address;
  firstMourner: Address;
  firstBurialTime: bigint;
  mourners: bigint;
  totalBuried: bigint;
  epitaphText: string;
  epitaphWritten: boolean;
  flowers: bigint;
};
export type Token = Tombstone &
  TokenMeta & { balance: bigint | null; canBury: boolean; readError?: boolean };
export type Snapshot = {
  owner: Address;
  wakeToken: Address;
  configured: boolean;
  mismatch: boolean;
  tokens: Token[];
  totalBurials: bigint;
  totalTokensBuried: bigint;
  totalMourners: bigint;
  totalWakePaidOut: bigint;
  totalFlowersBurned: bigint;
  vault: bigint;
  nextReward: bigint;
  wakeBalance: bigint;
  wakeDecimals: number;
  walletRecord: readonly [bigint, bigint];
  block: bigint;
  time: number;
  account?: Address;
};
export async function read<T>(
  client: PublicClient,
  address: Address,
  abi: Abi,
  functionName: string,
  args?: readonly unknown[],
  blockNumber?: bigint,
): Promise<T> {
  return client.readContract({
    address,
    abi,
    functionName,
    args,
    blockNumber,
  }) as Promise<T>;
}
export async function verifyChain(client: PublicClient, runtime: Runtime) {
  if ((await client.getChainId()) !== runtime.deployment.chainId)
    throw Error("The RPC returned the wrong chain. Transactions are disabled.");
  for (const c of runtime.deployment.contracts) {
    const code = await client.getBytecode({ address: c.address });
    if (!code || code === "0x")
      throw Error(
        `${c.name} has no deployed code on this RPC. Transactions are disabled.`,
      );
  }
}
export async function snapshot(
  client: PublicClient,
  runtime: Runtime,
  account?: Address,
): Promise<Snapshot> {
  const block = await client.getBlockNumber();
  const g = <T>(name: string, args?: readonly unknown[]) =>
    read<T>(
      client,
      runtime.graveyard.address,
      runtime.abis.Graveyard,
      name,
      args,
      block,
    );
  const erc = <T>(address: Address, name: string, args?: readonly unknown[]) =>
    read<T>(client, address, runtime.abis.LaunchToken, name, args, block);
  const [
    owner,
    wakeToken,
    count,
    totalBurials,
    totalTokensBuried,
    totalMourners,
    totalWakePaidOut,
    totalFlowersBurned,
    wakeDecimals,
  ] = await Promise.all([
    g<Address>("owner"),
    g<Address>("wakeToken"),
    g<bigint>("consecratedCount"),
    g<bigint>("totalBurials"),
    g<bigint>("totalTokensBuried"),
    g<bigint>("totalMourners"),
    g<bigint>("totalWakePaidOut"),
    g<bigint>("totalFlowersBurned"),
    erc<number>(runtime.wake.address, "decimals"),
  ]);
  const configured = same(wakeToken, runtime.wake.address);
  const mismatch = !same(wakeToken, zeroAddress) && !configured;
  const [vault, nextReward, wakeBalance, walletRecord] = await Promise.all([
    erc<bigint>(runtime.wake.address, "balanceOf", [runtime.graveyard.address]),
    configured ? g<bigint>("nextReward") : 0n,
    account ? erc<bigint>(runtime.wake.address, "balanceOf", [account]) : 0n,
    account
      ? g<readonly [bigint, bigint]>("walletRecords", [account])
      : ([0n, 0n] as const),
  ]);
  const stones: Tombstone[] = [];
  for (let start = 0n; start < count; start += 100n)
    stones.push(...(await g<Tombstone[]>("getTombstones", [start, 100n])));
  const tokens: Token[] = [];
  // Bound token discovery to six tokens at a time. One hostile token cannot hide the others.
  for (let i = 0; i < stones.length; i += 6)
    tokens.push(
      ...(await Promise.all(
        stones.slice(i, i + 6).map(async (stone) => {
          const [name, symbol, decimals, balance, eligible] =
            await Promise.allSettled([
              erc<string>(stone.token, "name"),
              erc<string>(stone.token, "symbol"),
              erc<number>(stone.token, "decimals"),
              account
                ? erc<bigint>(stone.token, "balanceOf", [account])
                : Promise.resolve(null),
              account && configured
                ? g<boolean>("canBury", [account, stone.token])
                : Promise.resolve(false),
            ]);
          return {
            ...stone,
            address: stone.token,
            name: name.status === "fulfilled" ? name.value : "Unnamed token",
            symbol:
              symbol.status === "fulfilled" ? symbol.value : short(stone.token),
            decimals:
              decimals.status === "fulfilled" ? Number(decimals.value) : null,
            balance: balance.status === "fulfilled" ? balance.value : null,
            canBury: eligible.status === "fulfilled" && eligible.value,
            readError:
              balance.status === "rejected" || eligible.status === "rejected",
          };
        }),
      )),
    );
  return {
    owner,
    wakeToken,
    configured,
    mismatch,
    tokens,
    totalBurials,
    totalTokensBuried,
    totalMourners,
    totalWakePaidOut,
    totalFlowersBurned,
    vault,
    nextReward,
    wakeBalance,
    wakeDecimals: Number(wakeDecimals),
    walletRecord,
    block,
    time: Date.now(),
    account,
  };
}
export function useChainData(runtime: Runtime) {
  const { address, connector, chainId } = useAccount();
  const [data, setData] = useState<Snapshot>();
  const [client, setClient] = useState<PublicClient>(
    runtime.publicClient as PublicClient,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const [viaWallet, setViaWallet] = useState(false);
  const generation = useRef(0);
  const reading = useRef(false);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    reading.current = true;
    try {
      let active = runtime.publicClient as PublicClient;
      let walletFallback = false;
      try {
        await verifyChain(active, runtime);
      } catch (e) {
        if (!connector || chainId !== runtime.chain.id) throw e;
        const provider = await connector.getProvider();
        active = createPublicClient({
          chain: runtime.chain,
          transport: custom(provider as Parameters<typeof custom>[0]),
        }) as PublicClient;
        await verifyChain(active, runtime);
        walletFallback = true;
      }
      const result = await snapshot(active, runtime, address);
      if (current !== generation.current) return;
      setClient(active);
      setData(result);
      setVerified(true);
      setViaWallet(walletFallback);
      setError("");
    } catch (e) {
      if (current === generation.current) {
        setVerified(false);
        setError(errorMessage(e));
      }
    } finally {
      if (current === generation.current) {
        setLoading(false);
        reading.current = false;
      }
    }
  }, [runtime, address, connector, chainId]);
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (!document.hidden && !reading.current) void refresh();
    }, 30000);
    return () => {
      generation.current++;
      clearInterval(interval);
    };
  }, [refresh]);
  const walletReady =
    !!address &&
    chainId === runtime.chain.id &&
    verified &&
    same(address, data?.account);
  return {
    data,
    client,
    loading,
    error,
    verified,
    viaWallet,
    refresh,
    walletReady,
  };
}
export type ChainData = ReturnType<typeof useChainData>;
export type Write = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};
export type TxState = {
  key: string;
  label: string;
  phase:
    "simulating" | "signing" | "confirming" | "uncertain" | "success" | "error";
  message: string;
  hash?: Hash;
};
export function useTransactions(runtime: Runtime, chain: ChainData) {
  const [state, setState] = useState<TxState>();
  const latestChain = useRef(chain);
  latestChain.current = chain;
  const locked = useRef(false);
  const confirmationRetry = useRef<(() => void) | undefined>(undefined);
  const busy =
    state?.phase === "simulating" ||
    state?.phase === "signing" ||
    state?.phase === "confirming" ||
    state?.phase === "uncertain";
  const send = async (
    key: string,
    label: string,
    call: Write,
  ): Promise<TransactionReceipt> => {
    if (locked.current)
      throw Error("Wait for the current transaction to finish.");
    locked.current = true;
    let hash: Hash | undefined;
    setState({
      key,
      label,
      phase: "simulating",
      message: "Checking this transaction…",
    });
    try {
      const account = getAccount(runtime.config);
      if (
        !account.address ||
        account.chainId !== runtime.chain.id ||
        !chain.walletReady
      )
        throw Error(
          `Connect on ${runtime.chain.name} and refresh the contract state first.`,
        );
      const wallet = await getWalletClient(runtime.config);
      if ((await wallet.getChainId()) !== runtime.chain.id)
        throw Error(`Switch your wallet to ${runtime.chain.name}.`);
      await verifyChain(chain.client, runtime);
      const { request } = await chain.client.simulateContract({
        ...call,
        account: account.address,
      });
      // Guard a wallet/account change while the simulation was in flight.
      const fresh = getAccount(runtime.config);
      if (
        !same(fresh.address, account.address) ||
        fresh.chainId !== runtime.chain.id
      )
        throw Error("Your wallet changed. Review the action again.");
      setState({
        key,
        label,
        phase: "signing",
        message: "Review the transaction in your wallet.",
      });
      hash = await wallet.writeContract({
        ...request,
        chain: runtime.chain,
        account: account.address,
      });
      setState({
        key,
        label,
        phase: "confirming",
        hash,
        message: "Waiting for on-chain confirmation…",
      });
      let receipt: TransactionReceipt;
      let changedTransaction = false;
      for (;;) {
        try {
          receipt = await chain.client.waitForTransactionReceipt({
            hash,
            confirmations: 1,
            timeout: 180000,
            onReplaced: (replacement) => {
              changedTransaction ||= replacement.reason !== "repriced";
              hash = replacement.transaction.hash;
              setState({
                key,
                label,
                phase: "confirming",
                hash,
                message: "Checking the replacement transaction…",
              });
            },
          });
          break;
        } catch {
          setState({
            key,
            label,
            phase: "uncertain",
            hash,
            message:
              "Confirmation is not available yet. This action stays locked to prevent a duplicate. Check the transaction or retry confirmation.",
          });
          await new Promise<void>((resolve) => {
            confirmationRetry.current = resolve;
          });
          setState({
            key,
            label,
            phase: "confirming",
            hash,
            message: "Checking on-chain confirmation…",
          });
        }
      }
      if (changedTransaction) {
        await latestChain.current.refresh();
        throw Error(
          "A different transaction replaced this action. Review your balances before retrying.",
        );
      }
      if (receipt.status !== "success")
        throw Error(
          "The transaction reverted. Refresh your balances before retrying.",
        );
      await latestChain.current.refresh();
      setState({
        key,
        label,
        phase: "success",
        hash,
        message: "Confirmed on Ethereum.",
      });
      return receipt;
    } catch (e) {
      setState({
        key,
        label,
        phase: "error",
        hash,
        message: hash
          ? `${errorMessage(e)} Check the transaction before submitting again.`
          : errorMessage(e),
      });
      throw e;
    } finally {
      locked.current = false;
    }
  };
  return {
    state,
    busy,
    send,
    retryConfirmation: () => {
      confirmationRetry.current?.();
      confirmationRetry.current = undefined;
    },
    clear: () => {
      if (!locked.current) setState(undefined);
    },
  };
}
export type Transactions = ReturnType<typeof useTransactions>;
