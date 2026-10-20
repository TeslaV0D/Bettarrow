CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "body_weight_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"weight_kg" numeric(6, 3) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "body_weight_entries_date_uq" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_builtin" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_secondary_muscles" (
	"exercise_id" text NOT NULL,
	"muscle_id" text NOT NULL,
	CONSTRAINT "exercise_secondary_muscles_exercise_id_muscle_id_pk" PRIMARY KEY("exercise_id","muscle_id")
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"description" text,
	"instructions" text,
	"primary_muscle_id" text NOT NULL,
	"equipment_id" text NOT NULL,
	"movement_pattern_id" text,
	"mechanic" text DEFAULT 'compound' NOT NULL,
	"tracking" text DEFAULT 'reps' NOT NULL,
	"load_mode" text DEFAULT 'external' NOT NULL,
	"bodyweight_factor" numeric(4, 3) DEFAULT 1 NOT NULL,
	"rep_min" smallint,
	"rep_max" smallint,
	"rest_seconds" integer,
	"notes" text,
	"image_path" text,
	"is_custom" boolean DEFAULT false NOT NULL,
	"is_modified" boolean DEFAULT false NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_mechanic_chk" CHECK ("exercises"."mechanic" in ('compound','isolation')),
	CONSTRAINT "exercises_tracking_chk" CHECK ("exercises"."tracking" in ('reps','duration')),
	CONSTRAINT "exercises_load_mode_chk" CHECK ("exercises"."load_mode" in ('external','bodyweight','bodyweight_plus','bodyweight_minus','none')),
	CONSTRAINT "exercises_bw_factor_chk" CHECK ("exercises"."bodyweight_factor" > 0 and "exercises"."bodyweight_factor" <= 2)
);
--> statement-breakpoint
CREATE TABLE "movement_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_builtin" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "muscle_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"region" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_builtin" boolean DEFAULT true NOT NULL,
	CONSTRAINT "muscle_groups_region_chk" CHECK ("muscle_groups"."region" in ('upper','core','lower'))
);
--> statement-breakpoint
CREATE TABLE "plan_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"template_id" uuid,
	"title" text NOT NULL,
	"weekdays" smallint[] NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_rules_kind_chk" CHECK ("plan_rules"."kind" in ('workout','rest'))
);
--> statement-breakpoint
CREATE TABLE "planned_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"template_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"moved_from" date,
	"rule_id" uuid,
	"occurrence_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planned_entries_kind_chk" CHECK ("planned_entries"."kind" in ('workout','rest')),
	CONSTRAINT "planned_entries_status_chk" CHECK ("planned_entries"."status" in ('planned','completed','skipped','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text,
	"birth_date" date,
	"sex" text,
	"height_cm" numeric(5, 1),
	"target_weight_kg" numeric(6, 3),
	"training_level" text,
	"goals" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_singleton_chk" CHECK ("profile"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"weight_unit" text DEFAULT 'kg' NOT NULL,
	"height_unit" text DEFAULT 'cm' NOT NULL,
	"week_start" smallint DEFAULT 1 NOT NULL,
	"timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"default_rest_seconds" integer DEFAULT 90 NOT NULL,
	"auto_start_rest_timer" boolean DEFAULT true NOT NULL,
	"rest_timer_sound" boolean DEFAULT true NOT NULL,
	"keep_screen_awake" boolean DEFAULT true NOT NULL,
	"effort_metric" text DEFAULT 'rir' NOT NULL,
	"default_bodyweight_mode" text DEFAULT 'bodyweight_plus' NOT NULL,
	"bodyweight_in_volume" boolean DEFAULT true NOT NULL,
	"secondary_muscle_weight" numeric(3, 2) DEFAULT 0.5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton_chk" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_week_start_chk" CHECK ("settings"."week_start" between 1 and 7),
	CONSTRAINT "settings_secondary_weight_chk" CHECK ("settings"."secondary_muscle_weight" >= 0 and "settings"."secondary_muscle_weight" <= 1)
);
--> statement-breakpoint
CREATE TABLE "template_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"position" integer NOT NULL,
	"target_sets" smallint DEFAULT 3 NOT NULL,
	"rep_min" smallint,
	"rep_max" smallint,
	"rest_seconds" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workout_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"position" integer NOT NULL,
	"notes" text,
	"rest_seconds" integer,
	"tracking" text DEFAULT 'reps' NOT NULL,
	"load_mode" text DEFAULT 'external' NOT NULL,
	"bodyweight_factor" numeric(4, 3) DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workout_exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"set_type" text DEFAULT 'working' NOT NULL,
	"weight_kg" numeric(7, 3),
	"reps" smallint,
	"duration_seconds" integer,
	"rir" numeric(3, 1),
	"rpe" numeric(3, 1),
	"note" text,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"bodyweight_kg" numeric(6, 3),
	"load_kg" numeric(7, 3),
	CONSTRAINT "workout_sets_type_chk" CHECK ("workout_sets"."set_type" in ('warmup','working','dropset','failure')),
	CONSTRAINT "workout_sets_reps_chk" CHECK ("workout_sets"."reps" is null or "workout_sets"."reps" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"template_id" uuid,
	"planned_entry_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"paused_seconds" integer DEFAULT 0 NOT NULL,
	"local_date" date NOT NULL,
	"bodyweight_kg" numeric(6, 3),
	"notes" text,
	"revision" bigint DEFAULT 0 NOT NULL,
	"sync_device_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workouts_status_chk" CHECK ("workouts"."status" in ('active','completed','discarded'))
);
--> statement-breakpoint
ALTER TABLE "exercise_secondary_muscles" ADD CONSTRAINT "exercise_secondary_muscles_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_secondary_muscles" ADD CONSTRAINT "exercise_secondary_muscles_muscle_id_muscle_groups_id_fk" FOREIGN KEY ("muscle_id") REFERENCES "public"."muscle_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_primary_muscle_id_muscle_groups_id_fk" FOREIGN KEY ("primary_muscle_id") REFERENCES "public"."muscle_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_movement_pattern_id_movement_patterns_id_fk" FOREIGN KEY ("movement_pattern_id") REFERENCES "public"."movement_patterns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muscle_groups" ADD CONSTRAINT "muscle_groups_parent_id_muscle_groups_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."muscle_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_rules" ADD CONSTRAINT "plan_rules_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_entries" ADD CONSTRAINT "planned_entries_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_entries" ADD CONSTRAINT "planned_entries_rule_id_plan_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."plan_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_workout_exercise_id_workout_exercises_id_fk" FOREIGN KEY ("workout_exercise_id") REFERENCES "public"."workout_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_planned_entry_id_planned_entries_id_fk" FOREIGN KEY ("planned_entry_id") REFERENCES "public"."planned_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "exercise_secondary_muscles_muscle_idx" ON "exercise_secondary_muscles" USING btree ("muscle_id");--> statement-breakpoint
CREATE INDEX "exercises_primary_muscle_idx" ON "exercises" USING btree ("primary_muscle_id");--> statement-breakpoint
CREATE INDEX "exercises_equipment_idx" ON "exercises" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "planned_entries_date_idx" ON "planned_entries" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "planned_entries_rule_occurrence_uq" ON "planned_entries" USING btree ("rule_id","occurrence_date");--> statement-breakpoint
CREATE INDEX "template_exercises_template_idx" ON "template_exercises" USING btree ("template_id","position");--> statement-breakpoint
CREATE INDEX "template_exercises_exercise_idx" ON "template_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "workout_exercises_workout_idx" ON "workout_exercises" USING btree ("workout_id","position");--> statement-breakpoint
CREATE INDEX "workout_exercises_exercise_idx" ON "workout_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "workout_sets_we_idx" ON "workout_sets" USING btree ("workout_exercise_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "workouts_single_active_uq" ON "workouts" USING btree ("status") WHERE "workouts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "workouts_status_date_idx" ON "workouts" USING btree ("status","local_date");--> statement-breakpoint
CREATE INDEX "workouts_started_idx" ON "workouts" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "workouts_planned_entry_idx" ON "workouts" USING btree ("planned_entry_id");