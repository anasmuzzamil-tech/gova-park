-- GOVAPARK étape 5 : conserver la note de modération de chaque annonce.
ALTER TABLE `listings` ADD COLUMN `moderationNote` TEXT NULL;
