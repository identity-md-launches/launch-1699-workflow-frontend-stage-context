import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { keccak256, toBytes } from "viem";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = async (p) => JSON.parse(await readFile(resolve(root, p), "utf8"));
const handoff = await read("web/deployment/handoff.json");
const network = await read("web/deployment/network.json");
const canonical = (v) => JSON.stringify(sort(v));
function sort(v) {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
}
const check = process.argv.includes("--check");
for (const path of [".imd/reads/deployment.json", ".imd/reads/network.json"]) {
  try {
    const pinned = await read(path);
    if (
      canonical(pinned) !==
      canonical(path.includes("deployment") ? handoff : network)
    )
      throw Error(`Pinned input mismatch: ${path}`);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
const contracts = [];
for (const contract of handoff.contracts) {
  const sourcePath = `docs/abi/${contract.name}.json`;
  const pinned = execFileSync(
    "git",
    ["show", `${handoff.sourceCommit}:${sourcePath}`],
    { cwd: root },
  );
  const local = await readFile(resolve(root, sourcePath));
  if (!local.equals(pinned))
    throw Error(`ABI differs from pinned source: ${sourcePath}`);
  const abi = JSON.parse(pinned);
  if (!Array.isArray(abi)) throw Error("ABI must be an array");
  const abiHash = keccak256(toBytes(canonical(abi))).slice(2);
  if (abiHash !== contract.abiHash)
    throw Error(`ABI hash mismatch: ${contract.name}: ${abiHash}`);
  const abiPath = `abi/${contract.name}.json`;
  if (!check) {
    await mkdir(resolve(root, "dist/abi"), { recursive: true });
    await writeFile(resolve(root, "dist", abiPath), pinned);
  } else if (!(await readFile(resolve(root, "dist", abiPath))).equals(pinned))
    throw Error(`Export ABI differs: ${abiPath}`);
  contracts.push({
    name: contract.name,
    address: contract.address,
    abiHash,
    abiPath,
  });
}
async function files(dir, prefix = "") {
  const list = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    if (entry.isSymbolicLink()) throw Error("Symlinks are not export assets");
    const path = prefix + entry.name;
    if (entry.isDirectory())
      list.push(...(await files(resolve(dir, entry.name), path + "/")));
    else if (path !== "imd-deployment.json") list.push(path);
  }
  return list;
}
const paths = (await files(resolve(root, "dist"))).sort();
if (paths.length > 128 || !paths.includes("index.html"))
  throw Error("Invalid export inventory");
let bytes = 0;
const assets = [];
for (const path of paths) {
  if (path.includes("..") || path.startsWith("/") || path.includes("://"))
    throw Error("Unsafe path");
  const data = await readFile(resolve(root, "dist", path));
  bytes += data.length;
  if (data.length > 8388608) throw Error("Asset exceeds 8 MiB");
  assets.push({
    path,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
}
if (bytes > 8 * 1024 * 1024)
  throw Error("Export leaves insufficient submission budget");
const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  assets,
  ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
  network: network.network,
  ...(network.walletAddChain ? { walletAddChain: network.walletAddChain } : {}),
};
if (manifest.chainId !== manifest.network.chainId)
  throw Error("Network mismatch");
if (check) {
  if (canonical(await read("dist/imd-deployment.json")) !== canonical(manifest))
    throw Error(
      "Manifest differs from the exact handoff or final asset hashes",
    );
} else
  await writeFile(
    resolve(root, "dist/imd-deployment.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
console.log(
  `${check ? "Verified" : "Emitted"} deployment manifest: ${contracts.length} canonical Keccak ABI bindings, ${assets.length} SHA-256 assets, ${bytes} bytes.`,
);
