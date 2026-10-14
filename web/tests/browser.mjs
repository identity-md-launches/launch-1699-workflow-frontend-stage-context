import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import {
  createFixture,
  installFixture,
  deployment,
  TOKEN1,
  OWNER,
  g,
  w,
} from "./fixture.mjs";
const root = resolve(import.meta.dirname, "../..");
const report = [];
const evidence = resolve(root, "docs/frontend/evidence");
await mkdir(evidence, { recursive: true });
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const relative =
      decodeURIComponent(pathname.replace(/^\/ipfs\/wake\//, "")) ||
      "index.html";
    const path = resolve(root, "dist", relative);
    if (!path.startsWith(resolve(root, "dist") + "/")) throw Error();
    const bytes = await readFile(path);
    res.setHeader(
      "Content-Type",
      types[extname(path)] ?? "application/octet-stream",
    );
    res.end(bytes);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/ipfs/wake/`;
const browser = await chromium.launch({ headless: true });
const wait = async (page, text) =>
  page
    .getByText(text, { exact: false })
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 15000 });
const enabled = async (locator) => {
  await locator.waitFor();
  await locator
    .page()
    .waitForFunction((el) => !el.disabled, await locator.elementHandle(), {
      timeout: 15000,
    });
};
const check = async (name, fn) => {
  try {
    await fn();
    report.push({ name, passed: true });
    console.log("PASS " + name);
  } catch (e) {
    report.push({ name, passed: false, error: e.message });
    const pages = browser.contexts().flatMap((c) => c.pages());
    for (const [i, p] of pages.entries()) {
      await writeFile(
        "/tmp/wake-failure-" + i + ".txt",
        await p.locator("body").innerText(),
      );
      await p.screenshot({ path: "/tmp/wake-failure-" + i + ".png" });
    }
    throw e;
  }
};
async function setup(options = {}, browserType = browser) {
  const context = await browserType.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const state = createFixture(options);
  await installFixture(page, state);
  await page.goto(url);
  await wait(page, "Ethereum · live state");
  return { page, state };
}
async function connect(page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Test Wallet", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await enabled(page.getByRole("button", { name: /^Bury all/ }));
}
async function expectNoOverflow(page) {
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
    false,
  );
}
try {
  await check(
    "Mobile first screen, static gateway subpath, metadata, no resource/console failures",
    async () => {
      const { page } = await setup();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const control = await page
        .getByRole("button", { name: "Find my tokens" })
        .boundingBox();
      assert(control.y + control.height < 844);
      assert(await page.title());
      assert(
        await page.locator('meta[property="og:image"]').getAttribute("content"),
      );
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expectNoOverflow(page);
        await page.screenshot({
          path: resolve(evidence, `mock-disconnected-${width}.png`),
          fullPage: width === 1440,
        });
      }
      const axe = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(
        axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.length })),
        [],
      );
      assert.deepEqual(errors, []);
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("button", { name: "Browser wallet", exact: true })
          .count(),
        0,
      );
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert(
        await page
          .getByRole("button", { name: "Connect wallet", exact: true })
          .evaluate((el) => el === document.activeElement),
      );
      await page.close();
    },
  );
  await check(
    "Wallet rejection recovers, EIP-6963 connects, 4902 adds exact network then switches",
    async () => {
      const { page, state } = await setup({ wrongChain: true });
      state.rejectNext = true;
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Test Wallet", exact: true })
        .click();
      await wait(page, "Request declined");
      await page
        .getByRole("button", { name: "Test Wallet", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await enabled(page.getByRole("button", { name: "Bury all 2" }));
      assert.deepEqual(state.addChain, deployment.walletAddChain);
      state.chainId = "0xa";
      await page.evaluate(() => window.__fixtureEmit("chainChanged", "0xa"));
      await wait(page, "Switch to Ethereum");
      assert(
        await page.getByRole("button", { name: "Bury all 2" }).isDisabled(),
      );
      await page
        .getByRole("button", { name: "Switch to Ethereum", exact: true })
        .click();
      await enabled(page.getByRole("button", { name: "Bury all 2" }));
      await page.close();
    },
  );
  await check(
    "Full-balance approvals, rejected signing, batch burial, receipt rewards, share download, epitaph and flowers",
    async () => {
      const { page, state } = await setup();
      await connect(page);
      assert.equal(state.tokens[0].decimals, 6);
      await page.getByRole("button", { name: "Bury all 2" }).click();
      await wait(page, "123.45 MOON");
      const dialog = page.getByRole("dialog");
      assert(
        await dialog
          .getByRole("button", { name: "Approve MOON", exact: true })
          .isDisabled(),
      );
      await dialog
        .getByLabel(
          "I understand these full token balances cannot be recovered.",
        )
        .check();
      state.rejectNext = true;
      await dialog
        .getByRole("button", { name: "Approve MOON", exact: true })
        .click();
      await wait(page, "Request declined");
      await enabled(
        dialog.getByRole("button", { name: "Approve MOON", exact: true }),
      );
      await dialog
        .getByRole("button", { name: "Approve MOON", exact: true })
        .click();
      await enabled(
        dialog.getByRole("button", { name: "Approve LIGHT", exact: true }),
      );
      assert.equal(state.writes[0].args[1], 123450000n);
      assert.equal(state.writes[0].args[0].toLowerCase(), g);
      await dialog
        .getByRole("button", { name: "Approve LIGHT", exact: true })
        .click();
      await enabled(
        dialog.getByRole("button", { name: "Bury all 2 tokens", exact: true }),
      );
      await page.screenshot({
        path: resolve(evidence, "mock-burial-review-390.png"),
      });
      await dialog
        .getByRole("button", { name: "Bury all 2 tokens", exact: true })
        .click();
      await wait(page, "Laid to rest");
      assert.equal(state.writes.at(-1).functionName, "buryMany");
      assert.equal(state.burials, 2n);
      assert.equal(state.paid, 999750000000000000000n);
      await page.getByRole("button", { name: "See your share card" }).click();
      await wait(page, "I buried 2 dead tokens and woke up with 999.75 WAKE");
      const dl = page.waitForEvent("download");
      await page.getByRole("link", { name: "Download card" }).click();
      assert.equal((await dl).suggestedFilename(), "my-wake-burial.png");
      await page.getByRole("button", { name: /MOON.*Moon Rabbit/ }).click();
      await wait(page, "Write an epitaph");
      await page.getByLabel("Final words").fill("🌸".repeat(17));
      assert(
        await page
          .getByRole("button", { name: "Write permanent epitaph" })
          .isDisabled(),
      );
      await page
        .getByLabel("Final words")
        .fill("We held on until the moon went quiet.");
      await page
        .getByRole("button", { name: "Write permanent epitaph" })
        .click();
      await page.getByLabel("Final words").waitFor({ state: "hidden" });
      assert.equal(state.tokens[0].epitaphWritten, true);
      assert.equal(await page.getByLabel("Final words").count(), 0);
      await page.getByLabel("WAKE amount", { exact: true }).fill("3");
      await page.getByLabel("I understand this WAKE will be burned.").check();
      await page
        .getByRole("button", { name: "Approve WAKE for flowers", exact: true })
        .click();
      await enabled(
        page.getByRole("button", { name: "Lay flowers", exact: true }),
      );
      await page
        .getByRole("button", { name: "Lay flowers", exact: true })
        .click();
      await page
        .locator(".tx-status.success strong")
        .filter({ hasText: "Lay flowers", visible: true })
        .first()
        .waitFor();
      assert.equal(state.flowers, 3n * 10n ** 18n);
      await page.screenshot({
        path: resolve(evidence, "mock-tombstone-390.png"),
      });
      await page.getByRole("button", { name: "Close dialog" }).click();
      await page.close();
    },
  );
  await check(
    "Buy and sell quote uses attested hook, exact Permit2 approvals, simulation failure blocks sending, router calldata",
    async () => {
      const { page, state } = await setup();
      await connect(page);
      await page.getByLabel("You pay in IMD").fill("2");
      await page
        .getByRole("button", { name: "Get quote", exact: true })
        .click();
      await wait(page, "Expected output");
      assert.equal(
        state.lastQuote.poolKey.hooks.toLowerCase(),
        deployment.poolKey.hooks,
      );
      assert.equal(state.lastQuote.zeroForOne, false);
      await page
        .getByRole("button", { name: "Approve IMD to Permit2", exact: true })
        .click();
      await enabled(
        page.getByRole("button", {
          name: "Approve router allowance",
          exact: true,
        }),
      );
      assert.equal(
        state.writes.at(-1).args[0].toLowerCase(),
        deployment.network.uniswapV4.permit2,
      );
      assert.equal(state.writes.at(-1).args[1], 2n * 10n ** 18n);
      await page
        .getByRole("button", { name: "Approve router allowance", exact: true })
        .click();
      await enabled(
        page.getByRole("button", { name: "Confirm buy WAKE", exact: true }),
      );
      assert.equal(
        state.writes.at(-1).to.toLowerCase(),
        deployment.network.uniswapV4.permit2,
      );
      assert.equal(
        state.writes.at(-1).args[1].toLowerCase(),
        deployment.network.uniswapV4.universalRouter,
      );
      state.revertNext = true;
      const writes = state.writes.length;
      await page
        .getByRole("button", { name: "Confirm buy WAKE", exact: true })
        .click();
      await wait(page, "simulation failed");
      assert.equal(state.writes.length, writes);
      await enabled(
        page.getByRole("button", { name: "Confirm buy WAKE", exact: true }),
      );
      await page
        .getByRole("button", { name: "Confirm buy WAKE", exact: true })
        .click();
      await page
        .locator(".tx-status.success strong")
        .filter({ hasText: "Buy WAKE", visible: true })
        .first()
        .waitFor();
      assert.equal(state.writes.at(-1).functionName, "execute");
      assert.equal(
        state.writes.at(-1).to.toLowerCase(),
        deployment.network.uniswapV4.universalRouter,
      );
      assert.equal(state.writes.at(-1).value, "0x0");
      assert.equal(state.writes.at(-1).args[0], "0x10");
      await page
        .getByRole("button", { name: "Sell WAKE", exact: true })
        .click();
      await page.getByLabel("You pay in WAKE").fill("1");
      await page
        .getByRole("button", { name: "Get quote", exact: true })
        .click();
      await wait(page, "Expected output");
      assert.equal(state.lastQuote.zeroForOne, true);
      await page
        .getByRole("button", { name: "Approve WAKE to Permit2", exact: true })
        .click();
      await enabled(
        page.getByRole("button", {
          name: "Approve router allowance",
          exact: true,
        }),
      );
      await page
        .getByRole("button", { name: "Approve router allowance", exact: true })
        .click();
      await enabled(
        page.getByRole("button", { name: "Confirm sell WAKE", exact: true }),
      );
      await page
        .getByRole("button", { name: "Confirm sell WAKE", exact: true })
        .click();
      await page
        .locator(".tx-status.success strong")
        .filter({ hasText: "Sell WAKE", visible: true })
        .first()
        .waitFor();
      assert.equal(state.writes.at(-1).functionName, "execute");
      assert.equal(state.writes.at(-1).value, "0x0");
      await page.getByLabel("You pay in WAKE").fill("1");
      await page.getByLabel("Slippage tolerance (%)").fill("6");
      assert.equal(
        await page.getByText("Expected output", { exact: true }).count(),
        0,
      );
      await page
        .getByRole("button", { name: "Get quote", exact: true })
        .click();
      await wait(page, "Choose slippage between");
      await page.close();
    },
  );
  await check(
    "Owner-only setup uses attested WAKE, irrevocable funding and append-only consecration",
    async () => {
      const { page, state } = await setup({ owner: true, setup: false });
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Test Wallet", exact: true })
        .click();
      await wait(page, "Set WAKE token permanently");
      await enabled(
        page.getByRole("button", { name: "Set WAKE token permanently" }),
      );
      await page
        .getByRole("button", { name: "Set WAKE token permanently" })
        .click();
      await wait(page, "Fund rewards");
      assert.equal(state.writes.at(-1).args[0].toLowerCase(), w);
      await page.getByLabel("WAKE to deposit").fill("10");
      await page
        .getByLabel("I understand this deposit is irrevocable.")
        .check();
      await page
        .getByRole("button", { name: "Approve WAKE funding", exact: true })
        .click();
      await enabled(
        page.getByRole("button", { name: "Fund rewards", exact: true }),
      );
      await page
        .getByRole("button", { name: "Fund rewards", exact: true })
        .click();
      await page
        .locator(".tx-status.success strong")
        .filter({ hasText: "Fund WAKE rewards", visible: true })
        .first()
        .waitFor();
      assert.equal(state.writes.at(-1).functionName, "fund");
      await page
        .getByLabel("Token contract addresses")
        .fill(TOKEN1 + "\n" + TOKEN1);
      await page
        .getByRole("button", { name: "Consecrate permanently" })
        .click();
      await wait(page, "Remove duplicate addresses");
      await page
        .getByLabel("Token contract addresses")
        .fill("0x3000000000000000000000000000000000000003");
      await page
        .getByRole("button", { name: "Consecrate permanently" })
        .click();
      await page
        .locator(".tx-status.success strong")
        .filter({ hasText: "Consecrate tokens", visible: true })
        .first()
        .waitFor();
      assert.equal(state.writes.at(-1).functionName, "consecrate");
      await page.close();
    },
  );
  await check(
    "Phone wallet sheet has all four deep links and Coinbase Smart Wallet, no relay",
    async () => {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      });
      const state = createFixture();
      await installFixture(page, state, { inject: false });
      await page.goto(url);
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
        assert(
          await page.getByRole("link", { name: "Open in " + name }).isVisible(),
        );
      assert(
        await page
          .getByRole("button", { name: "Coinbase Smart Wallet", exact: true })
          .isVisible(),
      );
      await expectNoOverflow(page);
      await page.screenshot({
        path: resolve(evidence, "mock-wallet-sheet-390.png"),
      });
      await page.keyboard.press("Tab");
      assert(
        await page.evaluate(
          () => document.activeElement.closest("dialog") !== null,
        ),
      );
      await page.close();
    },
  );
  await check(
    "Unavailable RPC, missing contract code, and changed account block transactions; wallet RPC fallback works",
    async () => {
      const { page, state } = await setup();
      await connect(page);
      state.missingCode = true;
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await wait(page, "has no deployed code");
      assert(
        await page.getByRole("button", { name: "Bury all 2" }).isDisabled(),
      );
      state.missingCode = false;
      state.failReads = true;
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await wait(page, "Ethereum · live state");
      await page.locator(".observability summary").click();
      await wait(page, "Verified through your wallet");
      state.account = OWNER;
      await page.evaluate(
        (owner) => window.__fixtureEmit("accountsChanged", [owner]),
        OWNER,
      );
      await wait(page, "Owner settings");
      await page.close();
    },
  );
  await check(
    "Pending receipt stays locked; timeout recovery checks the same hash without resubmission",
    async () => {
      const { page, state } = await setup({ tokenCount: 1 });
      await connect(page);
      await page.clock.install();
      await page.getByRole("button", { name: "Review burial" }).click();
      await page
        .getByLabel(
          "I understand these full token balances cannot be recovered.",
        )
        .check();
      state.holdReceipts = true;
      await page
        .getByRole("button", { name: "Approve MOON", exact: true })
        .click();
      await wait(page, "Waiting for on-chain confirmation");
      assert.equal(state.writes.length, 1);
      assert(
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Approve MOON…", exact: true })
          .isDisabled(),
      );
      await page.clock.fastForward(181000);
      await wait(page, "Confirmation is not available yet");
      assert.equal(state.writes.length, 1);
      state.holdReceipts = false;
      await page
        .getByRole("button", { name: "Check confirmation", exact: true })
        .click();
      await enabled(
        page.getByRole("button", { name: "Bury 1 token", exact: true }),
      );
      assert.equal(state.writes.length, 1);
      await page.close();
    },
  );
  await check(
    "Bury all 51 tokens requires two confirmed batches of 50 and 1",
    async () => {
      const { page, state } = await setup({ tokenCount: 51 });
      for (const token of state.tokens)
        state.allowances.set(token.token.toLowerCase() + g, token.balance);
      await connect(page);
      await page
        .getByRole("button", { name: "Bury all 51", exact: true })
        .click();
      await page
        .getByLabel(
          "I understand these full token balances cannot be recovered.",
        )
        .check();
      await enabled(
        page.getByRole("button", { name: "Bury 50 tokens", exact: true }),
      );
      await page
        .getByRole("button", { name: "Bury 50 tokens", exact: true })
        .click();
      await wait(page, "50 burials already confirmed");
      assert.equal(state.writes[0].args[0].length, 50);
      await page
        .getByLabel(
          "I understand these full token balances cannot be recovered.",
        )
        .check();
      await enabled(
        page.getByRole("button", { name: "Bury all 1 token", exact: true }),
      );
      await page
        .getByRole("button", { name: "Bury all 1 token", exact: true })
        .click();
      await wait(page, "Laid to rest");
      assert.equal(state.writes[1].args[0].length, 1);
      assert.equal(state.burials, 51n);
      await page.close();
    },
  );
  await check(
    "Long balances, full addresses, open tombstone, keyboard focus, reduced motion and text enlargement reflow",
    async () => {
      const { page, state } = await setup();
      state.tokens[0].name =
        "A Token With An Exceptionally Long Name That Still Needs Its Own Resting Place";
      state.tokens[0].balance =
        999999999999999999999999999999999999999999999999n;
      await connect(page);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await expectNoOverflow(page);
      }
      await page.getByRole("button", { name: "Review burial" }).first().click();
      await page
        .getByRole("dialog")
        .getByText("Token address", { exact: true })
        .click();
      await expectNoOverflow(page);
      await page.keyboard.press("Tab");
      assert(
        await page.evaluate(
          () => document.activeElement.closest("dialog") !== null,
        ),
      );
      await page.keyboard.press("Escape");
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(
        await page.evaluate(
          () =>
            document
              .getAnimations()
              .filter(
                (a) =>
                  a.playState === "running" &&
                  a.effect?.getComputedTiming().iterations === Infinity,
              ).length,
        ),
        0,
      );
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "200%"),
      );
      await expectNoOverflow(page);
      await page.close();
    },
  );
  // This is an unmocked read-only check. No wallet is injected and no transaction is sent.
  await check(
    "Unmocked production export: live read verification and screenshot",
    async () => {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page.waitForFunction(
        () =>
          document.querySelector(".read-status") &&
          !document
            .querySelector(".read-status")
            .textContent.includes("Reading the cemetery"),
        { timeout: 45000 },
      );
      await page.screenshot({ path: resolve(evidence, "live-390.png") });
      await page.locator(".observability summary").click();
      const state = await page.locator(".observability").innerText();
      assert(state.includes("Verified through public RPC"));
      const rpcEvidence = await page.evaluate(
        async ({ rpc, contracts }) => {
          const request = async (method, params) => {
            const response = await fetch(rpc, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
            });
            const result = await response.json();
            if (result.error) throw Error(result.error.message);
            return result.result;
          };
          return {
            rpc,
            chainId: Number(BigInt(await request("eth_chainId", []))),
            contracts: await Promise.all(
              contracts.map(async (c) => ({
                name: c.name,
                address: c.address,
                codeBytes:
                  (await request("eth_getCode", [c.address, "latest"])).slice(2)
                    .length / 2,
              })),
            ),
            checkedAt: new Date().toISOString(),
          };
        },
        { rpc: deployment.network.rpcUrls[0], contracts: deployment.contracts },
      );
      assert.equal(rpcEvidence.chainId, deployment.chainId);
      assert(rpcEvidence.contracts.every((c) => c.codeBytes > 0));
      await writeFile(
        resolve(evidence, "live-rpc.json"),
        JSON.stringify(rpcEvidence, null, 2) + "\n",
      );
      await writeFile(resolve(evidence, "live-read.txt"), state + "\n");
      assert.deepEqual(errors, []);
      await page.close();
    },
  );
  try {
    const wk = await webkit.launch({ headless: true });
    try {
      await check(
        "WebKit: connect, full-balance approval and single burial",
        async () => {
          const { page, state } = await setup({ tokenCount: 1 }, wk);
          await connect(page);
          await page.getByRole("button", { name: "Review burial" }).click();
          await page
            .getByLabel(
              "I understand these full token balances cannot be recovered.",
            )
            .check();
          await page
            .getByRole("button", { name: "Approve MOON", exact: true })
            .click();
          await enabled(
            page.getByRole("button", { name: "Bury 1 token", exact: true }),
          );
          await page
            .getByRole("button", { name: "Bury 1 token", exact: true })
            .click();
          await wait(page, "Laid to rest");
          assert.equal(state.writes.at(-1).functionName, "bury");
          await expectNoOverflow(page);
          await page.screenshot({
            path: resolve(evidence, "mock-webkit-burial-390.png"),
          });
          await page.close();
        },
      );
    } finally {
      await wk.close();
    }
  } catch (e) {
    report.push({
      name: "WebKit browser availability",
      passed: false,
      limitation: e.message.split("\n").slice(0, 7).join("\n"),
    });
    console.log("WEBKIT LIMITATION " + e.message.split("\n")[0]);
  }
} finally {
  await browser.close();
  server.close();
  await writeFile(
    resolve(evidence, "browser-results.json"),
    JSON.stringify(
      { timestamp: new Date().toISOString(), tests: report },
      null,
      2,
    ) + "\n",
  );
}
