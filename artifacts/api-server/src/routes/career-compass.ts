import { GoogleGenAI } from "@google/genai";
import {
  GetAiMatchBody,
  GetAiMatchResponse,
  GetProfileParams,
  GetProfileResponse,
  ListOpportunitiesResponse,
  SaveProfileBody,
  SaveProfileParams,
  SaveProfileResponse,
  SendAiChatBody,
  SendAiChatResponse,
  CheckEligibilityBody,
  CheckEligibilityResponse,
} from "@workspace/api-zod";
import { db, opportunitiesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { checkEligibility } from "../lib/eligibility";

const router: IRouter = Router();

function getGemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }
  return new GoogleGenAI({ apiKey });
}

async function loadContext(profileId: string, opportunityId: string) {
  const [profile] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, profileId))
    .limit(1);
  const [opportunity] = await db
    .select()
    .from(opportunitiesTable)
    .where(eq(opportunitiesTable.id, opportunityId))
    .limit(1);

  return { profile, opportunity };
}

function parseModelJson(text: string): unknown {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(clean) as unknown;
}

router.get("/opportunities", async (_req, res): Promise<void> => {
  const opportunities = await db
    .select()
    .from(opportunitiesTable)
    .orderBy(opportunitiesTable.domain, opportunitiesTable.title);
  res.json(ListOpportunitiesResponse.parse(opportunities));
});

router.get("/profiles/:profileId", async (req, res): Promise<void> => {
  const params = GetProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [profile] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.profileId))
    .limit(1);
  if (!profile) {
    res.json(null);
    return;
  }

  res.json(
    GetProfileResponse.parse({
      profileId: profile.id,
      age: profile.age,
      category: profile.category,
      degree: profile.degree,
      branch: profile.branch,
      skills: profile.skills,
      dailyHours: profile.dailyHours,
      updatedAt: profile.updatedAt.toISOString(),
    }),
  );
});

router.put("/profiles/:profileId", async (req, res): Promise<void> => {
  const params = SaveProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SaveProfileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const profileValues = {
    ...body.data,
    id: params.data.profileId,
    dailyHours: body.data.dailyHours,
    email: null,
    updatedAt: new Date(),
  };
  const [profile] = await db
    .insert(usersTable)
    .values(profileValues)
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        ...body.data,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(
    SaveProfileResponse.parse({
      profileId: profile.id,
      age: profile.age,
      category: profile.category,
      degree: profile.degree,
      branch: profile.branch,
      skills: profile.skills,
      dailyHours: profile.dailyHours,
      updatedAt: profile.updatedAt.toISOString(),
    }),
  );
});

router.post("/eligibility/check", async (req, res): Promise<void> => {
  const body = CheckEligibilityBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { profile, opportunity } = await loadContext(
    body.data.profileId,
    body.data.opportunityId,
  );
  if (!profile || !opportunity) {
    res.status(404).json({
      error: !profile ? "Profile not found" : "Opportunity not found",
    });
    return;
  }

  const result = checkEligibility(profile, opportunity);
  res.json(
    CheckEligibilityResponse.parse({
      profileId: profile.id,
      opportunityId: opportunity.id,
      ...result,
    }),
  );
});

router.post("/ai/match", async (req, res): Promise<void> => {
  const body = GetAiMatchBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { profile, opportunity } = await loadContext(
    body.data.profileId,
    body.data.opportunityId,
  );
  if (!profile || !opportunity) {
    res.status(404).json({
      error: !profile ? "Profile not found" : "Opportunity not found",
    });
    return;
  }

  try {
    const response = await getGemini().models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: JSON.stringify({
                task: "Estimate how closely this candidate's listed skills and profile align with this opportunity. Return JSON only with matchPercentage (integer 0-100), summary (one concise sentence), and top3Gaps (array of up to 3 concrete skill gaps). Only cite gaps derived from requiredSkills. Do not invent eligibility rules or claim an official hiring/exam decision. This estimate is career guidance, not eligibility.",
                profile: {
                  age: profile.age,
                  category: profile.category,
                  degree: profile.degree,
                  branch: profile.branch,
                  skills: profile.skills,
                },
                opportunity: {
                  title: opportunity.title,
                  domain: opportunity.domain,
                  minAge: opportunity.minAge,
                  maxAge: opportunity.maxAge,
                  minDegree: opportunity.minDegree,
                  allowedBranches: opportunity.allowedBranches,
                  requiredSkills: opportunity.requiredSkills,
                },
              }),
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsed = GetAiMatchResponse.parse(
      parseModelJson(response.text ?? ""),
    );
    parsed.matchPercentage = Math.max(
      0,
      Math.min(100, Math.round(parsed.matchPercentage)),
    );
    res.json(parsed);
  } catch (error) {
    req.log.error({ err: error }, "Career profile match request failed");
    res.status(502).json({ error: "AI matching is temporarily unavailable." });
  }
});

router.post("/ai/chat", async (req, res): Promise<void> => {
  const body = SendAiChatBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { profile, opportunity } = await loadContext(
    body.data.profileId,
    body.data.opportunityId,
  );
  if (!profile || !opportunity) {
    res.status(404).json({
      error: !profile ? "Profile not found" : "Opportunity not found",
    });
    return;
  }

  try {
    const response = await getGemini().models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        ...(body.data.history ?? []).slice(-6).map((turn) => ({
          role: turn.role === "assistant" ? ("model" as const) : ("user" as const),
          parts: [{ text: turn.content.slice(0, 1500) }],
        })),
        { role: "user", parts: [{ text: body.data.message }] },
      ],
      config: {
        systemInstruction: [
          "You are CareerCompass AI, a concise career and exam assistant.",
          "Answer in 2-3 short sentences maximum. Ground every claim in the supplied profile and opportunity. Do not invent current vacancies, eligibility rules, cutoff dates, or official notices. For official requirements, direct the user to the opportunity's official URL. Make clear that advice is not an official eligibility decision.",
          `Candidate profile: ${JSON.stringify({
            age: profile.age,
            category: profile.category,
            degree: profile.degree,
            branch: profile.branch,
            skills: profile.skills,
            dailyHours: profile.dailyHours,
          })}`,
          `Selected opportunity: ${JSON.stringify({
            title: opportunity.title,
            domain: opportunity.domain,
            minAge: opportunity.minAge,
            maxAge: opportunity.maxAge,
            minDegree: opportunity.minDegree,
            allowedBranches: opportunity.allowedBranches,
            requiredSkills: opportunity.requiredSkills,
            officialUrl: opportunity.officialUrl,
          })}`,
        ].join("\n"),
      },
    });

    res.json(
      SendAiChatResponse.parse({
        reply: (response.text ?? "").trim(),
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Career assistant request failed");
    res.status(502).json({ error: "Career guidance is temporarily unavailable." });
  }
});

export default router;
