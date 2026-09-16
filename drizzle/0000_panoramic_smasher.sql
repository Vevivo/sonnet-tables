CREATE TABLE `sonnet_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sonnet_cursors` (
	`room` text PRIMARY KEY NOT NULL,
	`generation` integer NOT NULL,
	`seq` integer NOT NULL,
	`first_seq` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sonnet_records` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`generation` integer NOT NULL,
	`seq` integer NOT NULL,
	`body` text NOT NULL,
	`ts` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sonnet_records_room_generation` ON `sonnet_records` (`room`,`generation`);