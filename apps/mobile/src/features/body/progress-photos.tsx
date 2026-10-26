import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { radius } from '@chefer/tokens';
import { ConfirmSheet, PressableScale, Sheet, Text, useThemeColors } from '@chefer/ui-mobile';
import { formatDate, localDateStr, PROGRESS_PHOTOS_COPY } from '@chefer/utils';
import { Icon } from '../../components/icon';
import { track } from '../../lib/analytics';
import { canResizeOnDevice, resizeFor } from '../../lib/prepare-photo';
import { shareImageFile } from '../../lib/share-file';
import { trpc } from '../../lib/trpc';
import {
  addProgressPhoto,
  listProgressPhotos,
  removeProgressPhoto,
  type ProgressPhoto,
} from './progress-photo-store';

// ─── Progress photos (market review 2026-10, lane D4) ────────────────────────
// Owner decision 2026-10-22: on this phone only. Taken with the camera or
// picked from the library, shrunk on the device when the binary can, copied
// into the app's private folder (progress-photo-store.ts) — never uploaded,
// never saved to the camera roll unless the user shares one. A date-ordered
// grid; tap two photos to compare them side by side, oldest on the left.

type StoredPhoto = ProgressPhoto & { uri: string };

/** Thumbnails inside a card (radius token, not a magic number). */
const PHOTO_RADIUS = radius.inner;
const PHOTO_STYLE = { width: '100%', aspectRatio: 3 / 4, borderRadius: PHOTO_RADIUS } as const;

/** Long edge of a stored photo: sharp enough to compare, small on disk. */
const STORED_LONG_EDGE = 1600;

function day(value: string): string {
  return formatDate(new Date(`${value}T00:00:00`), 'medium');
}

