import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import scriptRoutes from "./routes/scriptRoutes.js";
import modelRoutes from "./routes/modelRoutes.js";
import pixelRoutes from "./routes/pixelRoutes.js";

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "20mb" }));

app.use("/api/script", scriptRoutes);
app.use("/api/model", modelRoutes);
app.use("/api/pixel", pixelRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

export default app;
