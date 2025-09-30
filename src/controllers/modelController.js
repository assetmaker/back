import { generateModel } from "../services/meshyService.js";

export const handleGenerateModel = async (req, res) => {
  const { prompt, mode } = req.body;
  if (!prompt) return res.status(400).json({ success: false, error: "프롬프트가 필요합니다." });

  try {
    const data = await generateModel(prompt, mode);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
