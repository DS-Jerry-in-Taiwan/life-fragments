ALTER TABLE `consent_events` ADD `owner` text;--> statement-breakpoint
CREATE INDEX `consent_events_owner_idx` ON `consent_events` (`owner`,`created`);