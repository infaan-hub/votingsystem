import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

// Restores production data from the legacy Django backup into the Prisma
// tables. Skips temp test accounts. Run against an EMPTY database (or after
// `prisma migrate reset`).
//
//   node scripts/restore-production.mjs [path-to-backup.sql]

const DRY = process.argv.includes("--dry-run");
const SKIP_USERNAMES = /^tempadmin/;

const backupArg = process.argv.find((a) => a.endsWith(".sql") && !a.startsWith("--"));
const file = backupArg
  ? path.resolve(backupArg)
  : (() => {
      const dir = path.resolve("backups");
      const list = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith("legacy-") && f.endsWith(".sql"))
        .sort()
        .reverse();
      if (list.length === 0) throw new Error(`No legacy-*.sql backup in ${dir}`);
      return path.join(dir, list[0]);
    })();

console.log(`Restoring from ${file}\n`);
const sql = fs.readFileSync(file, "utf8");

// Parse INSERT INTO "table" ("col", ...) VALUES (...);
// Values are already SQL literals; we hand them to Postgres as-is.
const inserts = [];
const re = /^INSERT INTO "([^"]+)" \(([^)]+)\) VALUES \((.*)\);$/gm;
let m;
while ((m = re.exec(sql)) !== null) {
  inserts.push({ table: m[1], cols: m[2], values: m[3] });
}

