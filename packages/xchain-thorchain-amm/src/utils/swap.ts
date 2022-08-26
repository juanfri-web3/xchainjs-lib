import { Address } from '@xchainjs/xchain-client'
import { AssetAtom } from '@xchainjs/xchain-cosmos/lib'
import { strip0x } from '@xchainjs/xchain-ethereum'
import { AssetLUNA } from '@xchainjs/xchain-terra/lib'
import {
  Asset,
  AssetAVAX,
  AssetBCH,
  AssetBNB,
  AssetBTC,
  AssetDOGE,
  AssetETH,
  AssetLTC,
  AssetRuneNative,
  AvalancheChain,
  BCHChain,
  BNBChain,
  BTCChain,
  // BaseAmount,
  Chain,
  CosmosChain,
  DOGEChain,
  ETHChain,
  LTCChain,
  THORChain,
  TerraChain,
  baseAmount,
} from '@xchainjs/xchain-util'
import { BigNumber } from 'bignumber.js'

import { CryptoAmount } from '../crypto-amount'
import { LiquidityPool } from '../liquidity-pool'
import { ThorchainCache } from '../thorchain-cache'
import { SwapOutput } from '../types'

/**
 *
 * @param inputAmount - amount to swap
 * @param pool - Pool Data, RUNE and ASSET Depths
 * @param toRune - Direction of Swap. True if swapping to RUNE.
 * @returns
 */
export const getSwapFee = (inputAmount: CryptoAmount, pool: LiquidityPool, toRune: boolean): CryptoAmount => {
  // formula: (x * x * Y) / (x + X) ^ 2
  const x = inputAmount.baseAmount.amount()
  const X = toRune ? pool.assetBalance.amount() : pool.runeBalance.amount() // input is asset if toRune
  const Y = toRune ? pool.runeBalance.amount() : pool.assetBalance.amount() // output is rune if toRune
  const units = toRune ? AssetRuneNative : inputAmount.asset
  const numerator = x.times(x).multipliedBy(Y)
  const denominator = x.plus(X).pow(2)
  const result = numerator.div(denominator)
  return new CryptoAmount(baseAmount(result), units)
}

/**
 * Works out the swap slip for a given swap.
 *
 * @param inputAmount - amount to swap
 * @param pool - Pool Data, RUNE and ASSET Depths
 * @param toRune - Direction of Swap. True if swapping to RUNE.
 * @returns The amount of slip. Needs to * 100 to get percentage.
 */
export const getSwapSlip = (inputAmount: CryptoAmount, pool: LiquidityPool, toRune: boolean): BigNumber => {
  // formula: (x) / (x + X)
  const x = inputAmount.baseAmount.amount()
  const X = toRune ? pool.assetBalance.amount() : pool.runeBalance.amount() // input is asset if toRune
  const result = x.div(x.plus(X))
  return new BigNumber(result)
}

/**
 *
 * @param inputAmount - amount to swap
 * @param pool - Pool Data, RUNE and ASSET Depths
 * @param toRune - Direction of Swap. True if swapping to RUNE.
 * @returns The output amount
 */
export const getSwapOutput = (inputAmount: CryptoAmount, pool: LiquidityPool, toRune: boolean): CryptoAmount => {
  // formula: (x * X * Y) / (x + X) ^ 2
  const x = inputAmount.baseAmount.amount()
  const X = toRune ? pool.assetBalance.amount() : pool.runeBalance.amount() // input is asset if toRune
  const Y = toRune ? pool.runeBalance.amount() : pool.assetBalance.amount() // output is rune if toRune
  const units = toRune ? AssetRuneNative : inputAmount.asset
  const numerator = x.times(X).times(Y)
  const denominator = x.plus(X).pow(2)
  const result = numerator.div(denominator)
  return new CryptoAmount(baseAmount(result), units)
}

export const getDoubleSwapOutput = (
  inputAmount: CryptoAmount,
  pool1: LiquidityPool,
  pool2: LiquidityPool,
): CryptoAmount => {
  // formula: getSwapOutput(pool1) => getSwapOutput(pool2)
  const r = getSwapOutput(inputAmount, pool1, true)
  const output = getSwapOutput(r, pool2, false)
  return output
}

/**
 *
 * @param inputAmount - amount to swap
 * @param pool - Pool Data, RUNE and ASSET Depths
 * @returns swap output object - output - fee - slip
 */
export const getSingleSwap = (inputAmount: CryptoAmount, pool: LiquidityPool, toRune: boolean): SwapOutput => {
  const output = getSwapOutput(inputAmount, pool, toRune)
  const fee = getSwapFee(inputAmount, pool, toRune)
  const slip = getSwapSlip(inputAmount, pool, toRune)
  const swapOutput = {
    output: output,
    swapFee: fee,
    slip: slip,
  }
  return swapOutput
}
export const getDoubleSwapSlip = (inputAmount: CryptoAmount, pool1: LiquidityPool, pool2: LiquidityPool): BigNumber => {
  // formula: getSwapSlip1(input1) + getSwapSlip2(getSwapOutput1 => input2)
  const swapOutput1 = getSingleSwap(inputAmount, pool1, true)
  const swapOutput2 = getSingleSwap(swapOutput1.output, pool2, false)
  const result = swapOutput2.slip.plus(swapOutput1.slip)
  return result
}
// export const getValueOfRuneInAsset = (inputRune: CryptoAmount, pool: LiquidityPool): CryptoAmount => {
//   // formula: ((r * A) / R) => A per R ($perRune)
//   const r = inputRune.baseAmount.amount()
//   const R = pool.runeBalance.amount()
//   const A = pool.assetBalance.amount()
//   const result = r.times(A).div(R)
//   // return baseAmount(result)
//   return new CryptoAmount(baseAmount(result), pool.asset)
// }

