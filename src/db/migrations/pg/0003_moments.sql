CREATE TABLE "moment_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"title" text,
	"summary" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"occurred_precision" text DEFAULT 'day' NOT NULL,
	"start_ms" integer,
	"end_ms" integer,
	"people" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"story_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_clips" (
	"story_id" text NOT NULL,
	"media_id" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "story_clips_story_id_media_id_start_ms_pk" PRIMARY KEY("story_id","media_id","start_ms")
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "birth_date" text;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "occurred_precision" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "story_media" ADD COLUMN "transcript_segments" jsonb;--> statement-breakpoint
ALTER TABLE "moment_suggestions" ADD CONSTRAINT "moment_suggestions_media_id_story_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."story_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_suggestions" ADD CONSTRAINT "moment_suggestions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_clips" ADD CONSTRAINT "story_clips_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_clips" ADD CONSTRAINT "story_clips_media_id_story_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."story_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moment_suggestions_media_id_idx" ON "moment_suggestions" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "story_clips_media_id_idx" ON "story_clips" USING btree ("media_id");