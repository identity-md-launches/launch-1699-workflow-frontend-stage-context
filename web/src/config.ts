import { createConfig } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  keccak256,
  toBytes,
  isAddress,
  type Abi,
  type Address,
} from "viem";
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export type PairToken = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
};
export type Deployment = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  poolKey?: PoolKey;
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    pairToken?: PairToken;
    otherPairTokens?: PairToken[];
    uniswapV4?: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
  };
  walletAddChain?: {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
};
export const canonical = (value: unknown): string =>
  JSON.stringify(ordered(value));
function ordered(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map(ordered)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, ordered((value as Record<string, unknown>)[k])]),
        )
      : value;
}
async function json(path: string) {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok)
    throw new Error(`Unable to load ${path}. Reload the page to retry.`);
  return response.json();
}
export async function loadRuntime() {
  const deployment = (await json("./imd-deployment.json")) as Deployment;
  if (
    deployment.version !== 1 ||
    deployment.chainId !== deployment.network?.chainId ||
    !deployment.network.rpcUrls.length
  )
    throw Error(
      "Deployment configuration is invalid. Transactions are unavailable.",
    );
  const abis: Record<string, Abi> = {};
  for (const contract of deployment.contracts) {
    if (
      !isAddress(contract.address) ||
      !/^[\w/-]+\.json$/.test(contract.abiPath) ||
      contract.abiPath.includes("..")
    )
      throw Error("Invalid deployment contract.");
    const abi = await json("./" + contract.abiPath);
    if (
      !Array.isArray(abi) ||
      keccak256(toBytes(canonical(abi))).slice(2) !== contract.abiHash
    )
      throw Error(
        `${contract.name} ABI failed verification. Transactions are unavailable.`,
      );
    abis[contract.name] = abi as Abi;
  }
  const graveyard = deployment.contracts.find((c) => c.name === "Graveyard");
  const wake = deployment.contracts.find((c) => c.name === "LaunchToken");
  if (!graveyard || !wake)
    throw Error("Required deployed contracts are missing.");
  const chain = defineChain({
    id: deployment.chainId,
    name: deployment.network.name,
    nativeCurrency: deployment.network.nativeCurrency,
    rpcUrls: { default: { http: deployment.network.rpcUrls } },
    blockExplorers: {
      default: { name: "Explorer", url: deployment.network.explorer },
    },
  });
  const transport = fallback(
    deployment.network.rpcUrls.map((url) =>
      http(url, { timeout: 12000, retryCount: 0 }),
    ),
    { rank: false },
  );
  const config = createConfig({
    chains: [chain],
    multiInjectedProviderDiscovery: true,
    connectors: [injected(), coinbaseWallet({ appName: "WAKE Graveyard" })],
    transports: { [chain.id]: transport },
  });
  return {
    deployment,
    abis,
    graveyard,
    wake,
    chain,
    config,
    publicClient: createPublicClient({ chain, transport }),
  };
}
export type Runtime = Awaited<ReturnType<typeof loadRuntime>>;
