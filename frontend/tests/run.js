/**
 * Test runner — runs normalizer.test.js via dynamic import.
 * Use: node tests/run.js
 */
import('../normalizer.test.js').catch(err => {
  console.error('[TestRunner] Failed:', err.message);
  process.exit(1);
});
