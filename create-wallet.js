const { Coinbase, Wallet } = require("@coinbase/coinbase-sdk");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

async function main() {
  console.log("\n=== CDP 지갑 생성 ===\n");
  const name = await ask("CDP API Key Name: ");
  const secret = await ask("CDP Private Key: ");

  console.log("\n지갑 생성 중...\n");

  Coinbase.configure({ apiKeyName: name.trim(), privateKey: secret.trim() });

  const wallet = await Wallet.create({ networkId: "base-mainnet" });
  const addr = await wallet.getDefaultAddress();

  console.log("지갑 주소: " + addr.getId());
  console.log("\n.env에 추가하세요:");
  console.log("WALLET_ADDRESS=" + addr.getId() + "\n");
  rl.close();
}

main().catch((e) => { console.error("에러:", e.message); process.exit(1); });