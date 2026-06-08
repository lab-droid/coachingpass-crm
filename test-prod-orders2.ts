import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.IMWEB_API_KEY?.trim();
const secret = process.env.IMWEB_SECRET?.trim();

async function main() {
  const tokenRes = await fetch(`https://api.imweb.me/v2/auth?key=${apiKey}&secret=${secret}`);
  const tokenData = await tokenRes.json();
  
  const startTime = Math.floor(new Date('2026-05-01T00:00:00+09:00').getTime() / 1000);
  const endTime = Math.floor(new Date('2026-05-31T23:59:59+09:00').getTime() / 1000);
  let ordersUrl = `https://api.imweb.me/v2/shop/prod-orders?start_time=${startTime}&end_time=${endTime}&limit=5`;
  const get1 = await fetch(ordersUrl, { headers: { 'access-token': tokenData.access_token }});
  console.log("Response:", await get1.text());
}

main();
