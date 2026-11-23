CREATE TABLE IF NOT EXISTS `campaigns` (
  `id` int AUTO_INCREMENT NOT NULL,
  `date` date NOT NULL,
  `name` varchar(160) NOT NULL,
  `brand` varchar(80) NOT NULL DEFAULT '',
  `spend` decimal(12,2) NOT NULL DEFAULT 0,
  `orders_count` int NOT NULL DEFAULT 0,
  `revenue` decimal(12,2) NOT NULL DEFAULT 0,
  `notes` varchar(300) NOT NULL DEFAULT '',
  CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
CREATE INDEX `camp_date_idx` ON `campaigns` (`date`);
