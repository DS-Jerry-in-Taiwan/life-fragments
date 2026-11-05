CREATE TABLE `writing_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`letter_type` text NOT NULL,
	`created` integer NOT NULL,
	`completed` integer,
	`shared` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `stories` ADD `letter_type` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `stories` ADD `mood` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `stories` ADD `reflection` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `stories` ADD `attempt` text;