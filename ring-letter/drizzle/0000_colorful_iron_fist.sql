CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`story` text NOT NULL,
	`kind` text NOT NULL,
	`note` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`era` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`consent` text NOT NULL,
	`created` integer NOT NULL
);
