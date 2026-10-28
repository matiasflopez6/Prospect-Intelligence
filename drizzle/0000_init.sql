CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`niche` text,
	`category` text,
	`description` text,
	`address` text,
	`city` text,
	`region` text,
	`country` text,
	`location` text,
	`lat` real,
	`lng` real,
	`phone` text,
	`email` text,
	`website` text,
	`website_domain` text,
	`whatsapp` text,
	`rating` real,
	`review_count` integer,
	`price_level` integer,
	`business_status` text,
	`opening_hours` text,
	`google_place_id` text,
	`osm_id` text,
	`analysis_status` text DEFAULT 'pending' NOT NULL,
	`analysis_error` text,
	`score` integer,
	`score_tier` text,
	`opportunity_count` integer DEFAULT 0 NOT NULL,
	`top_service_key` text,
	`analyzed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_place_id_uq` ON `companies` (`google_place_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `companies_osm_id_uq` ON `companies` (`osm_id`);--> statement-breakpoint
CREATE INDEX `companies_domain_idx` ON `companies` (`website_domain`);--> statement-breakpoint
CREATE INDEX `companies_name_idx` ON `companies` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `companies_score_idx` ON `companies` (`score`);--> statement-breakpoint
CREATE INDEX `companies_niche_idx` ON `companies` (`niche`);--> statement-breakpoint
CREATE INDEX `companies_location_idx` ON `companies` (`location`);--> statement-breakpoint
CREATE TABLE `company_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`provider` text NOT NULL,
	`external_id` text,
	`url` text,
	`fields` text,
	`raw` text,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `company_sources_company_idx` ON `company_sources` (`company_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`source` text NOT NULL,
	`external_id` text,
	`author` text,
	`rating` real,
	`text` text,
	`language` text,
	`published_at` integer,
	`owner_replied` integer,
	`owner_reply_text` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reviews_company_idx` ON `reviews` (`company_id`);--> statement-breakpoint
CREATE TABLE `search_companies` (
	`search_id` integer NOT NULL,
	`company_id` integer NOT NULL,
	`rank` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`search_id`, `company_id`),
	FOREIGN KEY (`search_id`) REFERENCES `searches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `searches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`niche` text NOT NULL,
	`location` text NOT NULL,
	`target_count` integer NOT NULL,
	`providers` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`found_count` integer DEFAULT 0 NOT NULL,
	`analyzed_count` integer DEFAULT 0 NOT NULL,
	`auto_analyze` integer DEFAULT true NOT NULL,
	`error` text,
	`provider_results` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `searches_created_idx` ON `searches` (`created_at`);--> statement-breakpoint
CREATE TABLE `social_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`platform` text NOT NULL,
	`url` text NOT NULL,
	`handle` text,
	`followers` integer,
	`found_via` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_company_url_uq` ON `social_profiles` (`company_id`,`url`);--> statement-breakpoint
CREATE TABLE `analyses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`error` text,
	`website_url` text,
	`signals` text,
	`summary` text,
	`quality` text,
	`findings` text,
	`model` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `analyses_company_idx` ON `analyses` (`company_id`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`analysis_id` integer,
	`kind` text NOT NULL,
	`key` text,
	`label` text NOT NULL,
	`detail` text NOT NULL,
	`source_url` text,
	`excerpt` text,
	`observed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`analysis_id`) REFERENCES `analyses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `evidence_company_idx` ON `evidence` (`company_id`);--> statement-breakpoint
CREATE INDEX `evidence_analysis_idx` ON `evidence` (`analysis_id`);--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`analysis_id` integer,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`problem` text NOT NULL,
	`consequence` text NOT NULL,
	`proposed_solution` text NOT NULL,
	`service_key` text NOT NULL,
	`impact` text NOT NULL,
	`impact_note` text,
	`severity` integer NOT NULL,
	`confidence` real NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`analysis_id`) REFERENCES `analyses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `opportunities_company_idx` ON `opportunities` (`company_id`);--> statement-breakpoint
CREATE INDEX `opportunities_type_idx` ON `opportunities` (`type`);--> statement-breakpoint
CREATE INDEX `opportunities_service_idx` ON `opportunities` (`service_key`);--> statement-breakpoint
CREATE TABLE `opportunity_evidence` (
	`opportunity_id` integer NOT NULL,
	`evidence_id` integer NOT NULL,
	PRIMARY KEY(`opportunity_id`, `evidence_id`),
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`analysis_id` integer,
	`total` integer NOT NULL,
	`tier` text NOT NULL,
	`confidence` real NOT NULL,
	`components` text NOT NULL,
	`method_version` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`analysis_id`) REFERENCES `analyses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `scores_company_idx` ON `scores` (`company_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`opportunity_id` integer,
	`channel` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`language` text DEFAULT 'es' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`evidence_ids` text,
	`model` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `messages_company_idx` ON `messages` (`company_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'generating' NOT NULL,
	`content` text,
	`pdf_path` text,
	`error` text,
	`model` text,
	`created_at` integer NOT NULL,
	`generated_at` integer,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reports_company_idx` ON `reports` (`company_id`);--> statement-breakpoint
CREATE TABLE `crm_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`owner_id` integer,
	`next_action` text,
	`follow_up_at` integer,
	`last_contacted_at` integer,
	`lost_reason` text,
	`status_changed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_entries_company_uq` ON `crm_entries` (`company_id`);--> statement-breakpoint
CREATE INDEX `crm_entries_status_idx` ON `crm_entries` (`status`);--> statement-breakpoint
CREATE INDEX `crm_entries_followup_idx` ON `crm_entries` (`follow_up_at`);--> statement-breakpoint
CREATE TABLE `crm_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`author_id` integer,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `crm_notes_company_idx` ON `crm_notes` (`company_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`company_id` integer,
	`search_id` integer,
	`actor` text,
	`meta` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`search_id`) REFERENCES `searches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_created_idx` ON `activity_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `activity_company_idx` ON `activity_log` (`company_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`progress_label` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 1 NOT NULL,
	`error` text,
	`result` text,
	`search_id` integer,
	`company_id` integer,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`search_id`) REFERENCES `searches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_search_idx` ON `jobs` (`search_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer
);
