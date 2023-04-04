import { JsonRpcProvider, Provider } from '@ethersproject/providers'
import { BigNumberish } from 'ethers/lib/ethers'
import { BigNumber } from 'ethers'
import {Deferrable} from "@ethersproject/properties";
import {TransactionRequest} from "@ethersproject/abstract-provider";

export class RpcError extends Error {
  // error codes from: https://eips.ethereum.org/EIPS/eip-1474
  constructor (msg: string, readonly code?: number, readonly data: any = undefined) {
    super(msg)
  }
}

export function tostr (s: BigNumberish): string {
  return BigNumber.from(s).toString()
}

export function requireCond (cond: boolean, msg: string, code?: number, data: any = undefined): void {
  if (!cond) {
    throw new RpcError(msg, code, data)
  }
}

/**
 * create a dictionary object with given keys
 * @param keys the property names of the returned object
 * @param mapper mapper from key to property value
 * @param filter if exists, must return true to add keys
 */
export function mapOf<T> (keys: Iterable<string>, mapper: (key: string) => T, filter?: (key: string) => boolean): { [key: string]: T } {
  const ret: { [key: string]: T } = {}
  for (const key of keys) {
    if (filter == null || filter(key)) {
      ret[key] = mapper(key)
    }
  }
  return ret
}

export async function sleep (sleepTime: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, sleepTime))
}

export async function waitFor<T> (func: () => T | undefined, timeout = 10000, interval = 500): Promise<T> {
  const endTime = Date.now() + timeout
  while (true) {
    const ret = await func()
    if (ret != null) {
      return ret
    }
    if (Date.now() > endTime) {
      throw new Error(`Timed out waiting for ${func as unknown as string}`)
    }
    await sleep(interval)
  }
}

export async function supportsRpcMethod (provider: JsonRpcProvider, method: string): Promise<boolean> {
  const ret = await provider.send(method, []).catch(e => e)
  const code = ret.error?.code ?? ret.code
  return code === -32602 // wrong params (meaning, method exists)
}

export async function isGeth (provider: JsonRpcProvider): Promise<boolean> {
  const p = provider.send as any
  if (p._clientVersion == null) {
    p._clientVersion = await provider.send('web3_clientVersion', [])
  }

  // check if we have traceCall
  // its GETH if it has debug_traceCall method.
  return await supportsRpcMethod(provider, 'debug_traceCall')
  // debug('client version', p._clientVersion)
  // return p._clientVersion?.match('go1') != null
}


export async function estimateGas(provider: Provider, transaction: Deferrable<TransactionRequest>): Promise<{ expandedGas: BigNumber, gas: BigNumber }>  {
  const { gasLimit } = await provider.getBlock('latest');
  const estimateGas = await provider.estimateGas(transaction);
  const maxGasBN = BigNumber.from((gasLimit.toNumber() * 0.9).toFixed(0));
  const paddedGasBN = BigNumber.from((estimateGas.toNumber() * 1.5).toFixed(0));
  if (estimateGas.gt(maxGasBN)) {
    return { expandedGas: estimateGas, gas: estimateGas };
  }
  if (paddedGasBN.lt(maxGasBN)) {
    return { expandedGas: paddedGasBN, gas: estimateGas };
  }
  return { expandedGas: maxGasBN, gas: estimateGas };
}
