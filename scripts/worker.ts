import { connection } from './connection';
import { runJobs } from '../src/features/jobs';
const sql = connection();
try {
  await runJobs(sql);
} finally {
  await sql.end();
}
