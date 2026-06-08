import express from "express";
const app = express();
app.get("/api/orders/:order_no", (req, res) => { res.json({matched: 1}) });
app.get("/api/orders/:order_no/prod-orders", (req, res) => { res.json({matched: 2}) });
app.listen(3001, async () => {
  const r = await fetch("http://localhost:3001/api/orders/xyz/prod-orders");
  console.log(await r.json());
  process.exit(0);
});
