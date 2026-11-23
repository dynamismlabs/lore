CREATE TABLE `moment_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`title` text,
	`summary` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`occurred_precision` text DEFAULT 'day' NOT NULL,
	`start_ms` integer,
	`end_ms` integer,
	`people` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`story_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `story_media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `moment_suggestions_media_id_idx` ON `moment_suggestions` (`media_id`);--> statement-breakpoint
CREATE TABLE `story_clips` (
	`story_id` text NOT NULL,
	`media_id` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`story_id`, `media_id`, `start_ms`),
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `story_media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `story_clips_media_id_idx` ON `story_clips` (`media_id`);--> statement-breakpoint
ALTER TABLE `people` ADD `birth_date` text;--> statement-breakpoint
ALTER TABLE `stories` ADD `occurred_precision` text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE `story_media` ADD `transcript_segments` text;