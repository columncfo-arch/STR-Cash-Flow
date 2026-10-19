import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Point the filesystem storage backend at a throwaway directory before any
 * module reads it — `BASE_DIR` is resolved once, when storage is first
 * imported, so this has to happen before the test files do.
 */
process.env.STR_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'hostcfo-test-'));
