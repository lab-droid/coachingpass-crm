import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.IMWEB_API_KEY?.trim();
const secret = process.env.IMWEB_SECRET?.trim();

async function main() {
  const tokenUrl = `https://api.imweb.me/v2/auth?key=${apiKey}&secret=${secret}`;
  console.log("Fetching token:", tokenUrl);
  const tokenRes = await fetch(tokenUrl);
  const tokenData = await tokenRes.json();
  
  const orderCode = "o20260606114e0737b06e8";
  const orderNo = "202606068695842";
  
  let ordersUrl = `https://api.imweb.me/v2/shop/orders/${orderNo}`;
  const get1 = await fetch(ordersUrl, { headers: { 'access-token': tokenData.access_token }});
  console.log("/orders/{orderNo}:", await get1.text());

  ordersUrl = `https://api.imweb.me/v2/shop/orders/${orderNo}/prod-orders`;
  const get2 = await fetch(ordersUrl, { headers: { 'access-token': tokenData.access_token }});
  console.log("/orders/{orderNo}/prod-orders:", await get2.text());
}

main();
