CREATE TABLE `consent_events` (
	`id` integer PRIMARY KEY NOT NULL,
	`story` text NOT NULL,
	`action` text NOT NULL,
	`consent_version` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `consent_events_story_idx` ON `consent_events` (`story`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `last_seen` integer;--> statement-breakpoint
ALTER TABLE `stories` ADD `approved_at` integer;--> statement-breakpoint
ALTER TABLE `stories` ADD `status_at` integer;--> statement-breakpoint
-- Backfills (hand-written; #4 V3-a). The real approval and status-change
-- times of existing rows are unknown, so they start from `created`.
UPDATE `sessions` SET `last_seen` = `created` WHERE `last_seen` IS NULL;--> statement-breakpoint
UPDATE `stories` SET `status_at` = `created` WHERE `status_at` IS NULL;--> statement-breakpoint
UPDATE `stories` SET `approved_at` = `created` WHERE `status` = 'approved' AND `approved_at` IS NULL;--> statement-breakpoint
-- One 'submit' event per existing story. `consent` is "<version>:<flags>"
-- (lib/server/db/stories.ts); a value without ':' is kept whole.
INSERT INTO `consent_events` (`story`, `action`, `consent_version`, `created`)
SELECT `id`, 'submit',
  CASE WHEN instr(`consent`, ':') > 0 THEN substr(`consent`, 1, instr(`consent`, ':') - 1) ELSE `consent` END,
  `created`
FROM `stories` ORDER BY `created`, `id`;
