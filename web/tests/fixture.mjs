// Synthetic chain for browser validation only; never imported by the application.
import { readFileSync } from "node:fs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeAbiParameters,
  encodeEventTopics,
  parseAbi,
  parseAbiParameters,
  toHex,
  zeroAddress,
} from "viem";
export const deployment = JSON.parse(
  readFileSync(
    new URL("../../dist/imd-deployment.json", import.meta.url),
    "utf8",
  ),
);
export const g = deployment.contracts.find(
  (c) => c.name === "Graveyard",
).address;
export const w = deployment.contracts.find(
  (c) => c.name === "LaunchToken",
).address;
export const graveAbi = JSON.parse(
  readFileSync(
    new URL("../../dist/abi/Graveyard.json", import.meta.url),
    "utf8",
  ),
);
export const ercAbi = JSON.parse(
  readFileSync(
    new URL("../../dist/abi/LaunchToken.json", import.meta.url),
    "utf8",
  ),
);
const quoteAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)",
]);
const permitAbi = parseAbi([
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
const routerAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
export const ACCOUNT = "0x1000000000000000000000000000000000000001";
export const OWNER = "0x1000000000000000000000000000000000000002";
export const TOKEN1 = "0x2000000000000000000000000000000000000001";
export const TOKEN2 = "0x2000000000000000000000000000000000000002";
const HASH = "0x" + "ab".repeat(32);
const UNIT = 10n ** 18n;
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();
export function createFixture({
  owner = false,
  setup = true,
  wrongChain = false,
  tokenCount = 2,
} = {}) {
  const s = {
    account: owner ? OWNER : ACCOUNT,
    chainId: wrongChain ? "0xa" : "0x1",
    unknownChain: wrongChain,
    connected: false,
    setup,
    calls: [],
    writes: [],
    holdReceipts: false,
    receipts: new Map(),
    txs: new Map(),
    allowances: new Map(),
    permits: new Map(),
    rejectNext: false,
    revertNext: false,
    failReads: false,
    missingCode: false,
    vault: 1000000n * UNIT,
    wakeBalance: 100n * UNIT,
    paid: 0n,
    flowers: 0n,
    burials: 0n,
    block: 30000000n,
  };
  s.tokens = Array.from({ length: tokenCount }, (_, i) => ({
    token: "0x" + (BigInt(TOKEN1) + BigInt(i)).toString(16).padStart(40, "0"),
    firstMourner: zeroAddress,
    firstBurialTime: 0n,
    mourners: 0n,
    totalBuried: 0n,
    epitaphText: "",
    epitaphWritten: false,
    flowers: 0n,
    balance: i === 0 ? 123450000n : 20n * UNIT,
    name: i === 0 ? "Moon Rabbit" : "Last Light",
    symbol: i === 0 ? "MOON" : "LIGHT",
    decimals: i === 0 ? 6 : 18,
  }));
  const abiFor = (a) =>
    same(a, g)
      ? graveAbi
      : same(a, deployment.network.uniswapV4.quoter)
        ? quoteAbi
        : same(a, deployment.network.uniswapV4.permit2)
          ? permitAbi
          : same(a, deployment.network.uniswapV4.universalRouter)
            ? routerAbi
            : ercAbi;
  const block = () => ({
    number: toHex(s.block),
    hash: HASH,
    parentHash: HASH,
    nonce: "0x0000000000000000",
    sha3Uncles: HASH,
    logsBloom: "0x" + "00".repeat(256),
    transactionsRoot: HASH,
    stateRoot: HASH,
    receiptsRoot: HASH,
    miner: OWNER,
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x100",
    gasLimit: "0x1c9c380",
    gasUsed: "0x5208",
    timestamp: "0x68000000",
    transactions: [],
    uncles: [],
    baseFeePerGas: "0x3b9aca00",
    mixHash: HASH,
  });
  function call(tx) {
    const abi = abiFor(tx.to);
    const { functionName: f, args = [] } = decodeFunctionData({
      abi,
      data: tx.data,
    });
    const t = s.tokens.find((t) => same(t.token, tx.to));
    let result;
    if (same(tx.to, g)) {
      result = {
        owner: OWNER,
        wakeToken: s.setup ? w : zeroAddress,
        consecratedCount: BigInt(s.tokens.length),
        totalBurials: s.burials,
        totalTokensBuried: BigInt(
          s.tokens.filter((t) => t.mourners > 0n).length,
        ),
        totalMourners: s.burials > 0n ? 1n : 0n,
        totalWakePaidOut: s.paid,
        totalFlowersBurned: s.flowers,
        nextReward: s.vault / 2000n,
      }[f];
      if (f === "getTombstones")
        result = s.tokens.slice(Number(args[0]), Number(args[0] + args[1]));
      if (f === "getTombstone")
        result = s.tokens.find((t) => same(t.token, args[0]));
      if (f === "walletRecords") result = [s.burials, s.paid];
      if (f === "canBury") {
        const found = s.tokens.find((t) => same(t.token, args[1]));
        result =
          s.setup && !!found && found.balance > 0n && found.mourners === 0n;
      }
      if (f === "hasBuried")
        result =
          (s.tokens.find((t) => same(t.token, args[1]))?.mourners ?? 0n) > 0n;
      if (f === "consecrated")
        result = s.tokens.some((t) => same(t.token, args[0]));
    } else if (same(tx.to, deployment.network.uniswapV4.quoter)) {
      s.lastQuote = args[0];
      result = [args[0].exactAmount * 2n, 150000n];
    } else if (
      same(tx.to, deployment.network.uniswapV4.permit2) &&
      f === "allowance"
    )
      result = [s.permits.get(args[1].toLowerCase()) ?? 0n, 2000000000, 0];
    else if (f === "decimals") result = t?.decimals ?? 18;
    else if (f === "name")
      result =
        t?.name ??
        (same(tx.to, w) ? "A Funeral For Every Dead Token" : "Identity.md");
    else if (f === "symbol")
      result = t?.symbol ?? (same(tx.to, w) ? "WAKE" : "IMD");
    else if (f === "balanceOf")
      result = same(tx.to, w)
        ? same(args[0], g)
          ? s.vault
          : s.wakeBalance
        : (t?.balance ?? 1000n * UNIT);
    else if (f === "allowance")
      result =
        s.allowances.get(tx.to.toLowerCase() + args[1].toLowerCase()) ?? 0n;
    if (result !== undefined)
      return encodeFunctionResult({ abi, functionName: f, result });
    if (s.revertNext) {
      s.revertNext = false;
      throw Object.assign(Error("execution reverted: simulation failed"), {
        code: 3,
      });
    }
    if (f === "bury" || f === "buryMany")
      return encodeFunctionResult({
        abi,
        functionName: f,
        result: s.vault / 2000n,
      });
    if (f === "approve" && abi === ercAbi)
      return encodeFunctionResult({ abi, functionName: f, result: true });
    return "0x";
  }
  function send(tx) {
    if (s.rejectNext) {
      s.rejectNext = false;
      throw Object.assign(Error("User rejected the request"), { code: 4001 });
    }
    const abi = abiFor(tx.to);
    const decoded = decodeFunctionData({ abi, data: tx.data });
    s.writes.push({ ...decoded, to: tx.to, value: tx.value ?? "0x0" });
    const f = decoded.functionName,
      args = decoded.args ?? [];
    const hash = "0x" + (s.writes.length + 1).toString(16).padStart(64, "0");
    s.block++;
    const logs = [];
    if (f === "approve" && abi === ercAbi)
      s.allowances.set(tx.to.toLowerCase() + args[0].toLowerCase(), args[1]);
    if (f === "approve" && abi === permitAbi)
      s.permits.set(args[0].toLowerCase(), args[2]);
    if (f === "setWakeToken") s.setup = true;
    if (f === "fund") {
      s.vault += args[0];
      s.wakeBalance -= args[0];
    }
    if (f === "consecrate")
      for (const address of args[0])
        s.tokens.push({
          token: address,
          firstMourner: zeroAddress,
          firstBurialTime: 0n,
          mourners: 0n,
          totalBuried: 0n,
          epitaphText: "",
          epitaphWritten: false,
          flowers: 0n,
          balance: 0n,
          name: "New token",
          symbol: "NEW",
          decimals: 18,
        });
    if (f === "bury" || f === "buryMany")
      for (const addr of f === "bury" ? [args[0]] : args[0]) {
        const token = s.tokens.find((t) => same(t.token, addr));
        const value = token.balance;
        const reward = s.vault / 2000n;
        s.vault -= reward;
        s.paid += reward;
        s.wakeBalance += reward;
        s.burials++;
        token.balance = 0n;
        token.mourners = 1n;
        token.totalBuried = value;
        token.firstMourner = s.account;
        token.firstBurialTime = 1744830464n;
        logs.push({
          address: g,
          topics: encodeEventTopics({
            abi: graveAbi,
            eventName: "Buried",
            args: { token: addr, mourner: s.account },
          }),
          data: encodeAbiParameters(parseAbiParameters("uint256,uint256"), [
            value,
            reward,
          ]),
          blockNumber: toHex(s.block),
          transactionHash: hash,
          transactionIndex: "0x0",
          blockHash: HASH,
          logIndex: toHex(logs.length),
          removed: false,
        });
      }
    if (f === "epitaph") {
      const t = s.tokens.find((t) => same(t.token, args[0]));
      t.epitaphText = args[1];
      t.epitaphWritten = true;
    }
    if (f === "layFlowers") {
      const t = s.tokens.find((t) => same(t.token, args[0]));
      t.flowers += args[1];
      s.flowers += args[1];
      s.wakeBalance -= args[1];
    }
    const transaction = {
      hash,
      from: s.account,
      to: tx.to,
      input: tx.data,
      value: tx.value ?? "0x0",
      gas: "0x40000",
      gasPrice: "0x3b9aca00",
      nonce: "0x0",
      blockNumber: toHex(s.block),
      blockHash: HASH,
      transactionIndex: "0x0",
      type: "0x2",
      chainId: "0x1",
      v: "0x0",
      r: HASH,
      s: HASH,
      maxFeePerGas: "0x77359400",
      maxPriorityFeePerGas: "0x3b9aca00",
    };
    const receipt = {
      transactionHash: hash,
      transactionIndex: "0x0",
      blockHash: HASH,
      blockNumber: toHex(s.block),
      from: s.account,
      to: tx.to,
      cumulativeGasUsed: "0x20000",
      gasUsed: "0x20000",
      contractAddress: null,
      logs,
      logsBloom: "0x" + "00".repeat(256),
      status: "0x1",
      effectiveGasPrice: "0x3b9aca00",
      type: "0x2",
    };
    s.receipts.set(hash, receipt);
    s.txs.set(hash, transaction);
    return hash;
  }
  s.rpc = async ({ method, params = [] }, wallet = false) => {
    s.calls.push({ method, params, wallet });
    if (s.failReads && !wallet)
      throw Object.assign(Error("Network fixture unavailable"), {
        code: -32000,
      });
    switch (method) {
      case "eth_chainId":
        return wallet ? s.chainId : "0x1";
      case "eth_accounts":
        return s.connected ? [s.account] : [];
      case "eth_requestAccounts":
        if (s.rejectNext) {
          s.rejectNext = false;
          throw Object.assign(Error("User rejected the request"), {
            code: 4001,
          });
        }
        s.connected = true;
        return [s.account];
      case "wallet_switchEthereumChain":
        if (s.unknownChain) {
          s.unknownChain = false;
          throw Object.assign(Error("Unknown chain"), { code: 4902 });
        }
        s.chainId = params[0].chainId;
        return null;
      case "wallet_addEthereumChain":
        s.addChain = params[0];
        return null;
      case "wallet_getCapabilities":
        return {};
      case "wallet_requestPermissions":
        if (s.rejectNext) {
          s.rejectNext = false;
          throw Object.assign(Error("User rejected the request"), {
            code: 4001,
          });
        }
        s.connected = true;
        return [
          {
            parentCapability: "eth_accounts",
            caveats: [{ type: "restrictReturnedAccounts", value: [s.account] }],
          },
        ];
      case "wallet_revokePermissions":
        s.connected = false;
        return null;
      case "eth_getCode":
        return s.missingCode ? "0x" : "0x6000600055";
      case "eth_blockNumber":
        return toHex(s.block);
      case "eth_getBlockByNumber":
      case "eth_getBlockByHash":
        return block();
      case "eth_call":
        return call(params[0]);
      case "eth_estimateGas":
        return "0x30000";
      case "eth_gasPrice":
      case "eth_maxPriorityFeePerGas":
        return "0x3b9aca00";
      case "eth_getBalance":
        return toHex(10n * UNIT);
      case "eth_getTransactionCount":
        return "0x1";
      case "eth_sendTransaction":
        return send(params[0]);
      case "eth_getTransactionReceipt":
        return s.holdReceipts ? null : (s.receipts.get(params[0]) ?? null);
      case "eth_getTransactionByHash":
        return s.txs.get(params[0]) ?? null;
      default:
        throw Error("Unsupported fixture method " + method);
    }
  };
  return s;
}
export async function installFixture(page, s, { inject = true } = {}) {
  await page.route(
    /ethereum-rpc\.publicnode\.com|eth\.drpc\.org/,
    async (route) => {
      const body = route.request().postDataJSON();
      const run = async (r) => {
        try {
          return { jsonrpc: "2.0", id: r.id, result: await s.rpc(r) };
        } catch (e) {
          return {
            jsonrpc: "2.0",
            id: r.id,
            error: { code: e.code ?? -32000, message: e.message },
          };
        }
      };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          Array.isArray(body)
            ? await Promise.all(body.map(run))
            : await run(body),
        ),
      });
    },
  );
  if (!inject) return;
  await page.exposeFunction("__fixtureRequest", async (request) => {
    try {
      return { result: await s.rpc(request, true) };
    } catch (e) {
      return { error: { message: e.message, code: e.code ?? -32000 } };
    }
  });
  await page.addInitScript(() => {
    const listeners = {};
    const provider = {
      isMetaMask: false,
      on: (name, fn) => {
        (listeners[name] ??= []).push(fn);
      },
      removeListener: (name, fn) => {
        listeners[name] = (listeners[name] ?? []).filter((f) => f !== fn);
      },
      request: async (req) => {
        const response = await window.__fixtureRequest(req);
        if (response.error)
          throw Object.assign(new Error(response.error.message), {
            code: response.error.code,
          });
        if (req.method === "wallet_switchEthereumChain")
          for (const fn of listeners.chainChanged ?? [])
            fn(req.params[0].chainId);
        return response.result;
      },
    };
    window.__fixtureProvider = provider;
    window.__fixtureEmit = (name, value) => {
      for (const fn of listeners[name] ?? []) fn(value);
    };
    const info = {
      uuid: "fa92a4b1-c8e1-4c27-ae8e-9a24f5c41374",
      name: "Test Wallet",
      icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="28" height="28"%3E%3Crect width="28" height="28" fill="gold"/%3E%3C/svg%3E',
      rdns: "test.wallet",
    };
    const announce = () =>
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: Object.freeze({ info, provider }),
        }),
      );
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  });
}
