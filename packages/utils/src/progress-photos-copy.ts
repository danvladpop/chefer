// ─── Progress photos copy (market review 2026-10, lane D4) ───────────────────
// Owner decision 2026-10-22: progress photos stay on the phone. They are never
// uploaded and never written to the camera roll unless the user shares one.
// The app shows the feature; web only says where the photos live.

export const PROGRESS_PHOTOS_COPY = {
  title: 'Progress photos',
  privacy:
    'Saved only on this phone, never uploaded. Deleting the app deletes them — share a photo to keep a copy.',
  exportNote: 'Progress photos stay on your phone, so they aren’t in the export.',
  web: 'Progress photos live on your phone: open the Chefer app to take and compare them. They are never uploaded.',
  empty:
    'No photos yet. Take one in the same spot and light each time, and compare them side by side.',
  takePhoto: 'Take photo',
  choosePhoto: 'Choose photo',
  compare: 'Compare',
  pickTwo: 'Tap two photos to compare them.',
  share: 'Share',
  delete: 'Delete photo',
  deleteConfirmTitle: 'Delete this photo?',
  deleteConfirmBody: 'It’s only on this phone, so it can’t be restored.',
  shareFailed: "Couldn't share the photo from this version of the app.",
  saveFailed: "Couldn't save the photo. Try again.",
  cameraDenied: 'Camera access is off. Allow it in Settings, or choose a photo instead.',
} as const;
