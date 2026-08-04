CREATE TABLE "practice"."practice_state" (
    "user_id" varchar(128) PRIMARY KEY,
    "github_account_id" varchar(64) NOT NULL,
    "state" jsonb NOT NULL,
    "receipts" jsonb NOT NULL,
    "created_by" varchar(250) NOT NULL,
    "created_on" timestamptz NOT NULL,
    "updated_by" varchar(250) NOT NULL,
    "updated_on" timestamptz NOT NULL
);

CREATE INDEX "practice_state_github_account_id_idx"
    ON "practice"."practice_state" ("github_account_id");
