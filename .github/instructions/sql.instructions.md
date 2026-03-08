---
description: Load when working with SQL or looking for database schema information
applyTo: '**' # when provided, instructions will automatically be added to the request context when the pattern matches an attached file
---

<!-- Tip: Use /create-instructions in chat to generate content with agent assistance -->

`sql/tables/**`: contains all database canonical sql table information with relevant sql triggers,functions, indexes etc.
`sql/functions/**`: contains all database canonical function sql files that are table agnostic.
`sql/migrations/**`: contains all database migration sql files. Store new migration sql files here and update the canonical files for every migration.
Use the backend capabilities only when optimum and required for the most efficient system.
Use TS for anything that should be done on the client side for better performance and resource efficiency.