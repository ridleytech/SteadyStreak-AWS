var express = require("express");
var OpenAI = require("openai");
var z = require("zod");

var router = express.Router();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "no-api-key";

router.get("/", function (req, res) {
  res.send("respond with a resource RepGoal");
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const Body = z.object({
  exerciseName: z.string().min(1),
  targetTotal: z.number().int().min(1),
  currentMax: z.number().int().min(0),
});

// ---------- Pricing (USD per token) ----------
const PRICES = {
  // per 1M tokens (convert to per-token below)
  "gpt-4o-mini": {
    inputPerM: 0.15,
    cachedInputPerM: 0.08,
    outputPerM: 0.6,
  },
  "gpt-4o": {
    inputPerM: 2.5,
    cachedInputPerM: 1.25,
    outputPerM: 10.0,
  },
};

function modelKey(m) {
  if (!m) return null;
  if (m.startsWith("gpt-4o-mini")) return "gpt-4o-mini";
  if (m.startsWith("gpt-4o")) return "gpt-4o";
  return null;
}

function costFromUsage(usage, model) {
  const key = modelKey(model);
  const rate = key ? PRICES[key] : null;

  const pt = usage?.prompt_tokens ?? usage?.input_tokens ?? 0;
  const ct = usage?.completion_tokens ?? usage?.output_tokens ?? 0;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;

  const nonCached = Math.max(0, pt - cached);

  if (!rate) {
    return {
      inputTokens: pt,
      cachedTokens: cached,
      outputTokens: ct,
      total: 0,
      details: "Unknown model pricing",
    };
  }

  const inPerTok = rate.inputPerM / 1_000_000;
  const cachedPerTok = rate.cachedInputPerM / 1_000_000;
  const outPerTok = rate.outputPerM / 1_000_000;

  const inputCost = nonCached * inPerTok;
  const cachedCost = cached * cachedPerTok;
  const outputCost = ct * outPerTok;
  const total = inputCost + cachedCost + outputCost;

  return {
    inputTokens: pt,
    cachedTokens: cached,
    outputTokens: ct,
    inputCost,
    cachedCost,
    outputCost,
    total,
  };
}

// --------------------------------------------

router.post("/plan", async (req, res) => {
  console.log("[macro] req.body", req.body);
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    console.log("[macro] zod error:", parsed.error);
    return res
      .status(400)
      .json({ error: "Bad request", details: parsed.error.flatten() });
  }
  const { exerciseName, targetTotal, currentMax } = parsed.data;

  try {
    const userJSON = JSON.stringify({
      task: "estimate_time_to_target",
      exercise: exerciseName,
      target_total: targetTotal,
      current_max: currentMax,
      expected_keys: [
        "estimated_days",
        "estimated_completion_date",
        "daily_recommendation",
        "weekly_notes",
        "assumptions",
      ],
    });

    const rsp = await openai.responses.create({
      model: "gpt-4o-mini",
      text: { format: "json_object" },
      input: [
        {
          role: "system",
          content:
            "You are a training planner. Respond with JSON only (one JSON object). No markdown or prose.",
        },
        { role: "user", content: userJSON },
      ],
    });

    // --- Cost logging ---
    const usage = rsp.usage ?? {};
    const model = rsp.model ?? "unknown-model";
    const cost = costFromUsage(usage, model);

    console.log(
      `[macro] usage model=${model} in=${cost.inputTokens} cached_in=${
        cost.cachedTokens
      } out=${cost.outputTokens} → cost $${cost.total.toFixed(6)}`
    );

    // (Optional) log breakdown
    // console.log(`[macro] breakdown in=$${(cost.inputCost||0).toFixed(6)} cached=$${(cost.cachedCost||0).toFixed(6)} out=$${(cost.outputCost||0).toFixed(6)}`);

    const jsonText =
      rsp.output_text ?? rsp.output?.[0]?.content?.[0]?.text?.value ?? "{}";

    try {
      const obj = JSON.parse(jsonText);
      // (Optional) include cost in the response for the app:
      // obj._estimated_cost_usd = Number(cost.total.toFixed(6));
      return res.json(obj);
    } catch {
      return res
        .status(502)
        .json({ error: "Non-JSON from model", raw: jsonText });
    }
  } catch (err) {
    const status = err?.status ?? err?.response?.status ?? 500;
    // Log detailed failure (and any usage if present)
    try {
      const usage = err?.response?.data?.usage;
      if (usage) {
        const model = err?.response?.data?.model ?? "unknown";
        const cost = costFromUsage(usage, model);
        console.error(
          `[macro] ERROR usage model=${model} in=${
            cost.inputTokens
          } cached_in=${cost.cachedTokens} out=${
            cost.outputTokens
          } (pre-failure est cost $${cost.total.toFixed(6)})`
        );
      }
    } catch {}
    console.error("[macro] OpenAI request failed:", err?.response?.data ?? err);
    return res.status(status).json({
      error: "OpenAI request failed",
      details: err?.response?.data ?? err?.message ?? String(err),
    });
  }
});

module.exports = router;
