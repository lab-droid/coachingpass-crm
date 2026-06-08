import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.IMWEB_API_KEY?.trim();
const secret = process.env.IMWEB_SECRET?.trim();

async function main() {
  const tokenRes = await fetch(`https://api.imweb.me/v2/auth?key=${apiKey}&secret=${secret}`);
  const tokenData = await tokenRes.json();
  const headers = { 'access-token': tokenData.access_token };
  
  const orders1 = await fetch(`https://api.imweb.me/v2/shop/orders?limit=1&offset=0`, { headers });
  console.log("o1", await orders1.text());
  
  const orders2 = await fetch(`https://api.imweb.me/v2/shop/orders?limit=1&offset=1`, { headers });
  console.log("o2", await orders2.text());
}
main();
