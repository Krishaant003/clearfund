import { DuckDBInstance } from "@duckdb/node-api";

const YEARS = [2023, 2024];
const parquetUrls = YEARS.map(
  (year) =>
    `https://data.opengrants.io/funder-graph/2026.09.0/grants/filing_year=${year}/part-0000.parquet`
);

async function main() {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  await connection.run("INSTALL httpfs");
  await connection.run("LOAD httpfs");

  const query = `
    SELECT funder_ein, funder_name, recipient_name_raw, recipient_ein_resolved,
           recipient_state, amount_usd, tax_year, grant_purpose,
           match_confidence, match_tier, object_id
    FROM read_parquet(
      [${parquetUrls.map((url) => `'${url}'`).join(", ")}],
      hive_partitioning = 1
    )
    WHERE funder_ein = '205205488'
      AND amount_type = 'paid'
      AND match_tier IN ('A', 'B')
    ORDER BY amount_usd DESC
    LIMIT 50;
  `;

  const reader = await connection.runAndReadAll(query);
  const rows = reader.getRowObjects();

  console.log(`Fetched ${rows.length} rows for Silicon Valley Community Foundation`);
  console.table(rows.slice(0, 5));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
