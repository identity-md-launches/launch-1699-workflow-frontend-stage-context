import {
  encodeAbiParameters,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import type { PoolKey } from "./config";
import { same } from "./utils";
export const quoterAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)",
]);
export const routerAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);
export const permitAbi = parseAbi([
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
export function buildSwap(
  poolKey: PoolKey,
  input: Address,
  amountIn: bigint,
  minOut: bigint,
  extended = false,
): { commands: Hex; inputs: Hex[]; value: bigint } {
  if (!same(input, poolKey.currency0) && !same(input, poolKey.currency1))
    throw Error("Input currency is outside the attested pool.");
  if (amountIn <= 0n || amountIn > (1n << 128n) - 1n)
    throw Error("Swap amount exceeds the router limit.");
  const zeroForOne = same(input, poolKey.currency0);
  const output = zeroForOne ? poolKey.currency1 : poolKey.currency0;
  const schema = extended
    ? "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)"
    : "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)";
  const values = {
    poolKey,
    zeroForOne,
    amountIn,
    amountOutMinimum: minOut,
    ...(extended ? { minHopPriceX36: 0n } : {}),
    hookData: "0x",
  };
  const swap = encodeAbiParameters(parseAbiParameters(schema), [
    values,
  ] as never);
  const settle = encodeAbiParameters(
    parseAbiParameters("address currency,uint256 amount"),
    [input, amountIn],
  );
  const take = encodeAbiParameters(
    parseAbiParameters("address currency,uint256 minimum"),
    [output, minOut],
  );
  return {
    commands: "0x10",
    inputs: [
      encodeAbiParameters(parseAbiParameters("bytes actions,bytes[] params"), [
        "0x060c0f",
        [swap, settle, take],
      ]),
    ],
    value: same(input, zeroAddress) ? amountIn : 0n,
  };
}
export function minimumOutput(quote: bigint, slippage: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(slippage))
    throw Error("Use up to two decimal places for slippage.");
  const bps = Math.round(Number(slippage) * 100);
  if (bps < 1 || bps > 500)
    throw Error("Choose slippage between 0.01% and 5%.");
  const min = (quote * BigInt(10000 - bps)) / 10000n;
  if (min <= 0n)
    throw Error("The quoted output is too small. Try a larger amount.");
  return min;
}
