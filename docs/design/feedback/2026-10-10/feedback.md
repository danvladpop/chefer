# UI/UX feedback — 10 October 2026

Source: Google Doc "Chefer feedback 2"
(https://docs.google.com/document/d/1W_bcY94tvL2S3iKoEo1eP8vRl69rsCteQ3n-K5e7R2w/edit), copied verbatim below.
The reference screenshots attached to the doc are in this folder (`ref-*.png`). They are layout inspiration
only: keep Chefer's own colour roles and brand.

---

Ui/ Ux Feedback after review:

Check the attached images and the instructions I wrote below and improve the designs for the chefer app.

Improvements:

General

- All the screens should be easy to view and very intuitive for the user. There shouldn't be a lot of text displayed. Reuse UI components to have a seamless application flow. For example the grid where the recipes are displayed and the grid where the workouts are displayed should be similar from a UI/ UX perspective. The cookbook button should be more visible and in the same way the Routines button should be displayed because when you want to add a new receipt as a user you go to the cookbook area and in the same I will go to the Train area and add a Routine.
- Consider adding some small emojis for macros to be nicer displayed but still relevant and clear what they mean

Today's screen

- For the Today or home page the user should see a diagram (check attached images for inspiration) with today's intake and remaining calories and the other macros. On this screen the user should also see the next meal he has to eat which should have the option to be marked as eat or select cook now or swap or skipp. Next the user should see some brief info about the training he has to do today or if it was already logged there should be some stats about calories burned, maybe duration
- Then the user should have the option to log another workout in the train area on Today screen, similar to cook now option
- Then there should be options for adding weight but after the weight is added for a day display it as a progress widget
- Regarding See full Day option think about how to make it more user friendly
- Add a Stats button and when clicked and the user should see stats about heating trends, weight loss/ gained, training starts

Plan screen:

- Rename this menu item to be clear that it refers to food because it's not clear here if you plan a workout or a weekly meals
- Here the user is overwhelmed with a lot of text and a lot of menus. There shouldn't be a lot of text, only what is absolutely necessary for the user to understand what the app is doing
- Here there should be today's menu displayed with the days at the top to be able to change what meals you see for a day and change the week between this week and next week. Also have the option to change a meal, change/ regenerate week plan
- Move plan settings to You tab. In there we should have everything related to settings
- In here there shouldn't be anything training related
- Show nicer the numbers or calories on this page for the selected day because the plain text there is now is hard to read and notice
- The AI chef button at the top should be a generally available functionality which should be present on all pages like an AI assistant to create meals or workout routines
- Improve the grid where the shown recipes for the selected day are displayed because the images are not nicely framed

Train screen:

- This screen is overwhelming and hard to read. Check attached screenshots and come up with a more UX friendly design
- Here the user should see its training progress for the week, should see ongoing workout if there is any, should see past workouts in a grid similar to the one from the Plan page where the meals for a day are shown
- Should see next routine, have the possibility to edit it or log freestyle workout
- Move all kinds of settings to You area

Shop screen:

- Too much text here
- Add checkbox list with all the needed ingredients for the week in a similar grid as the other existing pages
- Add a search and add item
- Display a cost estimate but not with a lot of text
- When an item is checked move it to the bottom of the list
- Group the items by type for example Fruits and vegetables, dairy products, etc

## Reference images

| File                                             | What it shows (borrow the layout idea, not the palette)                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ref-1-today-gauge-macros-planned-meals.png`     | Today: day strip, half-ring calorie gauge (consumed / remaining / target), three macro bars with values, "Planned meals" list with a ⋯ action per meal |
| `ref-2-calorie-gauge-macro-emojis.png`           | Compact card: calorie gauge with "855 kcal left", macro rows with food emojis (🍖 protein, 🍞 carbs, 🥑 fat) and coloured bars                         |
| `ref-3-home-day-strip-stat-tiles-goal-cards.png` | Home: greeting + day strip, two stat tiles (water, calories), "Today's goals" cards (activity, minutes, Start now) and "See all"                       |
| `ref-4-live-workout-header.png`                  | Live workout header: name, elapsed time, kcal, progress bar, big pause button                                                                          |
| `ref-5-workout-detail-exercise-list.png`         | Workout detail: header stats, "30 min · 11 workouts", exercise cards (illustration, name, reps, chevron), "Start now"                                  |
| `ref-6-workout-completed.png`                    | Workout completed: trophy, three stat tiles (kcal, active time, exercises), rating, Done                                                               |
