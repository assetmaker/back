import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import scriptRoutes from "./routes/scriptRoutes.js";
import modelRoutes from "./routes/modelRoutes.js";
import pixelRoutes from "./routes/pixelRoutes.js";

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.use("/api/script", scriptRoutes);
app.use("/api/model", modelRoutes);
app.use("/api/pixel", pixelRoutes);

export default app;
