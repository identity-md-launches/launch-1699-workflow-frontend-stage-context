import { describe, it, expect } from "vitest";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  parseAbiParameters,
  toBytes,
  zeroAddress,
  type Address,
  type TransactionReceipt,
} from "viem";
import { readFileSync } from "node:fs";
import { canonical, type Runtime, type PoolKey } from "../src/config";
import {
  amount,
  batches,
  byteLength,
  parseAmount,
  rewards,
} from "../src/utils";
import { buildSwap, minimumOutput } from "../src/swap";
import { switchNetwork, OPEN_IN } from "../src/Wallet";
import { confirmedBurials } from "../src/Burial";
const deployment = JSON.parse(
  readFileSync(
    new URL("../../dist/imd-deployment.json", import.meta.url),
    "utf8",
  ),
);
const graveyard = deployment.contracts.find(
  (c: { name: string }) => c.name === "Graveyard",
);
const abi = JSON.parse(
  readFileSync(
    new URL("../../dist/" + graveyard.abiPath, import.meta.url),
    "utf8",
  ),
);
const runtime = {
  deployment,
  chain: { id: deployment.chainId },
  graveyard,
  abis: { Graveyard: abi },
} as unknown as Runtime;
const pool = deployment.poolKey as PoolKey;
describe("Attested contract binding", () => {
  for (const c of deployment.contracts)
    it(c.name + " ABI hash matches", () => {
      const a = JSON.parse(
        readFileSync(
          new URL("../../dist/" + c.abiPath, import.meta.url),
          "utf8",
        ),
      );
      expect(keccak256(toBytes(canonical(a))).slice(2)).toBe(c.abiHash);
    });
});
describe("Amounts and irreversible burial previews", () => {
  it("uses token decimals and rejects rounding/exponents/negative/zero", () => {
    expect(parseAmount("1.000001", 6)).toBe(1000001n);
    expect(amount(1234567890123456789012345n, 18)).toBe("1,234,567.8901");
    for (const v of ["1.0000001", "1e3", "-1", "0", "Infinity"])
      expect(() => parseAmount(v, 6)).toThrow();
  });
  it("computes decay using integer flooring after every burial", () => {
    expect(rewards(10000000n, 3)).toEqual({
      each: [5000n, 4997n, 4995n],
      total: 14992n,
    });
    expect(rewards(1999n, 50).total).toBe(0n);
  });
  it("never batches more than 50 and keeps input ordering", () => {
    const tokens = Array.from({ length: 101 }, (_, i) => i);
    const parts = batches(tokens);
    expect(parts.map((p) => p.length)).toEqual([50, 50, 1]);
    expect(parts.flat()).toEqual(tokens);
  });
  it("counts UTF-8 bytes instead of characters for epitaphs", () => {
    expect(byteLength("é".repeat(32))).toBe(64);
    expect(byteLength("🌸".repeat(17))).toBe(68);
  });
});
describe("Uniswap v4 calldata", () => {
  for (const input of [pool.currency0, pool.currency1])
    it("uses exact attested pool in " + input, () => {
      const swap = buildSwap(pool, input, 1000n, 900n);
      expect(swap.commands).toBe("0x10");
      expect(swap.value).toBe(0n);
      const [actions, params] = decodeAbiParameters(
        parseAbiParameters("bytes,bytes[]"),
        swap.inputs[0],
      );
      expect(actions).toBe("0x060c0f");
      const [tuple] = decodeAbiParameters(
        parseAbiParameters(
          "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
        ),
        params[0],
      );
      expect(tuple.poolKey.hooks.toLowerCase()).toBe(pool.hooks);
      expect(tuple.poolKey.fee).toBe(pool.fee);
      expect(tuple.poolKey.tickSpacing).toBe(pool.tickSpacing);
      expect(tuple.zeroForOne).toBe(input === pool.currency0);
      expect(tuple.amountIn).toBe(1000n);
      expect(tuple.amountOutMinimum).toBe(900n);
      const settle = decodeAbiParameters(
        parseAbiParameters("address,uint256"),
        params[1],
      );
      expect(settle[0].toLowerCase()).toBe(input);
      expect(settle[1]).toBe(1000n);
      const take = decodeAbiParameters(
        parseAbiParameters("address,uint256"),
        params[2],
      );
      expect(take[0].toLowerCase()).toBe(
        input === pool.currency0 ? pool.currency1 : pool.currency0,
      );
      expect(take[1]).toBe(900n);
    });
  it("supports extended tuple and native value without changing the hook", () => {
    const native = { ...pool, currency0: zeroAddress };
    const call = buildSwap(native, zeroAddress, 500n, 450n, true);
    expect(call.value).toBe(500n);
    const [, params] = decodeAbiParameters(
      parseAbiParameters("bytes,bytes[]"),
      call.inputs[0],
    );
    const [v] = decodeAbiParameters(
      parseAbiParameters(
        "((address,address,uint24,int24,address),bool,uint128,uint128,uint256,bytes)",
      ),
      params[0],
    );
    expect(v[4]).toBe(0n);
    expect(v[0][4].toLowerCase()).toBe(pool.hooks);
  });
  it("rejects invalid amounts/currencies and constrains slippage", () => {
    expect(() => buildSwap(pool, zeroAddress, 1n, 1n)).toThrow();
    expect(() => buildSwap(pool, pool.currency0, 1n << 128n, 1n)).toThrow();
    expect(minimumOutput(10001n, "0.50")).toBe(9950n);
    for (const s of ["0", "5.01", "abc", "-1", "0.001"])
      expect(() => minimumOutput(100n, s)).toThrow();
  });
});
describe("Wallet network handling", () => {
  it("adds the exact handoff chain after 4902 then switches again", async () => {
    const calls: unknown[] = [];
    let first = true;
    await switchNetwork(
      {
        request: async (req) => {
          calls.push(req);
          if (first) {
            first = false;
            throw { code: 4902 };
          }
          return null;
        },
      },
      runtime,
    );
    expect(calls).toEqual([
      { method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] },
      {
        method: "wallet_addEthereumChain",
        params: [deployment.walletAddChain],
      },
      { method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] },
    ]);
  });
  it("does not reinterpret wallet rejection as an unknown chain", async () => {
    const calls: unknown[] = [];
    await expect(
      switchNetwork(
        {
          request: async (req) => {
            calls.push(req);
            throw { code: 4001, message: "User rejected" };
          },
        },
        runtime,
      ),
    ).rejects.toMatchObject({ code: 4001 });
    expect(calls.length).toBe(1);
  });
  it("keeps subpath and hash in all four mobile open links", () => {
    const url = "https://example.org/ipfs/content/index.html#cemetery";
    expect(OPEN_IN).toHaveLength(4);
    for (const w of OPEN_IN)
      expect(decodeURIComponent(w.href(url))).toContain(
        "example.org/ipfs/content/index.html#cemetery",
      );
  });
});
describe("Receipt-based sharing", () => {
  it("counts only matching Graveyard Buried events for this wallet", () => {
    const wallet = pool.currency0;
    const other = pool.currency1;
    const log = (address: Address, mourner: Address, reward: bigint) => ({
      address,
      topics: encodeEventTopics({
        abi,
        eventName: "Buried",
        args: { token: other, mourner },
      }),
      data: encodeAbiParameters(parseAbiParameters("uint256,uint256"), [
        100n,
        reward,
      ]),
    });
    const receipt = {
      logs: [
        log(graveyard.address, wallet, 500n),
        log(graveyard.address, wallet, 499n),
        log(graveyard.address, other, 700n),
        log(other, wallet, 800n),
      ],
    } as unknown as TransactionReceipt;
    expect(confirmedBurials(receipt, runtime, wallet)).toEqual({
      count: 2,
      reward: 999n,
    });
  });
});
