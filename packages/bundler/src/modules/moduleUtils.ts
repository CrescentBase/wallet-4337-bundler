// misc utilities for the various modules.

import { BigNumber, BytesLike, ContractFactory } from 'ethers'
import { hexlify, hexZeroPad, Result } from 'ethers/lib/utils'
import { SlotMap, StorageMap } from './Types'
import { Provider } from '@ethersproject/providers'
import {JsonRpcProvider} from "@ethersproject/providers";
import { BigNumber as BignumberJs } from 'bignumber.js';
import fetch from "node-fetch";

// extract address from initCode or paymasterAndData
export function getAddr (data?: BytesLike): string | undefined {
  if (data == null) {
    return undefined
  }
  const str = hexlify(data)
  if (str.length >= 42) {
    return str.slice(0, 42)
  }
  return undefined
}

/**
 * merge all validationStorageMap objects into merged map
 * - entry with "root" (string) is always preferred over entry with slot-map
 * - merge slot entries
 * NOTE: slot values are supposed to be the value before the transaction started.
 *  so same address/slot in different validations should carry the same value
 * @param mergedStorageMap
 * @param validationStorageMap
 */
export function mergeStorageMap (mergedStorageMap: StorageMap, validationStorageMap: StorageMap): StorageMap {
  Object.entries(validationStorageMap).forEach(([addr, validationEntry]) => {
    if (typeof validationEntry === 'string') {
      // it's a root. override specific slots, if any
      mergedStorageMap[addr] = validationEntry
    } else if (typeof mergedStorageMap[addr] === 'string') {
      // merged address already contains a root. ignore specific slot values
    } else {
      let slots: SlotMap
      if (mergedStorageMap[addr] == null) {
        slots = mergedStorageMap[addr] = {}
      } else {
        slots = mergedStorageMap[addr] as SlotMap
      }

      Object.entries(validationEntry).forEach(([slot, val]) => {
        slots[slot] = val
      })
    }
  })
  return mergedStorageMap
}

export function toBytes32 (b: BytesLike | number): string {
  return hexZeroPad(hexlify(b).toLowerCase(), 32)
}

/**
 * run the constructor of the given type as a script: it is expected to revert with the script's return values.
 * @param provider provider to use fo rthe call
 * @param c - contract factory of the script class
 * @param ctrParams constructor parameters
 * @return an array of arguments of the error
 * example usasge:
 *     hashes = await runContractScript(provider, new GetUserOpHashes__factory(), [entryPoint.address, userOps]).then(ret => ret.userOpHashes)
 */
export async function runContractScript<T extends ContractFactory> (provider: Provider, c: T, ctrParams: Parameters<T['getDeployTransaction']>): Promise<Result> {
  const tx = c.getDeployTransaction(...ctrParams)
  const ret = await provider.call(tx)
  const parsed = ContractFactory.getInterface(c.interface).parseError(ret)
  if (parsed == null) throw new Error('unable to parse script (error) response: ' + ret)
  return parsed.args
}

export async function fetchPolygonSuggestedGasFees() {
  const timeout = 14000;

  const EIP1559APIEndpoint = 'https://gasstation-mainnet.matic.network/v2';
  const fetchPromise = fetch(EIP1559APIEndpoint).then((r: any) => r.json());

  return Promise.race([
    fetchPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
  ]);
}

export async function fetchSuggestedGasFees(chainId: string | number) {
  const timeout = 14000;

  if (typeof chainId === 'string') {
    chainId = Number(chainId);
  }
  const EIP1559APIEndpoint = `https://gas-api.metaswap.codefi.network/networks/${chainId}/suggestedGasFees`;
  const fetchPromise = fetch(EIP1559APIEndpoint).then((r: any) => r.json());

  return Promise.race([
    fetchPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
  ]);
}

export function convert2BigNumber(strGwei: string) {
  const base = Math.pow(10, 9);
  return BigNumber.from(new BignumberJs(strGwei).multipliedBy(base).toFixed(0))
}

export async function getFeeData(provider: JsonRpcProvider) {
  const chainId = provider._network.chainId;
  let maxPriorityFeePerGas, maxFeePerGas;
  if (chainId == 137) {
    const fee: any = await fetchPolygonSuggestedGasFees();
    maxPriorityFeePerGas = convert2BigNumber(fee.standard.maxPriorityFee)
    maxFeePerGas = convert2BigNumber(fee.standard.maxFee)
  } else if (chainId == 1 || chainId == 42161) {
    const fee: any = await fetchSuggestedGasFees(chainId);
    maxPriorityFeePerGas = convert2BigNumber(fee.medium.suggestedMaxPriorityFeePerGas)
    maxFeePerGas = convert2BigNumber(fee.medium.suggestedMaxFeePerGas)
  }
  const feeData = await provider.getFeeData()
  if (!maxPriorityFeePerGas || !maxFeePerGas) {
    maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    maxFeePerGas = feeData.maxFeePerGas;
  }
  return { maxPriorityFeePerGas, maxFeePerGas, gasPrice: feeData.gasPrice };
}
