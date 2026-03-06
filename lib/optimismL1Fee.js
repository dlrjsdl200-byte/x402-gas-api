const { createPublicClient, http, fallback, parseAbi } = require("viem");
const { optimism } = require("viem/chains");

// Optimism GasPriceOracle precompile
const ORACLE_ADDRESS = "0x420000000000000000000000000000000000000F";

const oracleAbi = parseAbi([
  "function l1BaseFee() view returns (uint256)",
  "function baseFeeScalar() view returns (uint32)",
  "function blobBaseFeeScalar() view returns (uint32)",
  "function blobBaseFee() view returns (uint256)",
]);

// Typical calldata sizes (bytes) for cost estimation
const CALLDATA_SIZES = {
  nativeTransfer: 0,      // simple ETH transfer = no calldata
  erc20Transfer: 68,      // transfer(address,uint256)
  dexSwap: 260,           // Uniswap-style swap (approx)
};

let client = null;

function getClient(rpcs) {
  if (!client) {
    client = createPublicClient({
      chain: optimism,
      transport: fallback(rpcs.map((url) => http(url, { timeout: 10_000 }))),
    });
  }
  return client;
}

// Estimate L1 data fee for a given calldata size
// Ecotone formula: l1Fee = (baseFeeScalar * l1BaseFee * 16 + blobBaseFeeScalar * blobBaseFee) * calldataSize / 1e6
async function estimateL1Fee(rpcs) {
  const c = getClient(rpcs);

  const [l1BaseFee, baseFeeScalar, blobBaseFeeScalar, blobBaseFee] = await Promise.all([
    c.readContract({ address: ORACLE_ADDRESS, abi: oracleAbi, functionName: "l1BaseFee" }),
    c.readContract({ address: ORACLE_ADDRESS, abi: oracleAbi, functionName: "baseFeeScalar" }),
    c.readContract({ address: ORACLE_ADDRESS, abi: oracleAbi, functionName: "blobBaseFeeScalar" }),
    c.readContract({ address: ORACLE_ADDRESS, abi: oracleAbi, functionName: "blobBaseFee" }),
  ]);

  const fees = {};
  for (const [txType, calldataBytes] of Object.entries(CALLDATA_SIZES)) {
    if (calldataBytes === 0) {
      fees[txType] = 0n;
    } else {
      // Ecotone L1 fee formula
      const scaledL1Fee = BigInt(baseFeeScalar) * l1BaseFee * 16n;
      const scaledBlobFee = BigInt(blobBaseFeeScalar) * blobBaseFee;
      fees[txType] = (scaledL1Fee + scaledBlobFee) * BigInt(calldataBytes) / 1000000n;
    }
  }

  return fees;
}

module.exports = { estimateL1Fee, CALLDATA_SIZES };
