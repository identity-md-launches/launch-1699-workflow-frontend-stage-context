import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { getAccount } from "@wagmi/core";
import {
  decodeEventLog,
  formatUnits,
  type Address,
  type TransactionReceipt,
} from "viem";
import type { Runtime } from "./config";
import { read, type ChainData, type Token, type Transactions } from "./chain";
import { amount, batches, errorMessage, rewards, same } from "./utils";
import { AddressLink, FieldError, Icon, Modal, TxStatus } from "./ui";
export type BurialResult = { count: number; reward: bigint };
export function confirmedBurials(
  receipt: TransactionReceipt,
  runtime: Runtime,
  wallet: Address,
): BurialResult {
  let count = 0;
  let reward = 0n;
  for (const log of receipt.logs) {
    if (!same(log.address, runtime.graveyard.address)) continue;
    try {
      const event = decodeEventLog({
        abi: runtime.abis.Graveyard,
        data: log.data,
        topics: log.topics,
      });
      if (event.eventName === "Buried") {
        const args = event.args as unknown as {
          mourner: Address;
          reward: bigint;
        };
        if (same(args.mourner, wallet)) {
          count++;
          reward += args.reward;
        }
      }
    } catch {
      /* Other receipt events do not contribute to the share card. */
    }
  }
  return { count, reward };
}
export function Burial({
  runtime,
  chain,
  tx,
  tokens,
  close,
  onResult,
}: {
  runtime: Runtime;
  chain: ChainData;
  tx: Transactions;
  tokens: Token[];
  close: () => void;
  onResult: (r: BurialResult) => void;
}) {
  const { address } = useAccount();
  const [remaining, setRemaining] = useState(tokens);
  const [allowances, setAllowances] = useState<Record<string, bigint>>({});
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [ack, setAck] = useState(false);
  const [batchSize, setBatchSize] = useState(50);
  const [completed, setCompleted] = useState<BurialResult>({
    count: 0,
    reward: 0n,
  });
  const refresh = async (list: Token[]) => {
    if (!address) return;
    setLoading(true);
    setReady(false);
    try {
      const updated: Token[] = [];
      const a: Record<string, bigint> = {};
      for (const token of list) {
        const [balance, allowance, canBury] = await Promise.all([
          read<bigint>(
            chain.client,
            token.address,
            runtime.abis.LaunchToken,
            "balanceOf",
            [address],
          ),
          read<bigint>(
            chain.client,
            token.address,
            runtime.abis.LaunchToken,
            "allowance",
            [address, runtime.graveyard.address],
          ),
          read<boolean>(
            chain.client,
            runtime.graveyard.address,
            runtime.abis.Graveyard,
            "canBury",
            [address, token.address],
          ),
        ]);
        if (!canBury)
          throw Error(
            `${token.symbol} is no longer eligible. Close this review and refresh your graveyard.`,
          );
        updated.push({ ...token, balance });
        a[token.address] = allowance;
      }
      setRemaining(updated);
      setAllowances(a);
      setReady(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh(tokens);
  }, []);
  const nextBatch = batches(remaining, batchSize)[0] ?? [];
  const needsApproval = nextBatch.find(
    (t) => t.balance !== null && (allowances[t.address] ?? 0n) < t.balance,
  );
  const estimate = rewards(chain.data?.vault ?? 0n, remaining.length);
  const step = async () => {
    if (!address) return;
    setError("");
    try {
      if (needsApproval) {
        const current = await read<bigint>(
          chain.client,
          needsApproval.address,
          runtime.abis.LaunchToken,
          "balanceOf",
          [address],
        );
        if (current !== needsApproval.balance) {
          setAck(false);
          await refresh(remaining);
          throw Error(
            "A token balance changed. Review the updated amount before approving.",
          );
        }
        await tx.send("burial", "Approve " + needsApproval.symbol, {
          address: needsApproval.address,
          abi: runtime.abis.LaunchToken,
          functionName: "approve",
          args: [runtime.graveyard.address, current],
        });
        await refresh(remaining);
      } else {
        for (const token of nextBatch) {
          const current = await read<bigint>(
            chain.client,
            token.address,
            runtime.abis.LaunchToken,
            "balanceOf",
            [address],
          );
          if (current !== token.balance) {
            setAck(false);
            await refresh(remaining);
            throw Error(
              "A token balance changed. Review the updated full balance.",
            );
          }
        }
        const receipt = await tx.send(
          "burial",
          `Bury ${nextBatch.length} token${nextBatch.length === 1 ? "" : "s"}`,
          {
            address: runtime.graveyard.address,
            abi: runtime.abis.Graveyard,
            functionName: tokens.length === 1 ? "bury" : "buryMany",
            args:
              tokens.length === 1
                ? [nextBatch[0].address]
                : [nextBatch.map((t) => t.address)],
          },
        );
        const result = confirmedBurials(receipt, runtime, address);
        const total = {
          count: completed.count + result.count,
          reward: completed.reward + result.reward,
        };
        setCompleted(total);
        if (same(getAccount(runtime.config).address, address)) onResult(total);
        const rest = remaining.slice(nextBatch.length);
        setRemaining(rest);
        setAck(false);
        if (rest.length) await refresh(rest);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal
      title={remaining.length ? "Review your burial" : "Laid to rest"}
      close={close}
    >
      {remaining.length ? (
        <>
          <p>
            Burial permanently sends each token’s{" "}
            <strong>entire balance</strong> to the contract’s dead address. Each
            token can be buried once per wallet.
          </p>
          <ul className="review-list">
            {remaining.map((t, i) => (
              <li key={t.address}>
                <div>
                  <strong>{t.symbol}</strong>
                  <span>
                    {t.balance !== null && t.decimals !== null
                      ? formatUnits(t.balance, t.decimals)
                      : "Unavailable"}{" "}
                    {t.symbol}
                  </span>
                  <span className="small muted">
                    Estimated reward:{" "}
                    {amount(estimate.each[i], chain.data?.wakeDecimals)} WAKE
                  </span>
                </div>
                <details>
                  <summary>Token address</summary>
                  <AddressLink runtime={runtime} address={t.address} />
                </details>
              </li>
            ))}
          </ul>
          <div className="reward-line">
            <span>Estimated total reward</span>
            <strong>
              {amount(estimate.total, chain.data?.wakeDecimals)} WAKE
            </strong>
          </div>
          <p className="small muted">
            Rewards fall by 0.05% of the remaining vault per burial. Other
            transactions can change them; a zero reward still uses your burial
            right. Gas is paid in ETH.
          </p>
          {tokens.length > 1 && (
            <label>
              Tokens per transaction
              <select
                value={batchSize}
                disabled={!!tx.busy}
                onChange={(e) => setBatchSize(Number(e.target.value))}
              >
                <option value={50}>Up to 50</option>
                <option value={10}>Up to 10</option>
                <option value={1}>One at a time</option>
              </select>
            </label>
          )}
          {remaining.length > batchSize && (
            <p className="small">
              {Math.ceil(remaining.length / batchSize)} separate transactions. A
              later failed batch cannot undo a confirmed burial.
            </p>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I understand these full token balances cannot be recovered.
          </label>
          <p className="small">
            {needsApproval
              ? `First, approve exactly ${amount(needsApproval.balance ?? 0n, needsApproval.decimals ?? 18)} ${needsApproval.symbol} for Graveyard. Burial requires a separate confirmation.`
              : "Approvals are sufficient. The next confirmation performs the burial."}
          </p>
          <button
            className="primary full"
            disabled={
              !ack || loading || !ready || !!tx.busy || !chain.walletReady
            }
            onClick={() => void step()}
          >
            {tx.busy && tx.state?.key === "burial"
              ? tx.state.label + "…"
              : loading
                ? "Checking allowances…"
                : needsApproval
                  ? `Approve ${needsApproval.symbol}`
                  : `Bury ${nextBatch.length === remaining.length && tokens.length > 1 ? "all " + nextBatch.length : nextBatch.length} token${nextBatch.length === 1 ? "" : "s"}`}
          </button>
        </>
      ) : (
        <div className="completion">
          <Icon name="candle" size={40} />
          <p>
            You buried {completed.count} token{completed.count === 1 ? "" : "s"}{" "}
            and received{" "}
            <strong>
              {amount(completed.reward, chain.data?.wakeDecimals)} WAKE
            </strong>
            .
          </p>
          <button className="primary" onClick={close}>
            See your share card
          </button>
        </div>
      )}
      {completed.count > 0 && remaining.length > 0 && (
        <p>
          {completed.count} burials already confirmed.{" "}
          {amount(completed.reward, chain.data?.wakeDecimals)} WAKE received.
        </p>
      )}
      <FieldError error={error} />
      {!ready && !loading && remaining.length > 0 && (
        <button
          onClick={() => {
            setError("");
            void refresh(remaining);
          }}
        >
          Retry allowance checks
        </button>
      )}
      <TxStatus runtime={runtime} tx={tx} actionKey="burial" />
    </Modal>
  );
}
export function ShareCard({
  result,
  decimals,
}: {
  result: BurialResult;
  decimals: number;
}) {
  const [url, setUrl] = useState("");
  const text = `I buried ${result.count} dead token${result.count === 1 ? "" : "s"} and woke up with ${amount(result.reward, decimals)} WAKE`;
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#0b1421";
    c.fillRect(0, 0, 1200, 630);
    c.strokeStyle = "#405165";
    c.lineWidth = 2;
    c.strokeRect(34, 34, 1132, 562);
    c.fillStyle = "#d8bd87";
    c.font = "36px Georgia";
    c.fillText("WAKE · A funeral for every dead token", 80, 105);
    c.fillStyle = "#e6e9ed";
    c.font = "58px Georgia";
    c.fillText(
      `I buried ${result.count} dead token${result.count === 1 ? "" : "s"}`,
      80,
      250,
    );
    c.fillText("and woke up with", 80, 330);
    c.fillStyle = "#d8bd87";
    const rewardText = `${amount(result.reward, decimals)} WAKE`;
    let size = 58;
    while (c.measureText(rewardText).width > 1040 && size > 18) {
      c.font = `${--size}px Georgia`;
    }
    c.fillText(rewardText, 80, 415);
    c.fillStyle = "#a7b2c1";
    c.font = "24px sans-serif";
    c.fillText("A final word. A new beginning.", 80, 540);
    const data = canvas.toDataURL("image/png");
    setUrl(data);
  }, [result.count, result.reward, decimals]);
  return (
    <section className="share-panel" aria-label="Your burial share card">
      <div>
        <h2>A little closure.</h2>
        <p>{text}.</p>
        <p className="small muted">
          From your confirmed burial receipts in this visit.
        </p>
        <div className="button-row">
          <a
            className="button primary"
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(location.href.split("#")[0])}`}
            target="_blank"
            rel="noreferrer"
          >
            Share on X ↗
          </a>
          <a
            className="button"
            href={url || undefined}
            download="my-wake-burial.png"
          >
            Download card
          </a>
        </div>
      </div>
      {url && <img className="share-image" src={url} alt={text} />}
    </section>
  );
}