// export const getValueOfAssetInRune = (inputAsset: CryptoAmount, pool: LiquidityPool): CryptoAmount => {
//   // formula: ((a * R) / A) => R per A (Runeper$)
//   const t = inputAsset.baseAmount.amount()
//   const R = pool.runeBalance.amount()
//   const A = pool.assetBalance.amount()
//   const result = t.times(R).div(A)
//   return new CryptoAmount(baseAmount(result), AssetRuneNative)
// }
export const getDoubleSwapFee = async (
  inputAmount: CryptoAmount,
  pool1: LiquidityPool,
  pool2: LiquidityPool,
  thorchainCache: ThorchainCache,
): Promise<CryptoAmount> => {
  // formula: getSwapFee1 + getSwapFee2
  const fee1 = getSwapFee(inputAmount, pool1, true)
  const fee1InRune = await thorchainCache.convert(fee1, AssetRuneNative)
  const r = getSwapOutput(inputAmount, pool1, true)
  const fee2 = getSwapFee(r, pool2, false)
  const fee2InRune = await thorchainCache.convert(fee2, AssetRuneNative)
  const result = fee1InRune.plus(fee2InRune)
  return result
}

/**
 *
 * @param inputAmount - amount to swap
 * @param pool - Pool Data, RUNE and ASSET Depths
 * @param toRune - Direction of Swap. True if swapping to RUNE.
 * @returns swap output object - output - fee - slip
 */

export const getDoubleSwap = async (
  inputAmount: CryptoAmount,
  pool1: LiquidityPool,
  pool2: LiquidityPool,
  thorchainCache: ThorchainCache,
): Promise<SwapOutput> => {
  const doubleOutput = getDoubleSwapOutput(inputAmount, pool1, pool2)
  const doubleFee = await getDoubleSwapFee(inputAmount, pool1, pool2, thorchainCache)
  const doubleSlip = getDoubleSwapSlip(inputAmount, pool1, pool2)
  const SwapOutput = {
    output: doubleOutput,
    swapFee: doubleFee,
    slip: doubleSlip,
  }
  return SwapOutput
}
export const getContractAddressFromAsset = (asset: Asset): Address => {
  const assetAddress = asset.symbol.slice(asset.ticker.length + 1)
  return strip0x(assetAddress)
}

/**
 * Works out the required inbound or outbound fee based on the chain.
 * Call getInboundDetails to get the current gasRate
 *
 * @param sourceAsset
 * @param gasRate
 * @see https://dev.thorchain.org/thorchain-dev/thorchain-and-fees#fee-calcuation-by-chain
 * @returns
 */
export const calcNetworkFee = (asset: Asset, gasRate: BigNumber): CryptoAmount => {
  if (asset.synth) return new CryptoAmount(baseAmount(2000000), AssetRuneNative)
  switch (asset.chain) {
    case Chain.Bitcoin:
      return new CryptoAmount(baseAmount(gasRate.multipliedBy(1000)), AssetBTC)
      break
    case Chain.BitcoinCash:
      return new CryptoAmount(baseAmount(gasRate.multipliedBy(1500)), AssetBCH)
      break
    case Chain.Litecoin:
      return new CryptoAmount(baseAmount(gasRate.multipliedBy(250)), AssetLTC)
      break
    case Chain.Doge:
      // NOTE: UTXO chains estimate fees with a 250 byte size
      return new CryptoAmount(baseAmount(gasRate.multipliedBy(1000)), AssetDOGE)
      break
    case Chain.Binance:
      //flat fee
      return new CryptoAmount(baseAmount(gasRate), AssetBNB)
      break
    case Chain.Avalanche:
      const gasRateinAVAXGwei = gasRate
      const feeInAVAXGwei = gasRateinAVAXGwei.multipliedBy(80000)
      const feeInAVAXWei = baseAmount(feeInAVAXGwei.multipliedBy(10 ** 9), 18)
      return new CryptoAmount(feeInAVAXWei, AssetAVAX)
    case Chain.Ethereum:
      const gasRateinETHGwei = gasRate
      const feeInETHGwei = gasRateinETHGwei.multipliedBy(80000)
      const feeInETHWei = baseAmount(feeInETHGwei.multipliedBy(10 ** 9), 18)
      return new CryptoAmount(feeInETHWei, AssetETH)
      // if (eqAsset(asset, AssetETH)) {
      //   return new CryptoAmount(feeInWei, AssetETH)
      // } else {
      //   return new CryptoAmount(feeInWei, AssetETH)
      // }
      break
    case Chain.Terra:
      return new CryptoAmount(baseAmount(gasRate), AssetLUNA)
      break
    case Chain.Cosmos:
      return new CryptoAmount(baseAmount(gasRate), AssetAtom)
      break
    case Chain.THORChain:
      return new CryptoAmount(baseAmount(2000000), AssetRuneNative)
      break
  }
  throw new Error(`could not calculate inbound fee for ${asset.chain}`)
}

/**
 * Return the chain for a given Asset This method should live somewhere else.
 * @param chain
 * @returns the gas asset type for the given chain
 */
export const getChainAsset = (chain: Chain): Asset => {
  switch (chain) {
    case BNBChain:
      return AssetBNB
    case BTCChain:
      return AssetBTC
    case ETHChain:
      return AssetETH
    case THORChain:
      return AssetRuneNative
    case CosmosChain:
      return AssetAtom
    case BCHChain:
      return AssetBCH
    case LTCChain:
      return AssetLTC
    case DOGEChain:
      return AssetDOGE
    case TerraChain:
      return AssetLUNA
    case AvalancheChain:
      return AssetAVAX
    default:
      throw Error('Unknown chain')
  }
}
