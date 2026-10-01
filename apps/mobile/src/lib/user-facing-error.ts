// App Review R-09: mutation/query errors shown to people go through this so a
// dropped connection reads "Can't reach Chefer right now…" instead of raw
// transport text. The mapping lives in @chefer/utils (shared with web).
export {
  NETWORK_ERROR_MESSAGE,
  SERVER_ERROR_MESSAGE,
  isNetworkError,
  userFacingErrorMessage,
} from '@chefer/utils';
