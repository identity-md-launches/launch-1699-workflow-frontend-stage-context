import {
  BaseError,
  ContractFunctionRevertedError,
  formatUnits,
  getAddress,
  parseUnits,
  type Address,
} from "viem";
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const same = (a?: string, b?: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const checkedAddress = (a: string) => getAddress(a.trim());
export function amount(value: bigint, decimals = 18, precision = 4) {
  const [whole, fraction] = formatUnits(value, decimals).split(".");
  const digits = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!fraction) return digits;
  const tail = fraction.slice(0, precision).replace(/0+$/, "");
  if (!tail && whole === "0" && value > 0n)
    return `<0.${"0".repeat(precision - 1)}1`;
  return digits + (tail ? "." + tail : "");
}
export function parseAmount(text: string, decimals = 18) {
  if (
    !/^\d+(\.\d+)?$/.test(text.trim()) ||
    (text.split(".")[1]?.length ?? 0) > decimals
  )
    throw Error(
      `Enter a positive amount with at most ${decimals} decimal places.`,
    );
  const value = parseUnits(text.trim(), decimals);
  if (value <= 0n) throw Error("Enter an amount greater than zero.");
  return value;
}
export function rewards(vault: bigint, count: number) {
  let total = 0n;
  const each: bigint[] = [];
  for (let i = 0; i < count; i++) {
    const reward = vault / 2000n;
    vault -= reward;
    total += reward;
    each.push(reward);
  }
  return { total, each };
}
export function batches<T>(items: T[], size = 50): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}
export const byteLength = (text: string) =>
  new TextEncoder().encode(text).length;
const messages: Record<string, string> = {
  Unauthorized: "Only the cemetery owner can do this.",
  WakeNotConfigured: "WAKE rewards have not been configured yet.",
  WakeAlreadyConfigured: "The WAKE token is already locked in.",
  InvalidAddress: "Enter a valid token contract address.",
  InvalidToken: "This address is not an eligible token contract.",
  WakeCannotBeBuried: "WAKE cannot be consecrated or buried.",
  AlreadyConsecrated: "A token in this list is already consecrated.",
  NotConsecrated: "This token has not been consecrated.",
  AlreadyBuried: "This wallet has already buried this token.",
  EmptyBalance: "There is no token balance left to bury.",
  InvalidBatchSize: "Choose between 1 and 50 tokens per batch.",
  NoTombstone:
    "This token needs its first burial before it can receive flowers.",
  NotFirstMourner: "Only the first mourner can write this epitaph.",
  EpitaphAlreadyWritten: "This epitaph has already been written.",
  EpitaphTooLong: "Keep the epitaph within 64 UTF-8 bytes.",
  ZeroAmount: "Enter an amount greater than zero.",
  InexactTransfer:
    "This token changes the transferred amount. The burial cannot proceed.",
  ERC20InsufficientAllowance:
    "Refresh the allowance and approve the current amount.",
  ERC20InsufficientBalance:
    "Your balance is too low. Refresh and try a smaller amount.",
};
export function errorMessage(error: unknown): string {
  if (error instanceof BaseError) {
    const reverted = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError;
    if (
      reverted instanceof ContractFunctionRevertedError &&
      reverted.data?.errorName
    )
      return (
        messages[reverted.data.errorName] ??
        `The contract rejected this action (${reverted.data.errorName}). Refresh and try again.`
      );
  }
  const text = error instanceof Error ? error.message : String(error);
  const reason = text.match(/execution reverted(?::\s*([^\n]+))?/i);
  if (reason)
    return `The transaction would fail${reason[1] ? ": " + reason[1].slice(0, 180) : ". Refresh the state before retrying."}`;
  if (/reject|denied|4001/i.test(text))
    return "Request declined in your wallet. You can try again.";
  if (/insufficient funds/i.test(text))
    return "You need more ETH to pay the network fee.";
  if (/fetch|HTTP|timeout|network request|403|429/i.test(text))
    return "The network could not be reached. Retry, or check your wallet’s connection.";
  return (
    text.split("\n")[0].slice(0, 250) ||
    "The action failed. Refresh and try again."
  );
}
export type TokenMeta = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number | null;
};
