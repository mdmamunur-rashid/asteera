CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` date NOT NULL,
	`category` varchar(80) NOT NULL,
	`purpose` varchar(300) NOT NULL DEFAULT '',
	`amount` decimal(12,2) NOT NULL DEFAULT 0,
	`payment_status` varchar(20) NOT NULL DEFAULT 'Paid',
	`paid_by` varchar(80) NOT NULL DEFAULT '',
	`notes` varchar(300) NOT NULL DEFAULT '',
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fabric_purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` date NOT NULL,
	`fabric_id` int NOT NULL,
	`qty` decimal(12,3) NOT NULL DEFAULT 0,
	`unit_price` decimal(12,2) NOT NULL DEFAULT 0,
	CONSTRAINT `fabric_purchases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fabrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`unit` varchar(20) NOT NULL DEFAULT 'goj',
	CONSTRAINT `fabrics_id` PRIMARY KEY(`id`),
	CONSTRAINT `fabrics_name_uq` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sku` varchar(60) NOT NULL,
	`name` varchar(200) NOT NULL,
	`size` varchar(30) NOT NULL DEFAULT '',
	`type` varchar(80) NOT NULL DEFAULT '',
	`category` varchar(80) NOT NULL DEFAULT '',
	`purchase_price` decimal(12,2) NOT NULL DEFAULT 0,
	`sale_price` decimal(12,2) NOT NULL DEFAULT 0,
	`reorder_level` int NOT NULL DEFAULT 5,
	`image_url` varchar(500) NOT NULL DEFAULT '',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `items_id` PRIMARY KEY(`id`),
	CONSTRAINT `items_sku_uq` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ref` varchar(40) NOT NULL,
	`date` date NOT NULL,
	`due_date` date,
	`supplier_id` int NOT NULL,
	`sku` varchar(60) NOT NULL DEFAULT '',
	`description` varchar(200) NOT NULL DEFAULT '',
	`qty` decimal(12,3) NOT NULL DEFAULT 0,
	`unit_cost` decimal(12,2) NOT NULL DEFAULT 0,
	`total_due` decimal(12,2) NOT NULL DEFAULT 0,
	`amount_paid` decimal(12,2) NOT NULL DEFAULT 0,
	CONSTRAINT `ledger_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `ledger_ref_uq` UNIQUE(`ref`)
);
--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`item_id` int NOT NULL,
	`qty` decimal(12,3) NOT NULL DEFAULT 0,
	`price` decimal(12,2) NOT NULL DEFAULT 0,
	CONSTRAINT `order_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoice_no` varchar(30) NOT NULL,
	`date` date NOT NULL,
	`customer_name` varchar(160) NOT NULL,
	`phone` varchar(30) NOT NULL DEFAULT '',
	`address` varchar(400) NOT NULL DEFAULT '',
	`page_name` varchar(120) NOT NULL DEFAULT '',
	`status` varchar(20) NOT NULL DEFAULT 'Billed',
	`payment_mode` varchar(20) NOT NULL DEFAULT 'COD',
	`delivery_charge` decimal(12,2) NOT NULL DEFAULT 0,
	`discount` decimal(12,2) NOT NULL DEFAULT 0,
	`return_cost` decimal(12,2) NOT NULL DEFAULT 0,
	`total` decimal(12,2) NOT NULL DEFAULT 0,
	`paid` decimal(12,2) NOT NULL DEFAULT 0,
	`courier` varchar(30) NOT NULL DEFAULT '',
	`tracking_no` varchar(80) NOT NULL DEFAULT '',
	`note` varchar(400) NOT NULL DEFAULT '',
	`printed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_invoice_uq` UNIQUE(`invoice_no`)
);
--> statement-breakpoint
CREATE TABLE `production_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` date NOT NULL,
	`sku` varchar(60) NOT NULL,
	`item_name` varchar(200) NOT NULL DEFAULT '',
	`fabric_id` int,
	`qty` decimal(12,3) NOT NULL DEFAULT 0,
	`fabric_per_unit` decimal(12,3) NOT NULL DEFAULT 0,
	`print_supplier_id` int,
	`print_rate` decimal(12,2) NOT NULL DEFAULT 0,
	`print_status` varchar(20) NOT NULL DEFAULT 'Not Started',
	`print_received_qty` decimal(12,3) NOT NULL DEFAULT 0,
	`print_received_date` date,
	`sew_supplier_id` int,
	`sew_unit_cost` decimal(12,2) NOT NULL DEFAULT 0,
	`sew_status` varchar(20) NOT NULL DEFAULT 'Not Started',
	`sew_received_qty` decimal(12,3) NOT NULL DEFAULT 0,
	`sew_received_date` date,
	CONSTRAINT `production_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`po_id` int NOT NULL,
	`item_id` int NOT NULL,
	`qty` decimal(12,3) NOT NULL DEFAULT 0,
	`unit_cost` decimal(12,2) NOT NULL DEFAULT 0,
	CONSTRAINT `purchase_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`po_no` varchar(30) NOT NULL,
	`date` date NOT NULL,
	`supplier_id` int NOT NULL,
	`paid` decimal(12,2) NOT NULL DEFAULT 0,
	`note` varchar(300) NOT NULL DEFAULT '',
	`printed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `po_no_uq` UNIQUE(`po_no`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`name` varchar(160) NOT NULL,
	`type` varchar(30) NOT NULL DEFAULT 'Other',
	`address` varchar(300) NOT NULL DEFAULT '',
	`phone` varchar(30) NOT NULL DEFAULT '',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`),
	CONSTRAINT `suppliers_code_uq` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`email` varchar(160),
	`phone` varchar(30),
	`password_hash` varchar(100) NOT NULL,
	`role` varchar(20) NOT NULL DEFAULT 'staff',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_uq` UNIQUE(`email`),
	CONSTRAINT `users_phone_uq` UNIQUE(`phone`)
);
--> statement-breakpoint
CREATE INDEX `exp_date_idx` ON `expenses` (`date`);--> statement-breakpoint
CREATE INDEX `fp_fabric_idx` ON `fabric_purchases` (`fabric_id`);--> statement-breakpoint
CREATE INDEX `ledger_supplier_idx` ON `ledger_entries` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `ol_order_idx` ON `order_lines` (`order_id`);--> statement-breakpoint
CREATE INDEX `ol_item_idx` ON `order_lines` (`item_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `pb_sku_idx` ON `production_batches` (`sku`);--> statement-breakpoint
CREATE INDEX `pl_po_idx` ON `purchase_lines` (`po_id`);--> statement-breakpoint
CREATE INDEX `pl_item_idx` ON `purchase_lines` (`item_id`);--> statement-breakpoint
CREATE INDEX `po_supplier_idx` ON `purchase_orders` (`supplier_id`);