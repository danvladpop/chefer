import { useState } from 'react';
import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { CreateShareCardInput, ShareCardKind, ShareCardLink } from '@chefer/types';
import { useSnackbar } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { track } from '../../lib/analytics';
import { canShareFiles } from '../../lib/share-file';
import { trpc } from '../../lib/trpc';

// ─── Share cards (market review 2026-10, lane E2) ────────────────────────────
// `share.create` snapshots the card on the server and returns its public link;
// the PNG is rendered by the web app (next/og), so the phone needs no new
// native code. The image is downloaded to the cache and handed to the OS share
// sheet together with the link:
//   - iOS: `Share.share({ url, message })` — the image and the link;
//   - Android with `expo-sharing` (wave-4 binaries): `shareAsync(file)`;
//   - anything else, or a failed download: the link as text, which still
//     previews the card (the landing page carries Open Graph tags).
// Resolves false when the user dismissed the sheet.

type SharingModule = typeof import('expo-sharing');

/** The OS share sheet for a card that already exists. */
export async function presentShareCard(link: ShareCardLink, message: string): Promise<boolean> {
  const text = `${message} ${link.url}`;
  try {
    const uri = `${FileSystem.cacheDirectory}chefer-${link.id}.png`;
    const download = await FileSystem.downloadAsync(link.imageUrl, uri);
    if (download.status !== 200) throw new Error(`card image ${download.status}`);
    if (Platform.OS === 'ios') {
      const result = await Share.share({ url: download.uri, message: text });
      return result.action !== Share.dismissedAction;
    }
    if (canShareFiles()) {
      // Inline require: the module's import throws on binaries without it.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native module, see share-file.ts
      const Sharing = require('expo-sharing') as SharingModule;
      await Sharing.shareAsync(download.uri, { mimeType: 'image/png', dialogTitle: message });
      return true;
    }
  } catch {
    // Falls through: the link alone still shows the card in a preview.
  }
  const result = await Share.share({ message: text });
  return result.action !== Share.dismissedAction;
}

/** Create + share in one tap; a failure shows the standard snackbar. */
export function useShareCard(): {
  share: (input: CreateShareCardInput, message: string) => Promise<void>;
  sharing: ShareCardKind | null;
} {
  const create = trpc.share.create.useMutation();
  const snackbar = useSnackbar();
  const [sharing, setSharing] = useState<ShareCardKind | null>(null);
  const share = async (input: CreateShareCardInput, message: string) => {
    if (sharing) return;
    setSharing(input.kind);
    try {
      const link = await create.mutateAsync(input);
      const shared = await presentShareCard(link, message);
      track('share_card_shared', { kind: input.kind, completed: shared });
    } catch (error) {
      snackbar.show({ message: userFacingErrorMessage(error) });
    } finally {
      setSharing(null);
    }
  };
  return { share, sharing };
}
