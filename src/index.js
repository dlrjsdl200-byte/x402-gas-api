require('dotenv').config();
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const gasRoutes = require('./routes/gas');

const app = Fastify({ logger: true });

app.register(cors, { origin: true });

// x402 payment middleware (stub — replace with real x402 facilitator)
app.addHook('onRequest', async (request, reply) => {
  const FREE_PATHS = ['/', '/health'];
  if (FREE_PATHS.includes(request.url)) return;

  const paymentHeader = request.headers['x-payment'];
  if (!paymentHeader) {
    return reply.code(402).send({
      error: 'Payment Required',
      message: 'This endpoint requires x402 payment.',
      accepts: [{
        scheme: 'exact',
        network: 'base-mainnet',
        maxAmountRequired: '1000', // $0.001 in USDC (6 decimals)
        resource: request.url,
        description: 'MGO Gas API access',
        mimeType: 'application/json',
        payTo: process.env.PAYMENT_ADDRESS || '0x0000000000000000000000000000000000000000',
        maxTimeoutSeconds: 300,
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
        extra: { name: 'USD Coin', version: '2' }
      }]
    });
  }
});

app.get('/', async () => ({
  name: 'x402-gas-api',
  version: '0.1.0',
  description: 'Multi-Chain Gas Optimizer (MGO) — x402 PHASE 1',
  docs: 'https://github.com/dlrjsdl200-byte/x402-gas-api'
}));

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

app.register(gasRoutes, { prefix: '/gas' });

const PORT = process.env.PORT || 3000;
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(`🚀 x402-gas-api running on port ${PORT}`);
});
