CREATE INDEX `idx_sonnet_records_room_seq` ON `sonnet_records` (`room`,`generation`,`seq`);
--> statement-breakpoint
CREATE INDEX `idx_sonnet_records_sender` ON `sonnet_records` (json_extract("body", '$.from'));
--> statement-breakpoint
CREATE INDEX `idx_sonnet_records_receipt_sender` ON `sonnet_records` (json_extract("body", '$.payload.sender_did'));
--> statement-breakpoint
CREATE INDEX `idx_sonnet_records_request` ON `sonnet_records` (`room`,`generation`,json_extract("body", '$.from'),json_extract("body", '$.payload.request_id'));