function splitValues(raw) {
  const out = [];
  let cur = "";
  let inStr = false;
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      cur += ch;
      if (ch === "'") {
        if (raw[i + 1] === "'") { cur += raw[++i]; continue; }
        inStr = false;
      }
      continue;
    }
    if (ch === "'") { inStr = true; cur += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseRow(colsRaw, valuesRaw) {
  const cols = colsRaw.match(/"[^"]+"/g).map((c) => c.slice(1, -1));
  const vals = splitValues(valuesRaw);
  if (cols.length !== vals.length) {
    throw new Error(`Column/value mismatch: ${cols.length} cols vs ${vals.length} vals`);
  }
  const row = {};
  cols.forEach((c, i) => { row[c] = vals[i]; });
  return row;
}

const byTable = new Map();
for (const ins of inserts) {
  if (!byTable.has(ins.table)) byTable.set(ins.table, []);
  byTable.get(ins.table).push(parseRow(ins.cols, ins.values));
}

// ---- mapping helpers -------------------------------------------------------

const T = (v) => (v === undefined ? "NULL" : v);                       // passthrough literal
const DT = (v) => (v === undefined || v === "NULL" ? "NULL" : T(v));   // datetime literal
const B = (v) => (v === undefined || v === "NULL" || v === "''" ? "NULL" : T(v)); // text/bytea
const I = (v) => (v === undefined || v === "NULL" ? "NULL" : T(v));     // int literal
const BOOL = (v) => (v === undefined || v === "NULL" ? "NULL" : T(v));

function toUser(r) {
  if (SKIP_USERNAMES.test(r.username.replace(/^'|'$/g, ""))) return null;
  return {
    id: r.id, password: r.password ?? "''", lastLogin: DT(r.last_login),
    isSuperuser: BOOL(r.is_superuser), username: r.username,
    firstName: r.first_name ?? "''", lastName: r.last_name ?? "''",
    email: r.email ?? "''", isStaff: BOOL(r.is_staff), isActive: BOOL(r.is_active),
    dateJoined: DT(r.date_joined), role: r.role ?? "'student'",
    departmentId: I(r.department_id), sectionId: I(r.section_id),
    registrationNumber: r.registration_number ?? "''", staffId: r.staff_id ?? "''",
    phoneNumber: r.phone_number ?? "''", googleId: B(r.google_id),
    authProvider: r.auth_provider ?? "'local'",
  };
}
const USER_COLS = ["id","password","lastLogin","isSuperuser","username","firstName","lastName","email","isStaff","isActive","dateJoined","role","departmentId","sectionId","registrationNumber","staffId","phoneNumber","googleId","authProvider"];

function toToken(r, validUserIds) {
  const uid = r.user_id;
  if (!validUserIds.has(uid)) return null; // token belonged to a temp user
  return { key: r.key, created: DT(r.created), userId: uid };
}
const TOKEN_COLS = ["key", "created", "userId"];

function toElection(r) {
  return {
    id: r.id, title: r.title, description: r.description ?? "''",
    image: B(r.image), imageBytes: B(r.image_data),
    imageContentType: r.image_content_type ?? "''", imageFilename: r.image_filename ?? "''",
    campaignStartAt: DT(r.campaign_start_at), campaignEndAt: DT(r.campaign_end_at),
    votingStartAt: DT(r.voting_start_at), votingEndAt: DT(r.voting_end_at),
    allowLiveResults: BOOL(r.allow_live_results),
    announceWinnersAutomatically: BOOL(r.announce_winners_automatically),
    isPublished: BOOL(r.is_published),
    createdAt: DT(r.created_at), updatedAt: DT(r.updated_at),
  };
}
const ELECTION_COLS = ["id","title","description","image","imageBytes","imageContentType","imageFilename","campaignStartAt","campaignEndAt","votingStartAt","votingEndAt","allowLiveResults","announceWinnersAutomatically","isPublished","createdAt","updatedAt"];

function toPosition(r) {
  return {
    id: r.id, electionId: r.election_id, name: r.name,
    description: r.description ?? "''", departmentId: I(r.department_id),
    sectionId: I(r.section_id), voterGroup: r.voter_group ?? "'all'",
    maxWinners: r.max_winners ?? "1", createdAt: DT(r.created_at), updatedAt: DT(r.updated_at),
  };
}
const POSITION_COLS = ["id","electionId","name","description","departmentId","sectionId","voterGroup","maxWinners","createdAt","updatedAt"];

function toCandidate(r) {
  return {
    id: r.id, electionId: r.election_id, positionId: r.position_id, userId: r.user_id,
    departmentId: I(r.department_id), sectionId: I(r.section_id),
    slogan: r.slogan ?? "''", manifesto: r.manifesto ?? "''",
    campaignVideo: B(r.campaign_video), campaignVideoUrl: r.campaign_video_url ?? "''",
    campaignVideoBytes: B(r.campaign_video_data),
    campaignVideoContentType: r.campaign_video_content_type ?? "''",
    campaignVideoFilename: r.campaign_video_filename ?? "''",
    photo: B(r.photo), photoBytes: B(r.photo_data),
    photoContentType: r.photo_content_type ?? "''", photoFilename: r.photo_filename ?? "''",
    approved: BOOL(r.approved), featuredOrder: r.featured_order ?? "0",
    createdAt: DT(r.created_at), updatedAt: DT(r.updated_at),
  };
}
const CANDIDATE_COLS = ["id","electionId","positionId","userId","departmentId","sectionId","slogan","manifesto","campaignVideo","campaignVideoUrl","campaignVideoBytes","campaignVideoContentType","campaignVideoFilename","photo","photoBytes","photoContentType","photoFilename","approved","featuredOrder","createdAt","updatedAt"];

function toAnnouncement(r) {
  return {
    id: r.id, electionId: I(r.election_id), title: r.title, message: r.message,
    announcementType: r.announcement_type ?? "'notice'",
    publishAt: DT(r.publish_at), isPinned: BOOL(r.is_pinned),
    createdAt: DT(r.created_at), updatedAt: DT(r.updated_at),
  };
}
const ANNOUNCEMENT_COLS = ["id","electionId","title","message","announcementType","publishAt","isPinned","createdAt","updatedAt"];

// ---- build the restore plan -----------------------------------------------

const users = (byTable.get("votingsystem_customuser") ?? []).map(toUser).filter(Boolean);
const userIdSet = new Set(users.map((u) => u.id));
const skippedUsers = (byTable.get("votingsystem_customuser") ?? []).length - users.length;

const tokens = (byTable.get("authtoken_token") ?? []).map((r) => toToken(r, userIdSet)).filter(Boolean);
const elections = (byTable.get("votingsystem_election") ?? []).map(toElection);
const positions = (byTable.get("votingsystem_position") ?? []).map(toPosition);
const candidates = (byTable.get("votingsystem_candidate") ?? []).map(toCandidate);
const announcements = (byTable.get("votingsystem_announcement") ?? []).map(toAnnouncement);

console.log(`Plan: ${users.length} users (${skippedUsers} temp skipped), ${tokens.length} tokens, ` +
  `${elections.length} elections, ${positions.length} positions, ${candidates.length} candidates, ` +
  `${announcements.length} announcements`);

if (DRY) {
  for (const u of users) console.log(`  user ${u.id} ${u.username} role=${u.role}`);
  process.exit(0);
}

// ---- write it --------------------------------------------------------------

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// Clear any leftover test fixtures so the restore lands on a clean slate.
// FK-safe order: children first. _prisma_migrations is untouched.
const CLEAR_ORDER = ["Vote", "Candidate", "Announcement", "Position", "Token", "User", "Election", "Section", "Department"];
for (const t of CLEAR_ORDER) {
  const { rowCount } = await client.query(`DELETE FROM "${t}"`);
  if (rowCount) console.log(`  cleared ${t}: ${rowCount} rows`);
}

const ins = async (table, cols, rows) => {
  if (rows.length === 0) return;
  const colList = cols.map((c) => `"${c}"`).join(", ");
  for (const r of rows) {
    const vals = cols.map((c) => r[c] ?? "NULL").join(", ");
    try {
      await client.query(`INSERT INTO "${table}" (${colList}) VALUES (${vals})`);
    } catch (e) {
      console.error(`  FAILED ${table}: ${e.message}`);
      throw e;
    }
  }
  console.log(`  ${table}: ${rows.length} rows`);
};

await ins("User", USER_COLS, users);
await ins("Token", TOKEN_COLS, tokens);
await ins("Election", ELECTION_COLS, elections);
await ins("Position", POSITION_COLS, positions);
await ins("Candidate", CANDIDATE_COLS, candidates);
await ins("Announcement", ANNOUNCEMENT_COLS, announcements);

// verify
const counts = {};
for (const t of ["User","Token","Election","Position","Candidate","Vote","Announcement","Department","Section"]) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM "${t}"`);
  counts[t] = rows[0].n;
}
console.log("\nRestored counts:");
for (const [t, n] of Object.entries(counts)) console.log(`  ${t}: ${n}`);

await client.end();
