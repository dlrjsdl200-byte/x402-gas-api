// Local entry point. Runs the exact same Express app that Vercel serves
// (api/index.js) so there is only one source of truth for routes, prices,
// discovery metadata and the receiving wallet.
require("dotenv").config();
const app = require("./api/index");
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MGO Gas API (same app as production) on http://localhost:${PORT}`);
  console.log("Try: /health  /gas/demo  /prices  /gas/basic (402)  /mcp");
});
