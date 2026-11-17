import { loadConfig } from '../config';
import { createPool, withService } from '../db';
import { photoKey } from '../domain/public-invitation';
import { processImage, type PhotoFilter } from '../photos/process';
import { createStorage } from '../photos/storage';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const storage = createStorage(config);
const rows = await withService(pool, (client) =>
  client.query<{ invitation_id: string; photo_id: string; photo_filter: PhotoFilter }>(
    'select * from private.storage_keys_for_retry()',
  ),
);

let retried = 0;
for (const row of rows.rows) {
  const master = await storage.get(photoKey(row.invitation_id, row.photo_id, 'master.webp'));
  if (!master) {
    await withService(pool, (client) =>
      client.query('select private.mark_photo_status($1, $2, $3)', [row.photo_id, 'failed', row.photo_filter]),
    );
    continue;
  }
  const processed = await processImage(master, row.photo_filter);
  await storage.put(photoKey(row.invitation_id, row.photo_id, 'w800.webp'), processed.w800, 'image/webp');
  await storage.put(photoKey(row.invitation_id, row.photo_id, 'w1200.webp'), processed.w1200, 'image/webp');
  await storage.put(photoKey(row.invitation_id, row.photo_id, 'w1600.webp'), processed.w1600, 'image/webp');
  await storage.put(photoKey(row.invitation_id, row.photo_id, 'thumb.webp'), processed.thumb, 'image/webp');
  await withService(pool, (client) =>
    client.query('select private.mark_photo_status($1, $2, $3)', [row.photo_id, 'ready', row.photo_filter]),
  );
  retried += 1;
}
console.log(JSON.stringify({ retried }));
await pool.end();
