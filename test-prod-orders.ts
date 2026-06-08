import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.IMWEB_API_KEY?.trim();
const secret = process.env.IMWEB_SECRET?.trim();

async function main() {
  const tokenUrl = `https://api.imweb.me/v2/auth?key=${apiKey}&secret=${secret}`;
  console.log("Fetching token:", tokenUrl);
  const tokenRes = await fetch(tokenUrl);
  const tokenData = await tokenRes.json();
  
  let ordersUrl = `https://api.imweb.me/v2/shop/prod-orders?limit=2`;
  const get1 = await fetch(ordersUrl, { headers: { 'access-token': tokenData.access_token }});
  console.log("/prod-orders:", await get1.text());
}

main();
