// Coaching content per curated exercise, keyed by slug (see exercise-catalog.ts).
// Source: docs/gym/exercise-library-research.md — cues/mistakes are written in
// Chefer's own words; media ids are verified (oEmbed) YouTube clips and
// public-domain free-exercise-db photo ids. Owned by gym_plan.md G0-4 / G1-D.

import type { ExerciseCatalogEntry } from './exercise-catalog';

export type ExerciseContent = Pick<
  ExerciseCatalogEntry,
  'cues' | 'mistakes' | 'blurb' | 'freeExerciseDbId' | 'videoId' | 'videoStartSec' | 'videoChannel'
> & { aliases?: string[] };

/**
 * Missing entries render as "no cues yet"; the catalog invariant test lists them.
 *
 * Video picks: verified via YouTube oEmbed (title/channel match) as of 2026-09-24.
 * Timestamps for exercises that share a multi-exercise "ranking" video were
 * checked against that video's own chapter markers (or transcript, where chapters
 * didn't split finely enough) rather than trusted as self-reported guesses.
 * See docs/gym/exercise-library-research.md "QA table (G1-D)" for the full record.
 */
export const EXERCISE_CONTENT: Record<string, ExerciseContent> = {
  'barbell-bench-press': {
    cues: [
      'Drag the bar down your body, not straight down.',
      'Pull your shoulder blades together and keep them pinned.',
      'Push the bar toward the ceiling above your eyes.',
      'Keep your feet driving into the floor all rep.',
    ],
    mistakes: [
      'Flaring elbows to 90 degrees, hammering the shoulders.',
      'Bouncing the bar off the chest instead of controlling it.',
    ],
    blurb:
      'The benchmark horizontal press for chest size and pressing strength; belongs in almost every upper-body day.',
    freeExerciseDbId: 'Barbell_Bench_Press_-_Medium_Grip',
    videoId: 'vcBig73ojpE',
    videoStartSec: 0,
    videoChannel: 'Jeff Nippard',
  },
  'dumbbell-bench-press': {
    cues: [
      'Let the dumbbells travel below the bench for a full stretch.',
      'Drive up and slightly inward, almost touching at the top.',
      'Keep your wrists stacked directly over your elbows.',
    ],
    mistakes: [
      'Letting elbows drop too far and flare, stressing the shoulder.',
      'Losing dumbbell path control, letting them drift forward/back.',
    ],
    blurb:
      'Free range of motion and independent arms make this a strong hypertrophy alternative or finisher to the barbell press.',
    freeExerciseDbId: 'Dumbbell_Bench_Press',
    videoId: 'YQ2s_Y7g5Qk',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'incline-dumbbell-press': {
    cues: [
      'Set the bench to 30-45 degrees, not steeper.',
      'Tuck the dumbbells over your collarbone, elbows under wrists.',
      'Press up and slightly back, toward your eyes.',
    ],
    mistakes: [
      'Setting the incline too steep, turning it into a shoulder press.',
      'Flaring elbows out wide at the bottom, straining the front delt.',
    ],
    blurb:
      'The best-supported way to bias upper-chest development without turning the lift into a shoulder press.',
    freeExerciseDbId: 'Incline_Dumbbell_Press',
    videoId: '5CECBjd7HLQ',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'machine-chest-press': {
    cues: [
      'Set the seat so handles line up with mid-chest.',
      'Press forward and squeeze your chest together at lockout.',
      'Control the negative instead of letting the stack drop.',
    ],
    mistakes: [
      'Seat set too high, turning it into a shoulder-dominant press.',
      'Bouncing off the stack between reps instead of pausing.',
    ],
    blurb:
      'A joint-friendly, easy-to-load option for beginners and for chasing extra volume near the end of a session.',
    freeExerciseDbId: 'Machine_Bench_Press',
    videoId: 'NwzUje3z0qY',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'cable-fly': {
    cues: [
      'Keep a slight, fixed bend in the elbows all rep.',
      'Lead with your hands hugging a barrel, not pushing.',
      'Squeeze and hold half a second at full contraction.',
    ],
    mistakes: [
      'Bending the elbows more at the top, turning it into a press.',
      'Using so much weight the shoulders round forward at the stretch.',
    ],
    blurb:
      'The best isolated chest stretch-and-squeeze movement — cables (or a pec deck) keep tension on the chest at full stretch, which presses lose.',
    freeExerciseDbId: 'Flat_Bench_Cable_Flyes',
    videoId: '-EIhKMDSjBY',
    videoStartSec: 0,
    videoChannel: 'Jeff Nippard',
  },
  'push-up': {
    cues: [
      'Keep a straight line from head to heels the whole rep.',
      'Spread the floor apart with your hands to engage the chest.',
      "Lower until your chest is a fist's width from the floor.",
    ],
    mistakes: [
      'Letting the hips sag or pike up instead of staying rigid.',
      'Flaring the elbows straight out to the sides.',
    ],
    blurb:
      'A zero-equipment horizontal push that scales from beginners to advanced — essential for any bodyweight-only day.',
    freeExerciseDbId: 'Pushups',
    videoId: 'IvCknxXOgSA',
    videoStartSec: 568,
    videoChannel: 'Renaissance Periodization',
  },
  'chest-dip': {
    cues: [
      'Lean your torso forward and let your elbows flare slightly.',
      'Lower until your shoulders dip just below your elbows.',
      'Drive back up by pushing the bars down and away.',
    ],
    mistakes: [
      'Staying too upright, shifting load onto the triceps instead.',
      'Dropping too deep, letting the shoulders roll forward at bottom.',
    ],
    blurb:
      'A forward-lean dip loads the lower chest hard and is easy to add weight to once bodyweight reps get easy.',
    freeExerciseDbId: 'Dips_-_Chest_Version',
    videoId: 'yN6Q1UI_xkE',
    videoStartSec: 0,
    videoChannel: 'Jeff Nippard',
  },
  'pull-up': {
    cues: [
      'Drive your elbows down to your hips, not just up.',
      'Lead the pull with your chest toward the bar.',
      'Get a full stretch at the bottom before pulling again.',
    ],
    mistakes: [
      'Kipping/swinging to cheat the rep instead of pulling strict.',
      'Stopping short of full elbow extension at the bottom.',
    ],
    blurb:
      'The gold-standard vertical pull for lat width; scales with bands (assisted) or a dip belt (weighted) as strength changes.',
    freeExerciseDbId: 'Pullups',
    videoId: 'Hdc7Mw6BIEE',
    videoStartSec: 0,
    videoChannel: 'Jeff Nippard',
  },
  'chin-up': {
    cues: [
      'Keep your elbows close to your torso as you pull.',
      'Pull your chest to the bar, not your chin over it.',
      'Squeeze your shoulder blades down before you start pulling.',
    ],
    mistakes: [
      'Using hip momentum to kick-start the pull.',
      'Only doing half-reps and never fully extending the arms.',
    ],
    blurb: 'The underhand grip biases biceps more than the pull-up while still hammering the lats.',
    freeExerciseDbId: 'Chin-Up',
    videoId: '9JC1EwqezGY',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'assisted-pull-up': {
    cues: [
      'Loop the band so it supports you at the hips, not knees.',
      'Still drive your elbows down and back on every rep.',
      "Lower yourself slowly — don't let the band snap you up.",
    ],
    mistakes: [
      'Leaning on too much assistance, turning it into a bounce.',
      'Letting the band do the top-range work you should own.',
    ],
    blurb:
      'Lets beginners groove the exact pull-up movement pattern under reduced load and progress toward an unassisted rep.',
    freeExerciseDbId: 'Band_Assisted_Pull-Up',
    videoId: 'vKpqOpjJt18',
    videoStartSec: 13,
    videoChannel: 'Renaissance Periodization',
  },
  'lat-pulldown': {
    cues: [
      'Lead with your elbows driving down toward your back pockets.',
      'Lean back only slightly — a few degrees, not a swing.',
      'Pause and squeeze your lats before the bar rises back up.',
    ],
    mistakes: [
      'Yanking the bar down with a big backward lean.',
      'Pulling the bar behind the head, straining the shoulder.',
    ],
    blurb:
      'A machine-regulated, easy-to-load stand-in for the pull-up — lets beginners build the same pattern at any load.',
    freeExerciseDbId: 'Wide-Grip_Lat_Pulldown',
    videoId: 'O94yEoGXtBY',
    videoStartSec: 0,
    videoChannel: 'Jeff Nippard',
  },
  'barbell-row': {
    cues: [
      'Hinge to about 45 degrees and hold that angle all set.',
      'Row the bar into your lower ribs, not your chest.',
      'Squeeze your shoulder blades together at the top of every rep.',
    ],
    mistakes: [
      'Standing more upright as the set gets hard, becoming a shrug.',
      'Using a big body heave/jerk to move the weight.',
    ],
    blurb:
      'The classic horizontal pull for back thickness; the hip hinge also reinforces deadlift positioning.',
    freeExerciseDbId: 'Bent_Over_Barbell_Row',
    videoId: 'RQU8wZPbioA',
    videoStartSec: 0,
    videoChannel: 'Alan Thrall (Untamed Strength)',
  },
  'chest-supported-row': {
    cues: [
      "Let your chest rest fully on the pad — don't hover.",
      'Row your elbows up and back, starting a lawnmower.',
      'Pause and squeeze between your shoulder blades at the top.',
    ],
    mistakes: [
      'Lifting the chest off the pad to cheat extra range.',
      'Shrugging the weight up with traps instead of rowing.',
    ],
    blurb:
      'Removes lower-back fatigue and cheat-momentum from rowing, so the upper-back muscles get pushed harder and safer.',
    freeExerciseDbId: 'Lying_T-Bar_Row',
    videoId: 'jLvqKgW-_G8',
    videoStartSec: 533,
    videoChannel: 'Jeff Nippard',
  },
  'seated-cable-row': {
    cues: [
      "Sit tall and keep your torso still — don't rock.",
      'Drive your elbows straight back past your ribs.',
      'Round your shoulders forward slightly at the stretch, then reset tall.',
    ],
    mistakes: [
      'Rocking the torso back and forth to add momentum.',
      'Shrugging the shoulders up toward the ears during the pull.',
    ],
    blurb: 'A stable, seated way to load horizontal back volume without any lower-back strain.',
    freeExerciseDbId: 'Seated_Cable_Rows',
    videoId: 'jLvqKgW-_G8',
    videoStartSec: 562,
    videoChannel: 'Jeff Nippard',
  },
  'single-arm-dumbbell-row': {
    cues: [
      'Brace your free hand on the bench, keep your back flat.',
      'Row your elbow up toward your hip, not out sideways.',
      'Let the dumbbell hang and stretch your lat at the bottom.',
    ],
    mistakes: [
      'Twisting the torso to help heave the weight up.',
      'Cutting the range short, never letting the arm fully extend.',
    ],
    blurb:
      'Unilateral loading drives a deep lat stretch and fixes side-to-side imbalances bilateral rows can hide.',
    freeExerciseDbId: 'One-Arm_Dumbbell_Row',
    videoId: 'DMo3HJoawrU',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'face-pull': {
    cues: [
      'Pull the rope apart toward your eyes, not your throat.',
      'Finish with thumbs pointing behind you, like drawing a bow.',
      'Lead the pull keeping your elbows high the whole time.',
    ],
    mistakes: [
      'Pulling low toward the chest, turning it into a row.',
      'Using too much weight, losing the external-rotation finish.',
    ],
    blurb:
      'The single best cable move for rear-delt and rotator-cuff health — cheap insurance for shoulder longevity.',
    freeExerciseDbId: 'Face_Pull',
    videoId: 'cc0tasCalHg',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'straight-arm-pulldown': {
    cues: [
      'Keep a soft, fixed bend in the elbows all rep.',
      'Sweep the bar down in an arc, leading with your lats.',
      'Feel the stretch overhead before starting each rep.',
    ],
    mistakes: [
      'Bending the elbows more on the way down, becoming a pushdown.',
      'Using shoulders/torso to yank the weight instead of the lats.',
    ],
    blurb:
      'Isolates the lats through shoulder extension without elbow flexion, so grip/bicep fatigue never limits the set.',
    freeExerciseDbId: 'Straight-Arm_Pulldown',
    videoId: 'G9uNaXGTJ4w',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'overhead-press': {
    cues: [
      'Squeeze your glutes and brace your abs before you press.',
      'Move your head back and through once the bar clears your face.',
      'Finish by shrugging the bar up under lockout, over your ears.',
    ],
    mistakes: [
      'Leaning back excessively, turning it into an incline press.',
      'Flaring the elbows out to the sides right off the shoulders.',
    ],
    blurb:
      'The most direct test and builder of raw shoulder pressing strength, and it teaches full-body bracing.',
    freeExerciseDbId: 'Standing_Military_Press',
    videoId: '_RlRDWO2jfg',
    videoStartSec: 0,
    videoChannel: 'Jeff Nippard',
  },
  'seated-dumbbell-shoulder-press': {
    cues: [
      'Start with the dumbbells at ear height, not at the shoulders.',
      'Press up and slightly in, finishing near the top of your head.',
      "Keep your ribs down — don't arch to muscle it up.",
    ],
    mistakes: [
      'Excessive lower-back arch to help the last few reps.',
      'Letting the dumbbells drift forward instead of pressing straight up.',
    ],
    blurb:
      'Seated support removes leg-drive cheating so you isolate real shoulder pressing strength.',
    freeExerciseDbId: 'Seated_Dumbbell_Press',
    videoId: 'HzIiNhHhhtA',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'dumbbell-lateral-raise': {
    cues: [
      'Lead the raise with your elbows, pouring water from a jug.',
      'Raise only to shoulder height, not above it.',
      'Tip your pinkies up slightly at the top of the raise.',
    ],
    mistakes: [
      'Swinging the torso to launch the weight with momentum.',
      'Shrugging the traps up to help lift the dumbbells.',
    ],
    blurb:
      'The single best isolation move for round, wide-looking shoulders — side delts respond best to strict light-weight form.',
    freeExerciseDbId: 'Side_Lateral_Raise',
    videoId: 'SgyUoY0IZ7A',
    videoStartSec: 100,
    videoChannel: 'Jeff Nippard',
  },
  'cable-lateral-raise': {
    cues: [
      'Stand with the cable crossing your body for tension at the bottom.',
      'Raise your arm out to the side, leading with the elbow.',
      'Control the lowering instead of letting the cable snap it down.',
    ],
    mistakes: [
      'Standing too far from the machine, losing tension at the start.',
      'Using the free hand to brace and cheat the weight up.',
    ],
    blurb:
      'Unlike a dumbbell, the cable keeps tension on the side delt even at the bottom, where dumbbells go slack.',
    freeExerciseDbId: 'Cable_Seated_Lateral_Raise',
    videoId: 'SgyUoY0IZ7A',
    videoStartSec: 477,
    videoChannel: 'Jeff Nippard',
  },
  'reverse-pec-deck': {
    cues: [
      'Lead the movement with your elbows, not your hands.',
      'Keep a soft elbow bend, squeeze your shoulder blades together.',
      "Move slowly — this small muscle doesn't need momentum.",
    ],
    mistakes: [
      'Using too much weight, turning it into a mid-back row.',
      'Letting the hands lead, shifting work off the rear delts.',
    ],
    blurb:
      'The rear delts are chronically undertrained relative to front/side — this machine isolates them with the least technique risk.',
    freeExerciseDbId: 'Reverse_Machine_Flyes',
    videoId: 'SgyUoY0IZ7A',
    videoStartSec: 626,
    videoChannel: 'Jeff Nippard',
  },
  'barbell-curl': {
    cues: [
      'Pin your elbows to your sides and keep them there.',
      'Curl the bar up without swinging your torso to help.',
      'Squeeze hard at the top for a full second.',
    ],
    mistakes: [
      'Swinging the hips/back to sling the weight up.',
      'Letting the elbows drift forward as the weight gets heavy.',
    ],
    blurb:
      'The classic mass-builder for biceps — strict elbow position separates a real curl from a hip-driven swing.',
    freeExerciseDbId: 'Barbell_Curl',
    videoId: 'GNO4OtYoCYk',
    videoStartSec: 116,
    videoChannel: 'Jeff Nippard',
  },
  'dumbbell-curl': {
    cues: [
      'Keep your elbows pinned to your sides the whole set.',
      'Rotate your palm up as you curl for a full squeeze.',
      'Lower under control instead of dropping the weight down.',
    ],
    mistakes: [
      'Swinging the dumbbells up using body momentum.',
      'Letting the elbows drift forward, turning it into a front raise.',
    ],
    blurb:
      'The simplest, most accessible biceps builder in the gym — a baseline every lifter can load and progress.',
    freeExerciseDbId: 'Dumbbell_Bicep_Curl',
    videoId: 'GNO4OtYoCYk',
    videoStartSec: 217,
    videoChannel: 'Jeff Nippard',
  },
  'incline-dumbbell-curl': {
    cues: [
      'Let your arms hang straight down from your shoulders to start.',
      'Curl without letting your elbows drift forward off the bench.',
      'Get a full stretch at the bottom of every rep.',
    ],
    mistakes: [
      'Letting the shoulders round forward, killing the stretch.',
      'Rushing the eccentric instead of controlling it down.',
    ],
    blurb:
      'The incline angle pins the shoulder back and stretches the long head of the biceps harder than a standing curl.',
    freeExerciseDbId: 'Incline_Dumbbell_Curl',
    videoId: 'GNO4OtYoCYk',
    videoStartSec: 320,
    videoChannel: 'Jeff Nippard',
  },
  'hammer-curl': {
    cues: [
      'Keep your palms facing each other the entire rep.',
      "Curl straight up — don't let the dumbbells swing outward.",
      'Keep your elbows fixed at your sides throughout.',
    ],
    mistakes: [
      'Letting the wrist rotate toward a regular curl grip mid-rep.',
      'Using body momentum instead of a controlled curl.',
    ],
    blurb:
      "The neutral grip shifts emphasis onto the brachialis and forearm, adding arm thickness a supinated curl alone won't.",
    freeExerciseDbId: 'Hammer_Curls',
    videoId: 'GNO4OtYoCYk',
    videoStartSec: 786,
    videoChannel: 'Jeff Nippard',
  },
  'preacher-curl': {
    cues: [
      'Pin your upper arms flat against the pad the whole set.',
      'Stop just short of fully locking out at the bottom.',
      'Squeeze at the top without shrugging your shoulders up.',
    ],
    mistakes: [
      'Bouncing out of the bottom stretch instead of controlling it.',
      'Lifting the upper arms off the pad to cheat reps.',
    ],
    blurb:
      'The preacher angle removes shoulder/momentum help entirely, making it one of the strictest biceps builders available.',
    freeExerciseDbId: 'Cable_Preacher_Curl',
    videoId: 'sxA__DoLsgo',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'triceps-pushdown': {
    cues: [
      "Pin your elbows to your sides, don't let them drift.",
      'Push down and slightly spread the rope apart at the bottom.',
      'Control the weight back up instead of letting it fly.',
    ],
    mistakes: [
      'Letting the elbows travel forward away from the torso.',
      'Leaning over the bar, using body weight to push it down.',
    ],
    blurb:
      "A joint-friendly triceps isolation staple that's easy to load precisely for high volume.",
    freeExerciseDbId: 'Triceps_Pushdown',
    videoId: 'OpRMRhr0Ycc',
    videoStartSec: 60,
    videoChannel: 'Jeff Nippard',
  },
  'overhead-cable-triceps-extension': {
    cues: [
      'Keep your upper arms close to your ears and fixed.',
      'Extend your forearms forward and up, not straight overhead.',
      'Feel a deep stretch behind your elbow at the bottom.',
    ],
    mistakes: [
      'Letting the elbows flare out wide instead of staying narrow.',
      'Moving the shoulders to help instead of isolating the elbow.',
    ],
    blurb:
      'The overhead position stretches the long head of the triceps, the head most pressing/pushdown work neglects.',
    freeExerciseDbId: 'Triceps_Overhead_Extension_with_Rope',
    videoId: 'OpRMRhr0Ycc',
    videoStartSec: 275,
    videoChannel: 'Jeff Nippard',
  },
  'skull-crusher': {
    cues: [
      'Keep your upper arms vertical and still — only forearms move.',
      'Lower the bar toward your forehead or just past it.',
      'Extend back up under control, without flaring the elbows.',
    ],
    mistakes: [
      'Letting the elbows drift backward/forward instead of staying fixed.',
      'Using too much weight, turning it into a partial-range press.',
    ],
    blurb:
      "A high-stretch triceps builder that, done with strict elbow position, adds size the pushdown's limited range can't.",
    freeExerciseDbId: 'EZ-Bar_Skullcrusher',
    videoId: 'OpRMRhr0Ycc',
    videoStartSec: 410,
    videoChannel: 'Jeff Nippard',
  },
  'close-grip-bench-press': {
    cues: [
      'Set your grip just inside shoulder width, not fist-narrow.',
      'Keep your elbows tracking close to your torso on the way down.',
      'Drive through your palms and lock out fully at the top.',
    ],
    mistakes: [
      'Gripping too narrow, straining the wrists and elbows.',
      'Letting the elbows flare out, turning it back into a chest press.',
    ],
    blurb:
      'Lets you overload the triceps with real pressing weight — more loading potential than any single-joint triceps move.',
    freeExerciseDbId: 'Close-Grip_Barbell_Bench_Press',
    videoId: 'OpRMRhr0Ycc',
    videoStartSec: 728,
    videoChannel: 'Jeff Nippard',
  },
  'back-squat': {
    cues: [
      'Break at the hips and knees together, not knees first.',
      'Spread the floor apart with your feet to keep knees out.',
      'Keep your ribcage stacked over your hips the whole descent.',
    ],
    mistakes: [
      'Letting the knees cave inward, especially near the bottom.',
      'Losing the neutral spine and rounding the lower back.',
    ],
    blurb:
      'The foundational lower-body compound for quad and total leg mass, and the best transferable strength builder in the gym.',
    freeExerciseDbId: 'Barbell_Squat',
    videoId: 'Po9CDtfcLJI',
    videoStartSec: 0,
    videoChannel: 'Squat University',
  },
  'front-squat': {
    cues: [
      'Keep your elbows up high so the bar rests on your shoulders.',
      'Sit straight down between your hips, staying upright through the torso.',
      'Push your knees forward over your toes as you descend.',
    ],
    mistakes: [
      'Letting the elbows drop, dumping the bar off the shoulders.',
      'Leaning forward like a back squat instead of staying vertical.',
    ],
    blurb:
      'The most quad-dominant barbell squat variation — the upright torso shifts far more work onto the quads than a back squat.',
    freeExerciseDbId: 'Front_Squat_Clean_Grip',
    videoId: 'v-mQm_droHg',
    videoStartSec: 242,
    videoChannel: 'Jeff Nippard',
  },
  'hack-squat': {
    cues: [
      'Sink as deep as you comfortably can without your back rounding.',
      'Keep your whole foot planted, weight through heel to toe.',
      "Lower slowly — there's no need to rush the descent.",
    ],
    mistakes: [
      'Stopping the descent short of a full, controlled range.',
      'Letting the lower back round off the pad at depth.',
    ],
    blurb:
      'Loads the quads through a long range with the machine handling balance — a safe way to chase deep-squat quad growth.',
    freeExerciseDbId: 'Hack_Squat',
    videoId: '4cxt_Tldugw',
    videoStartSec: 217,
    videoChannel: 'Renaissance Periodization',
  },
  'goblet-squat': {
    cues: [
      'Hold the weight close to your chest, elbows pointing down.',
      'Use your elbows to nudge your knees out as you sit.',
      'Sit straight down between your heels, staying tall through the chest.',
    ],
    mistakes: [
      'Letting the weight drift away from the chest, pulling you forward.',
      'Rushing the depth instead of controlling the descent.',
    ],
    blurb:
      'The easiest squat pattern to teach beginners — the front-loaded weight naturally keeps the torso upright and depth honest.',
    freeExerciseDbId: 'Goblet_Squat',
    videoId: '8sXVbOBFPig',
    videoStartSec: 480,
    videoChannel: 'Jeff Nippard',
  },
  'leg-press': {
    cues: [
      'Keep your lower back flat against the pad, not rounding.',
      'Lower until knees reach roughly 90 degrees, no deeper if back lifts.',
      'Push through your whole foot, not just your toes.',
    ],
    mistakes: [
      'Letting the hips round off the pad at the bottom.',
      'Locking the knees out hard and bouncing at the top.',
    ],
    blurb: 'Loads the quads hard with none of the balance/bracing demand of a free squat.',
    freeExerciseDbId: 'Leg_Press',
    videoId: 'B6rGDcfyPto',
    videoStartSec: 60,
    videoChannel: 'Renaissance Periodization',
  },
  'romanian-deadlift': {
    cues: [
      'Push your hips straight back like closing a car door with them.',
      'Keep the bar dragging down your thighs the whole way.',
      'Stop at a hard hamstring stretch, not when the back rounds.',
    ],
    mistakes: [
      'Squatting the weight down instead of hinging at the hips.',
      'Rounding the lower back to chase extra range of motion.',
    ],
    blurb:
      'The best hip-hinge movement for hamstrings and glutes while teaching the pattern the deadlift depends on.',
    freeExerciseDbId: 'Romanian_Deadlift',
    videoId: '_oyxCn2iSjU',
    videoStartSec: 82,
    videoChannel: 'Jeff Nippard',
  },
  deadlift: {
    cues: [
      'Take the slack out of the bar before you pull.',
      'Push the floor away with your legs, not your back.',
      'Keep the bar dragging up your shins and thighs the whole pull.',
    ],
    mistakes: [
      'Letting the hips shoot up first, turning it into a stiff-leg pull.',
      'Rounding the lower back to start the pull off the floor.',
    ],
    blurb:
      'The single most complete strength movement in the gym, building the entire posterior chain and grip in one lift.',
    freeExerciseDbId: 'Barbell_Deadlift',
    videoId: 'g2Xl1zJeArs',
    videoStartSec: 0,
    videoChannel: 'Squat University',
  },
  'bulgarian-split-squat': {
    cues: [
      'Keep most of your weight on the front foot to balance.',
      'Drop straight down, not forward toward your front knee.',
      'Keep your torso tall through the whole rep.',
    ],
    mistakes: [
      'Placing the back foot too high, stressing the knee.',
      'Letting the front knee cave inward on the way up.',
    ],
    blurb:
      'A brutal single-leg quad and glute builder that also exposes and fixes side-to-side leg imbalances.',
    freeExerciseDbId: null,
    videoId: 'hPlKPjohFS0',
    videoStartSec: 10,
    videoChannel: 'Squat University',
  },
  'walking-lunge': {
    cues: [
      'Take a stride long enough that your front shin stays vertical.',
      'Drop your back knee straight down toward the floor.',
      'Push through your front heel to stand up and step through.',
    ],
    mistakes: [
      'Taking too short a stride, driving the front knee past the toes.',
      'Letting the torso lean forward instead of staying upright.',
    ],
    blurb:
      "Combines a quad/glute lunge with dynamic, athletic carryover that static lunges don't train.",
    freeExerciseDbId: 'Barbell_Walking_Lunge',
    videoId: 'Z6R8A5tcrTc',
    videoStartSec: 31,
    videoChannel: 'Renaissance Periodization',
  },
  'leg-extension': {
    cues: [
      'Adjust the pad to sit just above your ankle, not your shin.',
      'Extend all the way to a full, controlled lockout.',
      'Lower slowly instead of letting the stack drop.',
    ],
    mistakes: [
      'Using momentum/swinging to kick the weight up.',
      'Only using the top half of the range of motion.',
    ],
    blurb:
      'The most direct quad isolation available — a clean way to finish legs after squats/presses.',
    freeExerciseDbId: 'Leg_Extensions',
    videoId: 'ljO4jkwv8wQ',
    videoStartSec: 209,
    videoChannel: 'Jeff Nippard',
  },
  'seated-leg-curl': {
    cues: [
      'Point your toes toward your shins to bias the hamstrings.',
      'Curl through a full range, squeezing hard at the top.',
      "Lower under control — don't let the pad snap back.",
    ],
    mistakes: [
      'Letting the hips rise off the seat to cheat extra range.',
      'Pointing the toes down, shifting work onto the calves.',
    ],
    blurb:
      "Isolates the hamstrings through knee flexion, which hip-dominant RDLs and deadlifts don't hit directly.",
    freeExerciseDbId: 'Seated_Leg_Curl',
    videoId: 'jobEeklwrrs',
    videoStartSec: 31,
    videoChannel: 'Renaissance Periodization',
  },
  'lying-leg-curl': {
    cues: [
      'Keep your hips pressed flat into the bench the whole rep.',
      'Curl through a full range, squeezing hard at the top.',
      'Lower under control instead of letting the pad snap back.',
    ],
    mistakes: [
      'Lifting the hips off the bench to cheat extra range.',
      'Using short, fast partial reps instead of a full curl.',
    ],
    blurb:
      "The prone position removes any hip-drive cheating that's easier to sneak into the seated version.",
    freeExerciseDbId: 'Lying_Leg_Curls',
    videoId: 'jobEeklwrrs',
    videoStartSec: 31,
    videoChannel: 'Renaissance Periodization',
  },
  'hip-thrust': {
    cues: [
      'Tuck your chin and ribs down to stay neutral at lockout.',
      'Drive through your heels, not your toes.',
      'Squeeze your glutes hard at the top and pause a beat.',
    ],
    mistakes: [
      'Overextending the lower back at the top instead of squeezing glutes.',
      'Pushing through the toes, shifting work to the quads.',
    ],
    blurb:
      'The single best loaded glute builder — the horizontal hinge loads the glutes at their strongest range.',
    freeExerciseDbId: 'Barbell_Hip_Thrust',
    videoId: 'xDmFkJxPzeM',
    videoStartSec: 25,
    videoChannel: 'Jeff Nippard',
  },
  'standing-calf-raise': {
    cues: [
      'Get a deep stretch at the bottom before driving back up.',
      'Rise all the way onto your toes and pause at the top.',
      "Move slowly — don't bounce out of the bottom stretch.",
    ],
    mistakes: [
      'Using tiny, bouncy partial reps instead of a full range.',
      'Bending the knees to help push the weight up.',
    ],
    blurb:
      "Trains the gastrocnemius through a long, straight-leg range a seated calf raise can't reach.",
    freeExerciseDbId: 'Standing_Calf_Raises',
    videoId: '21inrjhoFkQ',
    videoStartSec: 236,
    videoChannel: 'Jeff Nippard',
  },
  'seated-calf-raise': {
    cues: [
      'Let your heels drop as low as comfortably possible.',
      'Press up through the balls of your feet to full extension.',
      'Pause briefly at the top before lowering under control.',
    ],
    mistakes: [
      'Rushing through short, bouncy partial reps.',
      'Letting the knees drift forward off the pad.',
    ],
    blurb:
      'The bent-knee position shifts emphasis onto the soleus, the calf muscle standing raises undertrain.',
    freeExerciseDbId: 'Seated_Calf_Raise',
    videoId: '21inrjhoFkQ',
    videoStartSec: 469,
    videoChannel: 'Jeff Nippard',
  },
  'hanging-knee-raise': {
    cues: [
      'Curl your pelvis under at the top, not just swinging.',
      'Keep the movement slow — no swinging from the shoulders.',
      'Lower under control until your legs are fully straight.',
    ],
    mistakes: [
      'Using momentum/swinging instead of a controlled hip-flexion curl.',
      'Stopping the raise at hip height without curling the pelvis.',
    ],
    blurb:
      "One of the few ab exercises that trains real resisted hip flexion, which planks/crunches don't provide.",
    freeExerciseDbId: 'Hanging_Leg_Raise',
    videoId: 'RD_A-Z15ER4',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'cable-crunch': {
    cues: [
      'Round your spine, crunching your ribs toward your hips.',
      "Keep hips fixed — it's a spine move, not a hip move.",
      'Squeeze and hold for a second at full contraction.',
    ],
    mistakes: [
      'Pulling with the arms/lats instead of crunching with the abs.',
      'Moving the hips back and forth instead of flexing the spine.',
    ],
    blurb:
      "Lets you add external load to a crunch, which bodyweight ab work eventually can't progress past.",
    freeExerciseDbId: 'Cable_Crunch',
    videoId: '6GMKPQVERzw',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  plank: {
    cues: [
      'Squeeze your glutes and brace your abs, like bracing for a punch.',
      'Keep a straight line from your ears to your ankles.',
      'Breathe steadily instead of holding your breath.',
    ],
    mistakes: [
      'Letting the hips sag toward the floor as fatigue sets in.',
      'Piking the hips up to make the hold easier.',
    ],
    blurb:
      "Trains the abs' real job — resisting spinal extension under load — and doubles as a low-risk core baseline.",
    freeExerciseDbId: 'Plank',
    videoId: '1G0y8D5rFDc',
    videoStartSec: 74,
    videoChannel: 'Jeff Nippard',
  },
  'ab-wheel-rollout': {
    cues: [
      'Brace your abs hard before you start rolling out.',
      'Roll out only as far as you can keep your back flat.',
      'Pull yourself back using your abs, not just your arms.',
    ],
    mistakes: [
      'Letting the lower back arch/sag at full extension.',
      'Rolling out farther than you can control back from.',
    ],
    blurb:
      'One of the hardest anti-extension core exercises available — builds bracing strength that protects the spine in squats and deadlifts.',
    freeExerciseDbId: 'Barbell_Ab_Rollout',
    videoId: '1G0y8D5rFDc',
    videoStartSec: 302,
    videoChannel: 'Jeff Nippard',
  },
  'pallof-press': {
    cues: [
      "Stand sideways to the cable so it's constantly trying to twist you.",
      'Press straight out and resist any rotation in your torso.',
      'Brace your abs before you press, not after you feel the pull.',
    ],
    mistakes: [
      'Letting the torso rotate toward the cable instead of resisting.',
      'Pressing from a stance too narrow to stay stable.',
    ],
    blurb:
      "Trains the core's anti-rotation function directly, which is what protects the spine during real-world twisting loads.",
    freeExerciseDbId: 'Pallof_Press',
    videoId: 'mpGF2t51IWE',
    videoStartSec: 21,
    videoChannel: 'Squat University',
  },
  'dumbbell-shrug': {
    cues: [
      'Lift straight up toward your ears, not up and back.',
      'Pause and hold a full second at the top.',
      'Lower under control instead of dropping the weight.',
    ],
    mistakes: [
      'Rolling the shoulders in a circle instead of a straight shrug.',
      'Using knee momentum to help start the lift.',
    ],
    blurb:
      'The traps have no other direct exercise in the base list, and they\'re a highly visible muscle for a "strength library" — a glaring gap without this.',
    freeExerciseDbId: 'Dumbbell_Shrug',
    videoId: '_t3lrPI6Ns4',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'farmers-carry': {
    cues: [
      'Set your shoulders back and down before your first step.',
      'Take short, quick steps rather than long, swinging strides.',
      'Keep your ribs stacked over your hips the whole walk.',
    ],
    mistakes: [
      'Letting the shoulders round forward and the weights swing.',
      'Leaning to one side to compensate for grip fatigue.',
    ],
    blurb:
      'A full-body strength and grip builder no other exercise on this list trains — practical, low-technical-risk total-body work.',
    freeExerciseDbId: 'Farmers_Walk',
    videoId: 'kL5ZQqrDQlc',
    videoStartSec: 0,
    videoChannel: 'Alan Thrall (Untamed Strength)',
  },
  'cable-pull-through': {
    cues: [
      'Push your hips back toward the machine, not just bending forward.',
      'Let the rope pull through between your legs at the bottom.',
      'Finish by squeezing your glutes hard, standing fully tall.',
    ],
    mistakes: [
      'Squatting the weight instead of hinging at the hips.',
      'Rounding the lower back to reach further at the bottom.',
    ],
    blurb:
      "A self-limiting hinge pattern that's easier for hinge-shy beginners to learn than an RDL, while still building real glute/hamstring strength.",
    freeExerciseDbId: 'Pull_Through',
    videoId: '3ryh7PNhz3E',
    videoStartSec: 753,
    videoChannel: 'Jeff Nippard',
  },
  'hip-abduction-machine': {
    cues: [
      'Sit tall with your lower back flat against the pad.',
      'Push your knees apart using your outer hips, not feet.',
      'Control the return instead of letting the pads snap together.',
    ],
    mistakes: [
      'Leaning the torso forward to add momentum.',
      'Using tiny, fast partial reps instead of a full range.',
    ],
    blurb:
      'Directly targets the glute medius — a hip stabilizer in every squat, lunge, and single-leg move, with no other direct exercise on this list.',
    freeExerciseDbId: null,
    videoId: '3ryh7PNhz3E',
    videoStartSec: 500,
    videoChannel: 'Jeff Nippard',
  },
};
