import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.IMWEB_API_KEY?.trim();
const secret = process.env.IMWEB_SECRET?.trim();

async function main() {
  const tokenRes = await fetch(`https://api.imweb.me/v2/auth?key=${apiKey}&secret=${secret}`);
  const tokenData = await tokenRes.json();
  const headers = { 'access-token': tokenData.access_token };
  
  const orders = await fetch(`https://api.imweb.me/v2/shop/orders?limit=2&offset=1`, { headers });
  const data = await orders.json();
  if (data.data?.list?.length > 0) {
    console.log("Keys of first order:", Object.keys(data.data.list[0]));
    console.log("order.items exists?", !!data.data.list[0].items);
    if(data.data.list[0].items) console.log("order.items:", data.data.list[0].items);
  }
}
main();
