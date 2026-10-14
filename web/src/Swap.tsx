import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits, zeroAddress } from "viem";
import type { Runtime } from "./config";
import { read, type ChainData, type Transactions } from "./chain";
import { amount, errorMessage, parseAmount, same } from "./utils";
import {
  buildSwap,
  minimumOutput,
  permitAbi,
  quoterAbi,
  routerAbi,
} from "./swap";
import { FieldError, TxStatus } from "./ui";
type Quote = {
  out: bigint;
  minimum: bigint;
  input: bigint;
  expires: number;
  step: "token" | "permit" | "swap";
  balance: bigint;
};
export function Swap({
  runtime,
  chain,
  tx,
  connect,
}: {
  runtime: Runtime;
  chain: ChainData;
  tx: Transactions;
  connect: () => void;
}) {
  const { address, chainId } = useAccount();
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [value, setValue] = useState("");
  const [slippage, setSlippage] = useState("0.50");
  const [quote, setQuote] = useState<Quote>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  const pool = runtime.deployment.poolKey;
  const net = runtime.deployment.network;
  const uni = net.uniswapV4;
  const pairAddress = pool
    ? same(pool.currency0, runtime.wake.address)
      ? pool.currency1
      : same(pool.currency1, runtime.wake.address)
        ? pool.currency0
        : undefined
    : undefined;
  const pair =
    pairAddress && same(pairAddress, zeroAddress)
      ? { address: zeroAddress, ...net.nativeCurrency }
      : [net.pairToken, ...(net.otherPairTokens ?? [])].find(
          (t) => t && same(t.address, pairAddress),
        );
  const wake = {
    address: runtime.wake.address,
    symbol: "WAKE",
    decimals: chain.data?.wakeDecimals ?? 18,
  };
  const input = direction === "buy" ? pair : wake;
  const output = direction === "buy" ? wake : pair;
  useEffect(() => {
    generation.current++;
    setQuote(undefined);
    setError("");
    setLoading(false);
  }, [direction, value, slippage, address, chainId]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const getQuote = async () => {
    if (!pool || !uni || !input || !output) return;
    setError("");
    setLoading(true);
    const current = ++generation.current;
    try {
      const inputAmount = parseAmount(value, input.decimals);
      if (inputAmount > (1n << 128n) - 1n)
        throw Error("This amount is too large for one swap.");
      for (const contract of [uni.quoter, uni.universalRouter, uni.permit2]) {
        const code = await chain.client.getBytecode({ address: contract });
        if (!code || code === "0x")
          throw Error(
            "A configured exchange contract has no code. Swaps are unavailable.",
          );
      }
      const result = await chain.client.simulateContract({
        address: uni.quoter,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: pool,
            zeroForOne: same(input.address, pool.currency0),
            exactAmount: inputAmount,
            hookData: "0x",
          },
        ],
        account: address,
      });
      const out = result.result[0];
      const minimum = minimumOutput(out, slippage);
      let step: Quote["step"] = "swap";
      let balance = 0n;
      if (address) {
        if (same(input.address, zeroAddress))
          balance = await chain.client.getBalance({ address });
        else {
          const [b, tokenAllowance, permitAllowance, block] = await Promise.all(
            [
              read<bigint>(
                chain.client,
                input.address,
                runtime.abis.LaunchToken,
                "balanceOf",
                [address],
              ),
              read<bigint>(
                chain.client,
                input.address,
                runtime.abis.LaunchToken,
                "allowance",
                [address, uni.permit2],
              ),
              read<readonly [bigint, number, number]>(
                chain.client,
                uni.permit2,
                permitAbi,
                "allowance",
                [address, input.address, uni.universalRouter],
              ),
              chain.client.getBlock(),
            ],
          );
          balance = b;
          step =
            tokenAllowance < inputAmount
              ? "token"
              : permitAllowance[0] < inputAmount ||
                  BigInt(permitAllowance[1]) <= block.timestamp + 600n
                ? "permit"
                : "swap";
        }
      }
      if (current === generation.current)
        setQuote({
          out,
          minimum,
          input: inputAmount,
          expires: Date.now() + 60000,
          step,
          balance,
        });
    } catch (e) {
      if (current === generation.current) {
        setError(errorMessage(e));
        setQuote(undefined);
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  };
  const execute = async () => {
    if (!quote || !input || !pool || !uni || !address) return;
    setError("");
    try {
      if (Date.now() > quote.expires)
        throw Error("This quote expired. Get a fresh quote before continuing.");
      const block = await chain.client.getBlock();
      if (quote.step === "token") {
        await tx.send("swap", `Approve ${input.symbol} to Permit2`, {
          address: input.address,
          abi: runtime.abis.LaunchToken,
          functionName: "approve",
          args: [uni.permit2, quote.input],
        });
        await getQuote();
      } else if (quote.step === "permit") {
        await tx.send("swap", `Allow router to spend ${input.symbol}`, {
          address: uni.permit2,
          abi: permitAbi,
          functionName: "approve",
          args: [
            input.address,
            uni.universalRouter,
            quote.input,
            Number(block.timestamp + 3600n),
          ],
        });
        await getQuote();
      } else {
        const data = buildSwap(
          pool,
          input.address,
          quote.input,
          quote.minimum,
          uni.extendedSwapParams,
        );
        await tx.send("swap", direction === "buy" ? "Buy WAKE" : "Sell WAKE", {
          address: uni.universalRouter,
          abi: routerAbi,
          functionName: "execute",
          args: [data.commands, data.inputs, block.timestamp + 600n],
          value: data.value,
        });
        setQuote(undefined);
        setValue("");
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <section id="trade" className="trade-section">
      <div>
        <IconHeading />
        <p>
          Trade WAKE in its deployed {pair?.symbol ?? "paired token"} pool. Use
          WAKE to leave flowers, or keep it as a memory.
        </p>
        <p className="small muted">
          A quote includes the pool fee. Gas is paid separately in ETH. USD
          prices are unavailable.
        </p>
        {pool && (
          <dl className="pool-details">
            <div>
              <dt>Pool fee</dt>
              <dd>{pool.fee / 10000}%</dd>
            </div>
            <div>
              <dt>Slippage</dt>
              <dd>Your choice</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>{net.name}</dd>
            </div>
          </dl>
        )}
      </div>
      <div className="trade-controls">
        {!pool || !uni || !input || !output ? (
          <p>
            Swaps are unavailable: this deployment has no verified pool
            configuration.
          </p>
        ) : (
          <>
            <div className="segmented" aria-label="Swap direction">
              <button
                aria-pressed={direction === "buy"}
                onClick={() => setDirection("buy")}
                disabled={!!tx.busy}
              >
                Buy WAKE
              </button>
              <button
                aria-pressed={direction === "sell"}
                onClick={() => setDirection("sell")}
                disabled={!!tx.busy}
              >
                Sell WAKE
              </button>
            </div>
            <label>
              You pay in {input.symbol}
              <input
                value={value}
                inputMode="decimal"
                placeholder="0.00"
                disabled={!!tx.busy}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <label>
              Slippage tolerance (%)
              <input
                value={slippage}
                inputMode="decimal"
                disabled={!!tx.busy}
                onChange={(e) => setSlippage(e.target.value)}
                aria-describedby="slippage-help"
              />
            </label>
            <p id="slippage-help" className="small muted">
              Maximum difference from the quote. Choose 0.01% to 5%.
            </p>
            <button
              className="full"
              disabled={!chain.verified || loading || !!tx.busy}
              onClick={() => void getQuote()}
            >
              {loading
                ? "Getting quote…"
                : quote
                  ? "Refresh quote"
                  : "Get quote"}
            </button>
            {quote && (
              <>
                <dl className="quote">
                  <div>
                    <dt>Expected output</dt>
                    <dd>
                      {amount(quote.out, output.decimals)} {output.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt>Minimum received</dt>
                    <dd>
                      {formatUnits(quote.minimum, output.decimals)}{" "}
                      {output.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt>Exchange rate</dt>
                    <dd>
                      1 {input.symbol} ≈{" "}
                      {amount(
                        (quote.out * 10n ** BigInt(input.decimals)) /
                          quote.input,
                        output.decimals,
                      )}{" "}
                      {output.symbol}
                    </dd>
                  </div>
                  {address && (
                    <div>
                      <dt>Your balance</dt>
                      <dd>
                        {amount(quote.balance, input.decimals)} {input.symbol}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="small muted">
                  {quote.expires <= now
                    ? "Quote expired. Refresh to continue."
                    : `Quote valid for ${Math.ceil((quote.expires - now) / 1000)} seconds.`}
                </p>
                {!address ? (
                  <button className="primary full" onClick={connect}>
                    Connect to trade
                  </button>
                ) : (
                  <>
                    <p className="small">
                      {quote.step === "token"
                        ? `Step 1: approve exactly ${amount(quote.input, input.decimals)} ${input.symbol} to Permit2.`
                        : quote.step === "permit"
                          ? `Step 2: allow the router to spend exactly ${amount(quote.input, input.decimals)} ${input.symbol} for one hour.`
                          : `Swap ${amount(quote.input, input.decimals)} ${input.symbol} for at least ${amount(quote.minimum, output.decimals)} ${output.symbol}.`}
                    </p>
                    <button
                      className="primary full"
                      disabled={
                        !chain.walletReady ||
                        !!tx.busy ||
                        loading ||
                        quote.expires <= now ||
                        quote.balance < quote.input
                      }
                      onClick={() => void execute()}
                    >
                      {tx.busy && tx.state?.key === "swap"
                        ? tx.state.label + "…"
                        : quote.balance < quote.input
                          ? `Insufficient ${input.symbol}`
                          : quote.step === "token"
                            ? `Approve ${input.symbol} to Permit2`
                            : quote.step === "permit"
                              ? "Approve router allowance"
                              : direction === "buy"
                                ? "Confirm buy WAKE"
                                : "Confirm sell WAKE"}
                    </button>
                  </>
                )}
              </>
            )}
            {!chain.verified && (
              <p className="small muted">
                Quotes become available after the deployed contracts are
                verified.
              </p>
            )}
            <FieldError error={error} />
            <TxStatus runtime={runtime} tx={tx} actionKey="swap" />
          </>
        )}
      </div>
    </section>
  );
}
function IconHeading() {
  return <h2>A new beginning, with WAKE.</h2>;
}
