// server.js
import express from "express";
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
 // install with: npm i express node-fetch
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// set in your environment (or hardcode for quick test)
const FWD_URL = process.env.FWD_URL || "https://example.com/endpoint";

app.use(express.json());

// webhook endpoint
app.post("/webhook", async (req, res) => {
    const data = req.body;
    
    console.log("Received dataa:", JSON.stringify(data));

  // define your criteria
  const shouldForward = data?.status === "ok" && Number(data?.amount) > 100;

  let forwardStatus;
  if (shouldForward) {
    try {
      const r = await fetch(FWD_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      forwardStatus = r.status;
    } catch (err) {
      console.error("Forward error:", err);
      forwardStatus = "error";
    }
  }

  res.json({ ok: true, forwarded: shouldForward, forwardStatus });
});

// start server
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
