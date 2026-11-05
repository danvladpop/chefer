# Progress photos stay on the phone

Progress photos are stored only on the user's phone: in the app's private documents folder, one folder per signed-in
account, with a small JSON index. They are never uploaded to Chefer and never written to the camera roll. The user can
share one photo at a time through the system share sheet, which is the only way a copy leaves the app. Web shows a card
saying the photos live on the phone. (Owner decision, 2026-10-22.)

We rejected server storage for now. Body photos are the most sensitive thing a user could give us. Keeping them off the
server means there is nothing to breach, nothing to moderate, no storage cost, and no new consent or retention rules,
and the feature ships OTA with modules already in the binary (`expo-file-system`, `expo-image-picker`,
`expo-image-manipulator`).

## Consequences

- No sync: a new phone, or a reinstall, starts with no photos. The copy says so ("Deleting the app deletes them — share
  a photo to keep a copy"), and so do the data-export and account-deletion screens.
- The data export does not contain the photos. Deleting the account inside the app also deletes the photos on that
  phone; deleting it on web leaves them until the app is deleted or that account signs in and deletes them.
- iOS includes the app's documents folder in the user's own device backup (iCloud or computer). That is the user's
  backup, not Chefer's; excluding the folder from backups would need a native change.
- The photo and camera permission strings in the shipped binary still describe meal scans and recipes only. They should
  mention progress photos in the next store build (a native change, lane C).
- Moving to server storage later is a new feature with its own consent: the on-device photos would need an explicit,
  per-photo upload, never a silent migration.
