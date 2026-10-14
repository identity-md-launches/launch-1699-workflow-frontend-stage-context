import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import type { Runtime } from "./config";
import { useChainData, useTransactions, type Token } from "./chain";
import { amount, same } from "./utils";
import { AddressLink, Icon, Scene, TxStatus } from "./ui";
import { Wallet } from "./Wallet";
import { Burial, ShareCard, type BurialResult } from "./Burial";
import { Tomb } from "./Tomb";
import { Owner } from "./Owner";
import { Swap } from "./Swap";
export function App({ runtime }: { runtime: Runtime }) {
  const { address, chainId } = useAccount();
  const chain = useChainData(runtime);
  const tx = useTransactions(runtime, chain);
  const [walletOpen, setWalletOpen] = useState(false);
  const [bury, setBury] = useState<Token[]>();
  const [tomb, setTomb] = useState<Token>();
  const [share, setShare] = useState<BurialResult>();
  const [sort, setSort] = useState("newest");
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const data = chain.data;
  const ownData = same(address, data?.account);
  const eligible = ownData
    ? (data?.tokens.filter(
        (t) =>
          t.canBury &&
          t.balance !== null &&
          t.balance > 0n &&
          t.decimals !== null,
      ) ?? [])
    : [];
  const unknown = ownData
    ? (data?.tokens.filter((t) => t.readError || t.decimals === null).length ??
      0)
    : 0;
  useEffect(() => {
    setBury(undefined);
    setShare(undefined);
    setTomb(undefined);
  }, [address, chainId]);
  useEffect(() => {
    const show = () => {
      const match = location.hash.match(/^#tomb\/(0x[a-fA-F0-9]{40})$/);
      if (match) {
        const found = data?.tokens.find((t) => same(t.address, match[1]));
        if (found) setTomb(found);
      } else setTomb(undefined);
    };
    show();
    window.addEventListener("hashchange", show);
    return () => window.removeEventListener("hashchange", show);
  }, [data]);
  const stones = (data?.tokens ?? [])
    .filter(
      (t) =>
        t.mourners > 0n &&
        `${t.name} ${t.symbol} ${t.address}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      const x = sort === "newest" ? a.firstBurialTime : a.mourners;
      const y = sort === "newest" ? b.firstBurialTime : b.mourners;
      return x > y ? -1 : x < y ? 1 : 0;
    });
  const openTomb = (t: Token) => {
    setTomb(t);
    location.hash = `tomb/${t.address}`;
  };
  const closeTomb = () => {
    setTomb(undefined);
    history.replaceState(null, "", "#cemetery");
  };
  const primaryText = !address
    ? "Find my tokens"
    : chain.loading && !ownData
      ? "Finding your tokens…"
      : !data?.configured
        ? "Burials awaiting setup"
        : `Bury all${eligible.length ? " " + eligible.length : ""}`;
  return (
    <div className={paused ? "site motion-paused" : "site"}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#main" aria-label="WAKE home">
          <Icon name="candle" size={28} />
          <span>WAKE</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#cemetery">The cemetery</a>
          <a href="#trade">Trade WAKE</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <Wallet
          runtime={runtime}
          open={walletOpen}
          onOpen={() => setWalletOpen(true)}
          onClose={() => setWalletOpen(false)}
        />
      </header>
      <main id="main">
        <section className="hero" aria-labelledby="hero-heading">
          <div className="hero-copy">
            <h1 id="hero-heading">
              A funeral for every <em>dead token.</em>
            </h1>
            <p>
              A quiet resting place for your tokens.
              <br />
              Lay them to rest. Wake up with WAKE.
            </p>
            <Scene />
          </div>
          <div className="graveyard-panel" id="your-graveyard">
            <div className="panel-heading">
              <Icon name="grave" size={28} />
              <h2>Your graveyard</h2>
            </div>
            <p className="task-summary">
              {!address
                ? "Some things are ready to be laid to rest."
                : ownData && data?.configured
                  ? `You have ${eligible.length} dead token${eligible.length === 1 ? "" : "s"} to bury.`
                  : "Your wallet is connected."}
            </p>
            <div className="next-reward">
              <span>Next reward per burial</span>
              <strong>
                {data?.configured
                  ? amount(data.nextReward, data.wakeDecimals)
                  : "Not available"}
                {data?.configured && <span> WAKE</span>}
              </strong>
              <span className="small muted">
                0.05% of the remaining reward vault
              </span>
            </div>
            <button
              className="primary full"
              onClick={() => {
                if (!address) setWalletOpen(true);
                else {
                  tx.clear();
                  setBury(eligible);
                }
              }}
              disabled={
                !!address &&
                (!chain.walletReady ||
                  !data?.configured ||
                  eligible.length === 0 ||
                  !!tx.busy)
              }
            >
              {primaryText}
              <Icon name="arrow" size={20} />
            </button>
            <p className="small panel-note">
              {!address
                ? "Connect to find your eligible token balances."
                : "Burns each full balance. Review before signing."}
            </p>
            {chainId && chainId !== runtime.chain.id && (
              <p className="notice">
                Switch your wallet to {runtime.chain.name} using the wallet
                button.
              </p>
            )}
            {data && !data.configured && (
              <p className="notice">
                {data.mismatch
                  ? "The configured WAKE address does not match this deployment. Burials are disabled."
                  : "The cemetery is awaiting its owner’s WAKE setup."}
              </p>
            )}
            <div className="read-status">
              <span>
                <span
                  className={"status-dot " + (chain.verified ? "online" : "")}
                />
                {chain.loading
                  ? "Reading the cemetery…"
                  : chain.verified
                    ? `${runtime.chain.name} · live state`
                    : "Live reads unavailable"}
              </span>
              <button
                className="text-button"
                disabled={chain.loading}
                onClick={() => void chain.refresh()}
              >
                {chain.loading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>
        </section>
        {chain.error && (
          <div className="network-note" role="status">
            <Icon name="moon" />
            <div>
              <strong>Waiting for the network</strong>
              <p>
                {chain.error}{" "}
                {address
                  ? "Your wallet’s RPC is also tried on the correct chain."
                  : "Connect a wallet on Ethereum to try its RPC."}
              </p>
            </div>
          </div>
        )}
        <dl className="stats" aria-label="Cemetery totals">
          {[
            ["Tokens buried", data?.totalTokensBuried?.toLocaleString()],
            ["Mourners", data?.totalMourners?.toLocaleString()],
            [
              "WAKE paid out",
              data
                ? amount(data.totalWakePaidOut, data.wakeDecimals)
                : undefined,
            ],
            [
              "Flowers burned",
              data
                ? amount(data.totalFlowersBurned, data.wakeDecimals)
                : undefined,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value ?? "Not available"}</dd>
            </div>
          ))}
        </dl>
        <div hidden={!!bury || !!tomb}>
          <TxStatus tx={tx} runtime={runtime} />
        </div>
        {address && ownData && (
          <section className="wallet-tokens" aria-label="Your eligible tokens">
            <div className="section-heading">
              <h2>Ready for a final goodbye</h2>
              <p className="small muted">
                Your record: {data?.walletRecord[0].toString()} burials ·{" "}
                {amount(data?.walletRecord[1] ?? 0n, data?.wakeDecimals)} WAKE
                earned
              </p>
            </div>
            {eligible.length ? (
              <div className="token-grid">
                {eligible.map((t) => (
                  <article className="token-row" key={t.address}>
                    <div>
                      <h3>{t.symbol}</h3>
                      <p className="small muted">{t.name}</p>
                      <p>
                        {amount(t.balance ?? 0n, t.decimals ?? 18)} {t.symbol}
                      </p>
                      <p className="small muted">
                        Next reward:{" "}
                        {amount(data?.nextReward ?? 0n, data?.wakeDecimals)}{" "}
                        WAKE
                      </p>
                    </div>
                    <button
                      disabled={!chain.walletReady || !!tx.busy}
                      onClick={() => {
                        tx.clear();
                        setBury([t]);
                      }}
                    >
                      Review burial
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-inline">
                {data?.configured
                  ? "No eligible balances found. Only consecrated tokens with a balance and an unused burial right appear here."
                  : "Your tokens will appear when the cemetery is configured."}
              </p>
            )}
            {unknown > 0 && (
              <p className="notice">
                {unknown} token{unknown === 1 ? " has" : "s have"} unreadable
                balance or metadata. Those tokens are excluded from burial;
                refresh to try again.
              </p>
            )}
          </section>
        )}
        {share && share.count > 0 && (
          <ShareCard result={share} decimals={data?.wakeDecimals ?? 18} />
        )}
        <section className="cemetery" id="cemetery">
          <div className="section-heading">
            <div>
              <h2>The cemetery</h2>
              <p>Every token has a story. This is where it rests.</p>
            </div>
            <div className="cemetery-tools">
              <label className="search-label">
                <span className="sr-only">Find a tombstone</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a token"
                />
              </label>
              <label>
                <span className="sr-only">Sort tombstones</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="newest">Newest burials</option>
                  <option value="mourned">Most mourned</option>
                </select>
              </label>
            </div>
          </div>
          {stones.length ? (
            <div className="tomb-grid">
              {stones.map((t) => (
                <button
                  className="tombstone"
                  key={t.address}
                  onClick={() => openTomb(t)}
                >
                  <Icon name="flower" size={28} />
                  <h3>{t.symbol}</h3>
                  <span className="small muted">{t.name}</span>
                  <p className="epitaph">
                    {t.epitaphWritten
                      ? t.epitaphText || "A moment of silence."
                      : "Waiting for a final word."}
                  </p>
                  <span className="stone-foot">
                    <span>{t.mourners.toString()} mourners</span>
                    <span>
                      <Icon name="flower" size={16} />
                      {amount(t.flowers, data?.wakeDecimals)} WAKE
                    </span>
                  </span>
                  <span className="stone-link">Visit tombstone ↗</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-cemetery">
              <div className="empty-stone">
                <Icon name="grave" size={40} />
              </div>
              <div>
                <h3>
                  {query
                    ? "No matching tombstones"
                    : chain.verified
                      ? "A quiet place, waiting."
                      : "The gates are quiet."}
                </h3>
                <p>
                  {query
                    ? `No burials match “${query}”.`
                    : chain.verified
                      ? "The first burial will place a tombstone here."
                      : "Tombstones will appear when the network is reachable."}
                </p>
                {query ? (
                  <button onClick={() => setQuery("")}>Clear search</button>
                ) : (
                  <a className="text-link" href="#your-graveyard">
                    Visit your graveyard ↑
                  </a>
                )}
              </div>
            </div>
          )}
        </section>
        <Swap
          runtime={runtime}
          chain={chain}
          tx={tx}
          connect={() => setWalletOpen(true)}
        />
        <section id="how-it-works" className="how-section">
          <h2>A proper goodbye, in four steps.</h2>
          <ol className="steps">
            <li>
              <span>01</span>
              <h3>Find what’s left</h3>
              <p>
                Connect your wallet. We check every consecrated token for an
                eligible balance.
              </p>
            </li>
            <li>
              <span>02</span>
              <h3>Lay it to rest</h3>
              <p>
                Approve the full balance, then bury it. This is permanent, once
                per wallet per token.
              </p>
            </li>
            <li>
              <span>03</span>
              <h3>Wake up with WAKE</h3>
              <p>
                Receive 0.05% of the remaining vault per burial. Earlier burials
                receive more.
              </p>
            </li>
            <li>
              <span>04</span>
              <h3>Leave a little love</h3>
              <p>
                The first mourner writes the epitaph. Anyone can burn WAKE to
                leave flowers.
              </p>
            </li>
          </ol>
        </section>
        <Owner runtime={runtime} chain={chain} tx={tx} />
        <details className="observability">
          <summary>Deployment & live state</summary>
          <p>
            Contract identities and ABIs are loaded from the attested deployment
            manifest.
          </p>
          <dl className="detail-stats">
            <div>
              <dt>Connection</dt>
              <dd>
                {chain.verified
                  ? chain.viaWallet
                    ? "Verified through your wallet"
                    : "Verified through public RPC"
                  : "Verification unavailable"}
              </dd>
            </div>
            <div>
              <dt>Last read block</dt>
              <dd>{data?.block.toString() ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>
                {data
                  ? new Date(data.time).toLocaleTimeString()
                  : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Total burials</dt>
              <dd>{data?.totalBurials.toString() ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Reward vault</dt>
              <dd>
                {data
                  ? amount(data.vault, data.wakeDecimals) + " WAKE"
                  : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Consecrated tokens</dt>
              <dd>{data?.tokens.length ?? "Unavailable"}</dd>
            </div>
          </dl>
          <p className="small muted">
            State refreshes every 30 seconds while this page is visible and
            after confirmed transactions. Amounts are in token units; USD
            context is unavailable.
          </p>
          {runtime.deployment.poolKey && (
            <p className="small break">
              Pool: {runtime.deployment.poolKey.currency0} /{" "}
              {runtime.deployment.poolKey.currency1} · fee{" "}
              {runtime.deployment.poolKey.fee} · tick spacing{" "}
              {runtime.deployment.poolKey.tickSpacing} · hook{" "}
              {runtime.deployment.poolKey.hooks}
            </p>
          )}
          <a href="./imd-deployment.json" target="_blank" rel="noreferrer">
            View deployment manifest ↗
          </a>
        </details>
      </main>
      <footer>
        <div className="footer-intro">
          <a className="brand" href="#main">
            <Icon name="candle" />
            <span>WAKE</span>
          </a>
          <p>A little closure for the things we held.</p>
          <label className="check small">
            <input
              type="checkbox"
              checked={paused}
              onChange={(e) => setPaused(e.target.checked)}
            />
            Pause the fog
          </label>
        </div>
        <div className="footer-contracts">
          <AddressLink
            runtime={runtime}
            address={runtime.wake.address}
            label="WAKE on Etherscan"
          />
          <AddressLink
            runtime={runtime}
            address={runtime.graveyard.address}
            label="Graveyard on Etherscan"
          />
        </div>
        <p className="footer-note small muted">
          Built for the tokens that didn’t make it. No ETH is accepted by the
          cemetery.
        </p>
      </footer>
      {bury && (
        <Burial
          key={address}
          runtime={runtime}
          chain={chain}
          tx={tx}
          tokens={bury}
          close={() => setBury(undefined)}
          onResult={setShare}
        />
      )}
      {tomb && (
        <Tomb
          key={tomb.address + address}
          runtime={runtime}
          chain={chain}
          tx={tx}
          token={tomb}
          close={closeTomb}
          connect={() => setWalletOpen(true)}
        />
      )}
    </div>
  );
}