/** A local copy of the picked image, shrunk when the binary has the manipulator. */
async function shrink(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  if (!canResizeOnDevice()) return asset.uri;
  type Manipulator = typeof import('expo-image-manipulator');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native module, see prepare-photo.ts
  const manipulator = require('expo-image-manipulator') as Manipulator;
  const { ImageManipulator, SaveFormat } = manipulator;
  const context = ImageManipulator.manipulate(asset.uri);
  const size = resizeFor(asset.width, asset.height, STORED_LONG_EDGE);
  if (size) context.resize(size);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

export function ProgressPhotos() {
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const { data: me } = trpc.user.me.useQuery(undefined, { staleTime: 300_000 });
  const userId = me?.id ?? null;
  const key = ['progress-photos', userId] as const;
  const { data: photos = [] } = useQuery({
    queryKey: key,
    queryFn: () => (userId ? listProgressPhotos(userId) : Promise.resolve([])),
    enabled: userId !== null,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [viewing, setViewing] = useState<StoredPhoto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async (source: 'camera' | 'library') => {
      if (!userId) return null;
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: 'images',
        ...(canResizeOnDevice() ? {} : { quality: 0.7 }),
      };
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setNotice(PROGRESS_PHOTOS_COPY.cameraDenied);
          return null;
        }
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(options);
      }
      const asset = result.canceled ? null : result.assets.at(0);
      if (!asset) return null;
      const local = await shrink(asset);
      const photo = await addProgressPhoto(userId, local, localDateStr());
      track('progress_photo_added', { source });
      return photo;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
    onError: () => setNotice(PROGRESS_PHOTOS_COPY.saveFailed),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (userId) await removeProgressPhoto(userId, id);
    },
    onSuccess: (_r, id) => {
      setSelected((s) => s.filter((x) => x !== id));
      setViewing(null);
      setConfirmDelete(false);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const toggle = (photo: StoredPhoto) => {
    setSelected((s) =>
      s.includes(photo.id)
        ? s.filter((x) => x !== photo.id)
        : s.length >= 2
          ? [s[1] ?? photo.id, photo.id]
          : [...s, photo.id],
    );
  };
  // Oldest on the left, newest on the right.
  const pair = photos
    .filter((p) => selected.includes(p.id))
    .sort((a, b) => (a.takenOn === b.takenOn ? 0 : a.takenOn < b.takenOn ? -1 : 1));

  return (
    <View testID="progress-photos" className="gap-3">
      <Text className="text-subhead text-label-secondary">{PROGRESS_PHOTOS_COPY.privacy}</Text>
      <View className="flex-row gap-2">
        {(['camera', 'library'] as const).map((source) => (
          <PressableScale
            key={source}
            testID={`progress-photo-${source}`}
            accessibilityRole="button"
            disabled={add.isPending || !userId}
            onPress={() => {
              setNotice(null);
              add.mutate(source);
            }}
            className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-control bg-brand-tint px-3"
          >
            <Icon name={source === 'camera' ? 'camera' : 'images'} color={colors.brand} size={18} />
            <Text className="text-subhead font-semibold text-brand">
              {source === 'camera'
                ? PROGRESS_PHOTOS_COPY.takePhoto
                : PROGRESS_PHOTOS_COPY.choosePhoto}
            </Text>
          </PressableScale>
        ))}
      </View>
      {notice ? (
        <Text
          testID="progress-photo-notice"
          accessibilityRole="alert"
          className="text-subhead text-attention"
        >
          {notice}
        </Text>
      ) : null}

      {photos.length === 0 ? (
        <Text testID="progress-photos-empty" className="text-subhead text-label-secondary">
          {PROGRESS_PHOTOS_COPY.empty}
        </Text>
      ) : (
        <>
          <View className="flex-row flex-wrap gap-2">
            {photos.map((photo) => {
              const on = selected.includes(photo.id);
              return (
                <Pressable
                  key={photo.id}
                  testID={`progress-photo-${photo.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Progress photo from ${day(photo.takenOn)}`}
                  accessibilityHint="Selects it to compare. Long press to open it."
                  onPress={() => toggle(photo)}
                  onLongPress={() => setViewing(photo)}
                  className="basis-[31%] gap-1"
                >
                  <Image
                    source={{ uri: photo.uri }}
                    contentFit="cover"
                    accessibilityIgnoresInvertColors
                    // expo-image takes `style`, not className (sized like exercise-image.tsx).
                    style={{
                      width: '100%',
                      aspectRatio: 3 / 4,
                      borderRadius: PHOTO_RADIUS,
                      borderWidth: on ? 3 : 0,
                      borderColor: colors.brand,
                      opacity: on ? 0.85 : 1,
                    }}
                  />
                  <Text className="text-caption text-label-secondary">{day(photo.takenOn)}</Text>
                </Pressable>
              );
            })}
          </View>
          {pair.length === 2 ? (
            <PressableScale
              testID="progress-photos-compare"
              accessibilityRole="button"
              onPress={() => {
                track('progress_photos_compared', {});
                setComparing(true);
              }}
              className="min-h-11 items-center justify-center rounded-control bg-brand px-4"
            >
              <Text className="text-body font-semibold text-brand-on">
                {PROGRESS_PHOTOS_COPY.compare}
              </Text>
            </PressableScale>
          ) : (
            <Text className="text-caption text-label-secondary">
              {PROGRESS_PHOTOS_COPY.pickTwo}
            </Text>
          )}
        </>
      )}

      <Sheet
        visible={comparing && pair.length === 2}
        onClose={() => setComparing(false)}
        title={PROGRESS_PHOTOS_COPY.compare}
        testID="progress-photos-compare-sheet"
      >
        <View className="flex-row gap-2">
          {pair.map((photo) => (
            <View key={photo.id} className="min-w-0 flex-1 gap-1">
              <Image
                source={{ uri: photo.uri }}
                contentFit="cover"
                accessibilityLabel={`Progress photo from ${day(photo.takenOn)}`}
                style={PHOTO_STYLE}
              />
              <Text className="text-center text-subhead text-label">{day(photo.takenOn)}</Text>
            </View>
          ))}
        </View>
      </Sheet>

      <Sheet
        visible={viewing !== null && !confirmDelete}
        onClose={() => setViewing(null)}
        title={viewing ? day(viewing.takenOn) : ''}
        testID="progress-photo-viewer"
        footer={
          <View className="flex-row gap-2">
            <PressableScale
              testID="progress-photo-share"
              accessibilityRole="button"
              onPress={async () => {
                if (viewing && !(await shareImageFile(viewing.uri))) {
                  setNotice(PROGRESS_PHOTOS_COPY.shareFailed);
                }
              }}
              className="min-h-11 flex-1 items-center justify-center rounded-control bg-brand-tint"
            >
              <Text className="text-body font-semibold text-brand">
                {PROGRESS_PHOTOS_COPY.share}
              </Text>
            </PressableScale>
            <PressableScale
              testID="progress-photo-delete"
              accessibilityRole="button"
              onPress={() => setConfirmDelete(true)}
              className="min-h-11 flex-1 items-center justify-center rounded-control border border-separator"
            >
              <Text className="text-body font-semibold text-attention">
                {PROGRESS_PHOTOS_COPY.delete}
              </Text>
            </PressableScale>
          </View>
        }
      >
        {viewing ? (
          <Image
            source={{ uri: viewing.uri }}
            contentFit="contain"
            accessibilityLabel={`Progress photo from ${day(viewing.takenOn)}`}
            style={PHOTO_STYLE}
          />
        ) : null}
      </Sheet>

      <ConfirmSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={PROGRESS_PHOTOS_COPY.deleteConfirmTitle}
        body={PROGRESS_PHOTOS_COPY.deleteConfirmBody}
        confirmLabel={PROGRESS_PHOTOS_COPY.delete}
        cancelLabel="Keep it"
        destructive
        busy={remove.isPending}
        onConfirm={() => viewing && remove.mutate(viewing.id)}
        testID="progress-photo-delete-confirm"
      />
    </View>
  );
}
