import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { permitRouter } from "./routes/permits";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRouter);
app.use("/permits", permitRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server on ${port}`));