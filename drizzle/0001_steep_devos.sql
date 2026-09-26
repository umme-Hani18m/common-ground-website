CREATE TABLE `challengeMedia` (
	`id` int AUTO_INCREMENT NOT NULL,
	`challengeId` int NOT NULL,
	`url` text NOT NULL,
	`fileKey` text NOT NULL,
	`fileName` varchar(220) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `challengeMedia_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(220) NOT NULL,
	`description` text NOT NULL,
	`phone` varchar(24) NOT NULL,
	`aadharLast4` varchar(4) NOT NULL,
	`email` varchar(320),
	`location` varchar(220) NOT NULL,
	`latitude` varchar(32),
	`longitude` varchar(32),
	`urgencyRequested` boolean NOT NULL DEFAULT false,
	`aiUrgency` enum('critical','high','medium','low') NOT NULL DEFAULT 'medium',
	`category` varchar(80) NOT NULL DEFAULT 'Community infrastructure',
	`difficulty` enum('starter','intermediate','advanced') NOT NULL DEFAULT 'intermediate',
	`status` enum('new','under_review','in_progress','solution_proposed','implemented') NOT NULL DEFAULT 'new',
	`assignedUniversity` varchar(180),
	`solution` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projectUpdates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`challengeId` int NOT NULL,
	`authorRole` varchar(40) NOT NULL,
	`authorName` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`status` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `projectUpdates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sponsorships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`industryName` varchar(180) NOT NULL,
	`amount` int NOT NULL DEFAULT 0,
	`contributionNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sponsorships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `techEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(220) NOT NULL,
	`description` text NOT NULL,
	`date` varchar(40) NOT NULL,
	`location` varchar(180) NOT NULL,
	`university` varchar(180) NOT NULL,
	`challengeId` int,
	`sponsorshipTarget` int NOT NULL DEFAULT 0,
	`sponsorRaised` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `techEvents_id` PRIMARY KEY(`id`)
);
