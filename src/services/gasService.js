const axios = require('axios');

const SUPPORTED_CHAINS = {
  ethereum: { rpcEnv: 'ETH_RPC_URL',      chainId: 1,     symbol: 'ETH',  decimals: 18 },
  polygon:  { rpcEnv: 'POLYGON_RPC_URL',   chainId: 137,   symbol: 'MATIC',decimals: 18 },
  arbitrum: { rpcEnv: 'ARBITRUM_RPC_URL',  chainId: 42161, symbol: 'ETH',  decimals: 18 },
  optimism: { rpcEnv: 'OPTIMISM_RPC_URL',  chainId: 10,    symbol: 'ETH',  decimals: 18 },
  base:     { rpcEnv: 'BASE_RPC_URL',      chainId: 8453,  symbol: 'ETH',  decimals: 18 },
  bsc:      { rpcEnv: 'BSC_RPC_URL',       chainId: 56,    symbol: 'BNB',  decimals: 18 },
};

async function rpcCall(chain, method, params = []) {
  const config = SUPPORTED_CHAINS[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}. Supported: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`);

  const rpcUrl = process.env[config.rpcEnv];
  if (!rpcUrl) throw new Error(`RPC URL not configured for ${chain}. Set ${config.rpcEnv} in .env`);

  const res = await axios.post(rpcUrl, { jsonrpc: '2.0', id: 1, method, params });
  if (res.data.error) throw new Error(res.data.error.message);
  return res.data.result;
}

function hexToGwei(hex) {
  return (parseInt(hex, 16) / 1e9).toFixed(4);
}

async function getCurrentGas(chain) {
  const [gasPriceHex, blockHex] = await Promise.all([
    rpcCall(chain, 'eth_gasPrice'),
    rpcCall(chain, 'eth_getBlockByNumber', ['latest', false])
  ]);

  const baseFeeGwei = blockHex?.baseFeePerGas ? hexToGwei(blockHex.baseFeePerGas) : null;
  const gasPriceGwei = hexToGwei(gasPriceHex);

  return {
    chain,
    timestamp: new Date().toISOString(),
    gasPrice: {
      safe:     (parseFloat(gasPriceGwei) * 0.9).toFixed(4),
      standard: gasPriceGwei,
      fast:     (parseFloat(gasPriceGwei) * 1.2).toFixed(4),
      unit: 'gwei'
    },
    baseFee: baseFeeGwei ? { value: baseFeeGwei, unit: 'gwei' } : null,
    blockNumber: blockHex ? parseInt(blockHex.number, 16) : null
  };
}

async function getGasHistory(chain) {
  const current = await getCurrentGas(chain);
  return {
    chain,
    period: '24h',
    note: 'Historical data coming in PHASE 2',
    latest: current
  };
}

async function compareAllChains() {
  const chains = Object.keys(SUPPORTED_CHAINS);
  const results = await Promise.allSettled(chains.map(c => getCurrentGas(c)));
  return {
    timestamp: new Date().toISOString(),
    chains: results.map((r, i) => ({
      chain: chains[i],
      status: r.status,
      data: r.status === 'fulfilled' ? r.value : { error: r.reason?.message }
    }))
  };
}

async function estimateTxCost(chain, gasLimit) {
  const gasData = await getCurrentGas(chain);
  const config = SUPPORTED_CHAINS[chain];
  return {
    chain,
    gasLimit,
    gasPrice: gasData.gasPrice,
    estimate: {
      safe:     ((parseFloat(gasData.gasPrice.safe)     * gasLimit) / 1e9).toFixed(8),
      standard: ((parseFloat(gasData.gasPrice.standard) * gasLimit) / 1e9).toFixed(8),
      fast:     ((parseFloat(gasData.gasPrice.fast)     * gasLimit) / 1e9).toFixed(8),
      unit: config.symbol
    }
  };
}

module.exports = { getCurrentGas, getGasHistory, compareAllChains, estimateTxCost, SUPPORTED_CHAINS };
