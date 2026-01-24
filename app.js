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

const NEW_LEAD_URL = "https://projectitudekabeer.app.n8n.cloud/webhook/on-new-lead-came-in";

app.use(express.json());

// webhook endpoint
app.post("/webhook", async (req, res) => {
    const data = req.body;

    const event_type = data["type"];

    console.log("Event type: ", event_type);
    
    console.log("Received data:", JSON.stringify(data));

    const message = data?.message?.message || null;

  // define your criteria
    const shouldForward =
      event_type !== "message_received" || data["data"]?.["customer"]?.["traits"]?.["Use AI Agent"].toLowerCase() === "yes" || false;

  const is_send_on_new_lead_url = message.toLowerCase() === "hello! can I get more info on this?"; 

  if (is_send_on_new_lead_url) {
    try {
      const r = await fetch(NEW_LEAD_URL, {
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
  
  const TARGET_URL = FWD_URL;

  let forwardStatus;
  if (shouldForward) {
    try {
      const r = await fetch(TARGET_URL, {
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
