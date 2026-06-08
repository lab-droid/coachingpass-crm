import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.IMWEB_API_KEY?.trim();
const secret = process.env.IMWEB_SECRET?.trim();

async function main() {
  if (!apiKey || !secret) {
    console.log("No API key or secret found");
    return;
  }
  
  const tokenUrl = `https://api.imweb.me/v2/auth?key=${apiKey}&secret=${secret}`;
  console.log("Fetching token:", tokenUrl);
  const tokenRes = await fetch(tokenUrl);
  const tokenText = await tokenRes.text();
  console.log("Token response:", tokenRes.status, tokenText);
  
  if (!tokenRes.ok) return;
  const tokenData = JSON.parse(tokenText);
  
  const startTime = Math.floor(new Date('2026-05-01T00:00:00+09:00').getTime() / 1000);
  const endTime = Math.floor(new Date('2026-05-31T23:59:59+09:00').getTime() / 1000);
  const ordersUrl = `https://api.imweb.me/v2/shop/orders?start_time=${startTime}&end_time=${endTime}&limit=100`;
  const ordersRes = await fetch(ordersUrl, {
    headers: { 'access-token': tokenData.access_token }
  });
  const ordersText = await ordersRes.text();
  const ordersData = JSON.parse(ordersText);
  if(ordersData.data && ordersData.data.list) {
      console.log("Items for first order:", ordersData.data.list[0].items.length > 0 ? ordersData.data.list[0].items : ordersData.data.list[0]);
  }
}

main();
