import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const API_BASE = process.env.VITE_PAYTWEAK_API_BASE || "https://api.paytweak.com";
const SECRET_TOKEN = process.env.VITE_PAYTWEAK_SECRET_TOKEN;
const PUBLIC_TOKEN = process.env.VITE_PAYTWEAK_PUBLIC_TOKEN;
const LINK_PATH = process.env.VITE_PAYTWEAK_LINK_PATH || "/link";

if (!SECRET_TOKEN || !PUBLIC_TOKEN) {
  // eslint-disable-next-line no-console
  console.warn("[paytweak-proxy] SECRET/PUBLIC token not set. Calls will fail.");
}

app.post("/api/paytweak/link", async (req, res) => {
  try {
    if (!SECRET_TOKEN || !PUBLIC_TOKEN) {
      return res.status(400).json({ error: "Paytweak tokens not configured" });
    }

    const {
      amount,
      currency = "EUR",
      reference,
      description,
      customer,
      successUrl,
      cancelUrl,
    } = req.body;

    if (!amount || !reference || !customer?.email) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const payload = {
      amount,
      currency,
      reference,
      description,
      customer,
      successUrl,
      cancelUrl,
      publicToken: PUBLIC_TOKEN,
    };

    const response = await fetch(`${API_BASE.replace(/\/+$/, "")}${LINK_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SECRET_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      // eslint-disable-next-line no-console
      console.error("[paytweak-proxy] API error", response.status, text);
      return res
        .status(response.status)
        .json({ error: "Paytweak API error", details: text || response.statusText });
    }

    const data = await response.json();
    const link =
      data?.paymentUrl ||
      data?.url ||
      data?.redirectUrl ||
      data?.link ||
      data?.shortUrl ||
      data?.short_url ||
      "";

    if (!link) {
      return res.status(502).json({ error: "No payment URL in response", data });
    }

    return res.json({ url: link, raw: data });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[paytweak-proxy] Error", error);
    return res.status(500).json({ error: "Proxy error" });
  }
});

const port = process.env.PORT || 5174;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[paytweak-proxy] listening on port ${port}`);
});

