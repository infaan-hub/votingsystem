import "dotenv/config";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const show = async (label, sql) => {
  const { rows } = await client.query(sql);
  console.log(`\n=== ${label} (${rows.length}) ===`);
  for (const r of rows) {
    const cleaned = {};
    for (const [k, v] of Object.entries(r)) {
      if (Buffer.isBuffer(v)) cleaned[k] = `<bytea ${v.length}B>`;
      else if (v instanceof Date) cleaned[k] = v.toISOString();
      else cleaned[k] = v;
    }
    console.log(JSON.stringify(cleaned));
  }
};

await show("departments", "SELECT * FROM votingsystem_department ORDER BY id");
await show("sections", "SELECT * FROM votingsystem_section ORDER BY id");
await show(
  "users",
  `SELECT id, username, email, first_name, last_name, role, is_superuser, is_staff, is_active,
          department_id, section_id, registration_number, staff_id, phone_number, google_id,
          auth_provider, last_login, date_joined, password
   FROM votingsystem_customuser ORDER BY id`,
);
await show("tokens", "SELECT key, created, user_id FROM authtoken_token ORDER BY user_id");
await show(
  "elections",
  `SELECT id, title, left(description,60) AS description, image, octet_length(image_data) AS image_bytes,
          image_content_type, image_filename, campaign_start_at, campaign_end_at,
          voting_start_at, voting_end_at, allow_live_results, announce_winners_automatically, is_published
   FROM votingsystem_election ORDER BY id`,
);
await show(
  "positions",
  `SELECT id, election_id, name, left(description,50) AS description, department_id, section_id,
          voter_group, max_winners FROM votingsystem_position ORDER BY id`,
);
await show(
  "candidates",
  `SELECT id, election_id, position_id, user_id, department_id, section_id, slogan,
          left(manifesto,50) AS manifesto, campaign_video, campaign_video_url,
          octet_length(campaign_video_data) AS video_bytes, campaign_video_content_type,
          campaign_video_filename, photo, octet_length(photo_data) AS photo_bytes,
          photo_content_type, photo_filename, approved, featured_order
   FROM votingsystem_candidate ORDER BY id`,
);
await show("votes", "SELECT * FROM votingsystem_vote ORDER BY id");
await show(
  "announcements",
  `SELECT id, election_id, title, left(message,60) AS message, announcement_type, publish_at, is_pinned
   FROM votingsystem_announcement ORDER BY id`,
);

await client.end();
