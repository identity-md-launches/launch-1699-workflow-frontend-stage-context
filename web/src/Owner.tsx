import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { zeroAddress } from "viem";
import type { Runtime } from "./config";
import { read, type ChainData, type Transactions } from "./chain";
import {
  amount,
  checkedAddress,
  errorMessage,
  parseAmount,
  same,
} from "./utils";
import { AddressLink, FieldError, TxStatus } from "./ui";
export function Owner({
  runtime,
  chain,
  tx,
}: {
  runtime: Runtime;
  chain: ChainData;
  tx: Transactions;
}) {
  const { address } = useAccount();
  const [fund, setFund] = useState("");
  const [tokens, setTokens] = useState("");
  const [fundAllowance, setFundAllowance] = useState<bigint>();
  const [error, setError] = useState("");
  const [ack, setAck] = useState(false);
  useEffect(() => {
    setFundAllowance(undefined);
    if (address && chain.data?.configured && same(address, chain.data.owner))
      void read<bigint>(
        chain.client,
        runtime.wake.address,
        runtime.abis.LaunchToken,
        "allowance",
        [address, runtime.graveyard.address],
      )
        .then(setFundAllowance)
        .catch((e) => setError(errorMessage(e)));
  }, [address, chain.data?.time]);
  if (!chain.data || !same(address, chain.data.owner)) return null;
  const data = chain.data;
  let funding = 0n;
  try {
    funding = parseAmount(fund, data.wakeDecimals);
  } catch {}
  const needsFundingApproval =
    fundAllowance === undefined || fundAllowance < funding;
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const fundAction = () =>
    run(async () => {
      const value = parseAmount(fund, data.wakeDecimals);
      if (value > data.wakeBalance)
        throw Error("Your WAKE balance is too low.");
      const current = await read<bigint>(
        chain.client,
        runtime.wake.address,
        runtime.abis.LaunchToken,
        "allowance",
        [address!, runtime.graveyard.address],
      );
      if (current < value !== needsFundingApproval) {
        setFundAllowance(current);
        throw Error(
          "Your allowance changed. Review the updated action and try again.",
        );
      }
      if (current < value) {
        await tx.send("fund", "Approve WAKE funding", {
          address: runtime.wake.address,
          abi: runtime.abis.LaunchToken,
          functionName: "approve",
          args: [runtime.graveyard.address, value],
        });
        setFundAllowance(
          await read<bigint>(
            chain.client,
            runtime.wake.address,
            runtime.abis.LaunchToken,
            "allowance",
            [address!, runtime.graveyard.address],
          ),
        );
      } else {
        await tx.send("fund", "Fund WAKE rewards", {
          address: runtime.graveyard.address,
          abi: runtime.abis.Graveyard,
          functionName: "fund",
          args: [value],
        });
        setFund("");
        setAck(false);
      }
    });
  const consecrate = () =>
    run(async () => {
      const list = tokens
        .split(/[\s,;]+/)
        .filter(Boolean)
        .map(checkedAddress);
      if (!list.length)
        throw Error("Paste at least one token contract address.");
      if (new Set(list.map((a) => a.toLowerCase())).size !== list.length)
        throw Error("Remove duplicate addresses.");
      for (const a of list) {
        if (
          same(a, runtime.wake.address) ||
          same(a, zeroAddress) ||
          same(a, runtime.graveyard.address)
        )
          throw Error(
            "WAKE, zero and Graveyard addresses cannot be consecrated.",
          );
        if (data.tokens.some((t) => same(t.address, a)))
          throw Error("Remove tokens that are already consecrated.");
      }
      await tx.send("consecrate", "Consecrate tokens", {
        address: runtime.graveyard.address,
        abi: runtime.abis.Graveyard,
        functionName: "consecrate",
        args: [list],
      });
      setTokens("");
    });
  return (
    <section className="owner-panel" id="owner">
      <div className="section-heading">
        <h2>Keep the candles burning</h2>
        <span className="muted small">Owner settings</span>
      </div>
      <p>These controls are available to the connected cemetery owner.</p>
      {!data.configured ? (
        <div>
          <h3>Set the WAKE token</h3>
          <p>
            This permanently binds the cemetery to the attested WAKE contract.
          </p>
          <AddressLink runtime={runtime} address={runtime.wake.address} />
          <button
            disabled={!chain.walletReady || !!tx.busy || data.mismatch}
            onClick={() =>
              void run(() =>
                tx.send("setup", "Set WAKE token", {
                  address: runtime.graveyard.address,
                  abi: runtime.abis.Graveyard,
                  functionName: "setWakeToken",
                  args: [runtime.wake.address],
                }),
              )
            }
          >
            Set WAKE token permanently
          </button>
          <TxStatus runtime={runtime} tx={tx} actionKey="setup" />
        </div>
      ) : (
        <div className="two-column">
          <div>
            <h3>Fund rewards</h3>
            <p className="small">
              Deposits cannot be withdrawn. Available:{" "}
              {amount(data.wakeBalance, data.wakeDecimals)} WAKE.
            </p>
            <label>
              WAKE to deposit
              <input
                value={fund}
                onChange={(e) => {
                  setFund(e.target.value);
                  setAck(false);
                }}
                inputMode="decimal"
                placeholder="0.00"
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              I understand this deposit is irrevocable.
            </label>
            <button
              disabled={
                !chain.walletReady ||
                !!tx.busy ||
                !ack ||
                fundAllowance === undefined
              }
              onClick={() => void fundAction()}
            >
              {tx.busy && tx.state?.key === "fund"
                ? tx.state.label + "…"
                : !needsFundingApproval && fund
                  ? "Fund rewards"
                  : "Approve WAKE funding"}
            </button>
            <TxStatus tx={tx} runtime={runtime} actionKey="fund" />
          </div>
          <div>
            <h3>Consecrate tokens</h3>
            <p className="small">
              One address per line. Tokens are added permanently; WAKE cannot be
              added.
            </p>
            <label>
              Token contract addresses
              <textarea
                value={tokens}
                onChange={(e) => setTokens(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
              />
            </label>
            <button
              disabled={!chain.walletReady || !!tx.busy}
              onClick={() => void consecrate()}
            >
              {tx.busy && tx.state?.key === "consecrate"
                ? "Consecrating…"
                : "Consecrate permanently"}
            </button>
            <TxStatus tx={tx} runtime={runtime} actionKey="consecrate" />
          </div>
        </div>
      )}
      <FieldError error={error} />
    </section>
  );
}
