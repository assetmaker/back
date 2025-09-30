import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import scriptRoutes from "./routes/scriptRoutes.js";
import modelRoutes from "./routes/modelRoutes.js";

const app = express();

app.use(cors());
app.use(bodyParser.json());

// 라우트 등록
app.use("/api/script", scriptRoutes);
app.use("/api/model", modelRoutes);

export default app;
