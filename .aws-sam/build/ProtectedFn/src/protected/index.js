import OpenAI from "openai";
import { z } from "zod";

// ---------- Env ----------
const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || "please provide OpenAI api key";
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// console.log(`OpenAI API key: ${OPENAI_API_KEY}`);

// export const handler = async (event) => {
//   // TODO implement
//   const response = {
//     statusCode: 200,
//     body: JSON.stringify("Hello from Lambda!"),
//   };
//   return response;
// };

// ------------ Handler (AWS Lambda) ------------
export const handler = async (event) => {
  // CORS preflight
  if (methodOf(event) === "OPTIONS") {
    return { statusCode: 204, headers: JSON_HEADERS, body: "" };
  }

  const method = methodOf(event);
  const p = pathOf(event);

  // Health: GET /macro (or "/" if function is mapped directly there)
  if (
    method === "GET" &&
    (p === "/" || p.endsWith("/macro") || p.endsWith("/protected"))
  ) {
    return ok("SteadyStreak create StreakPath (session-max mode)");
  }

  // POST /macro and /macro/plan
  if (
    method === "POST" &&
    (p === "/" ||
      p.endsWith("/plan") ||
      p.endsWith("/macro") ||
      p.endsWith("/protected"))
  ) {
    const body = parseJSONBody(event);
    return await handlePlanLambda(body);
  }

  return resp(404, { error: "Not found", path: p, method });
};

// ---------- Schemas ----------
const Body = z.object({
  exerciseName: z.string().min(1),
  currentMax: z.number().int().min(0), // current single-set max
  targetTotal: z.number().int().min(1), // target single-set max
  dailyGoal: z.number().int().min(1).optional(), // ignored if present
});

const PlanSchema = z.object({
  estimated_days: z.number().int().min(0),
  estimated_completion_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daily_recommendation: z.string(),
  weekly_notes: z.array(z.string()),
  assumptions: z.array(z.string()),
});

// ---------- Helpers ----------
const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type,authorization",
};

const ok = (body) => ({
  statusCode: 200,
  headers: JSON_HEADERS,
  body: typeof body === "string" ? body : JSON.stringify(body),
});

const resp = (statusCode, body) => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

