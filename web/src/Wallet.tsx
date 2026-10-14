import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { getAddress } from "viem";
import type { Runtime } from "./config";
import { errorMessage, short } from "./utils";
import { AddressLink, FieldError, Modal } from "./ui";
export const OPEN_IN = [
  {
    id: "metamask",
    name: "MetaMask",
    href: (url: string) =>
      `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    href: (url: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
  },
  {
    id: "rabby",
    name: "Rabby",
    href: (url: string) =>
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(url)}`,
  },
  {
    id: "phantom",
    name: "Phantom",
    href: (url: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}`,
  },
];
export async function switchNetwork(
  provider: {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  },
  runtime: Runtime,
) {
  const params = [{ chainId: `0x${runtime.chain.id.toString(16)}` }];
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params });
  } catch (error) {
    const e = error as {
      code?: number;
      message?: string;
      cause?: { code?: number };
      data?: { originalError?: { code?: number } };
    };
    if (
      (e.code === 4902 ||
        e.cause?.code === 4902 ||
        e.data?.originalError?.code === 4902 ||
        /unknown chain|unrecognized chain|not added/i.test(e.message ?? "")) &&
      runtime.deployment.walletAddChain
    ) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [runtime.deployment.walletAddChain],
      });
      await provider.request({ method: "wallet_switchEthereumChain", params });
    } else throw error;
  }
}
export function Wallet({
  runtime,
  open,
  onOpen,
  onClose,
}: {
  runtime: Runtime;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { address, isConnected, chainId, connector } = useAccount();
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !connectors.some((c) => c.type === "injected" && c.id !== "injected") &&
    !(window as Window & { ethereum?: unknown }).ethereum;
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter(
    (c) =>
      !(c.id === "injected" && named) && (!mobile || c.type !== "injected"),
  );
  const change = async () => {
    if (!connector) return;
    setError("");
    setSwitching(true);
    try {
      await switchNetwork(
        (await connector.getProvider()) as Parameters<typeof switchNetwork>[0],
        runtime,
      );
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      onOpen();
    } finally {
      setSwitching(false);
    }
  };
  return (
    <>
      <button
        className="wallet-button"
        onClick={() => {
          if (isConnected && chainId !== runtime.chain.id) void change();
          else onOpen();
        }}
        disabled={switching}
      >
        {switching
          ? "Switching…"
          : isConnected && chainId !== runtime.chain.id
            ? `Switch to ${runtime.chain.name}`
            : address
              ? short(getAddress(address))
              : "Connect wallet"}
      </button>
      {open && (
        <Modal
          title={address ? "Your wallet" : "Connect a wallet"}
          close={onClose}
          className="wallet-sheet"
        >
          {address ? (
            <>
              <AddressLink runtime={runtime} address={address} />
              <p>
                {chainId === runtime.chain.id
                  ? `Connected to ${runtime.chain.name}`
                  : `Switch to ${runtime.chain.name} to continue.`}
              </p>
              {chainId !== runtime.chain.id && (
                <button onClick={() => void change()} disabled={switching}>
                  Switch to {runtime.chain.name}
                </button>
              )}
              <button
                onClick={() => {
                  disconnect();
                  onClose();
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <p className="muted">Choose a wallet to visit your graveyard.</p>
              {mobile &&
                OPEN_IN.map((w) => (
                  <a
                    className="wallet-row"
                    href={w.href(location.href)}
                    key={w.id}
                  >
                    <img
                      src={`./wallets/${w.id}.svg`}
                      width="28"
                      height="28"
                      alt=""
                    />
                    Open in {w.name}
                  </a>
                ))}
              {listed.map((c) => (
                <button
                  className="wallet-row"
                  key={c.uid}
                  disabled={isPending}
                  onClick={async () => {
                    setError("");
                    try {
                      await connectAsync({ connector: c });
                      const provider = (await c.getProvider()) as Parameters<
                        typeof switchNetwork
                      >[0];
                      await switchNetwork(provider, runtime);
                      onClose();
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }}
                >
                  <img
                    width="28"
                    height="28"
                    alt=""
                    src={
                      c.icon ??
                      (c.id === "coinbaseWalletSDK"
                        ? "./wallets/coinbase.svg"
                        : "./wallets/browser.svg")
                    }
                  />
                  {c.id === "injected"
                    ? "Browser wallet"
                    : c.id === "coinbaseWalletSDK"
                      ? mobile
                        ? "Coinbase Smart Wallet"
                        : "Coinbase Wallet"
                      : c.name}
                  {isPending && variables?.connector === c ? " · opening…" : ""}
                </button>
              ))}
              {!named && !mobile && (
                <p className="small muted">
                  No browser wallet detected? Use Coinbase Wallet, or open this
                  page in your wallet’s browser.
                </p>
              )}
            </>
          )}
          <FieldError error={error} />
        </Modal>
      )}
    </>
  );
}
