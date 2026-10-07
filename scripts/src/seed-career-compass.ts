import {
  db,
  opportunitiesTable,
  pool,
  type InsertOpportunity,
} from "@workspace/db";

const opportunities: InsertOpportunity[] = [
  {
    id: "ssc-cgl",
    title: "SSC Combined Graduate Level",
    domain: "GOVERNMENT",
    minAge: 18,
    maxAge: 32,
    minDegree: "BACHELOR",
    allowedBranches: ["ANY"],
    requiredSkills: [
      "Quantitative aptitude",
      "English",
      "Reasoning",
      "General awareness",
    ],
    officialUrl: "https://ssc.gov.in/",
    lastUpdated: "2026-10-07",
  },
  {
    id: "rrb-ntpc",
    title: "RRB NTPC (Graduate)",
    domain: "GOVERNMENT",
    minAge: 18,
    maxAge: 33,
    minDegree: "BACHELOR",
    allowedBranches: ["ANY"],
    requiredSkills: ["Mathematics", "General awareness", "Reasoning"],
    officialUrl: "https://www.rrbcdg.gov.in/",
    lastUpdated: "2026-10-07",
  },
  {
    id: "upsc-cse",
    title: "UPSC Civil Services Examination",
    domain: "GOVERNMENT",
    minAge: 21,
    maxAge: 32,
    minDegree: "BACHELOR",
    allowedBranches: ["ANY"],
    requiredSkills: [
      "Current affairs",
      "General studies",
      "Answer writing",
      "Reasoning",
    ],
    officialUrl: "https://upsc.gov.in/",
    lastUpdated: "2026-10-07",
  },
  {
    id: "software-engineer",
    title: "Software Engineer",
    domain: "PRIVATE",
    minAge: 18,
    maxAge: null,
    minDegree: "BACHELOR",
    allowedBranches: [
      "Computer Science",
      "Information Technology",
      "Software Engineering",
      "Electronics and Communication",
    ],
    requiredSkills: [
      "JavaScript",
      "Data structures",
      "Problem solving",
      "Git",
    ],
    officialUrl: "https://careers.google.com/jobs/results/",
    lastUpdated: "2026-10-07",
  },
  {
    id: "data-analyst",
    title: "Data Analyst",
    domain: "PRIVATE",
    minAge: 18,
    maxAge: null,
    minDegree: "BACHELOR",
    allowedBranches: ["ANY"],
    requiredSkills: ["SQL", "Spreadsheets", "Data visualization", "Python"],
    officialUrl: "https://www.microsoft.com/en-us/careers",
    lastUpdated: "2026-10-07",
  },
  {
    id: "product-designer",
    title: "Product Designer",
    domain: "PRIVATE",
    minAge: 18,
    maxAge: null,
    minDegree: "BACHELOR",
    allowedBranches: ["ANY"],
    requiredSkills: [
      "User research",
      "Figma",
      "Prototyping",
      "Design systems",
    ],
    officialUrl: "https://careers.adobe.com/",
    lastUpdated: "2026-10-07",
  },
];

async function seed(): Promise<void> {
  await db.transaction(async (transaction) => {
    for (const opportunity of opportunities) {
      await transaction
        .insert(opportunitiesTable)
        .values(opportunity)
        .onConflictDoUpdate({
          target: opportunitiesTable.id,
          set: {
            ...opportunity,
          },
        });
    }
  });
  console.info(`Seeded ${opportunities.length} CareerCompass opportunities.`);
}

seed()
  .catch((error: unknown) => {
    console.error("Failed to seed CareerCompass opportunities.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
