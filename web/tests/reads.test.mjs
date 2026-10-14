import { describe, it, expect } from "vitest";
import { createPublicClient, custom } from "viem";
import {
  createFixture,
  deployment,
  graveAbi,
  ercAbi,
  g,
  w,
  ACCOUNT,
} from "./fixture.mjs";
import { snapshot, verifyChain } from "../src/chain";
import { errorMessage } from "../src/utils";
const runtime = {
  deployment,
  graveyard: { address: g },
  wake: { address: w },
  abis: { Graveyard: graveAbi, LaunchToken: ercAbi },
};
describe("Live reads without a wallet or funds", () => {
  it("reads all 101 consecrated tokens using 100-item pages at one block", async () => {
    const fixture = createFixture({ tokenCount: 101 });
    const client = createPublicClient({
      transport: custom({ request: (request) => fixture.rpc(request) }),
    });
    await verifyChain(client, runtime);
    const data = await snapshot(client, runtime, ACCOUNT);
    expect(data.tokens).toHaveLength(101);
    expect(data.tokens.filter((t) => t.canBury)).toHaveLength(101);
    expect(data.tokens[0].decimals).toBe(6);
    expect(data.tokens[100].balance).toBe(20n * 10n ** 18n);
    const calls = fixture.calls.filter((c) => c.method === "eth_call");
    expect(calls.every((c) => c.params[1] === "0x1c9c380")).toBe(true);
  });
  it("rejects an RPC with missing deployed code", async () => {
    const fixture = createFixture();
    fixture.missingCode = true;
    const client = createPublicClient({
      transport: custom({ request: (request) => fixture.rpc(request) }),
    });
    await expect(verifyChain(client, runtime)).rejects.toThrow(
      "has no deployed code",
    );
  });
  it("preserves a simulation revert reason even when the RPC error includes an HTTP URL", () => {
    expect(
      errorMessage(
        Error(
          "execution reverted: simulation failed\nURL: https://rpc.example",
        ),
      ),
    ).toBe("The transaction would fail: simulation failed");
  });
});
