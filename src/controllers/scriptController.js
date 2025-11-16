import { generateScript } from "../services/gptService.js";

export const handleGenerateScript = async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ success: false, error: "프롬프트가 필요합니다." });

  try {
    const code = await generateScript(prompt);
    res.json({ success: true, code });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