function parseJSONBody(event) {
  if (!event?.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function pathOf(event) {
  return event.requestContext?.http?.path || event.rawPath || event.path || "/";
}

function methodOf(event) {
  return event.requestContext?.http?.method || event.httpMethod || "GET";
}

// ------------ Baseline progression (deterministic) ------------
function baselineProgression(current, target) {
  const notes = [];
  let week = 0;
  let cur = Math.max(0, current);

  while (cur < target && week < 520) {
    week++;
    const rate = weeklyRate(cur);
    const inc = Math.max(1, Math.round(cur * rate));
    const next = cur + inc;
    notes.push(
      `Week ${week}: target ~${Math.min(
        next,
        target
      )} reps (from ${cur}, +${inc})`
    );
    cur = next;
  }
  const days = week * 7;
  return { estimatedWeeks: week, estimatedDays: days, weeklyNotes: notes };
}

function weeklyRate(cur) {
  if (cur < 30) return 0.15;
  if (cur < 60) return 0.12;
  if (cur < 100) return 0.08;
  return 0.06;
}

// ------------ Normalization helpers ------------
function normalizePlan(raw, todayIso) {
  let days = 0;
  if (typeof raw.estimated_days === "number")
    days = Math.max(0, Math.floor(raw.estimated_days));
  else if (typeof raw.estimated_days === "string") {
    const n = parseInt(raw.estimated_days, 10);
    days = isNaN(n) ? 0 : Math.max(0, n);
  }

  let dailyRecommendation = "";
  if (typeof raw.daily_recommendation === "string")
    dailyRecommendation = raw.daily_recommendation;
  else if (typeof raw.daily_recommendation === "number")
    dailyRecommendation = String(raw.daily_recommendation);
  else if (raw.daily_recommendation != null)
    dailyRecommendation = JSON.stringify(raw.daily_recommendation);

  const weekly_notes = coerceStringArray(raw.weekly_notes);

  let assumptions = [];
  if (Array.isArray(raw.assumptions))
    assumptions = coerceStringArray(raw.assumptions);
  else if (typeof raw.assumptions === "object" && raw.assumptions !== null) {
    assumptions = Object.values(raw.assumptions)
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .filter((s) => s.trim().length > 0);
  } else assumptions = coerceStringArray(raw.assumptions);

  return {
    estimated_days: days,
    estimated_completion_date: addDaysISO(todayIso, days), // overwritten later
    daily_recommendation:
      dailyRecommendation ||
      "Train push-ups 3–4×/week, practice near-max sets, add small reps weekly.",
    weekly_notes,
    assumptions,
  };
}

function coerceStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (typeof value === "string") {
    return value
      .replace(/•/g, "\n")
      .split(/[\n\r]+|(?<=[.!?])\s+(?=[A-Z0-9])/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (value == null) return [];
  return [JSON.stringify(value)];
}

function safeErr(err) {
  return {
    name: err?.name,
    message: err?.message,
    status: err?.status ?? err?.statusCode ?? err?.response?.status,
    data: err?.response?.data,
    stack: err?.stack?.split("\n").slice(0, 3).join("\n"),
  };
}

function localTodayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(
    now.getDate()
  )}`;
}
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

// ------------ Plan handler ------------
async function handlePlanLambda(body) {
  console.log("[macro] incoming body:", body);

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    console.warn("[macro] 400 invalid body:", parsed.error.flatten());
    return resp(400, { error: "Bad request", details: parsed.error.flatten() });
  }
  const { exerciseName, currentMax, targetTotal } = parsed.data;

  // 0) Already at/above goal
  if (currentMax >= targetTotal) {
    const todayIso = localTodayISO();
    const result = {
      estimated_days: 0,
      estimated_completion_date: todayIso,
      daily_recommendation:
        "Maintain form and consistency; you’ve already hit this session-max.",
      weekly_notes: ["Deload week as needed; maintain performance."],
      assumptions: ["No injuries; consistent weekly training."],
    };
    console.log("[macro] already at goal →", result);
    return ok(result);
  }

  // 1) Deterministic baseline
  const base = baselineProgression(currentMax, targetTotal);
  console.log("[macro] baseline progression:", base);

  // 2) Model request (session-max framing)
  const todayIso = localTodayISO();
  const userJSON = JSON.stringify({
    task: "estimate_session_max_progression",
    today: todayIso,
    notes:
      "This is NOT cumulative daily reps. It is the unbroken set (single-session) max reps capacity progression.",
    constraints: {
      description:
        "Plan should reflect progressive overload for session-max strength/endurance. Include rest, realistic rate, and avoid over-optimism.",
      completion_rule:
        "estimated_completion_date = today + estimated_days (calendar days)",
      output_shape: {
        estimated_days: "integer >= 0",
        estimated_completion_date: "YYYY-MM-DD (today + estimated_days)",
        daily_recommendation: "string",
        weekly_notes: "array of strings (no objects)",
        assumptions: "array of strings (no objects)",
      },
    },
    exercise: exerciseName,
    current_session_max: currentMax,
    target_session_max: targetTotal,
  });

  try {
    const chatReq = {
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a training planner. Respond with a single JSON object only—no prose or markdown.",
        },
        { role: "user", content: userJSON },
      ],
    };

    let completion;
    try {
      completion = await openai.chat.completions.create(chatReq);
    } catch (err) {
      console.warn(
        "[macro] primary call failed; fallback without response_format:",
        safeErr(err)
      );
      const fallbackReq = {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a training planner. Output ONLY a valid JSON object (no markdown). Use shape: { estimated_days:number, estimated_completion_date:'YYYY-MM-DD', daily_recommendation:string, weekly_notes:string[], assumptions:string[] }",
          },
          { role: "user", content: userJSON },
        ],
      };
      completion = await openai.chat.completions.create(fallbackReq);
    }

    const content = completion?.choices?.[0]?.message?.content ?? "";
    console.log("[macro] OpenAI success:", {
      id: completion?.id,
      model: completion?.model,
      usage: completion?.usage,
      contentPreview: content.slice(0, 200),
    });

    let raw;
    try {
      raw = JSON.parse(content);
    } catch {
      console.warn("[macro] model returned non-JSON; using empty object");
      raw = {};
    }

    // 3) Normalize + clamp to baseline
    const normalized = normalizePlan(raw, todayIso);
    const clampedDays = Math.max(normalized.estimated_days, base.estimatedDays);
    const finalPlan = PlanSchema.parse({
      ...normalized,
      estimated_days: clampedDays,
      estimated_completion_date: addDaysISO(todayIso, clampedDays),
      weekly_notes: normalized.weekly_notes.length
        ? normalized.weekly_notes
        : base.weeklyNotes,
      assumptions: normalized.assumptions.length
        ? normalized.assumptions
        : [
            "Progression rate based on conservative weekly increases; consistent training; no injuries.",
          ],
    });

    console.log("[macro] normalized + clamped plan:", finalPlan);
    return ok(finalPlan);
  } catch (err) {
    const info = safeErr(err);
    console.error("[macro] OpenAI error:", info);
    const status = info.status || 500;
    return resp(status, { error: "OpenAI request failed", details: info });
  }
}
