CREATE TYPE "public"."account_type" AS ENUM('cash', 'bank', 'ewallet', 'savings', 'credit');--> statement-breakpoint
CREATE TYPE "public"."alert_rule" AS ENUM('budget_approaching', 'budget_exceeded', 'spending_pace', 'obligations_exceed_funds', 'below_safety_buffer', 'purchase_shortfall', 'uncertain_income_risk', 'goal_off_track');--> statement-breakpoint
CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('active', 'dismissed', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('confirmed', 'likely', 'uncertain');--> statement-breakpoint
CREATE TYPE "public"."event_direction" AS ENUM('inflow', 'outflow');--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('expense', 'bill', 'purchase', 'salary', 'freelance', 'contract', 'income');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('planned', 'committed', 'recurring', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."goal_kind" AS ENUM('emergency', 'investment', 'vehicle', 'electronics', 'travel', 'custom');--> statement-breakpoint
CREATE TYPE "public"."month_end_rule" AS ENUM('clamp', 'last_day');--> statement-breakpoint
CREATE TYPE "public"."occurrence_action" AS ENUM('skip', 'reschedule', 'paid', 'amount');--> statement-breakpoint
CREATE TYPE "public"."recurrence_frequency" AS ENUM('none', 'daily', 'weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."sync_op" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense', 'transfer', 'refund', 'adjustment');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"opening_balance" bigint DEFAULT 0 NOT NULL,
	"opening_date" date NOT NULL,
	"color" text,
	"icon" text,
	"archived_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_id_user_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rule" "alert_rule" NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"fingerprint" text NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"amount" bigint,
	"affected_date" date,
	"suggestion" text NOT NULL,
	"subject_id" text,
	"status" "alert_status" DEFAULT 'active' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "alerts_user_fingerprint_unique" UNIQUE("user_id","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid,
	"amount" bigint NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_amount_positive" CHECK ("budgets"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"color" text,
	"icon" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_id_user_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "goal_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"allocated_on" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_allocations_amount_nonzero" CHECK ("goal_allocations"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "goal_kind" NOT NULL,
	"target_amount" bigint NOT NULL,
	"target_date" date,
	"monthly_contribution" bigint,
	"account_id" uuid,
	"archived_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "goals_target_positive" CHECK ("goals"."target_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "occurrence_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"action" "occurrence_action" NOT NULL,
	"new_date" date,
	"amount" bigint,
	"transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_overrides_event_date_unique" UNIQUE("event_id","occurrence_date"),
	CONSTRAINT "occurrence_overrides_reschedule_has_date" CHECK ("occurrence_overrides"."action" <> 'reschedule' OR "occurrence_overrides"."new_date" IS NOT NULL),
	CONSTRAINT "occurrence_overrides_amount_has_amount" CHECK ("occurrence_overrides"."action" <> 'amount' OR "occurrence_overrides"."amount" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "scheduled_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"direction" "event_direction" NOT NULL,
	"kind" "event_kind" NOT NULL,
	"status" "event_status" DEFAULT 'planned' NOT NULL,
	"amount" bigint NOT NULL,
	"amount_min" bigint,
	"amount_max" bigint,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"confidence" "confidence_level" DEFAULT 'confirmed' NOT NULL,
	"account_id" uuid,
	"category_id" uuid,
	"start_date" date NOT NULL,
	"frequency" "recurrence_frequency" DEFAULT 'none' NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"day_of_month" integer,
	"second_day_of_month" integer,
	"month_end_rule" "month_end_rule" DEFAULT 'clamp' NOT NULL,
	"end_date" date,
	"occurrence_count" integer,
	"installments" integer,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_events_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "scheduled_events_amount_positive" CHECK ("scheduled_events"."amount" > 0),
	CONSTRAINT "scheduled_events_range_valid" CHECK (("scheduled_events"."amount_min" IS NULL OR "scheduled_events"."amount_min" <= "scheduled_events"."amount") AND ("scheduled_events"."amount_max" IS NULL OR "scheduled_events"."amount_max" >= "scheduled_events"."amount")),
	CONSTRAINT "scheduled_events_interval_positive" CHECK ("scheduled_events"."interval" >= 1),
	CONSTRAINT "scheduled_events_installments_valid" CHECK ("scheduled_events"."installments" IS NULL OR "scheduled_events"."installments" >= 2),
	CONSTRAINT "scheduled_events_end_after_start" CHECK ("scheduled_events"."end_date" IS NULL OR "scheduled_events"."end_date" >= "scheduled_events"."start_date")
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"op" "sync_op" NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" bigint NOT NULL,
	"account_id" uuid NOT NULL,
	"counter_account_id" uuid,
	"category_id" uuid,
	"occurred_on" date NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"scheduled_event_id" uuid,
	"occurrence_date" date,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "transactions_amount_sign" CHECK (("transactions"."type" = 'adjustment' AND "transactions"."amount" <> 0) OR ("transactions"."type" <> 'adjustment' AND "transactions"."amount" > 0)),
	CONSTRAINT "transactions_transfer_shape" CHECK (("transactions"."type" = 'transfer' AND "transactions"."counter_account_id" IS NOT NULL AND "transactions"."counter_account_id" <> "transactions"."account_id") OR ("transactions"."type" <> 'transfer' AND "transactions"."counter_account_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"timezone" text DEFAULT 'Asia/Manila' NOT NULL,
	"safety_buffer" bigint DEFAULT 0 NOT NULL,
	"emergency_fund_goal_id" uuid,
	"demo_mode" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "safety_buffer_non_negative" CHECK ("user_settings"."safety_buffer" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."categories"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_allocations" ADD CONSTRAINT "goal_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_allocations" ADD CONSTRAINT "goal_allocations_goal_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_overrides" ADD CONSTRAINT "occurrence_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_overrides" ADD CONSTRAINT "occurrence_overrides_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_overrides" ADD CONSTRAINT "occurrence_overrides_event_fk" FOREIGN KEY ("event_id","user_id") REFERENCES "public"."scheduled_events"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_category_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."categories"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counter_account_fk" FOREIGN KEY ("counter_account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."categories"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_event_fk" FOREIGN KEY ("scheduled_event_id","user_id") REFERENCES "public"."scheduled_events"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alerts_user_status_idx" ON "alerts" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_user_category_unique" ON "budgets" USING btree ("user_id","category_id") WHERE "budgets"."category_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_user_overall_unique" ON "budgets" USING btree ("user_id") WHERE "budgets"."category_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_kind_name_unique" ON "categories" USING btree ("user_id","kind",lower("name"));--> statement-breakpoint
CREATE INDEX "goal_allocations_goal_idx" ON "goal_allocations" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "scheduled_events_user_start_idx" ON "scheduled_events" USING btree ("user_id","start_date");--> statement-breakpoint
CREATE INDEX "sync_operations_user_created_idx" ON "sync_operations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "transactions" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE INDEX "transactions_user_updated_idx" ON "transactions" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "transactions_account_idx" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_event_occurrence_unique" ON "transactions" USING btree ("scheduled_event_id","occurrence_date") WHERE "transactions"."scheduled_event_id" IS NOT NULL AND "transactions"."deleted_at" IS NULL;