import { DuckDBInstance } from "@duckdb/node-api";
import { createClient } from "@sanity/client";

const YEARS = [2019, 2020, 2021, 2022, 2023, 2024];

const PRIMARY_FUNDER_EINS = ["205205488", "362167000"]; // SVCF, Chicago Community Trust
const INTERMEDIARY_EINS = ["110303001", "311640316"]; // Fidelity Charitable, Schwab Charitable

const HOP1_LIMIT_PER_FUNDER = 20;
const HOP2_LIMIT_PER_FUNDER = 12;

interface GrantRow {
  funder_ein: string;
  funder_name: string;
  funder_state: string | null;
  recipient_ein_resolved: string;
  recipient_bmf_name: string | null;
  recipient_name_raw: string | null;
  recipient_state: string | null;
  recipient_ntee_code: string | null;
  recipient_subsection_code: string | null;
  amount_usd: bigint;
  tax_year: number;
  grant_purpose: string | null;
  match_confidence: number;
  match_tier: string;
  object_id: string;
}

interface OrganizationDoc {
  _type: "organization";
  ein: string;
  name: string;
  state?: string;
  nteeCode?: string;
  subsectionCode?: string;
}

function parquetUrls(): string[] {
  return YEARS.map(
    (year) =>
      `https://data.opengrants.io/funder-graph/2026.09.0/grants/filing_year=${year}/part-0000.parquet`
  );
}

async function fetchGrantsForFunders(
  connection: Awaited<ReturnType<Awaited<ReturnType<typeof DuckDBInstance.create>>["connect"]>>,
  funderEins: string[],
  limitPerFunder: number
): Promise<GrantRow[]> {
  const urls = parquetUrls().map((u) => `'${u}'`).join(", ");
  const eins = funderEins.map((e) => `'${e}'`).join(", ");

  const query = `
    SELECT * FROM (
      SELECT
        funder_ein, funder_name, funder_state,
        recipient_ein_resolved, recipient_bmf_name, recipient_name_raw,
        recipient_state, recipient_ntee_code, recipient_subsection_code,
        amount_usd, tax_year, grant_purpose, match_confidence, match_tier, object_id,
        row_number() OVER (PARTITION BY funder_ein ORDER BY amount_usd DESC) AS rn
      FROM read_parquet([${urls}], hive_partitioning = 1)
      WHERE funder_ein IN (${eins})
        AND amount_type = 'paid'
        AND match_tier IN ('A', 'B')
        AND recipient_ein_resolved IS NOT NULL
        AND recipient_name_raw NOT ILIKE '%VARIOUS ORGANIZATION%'
    )
    WHERE rn <= ${limitPerFunder}
    ORDER BY funder_ein, amount_usd DESC;
  `;

  const reader = await connection.runAndReadAll(query);
  return reader.getRowObjects() as unknown as GrantRow[];
}

function buildOrganizations(rows: GrantRow[]): Map<string, OrganizationDoc> {
  const orgs = new Map<string, OrganizationDoc>();

  for (const row of rows) {
    if (!orgs.has(row.funder_ein)) {
      orgs.set(row.funder_ein, {
        _type: "organization",
        ein: row.funder_ein,
        name: row.funder_name,
        state: row.funder_state ?? undefined,
      });
    }

    const recipientName = row.recipient_bmf_name || row.recipient_name_raw || "Unknown";
    const existing = orgs.get(row.recipient_ein_resolved);
    if (!existing) {
      orgs.set(row.recipient_ein_resolved, {
        _type: "organization",
        ein: row.recipient_ein_resolved,
        name: recipientName,
        state: row.recipient_state ?? undefined,
        nteeCode: row.recipient_ntee_code ?? undefined,
        subsectionCode: row.recipient_subsection_code ?? undefined,
      });
    } else if (!existing.nteeCode && row.recipient_ntee_code) {
      existing.nteeCode = row.recipient_ntee_code;
      existing.subsectionCode = row.recipient_subsection_code ?? undefined;
    }
  }

  return orgs;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  await connection.run("INSTALL httpfs");
  await connection.run("LOAD httpfs");

  console.log("Fetching hop 1 (primary funders)...");
  const hop1 = await fetchGrantsForFunders(connection, PRIMARY_FUNDER_EINS, HOP1_LIMIT_PER_FUNDER);

  console.log("Fetching hop 2 (intermediaries' own outbound grants)...");
  const hop2 = await fetchGrantsForFunders(connection, INTERMEDIARY_EINS, HOP2_LIMIT_PER_FUNDER);

  const allRows = [...hop1, ...hop2];
  const organizations = buildOrganizations(allRows);

  console.log(`hop1 grants: ${hop1.length}`);
  console.log(`hop2 grants: ${hop2.length}`);
  console.log(`total grants: ${allRows.length}`);
  console.log(`unique organizations: ${organizations.size}`);
  console.log(`total documents: ${allRows.length + organizations.size}`);

  if (dryRun) {
    console.log("\n--dry-run: no documents written to Sanity.");
    return;
  }

  const projectId = process.env.SANITY_PROJECT_ID;
  const dataset = process.env.SANITY_DATASET;
  const token = process.env.SANITY_WRITE_TOKEN;

  if (!projectId || !dataset || !token) {
    throw new Error(
      "Missing required environment variable: SANITY_PROJECT_ID, SANITY_DATASET, or SANITY_WRITE_TOKEN"
    );
  }

  const client = createClient({
    projectId,
    dataset,
    token,
    apiVersion: "2026-09-28",
    useCdn: false,
  });

  console.log("\nWriting organizations...");
  let orgTransaction = client.transaction();
  for (const org of organizations.values()) {
    orgTransaction = orgTransaction.create(org);
  }
  await orgTransaction.commit();

  // Correlate by the `ein` field rather than by `commit()`'s results array
  // order: that array is not returned in submission order (verified
  // empirically — it does not match _createdAt order for a 40-item batch).
  const eins = [...organizations.keys()];
  const createdOrgs: { _id: string; ein: string }[] = await client.fetch(
    `*[_type == "organization" && ein in $eins]{_id, ein}`,
    { eins }
  );
  const einToDocId = new Map<string, string>();
  for (const org of createdOrgs) {
    einToDocId.set(org.ein, org._id);
  }
  console.log(`Created ${createdOrgs.length} organization documents.`);

  console.log("Writing grants...");
  let grantTransaction = client.transaction();
  for (const row of allRows) {
    const funderId = einToDocId.get(row.funder_ein);
    const recipientId = einToDocId.get(row.recipient_ein_resolved);
    if (!funderId || !recipientId) continue;

    grantTransaction = grantTransaction.create({
      _type: "grant",
      funder: { _type: "reference", _ref: funderId },
      recipient: { _type: "reference", _ref: recipientId },
      amountUsd: Number(row.amount_usd),
      amountType: "paid",
      taxYear: row.tax_year,
      grantPurpose: row.grant_purpose ?? undefined,
      matchConfidence: row.match_confidence,
      matchTier: row.match_tier,
      sourceObjectId: row.object_id,
    });
  }
  const grantResult = await grantTransaction.commit();
  console.log(`Created ${grantResult.results.length} grant documents.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
