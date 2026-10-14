import { useEffect, useRef, useState, type ReactNode } from "react";
import { getAddress, type Address } from "viem";
import type { Runtime } from "./config";
import type { Transactions } from "./chain";
export function Icon({
  name = "candle",
  size = 24,
}: {
  name?: "candle" | "moon" | "flower" | "arrow" | "grave";
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "candle" ? (
        <>
          <path d="M9 10h6v11H9zM6 21h12M12 10V8" />
          <path d="M12 2c-4 4-2 6 0 6s4-2 0-6Z" />
        </>
      ) : name === "moon" ? (
        <path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z" />
      ) : name === "flower" ? (
        <>
          <path d="M12 13v9M12 18c-4 0-6-2-6-4 4 0 6 2 6 4ZM12 19c0-3 3-5 6-5 0 3-3 5-6 5Z" />
          <path d="M12 4c-5-6-9 2-5 5-3 5 5 8 5 3 0 5 8 2 5-3 4-3 0-11-5-5Z" />
        </>
      ) : name === "arrow" ? (
        <path d="M5 12h14m-6-6 6 6-6 6" />
      ) : (
        <>
          <path d="M5 21V10a7 7 0 0 1 14 0v11M3 21h18M9 10h6M12 7v8" />
        </>
      )}
    </svg>
  );
}
export function Modal({
  title,
  children,
  close,
  className = "",
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const prev = document.activeElement as HTMLElement;
    dialog.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = old;
      prev?.focus();
    };
  }, []);
  return (
    <dialog
      className={"modal " + className}
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close();
        }
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function AddressLink({
  runtime,
  address,
  label,
}: {
  runtime: Runtime;
  address: Address;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="address">
      <a
        href={`${runtime.deployment.network.explorer}/address/${address}`}
        target="_blank"
        rel="noreferrer"
      >
        {label && <span>{label} ↗</span>}
        <span className="address-value">{getAddress(address)}</span>
      </a>
      <button
        className="small-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(getAddress(address));
            setCopied(true);
            setFailed(false);
          } catch {
            setFailed(true);
          }
        }}
      >
        {copied ? "Copied" : failed ? "Select address to copy" : "Copy"}
      </button>
    </div>
  );
}
export function TxStatus({
  tx,
  runtime,
  actionKey,
}: {
  tx: Transactions;
  runtime: Runtime;
  actionKey?: string;
}) {
  const s = tx.state;
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        s && (!actionKey || s.key === actionKey)
          ? `tx-status ${s.phase}`
          : "sr-only"
      }
    >
      {s && (!actionKey || s.key === actionKey) && (
        <>
          <strong>{s.label}</strong>
          <span>{s.message}</span>
          {s.phase === "uncertain" && (
            <button onClick={tx.retryConfirmation}>Check confirmation</button>
          )}
          {s.hash && (
            <a
              target="_blank"
              rel="noreferrer"
              href={`${runtime.deployment.network.explorer}/tx/${s.hash}`}
            >
              View transaction ↗
            </a>
          )}
        </>
      )}
    </div>
  );
}
export function FieldError({ error, id }: { error: string; id?: string }) {
  return error ? (
    <p id={id} className="error" role="alert">
      {error}
    </p>
  ) : null;
}
export function Scene() {
  return (
    <div className="scene" aria-hidden="true">
      <svg viewBox="0 0 640 250" fill="none">
        <path
          d="M430 25a33 33 0 1 0 37 43 33 33 0 0 1-37-43Z"
          fill="#d5dce1"
          opacity=".7"
        />
        <g stroke="#9baaba" opacity=".3">
          <path d="M96 67h6m-3-3v6M334 20h6m-3-3v6M540 93h6m-3-3v6M203 41h4m-2-2v4" />
        </g>
        <path
          d="M0 225Q170 165 320 220T640 210"
          stroke="#738397"
          opacity=".3"
        />
        <g stroke="#718499" fill="#101e2d">
          <path d="M145 220v-51a24 24 0 0 1 48 0v51ZM239 220v-70a31 31 0 0 1 62 0v70ZM367 229v-43a23 23 0 0 1 46 0v43ZM488 225v-30a18 18 0 0 1 36 0v30Z" />
        </g>
        <g stroke="#9aabb9" opacity=".6">
          <path d="M259 158h20m-10-10v28M159 176h20m-10-9v25M381 191h18m-9-8v25M497 196h18" />
        </g>
        <g stroke="#d8bd87">
          <path d="M321 225v-18h7v18M317 225h15M324 206v-4" />
          <path d="M324 191q-7 9 0 10 6-1 0-10Z" fill="#d8bd87" />
        </g>
        <path d="M0 243h640" stroke="#435263" opacity=".4" />
      </svg>
      <div className="fog" />
    </div>
  );
}
