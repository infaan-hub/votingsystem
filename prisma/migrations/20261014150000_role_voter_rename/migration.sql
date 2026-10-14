-- Platform roles collapse to exactly three: voter, officer, admin.
-- Legacy "student" and "staff" accounts both become voters.
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'voter';
UPDATE "User" SET role = 'voter' WHERE role IN ('student', 'staff');
