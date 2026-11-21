ALTER TABLE `users` ADD COLUMN `photo_url` varchar(500) NOT NULL DEFAULT '';
ALTER TABLE `users` ADD COLUMN `status` varchar(20) NOT NULL DEFAULT 'Active';
ALTER TABLE `users` ADD COLUMN `permissions` text;

CREATE TABLE IF NOT EXISTS `brandings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(120) NOT NULL,
  `address` text,
  `logo_url` varchar(500) NOT NULL DEFAULT '',
  `phone` varchar(40) NOT NULL DEFAULT '',
  `is_default` int NOT NULL DEFAULT 0,
  CONSTRAINT `brandings_id` PRIMARY KEY(`id`),
  CONSTRAINT `brandings_name_uq` UNIQUE(`name`)
);

CREATE TABLE IF NOT EXISTS `settings` (
  `k` varchar(80) NOT NULL,
  `v` text NOT NULL,
  CONSTRAINT `settings_k` PRIMARY KEY(`k`)
);

CREATE TABLE IF NOT EXISTS `order_returns` (
  `id` int AUTO_INCREMENT NOT NULL,
  `order_id` int NOT NULL,
  `invoice_no` varchar(30) NOT NULL,
  `return_type` varchar(20) NOT NULL DEFAULT 'Partial',
  `items_json` text NOT NULL,
  `return_cost` decimal(12,2) NOT NULL DEFAULT 0,
  `note` varchar(300) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `order_returns_id` PRIMARY KEY(`id`)
);
CREATE INDEX `ret_order_idx` ON `order_returns` (`order_id`);

INSERT INTO `brandings` (`name`, `address`, `logo_url`, `phone`, `is_default`)
VALUES ('Asteera', '1038, Monipur, Mirpur Model, Dhaka 1216\nMalibag office: 926, Malibag, Dhaka 1217', 'https://lh3.googleusercontent.com/d/1sxBW7iWGbmNx40M0NonM8u8pa68KYhZg', '01821155665', 1);

INSERT INTO `settings` (`k`, `v`) VALUES ('standalone_mode', 'false');
INSERT INTO `settings` (`k`, `v`) VALUES ('inv_sheet_id', '1xpbG6HlnNaMAoZVNzEnqbnn3UVC3MyZ24N6xpGDY3Jo');
INSERT INTO `settings` (`k`, `v`) VALUES ('order_sheet_id', '1Ad1xyjH96HKUMt5BijlBgpqKuzcd8JZf0NBdm0OhA7A');
INSERT INTO `settings` (`k`, `v`) VALUES ('prod_sheet_id', '1Eoey62mS_l6MuYZHYmzAzPMcUUR9O1Zb-s4iL7UPkv0');
