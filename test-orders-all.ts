import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.IMWEB_API_KEY?.trim();
const secret = process.env.IMWEB_SECRET?.trim();

async function main() {
  const tokenUrl = `https://api.imweb.me/v2/auth?key=${apiKey}&secret=${secret}`;
  console.log("Fetching token:", tokenUrl);
  const tokenRes = await fetch(tokenUrl);
  const tokenData = await tokenRes.json();
  
  const ordersUrl = `https://api.imweb.me/v2/shop/orders?limit=10`;
  const ordersRes = await fetch(ordersUrl, {
    headers: { 'access-token': tokenData.access_token }
  });
  const ordersText = await ordersRes.text();
  console.log("Orders without filters:", ordersText.slice(0, 700));
}

main();
