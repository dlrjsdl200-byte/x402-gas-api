// OP Stack L1 data fee (Ecotone/Fjord formula) via the GasPriceOracle predeploy.
// Works for any OP Stack chain (Optimism, Base): same predeploy address.
const { createPublicClient, http, fallback, parseAbi } = require("viem");

const ORACLE_ADDRESS = "0x420000000000000000000000000000000000000F";

const oracleAbi = parseAbi([
  "function l1BaseFee() view returns (uint256)",
  "function baseFeeScalar() view returns (uint32)",
  "function blobBaseFeeScalar() view returns (uint32)",
  "function blobBaseFee() view returns (uint256)",
]);

// Approximate size of the *whole signed tx* that gets posted to L1, in bytes.
// A signed EIP-1559 transfer is ~110 bytes even with empty calldata, so the
// native transfer is not free on L1 (it used to be modelled as 0).
const TX_OVERHEAD = 110;
const CALLDATA_SIZES = {
  nativeTransfer: TX_OVERHEAD + 0,
  erc20Transfer: TX_OVERHEAD + 68,   // transfer(address,uint256)
  dexSwap: TX_OVERHEAD + 260,        // Uniswap-style swap (approx)
};

const clients = new Map(); // chainId -> client

function getClient(chain, rpcs) {
  if (!clients.has(chain.id)) {
    clients.set(chain.id, createPublicClient({
      chain,
      transport: fallback(rpcs.map((url) => http(url, { timeout: 4_000, retryCount: 0 }))),
    }));
  }
  return clients.get(chain.id);
}

// l1Fee = (baseFeeScalar * l1BaseFee * 16 + blobBaseFeeScalar * blobBaseFee) * bytes / 1e6
async function estimateL1Fee(chain, rpcs) {
  const c = getClient(chain, rpcs);
  const read = (functionName) => c.readContract({ address: ORACLE_ADDRESS, abi: oracleAbi, functionName });
  const [l1BaseFee, baseFeeScalar, blobBaseFeeScalar, blobBaseFee] = await Promise.all([
    read("l1BaseFee"), read("baseFeeScalar"), read("blobBaseFeeScalar"), read("blobBaseFee"),
  ]);
  const scaledL1Fee = BigInt(baseFeeScalar) * l1BaseFee * 16n;
  const scaledBlobFee = BigInt(blobBaseFeeScalar) * blobBaseFee;
  const fees = {};
  for (const [txType, bytes] of Object.entries(CALLDATA_SIZES)) {
    fees[txType] = (scaledL1Fee + scaledBlobFee) * BigInt(bytes) / 1000000n;
  }
  return fees;
}

const ZERO_FEES = { nativeTransfer: 0n, erc20Transfer: 0n, dexSwap: 0n };

module.exports = { estimateL1Fee, CALLDATA_SIZES, ZERO_FEES };
