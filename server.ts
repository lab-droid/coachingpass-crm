import dotenv from "dotenv";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

// Load environment variables (IMWEB_API_KEY, IMWEB_SECRET, etc.) from .env.
// Without this, local `npm run dev` never sees the I'mweb credentials and
// every order sync fails authentication.
dotenv.config();

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0; // timestamp in ms

async function getImwebAccessToken(): Promise<string> {
  const apiKey = process.env.IMWEB_API_KEY?.trim();
  const secret = process.env.IMWEB_SECRET?.trim();
  if (!apiKey || !secret) {
    throw new Error("I'mweb API credentials are not set.");
  }

  const now = Date.now();
  // If we have a cached token and it's not close to expiring (leave a 30s buffer), use it.
  if (cachedToken && now < tokenExpiresAt - 30000) {
    return cachedToken;
  }

  const tokenUrl = `https://api.imweb.me/v2/auth?key=${apiKey}&secret=${secret}`;
  const tokenRes = await fetch(tokenUrl, { method: "GET" });
  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    throw new Error(`Failed to authenticate with I'mweb: ${errorText}`);
  }

  // 주의: 아임웹 v2 인증은 키가 틀려도 HTTP 200을 반환하고 본문에
  // {"msg":"API Key Error","code":-1} 형태로 결과를 담는다. 따라서 본문을 확인한다.
  const tokenData = await tokenRes.json() as any;
  if (!tokenData.access_token) {
    const reason = tokenData?.msg || "No access token in response.";
    throw new Error(`I'mweb auth failed: ${reason}`);
  }

  cachedToken = tokenData.access_token;
  // Use expires_in from response, typically 3600s, or default to 50 minutes
  const expiresIn = tokenData.expires_in || 3600;
  tokenExpiresAt = now + (expiresIn * 1000);

  return cachedToken;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API endpoint to fetch access token from I'mweb
  app.get("/api/imweb/token", async (req, res) => {
    try {
      const accessToken = await getImwebAccessToken();
      res.json({ access_token: accessToken });
    } catch (error: any) {
      console.error("I'mweb token error:", error);
      res.status(500).json({ error: error.message || "Failed to authenticate with I'mweb." });
    }
  });

  // API endpoint to fetch orders from I'mweb
  app.get("/api/imweb/orders", async (req, res) => {
    try {
      const accessToken = await getImwebAccessToken();
      const queryParams = new URLSearchParams(req.query as any).toString();
      const ordersUrl = `https://api.imweb.me/v2/shop/orders?${queryParams}`;

      const ordersRes = await fetch(ordersUrl, {
        method: "GET",
        headers: {
          "access-token": accessToken,
          "Content-Type": "application/json"
        }
      });

      const text = await ordersRes.text();
      let ordersData;
      try {
        ordersData = JSON.parse(text);
      } catch(e) {
        return res.status(ordersRes.status).send(text);
      }

      if (!ordersRes.ok) {
        return res.status(ordersRes.status).json(ordersData);
      }

      res.status(ordersRes.status).json(ordersData);
    } catch (error: any) {
      console.error("I'mweb Orders fetch Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  app.get("/api/imweb/orders/:order_no", async (req, res) => {
    try {
      const accessToken = await getImwebAccessToken();
      
      const ordersUrl = `https://api.imweb.me/v2/shop/orders/${encodeURIComponent(req.params.order_no)}`;
      const ordersRes = await fetch(ordersUrl, {
        method: "GET",
        headers: { "access-token": accessToken, "Content-Type": "application/json" }
      });
      const text = await ordersRes.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch(e) {
        return res.status(ordersRes.status).send(text);
      }
      res.status(ordersRes.status).json(data);
    } catch (error) {
      res.status(500).json({ error: "Error" });
    }
  });

  app.get("/api/imweb/orders/:order_no/prod-orders", async (req, res) => {
    try {
      const accessToken = await getImwebAccessToken();
      
      const ordersUrl = `https://api.imweb.me/v2/shop/orders/${encodeURIComponent(req.params.order_no)}/prod-orders`;
      const ordersRes = await fetch(ordersUrl, {
        method: "GET",
        headers: { "access-token": accessToken, "Content-Type": "application/json" }
      });
      const text = await ordersRes.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return res.status(ordersRes.status).send(text);
      }
      res.status(ordersRes.status).json(data);
    } catch (error) {
      res.status(500).json({ error: "Error" });
    }
  });

  app.get("/api/imweb/prod-orders", async (req, res) => {
    try {
      const accessToken = await getImwebAccessToken();
      
      const rawQuery = req.originalUrl.split("?")[1] || "";
      const ordersUrl = `https://api.imweb.me/v2/shop/prod-orders?${rawQuery}`;
      const ordersRes = await fetch(ordersUrl, {
        method: "GET",
        headers: { "access-token": accessToken, "Content-Type": "application/json" }
      });
      const text = await ordersRes.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return res.status(ordersRes.status).send(text);
      }
      res.status(ordersRes.status).json(data);
    } catch (error) {
      res.status(500).json({ error: "Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
