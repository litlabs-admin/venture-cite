// Debug harness - sends one call to the LLM with our v2 prompt + JSON
// Schema and dumps the raw response so we can see exactly what's going
// wrong with empty-fact returns under strict mode.
import "dotenv/config";
import OpenAI from "openai";
import { buildExtractionPrompt } from "../server/lib/factAgent/v2/extractionPrompt";
import { MODELS } from "../server/lib/modelConfig";

(async () => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const payload =
    "VenturePR is a strategic public relations agency helping disruptive tech, SaaS, and consumer brands. Founded in 2020. Located at 407 N. Maple Dr., Ste. GRD 1, Beverly Hills, CA, 90210, US. Phone: +1-424-230-3770. Email: ben@venturepr.co.";
  const prompt = buildExtractionPrompt(payload, {
    brandUrl: "https://venturepr.com/",
    brandName: "VenturePR",
    industry: "Public relations",
  });
  console.log("=== SCHEMA NAME:", (prompt.responseFormat.json_schema as any).name);
  try {
    const res = await openai.chat.completions.create({
      model: MODELS.misc,
      response_format: prompt.responseFormat as any,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
    console.log("=== finish_reason:", res.choices[0]?.finish_reason);
    console.log("=== refusal:", (res.choices[0]?.message as any)?.refusal);
    console.log("=== RAW CONTENT:");
    console.log(res.choices[0]?.message?.content);
  } catch (err) {
    console.log("ERROR:", err instanceof Error ? err.message : String(err));
    if (err && typeof err === "object" && "response" in err) {
      console.log("Response status:", (err as any).response?.status);
      console.log("Response body:", (err as any).response?.data);
    }
  }
})();
