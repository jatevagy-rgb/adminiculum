import { Client } from 'pg';

const databaseUrl = process.env.DEMO_KFT_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Demo Kft verification queries', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query('CREATE TEMP TABLE cases (id text NOT NULL)');
    await client.query(
      'CREATE TEMP TABLE time_entries ("matterId" text NOT NULL, minutes integer NOT NULL)',
    );
    await client.query(
      'INSERT INTO cases (id) VALUES ($1), ($2), ($3)',
      ['demo-case-text-a', 'demo-case-text-b', 'demo-case-text-c'],
    );
    await client.query(
      'INSERT INTO time_entries ("matterId", minutes) VALUES ($1, $2), ($1, $3), ($2, $4)',
      ['demo-matter-text-a', 380, 310, 185],
    );
  });

  afterAll(async () => {
    await client.end();
  });

  it('executes both hosted verification queries against text IDs', async () => {
    const caseIds = ['demo-case-text-a', 'demo-case-text-b', 'demo-case-text-c'];
    const matterIds = ['demo-matter-text-a', 'demo-matter-text-b'];

    const caseCount = await client.query(
      'SELECT count(*)::int AS c FROM cases WHERE id = ANY($1::text[])',
      [caseIds],
    );
    const timeTotal = await client.query(
      'SELECT sum(minutes)::int AS m FROM time_entries WHERE "matterId" = ANY($1::text[])',
      [matterIds],
    );

    expect(caseCount.rows[0].c).toBe(3);
    expect(timeTotal.rows[0].m).toBe(875);
  });
});
