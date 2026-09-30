import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { permitRouter } from "./routes/permits";
import { lookupRouter } from "./routes/lookup";
import { expireOverduePermits } from "./services/permitService";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRouter);
app.use("/permits", permitRouter);
app.use("/lookup", lookupRouter);

// Called by an outside timer (cron-job.org). Needs the secret header.
// Expiry also runs whenever permits are read, so this is the backup for
// times when nobody has the app open.
app.post("/internal/expire", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers["x-cron-secret"] !== secret) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const expired = await expireOverduePermits();
    res.json({ expired });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Expiry job failed" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server on ${port}`));