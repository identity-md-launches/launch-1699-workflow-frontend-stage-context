import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import type { Runtime } from "./config";
import { read, type ChainData, type Token, type Transactions } from "./chain";
import { amount, byteLength, errorMessage, parseAmount, same } from "./utils";
import { AddressLink, FieldError, Icon, Modal, TxStatus } from "./ui";
export function Tomb({
  runtime,
  chain,
  tx,
  token,
  close,
  connect,
}: {
  runtime: Runtime;
  chain: ChainData;
  tx: Transactions;
  token: Token;
  close: () => void;
  connect: () => void;
}) {
  const { address } = useAccount();
  const [flowers, setFlowers] = useState("");
  const [epitaph, setEpitaph] = useState("");
  const [allowance, setAllowance] = useState<bigint>();
  const [error, setError] = useState("");
  const [ack, setAck] = useState(false);
  const fresh =
    chain.data?.tokens.find((t) => same(t.address, token.address)) ?? token;
  const loadAllowance = async () => {
    if (address)
      setAllowance(
        await read<bigint>(
          chain.client,
          runtime.wake.address,
          runtime.abis.LaunchToken,
          "allowance",
          [address, runtime.graveyard.address],
        ),
      );
  };
  useEffect(() => {
    void loadAllowance().catch((e) => setError(errorMessage(e)));
  }, [address]);
  let flowerAmount = 0n;
  try {
    flowerAmount = parseAmount(flowers, chain.data?.wakeDecimals);
  } catch {
    /* Validation on submit. */
  }
  const needsApproval = allowance === undefined || allowance < flowerAmount;
  const flower = async () => {
    setError("");
    try {
      const value = parseAmount(flowers, chain.data?.wakeDecimals);
      if (value > (chain.data?.wakeBalance ?? 0n))
        throw Error("Your WAKE balance is too low.");
      const current = await read<bigint>(
        chain.client,
        runtime.wake.address,
        runtime.abis.LaunchToken,
        "allowance",
        [address!, runtime.graveyard.address],
      );
      if (current < value !== needsApproval) {
        setAllowance(current);
        throw Error(
          "Your allowance changed. Review the updated action and try again.",
        );
      }
      if (current < value) {
        await tx.send("flowers", "Approve WAKE for flowers", {
          address: runtime.wake.address,
          abi: runtime.abis.LaunchToken,
          functionName: "approve",
          args: [runtime.graveyard.address, value],
        });
        await loadAllowance();
      } else {
        await tx.send("flowers", "Lay flowers", {
          address: runtime.graveyard.address,
          abi: runtime.abis.Graveyard,
          functionName: "layFlowers",
          args: [token.address, value],
        });
        setFlowers("");
        setAck(false);
        await loadAllowance();
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const write = async () => {
    setError("");
    try {
      if (!epitaph.trim()) throw Error("Write a final word before confirming.");
      if (byteLength(epitaph) > 64)
        throw Error("Keep the epitaph within 64 UTF-8 bytes.");
      await tx.send("epitaph", "Write epitaph", {
        address: runtime.graveyard.address,
        abi: runtime.abis.Graveyard,
        functionName: "epitaph",
        args: [token.address, epitaph],
      });
      setEpitaph("");
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal title={token.name} close={close}>
      <div className="tomb-detail">
        <Icon name="grave" size={40} />
        <p className="serif">
          {fresh.epitaphWritten
            ? fresh.epitaphText || "An epitaph left in silence."
            : "A final word, still unwritten."}
        </p>
        <dl className="detail-stats">
          <div>
            <dt>Mourners</dt>
            <dd>{fresh.mourners.toString()}</dd>
          </div>
          <div>
            <dt>Flowers</dt>
            <dd>{amount(fresh.flowers, chain.data?.wakeDecimals)} WAKE</dd>
          </div>
          <div>
            <dt>Total buried</dt>
            <dd>
              {fresh.decimals !== null
                ? formatUnits(fresh.totalBuried, fresh.decimals)
                : "Metadata unavailable"}{" "}
              {fresh.symbol}
            </dd>
          </div>
          <div>
            <dt>First burial</dt>
            <dd>
              {fresh.mourners > 0n
                ? new Date(
                    Number(fresh.firstBurialTime) * 1000,
                  ).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "Awaiting a mourner"}
            </dd>
          </div>
        </dl>
      </div>
      <AddressLink
        runtime={runtime}
        address={token.address}
        label="Token contract"
      />
      {fresh.mourners > 0n && (
        <>
          <h3>Lay flowers</h3>
          <p className="small">
            Burn WAKE on this tombstone. Flowers are permanent and earn no
            reward.
          </p>
          <label>
            WAKE amount
            <input
              inputMode="decimal"
              value={flowers}
              onChange={(e) => {
                setFlowers(e.target.value);
                setAck(false);
              }}
              placeholder="0.00"
            />
          </label>
          <p className="small muted">
            Your balance:{" "}
            {amount(chain.data?.wakeBalance ?? 0n, chain.data?.wakeDecimals)}{" "}
            WAKE
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I understand this WAKE will be burned.
          </label>
          {!address ? (
            <button
              onClick={() => {
                close();
                connect();
              }}
            >
              Connect wallet
            </button>
          ) : (
            <button
              className="primary full"
              disabled={
                !chain.walletReady ||
                !chain.data?.configured ||
                !!tx.busy ||
                !ack ||
                allowance === undefined
              }
              onClick={() => void flower()}
            >
              {tx.busy && tx.state?.key === "flowers"
                ? tx.state.label + "…"
                : needsApproval
                  ? "Approve WAKE for flowers"
                  : "Lay flowers"}
            </button>
          )}
          <TxStatus tx={tx} runtime={runtime} actionKey="flowers" />
        </>
      )}
      {same(address, fresh.firstMourner) && !fresh.epitaphWritten && (
        <>
          <h3>Write an epitaph</h3>
          <p className="small">
            You were the first mourner. Your words can be written once and
            cannot be edited.
          </p>
          <label>
            Final words
            <textarea
              value={epitaph}
              onChange={(e) => setEpitaph(e.target.value)}
              aria-describedby="epitaph-bytes"
              aria-invalid={byteLength(epitaph) > 64}
            />
          </label>
          <p className="small muted" id="epitaph-bytes">
            {byteLength(epitaph)} / 64 UTF-8 bytes
          </p>
          <button
            disabled={
              !chain.walletReady || !!tx.busy || byteLength(epitaph) > 64
            }
            onClick={() => void write()}
          >
            {tx.busy && tx.state?.key === "epitaph"
              ? "Writing epitaph…"
              : "Write permanent epitaph"}
          </button>
          <TxStatus tx={tx} runtime={runtime} actionKey="epitaph" />
        </>
      )}
      <FieldError error={error} />
    </Modal>
  );
}
