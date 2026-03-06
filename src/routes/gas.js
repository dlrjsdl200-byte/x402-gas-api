const gasService = require('../services/gasService');

async function gasRoutes(fastify) {
  // GET /gas/compare — must register before /:chain to avoid route conflict
  fastify.get('/compare', async (request, reply) => {
    try {
      return await gasService.compareAllChains();
    } catch (e) {
      reply.code(500).send({ error: e.message });
    }
  });

  // GET /gas/:chain — current gas prices
  fastify.get('/:chain', async (request, reply) => {
    const { chain } = request.params;
    try {
      return await gasService.getCurrentGas(chain);
    } catch (e) {
      reply.code(400).send({ error: e.message });
    }
  });

  // GET /gas/:chain/history — 24h history
  fastify.get('/:chain/history', async (request, reply) => {
    const { chain } = request.params;
    try {
      return await gasService.getGasHistory(chain);
    } catch (e) {
      reply.code(400).send({ error: e.message });
    }
  });

  // GET /gas/:chain/estimate?gasLimit=21000
  fastify.get('/:chain/estimate', async (request, reply) => {
    const { chain } = request.params;
    const gasLimit = parseInt(request.query.gasLimit || '21000');
    try {
      return await gasService.estimateTxCost(chain, gasLimit);
    } catch (e) {
      reply.code(400).send({ error: e.message });
    }
  });
}

module.exports = gasRoutes;
