import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet, showSnackbar, Text } from '@chefer/ui-mobile';
import { FeedbackCard } from './feedback-card';

// Gym-mode entry to the feedback channel (UX-PO-05): the form lived only in
// Food's More tab, so a tester mid-workout had no way to say what broke.
// One row in Gym settings opens the same form (same build/OS/route context) in
// a sheet.
export function GymFeedbackRow() {
  const [open, setOpen] = useState(false);
  // Mounted on first open and kept, so the sheet still plays its exit motion.
  const [mounted, setMounted] = useState(false);
  return (
    <View>
      <Pressable
        testID="gym-feedback-row"
        accessibilityRole="button"
        accessibilityLabel="Send feedback"
        accessibilityHint="Tell us what is broken, confusing or missing"
        onPress={() => {
          setMounted(true);
          setOpen(true);
        }}
        className="min-h-11 flex-row items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
      >
        <Ionicons name="chatbubble-ellipses-outline" size={20} color="#374151" />
        <View className="min-w-0 flex-1">
          <Text className="text-base font-medium">Send feedback</Text>
          <Text variant="muted" className="text-xs">
            Something broken or missing? It goes straight to the team.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
      </Pressable>
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Send feedback"
        testID="gym-feedback-sheet"
      >
        {mounted ? (
          <FeedbackCard
            bare
            onSent={() => {
              setOpen(false);
              showSnackbar({ message: 'Thanks, we read every note.' });
            }}
          />
        ) : null}
      </Sheet>
    </View>
  );
}
