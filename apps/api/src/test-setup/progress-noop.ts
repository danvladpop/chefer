import {
  noopProgressRecorder,
  setProgressRecorder,
} from '../application/progress/progress-hooks.js';

// Kitchen progress hooks must never reach a database from a unit test: every
// test file starts with the no-op recorder. A test that exercises a hook swaps
// in a spy with `setProgressRecorder`.
setProgressRecorder(noopProgressRecorder);
