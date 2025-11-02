import OpenAI from "openai";
import { config } from "../config/index.js";

const openai = new OpenAI({
  apiKey: config.openaiKey,
});

export const generateScript = async (prompt) => {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
    });
    return completion.choices[0].message.content;
  } catch (err) {
    throw new Error("GPT API 호출 실패: " + err.message);
  }
};
