# Icon library (Ionicons-outline look-alikes; the app uses @expo/vector-icons Ionicons)

Wrapper (size S, color C):
`<svg width="S" height="S" viewBox="0 0 24 24" fill="none" stroke="C" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">PATHS</svg>`
Use `stroke="currentColor"` when the parent sets `color`. Filled variants: add `fill="currentColor"` on the path.

arrow-back: <path d="M11 5l-7 7 7 7M4 12h16"/>
arrow-up: <path d="M12 19V5M6 11l6-6 6 6"/>
arrow-undo-outline: <path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>
chevron-back: <path d="M15 5l-7 7 7 7"/>
chevron-forward: <path d="M9 5l7 7-7 7"/>
chevron-down: <path d="M5 9l7 7 7-7"/>
chevron-up: <path d="M5 15l7-7 7 7"/>
add: <path d="M12 5v14M5 12h14"/>
remove: <path d="M5 12h14"/>
close: <path d="M6 6l12 12M18 6L6 18"/>
checkmark: <path d="M5 12.5l4.5 4.5L19 7.5"/>
checkmark-circle (filled): <circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none"/><path d="M7.5 12.3l3 3 6-6" stroke="#ffffff"/>
checkmark-circle-outline: <circle cx="12" cy="12" r="9"/><path d="M7.5 12.3l3 3 6-6"/>
today-outline: <rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/><rect x="13.5" y="13" width="3.5" height="3.5" rx=".8"/>
calendar-outline: <rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/>
cart-outline: <circle cx="9" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/><path d="M2.5 3.5h3l2.4 11.5h11l2-8.5H6.6"/>
book-outline: <path d="M12 6.5c-2-1.7-5-2.3-8.5-2v14c3.5-.3 6.5.3 8.5 2 2-1.7 5-2.3 8.5-2v-14c-3.5-.3-6.5.3-8.5 2zM12 6.5v14"/>
menu-outline: <path d="M4 7h16M4 12h16M4 17h16"/>
list-outline: <path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" stroke-width="2.2"/>
barbell-outline: <path d="M2.5 12h19M6 7.5v9M9 6v12M15 6v12M18 7.5v9"/>
stats-chart-outline: <path d="M4 20.5h16"/><rect x="5" y="13" width="3" height="7.5" rx=".8"/><rect x="10.5" y="5" width="3" height="15.5" rx=".8"/><rect x="16" y="9.5" width="3" height="11" rx=".8"/>
time-outline: <circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>
flame-outline: <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-4.3 4-6.3 4.5-11 2.8 1.6 4.3 4.3 4.5 6.8.9-.6 1.6-1.6 1.8-2.8 1.5 1.5 2.2 3.9 2.2 6 0 4.2-2.6 7.2-6.5 7.2z"/>
heart-outline: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.3a4.3 4.3 0 017.5 2.5C19.5 15.4 12 20 12 20z"/>
heart (filled): same path with fill="currentColor"
search: <circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/>
link-outline: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>
restaurant-outline: <path d="M6 3v7a2 2 0 002 2v9M10 3v7a2 2 0 01-2 2M8 3v6M17.5 21V3c-2 1-3.5 3.5-3.5 7v3h3.5"/>
play: <path d="M8 5.5v13l10-6.5z" fill="currentColor"/>
pause: <path d="M8.5 5v14M15.5 5v14" stroke-width="2.5"/>
camera-outline: <path d="M4 8h3l1.8-2.5h6.4L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>
images-outline: <rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M20.5 15.5l-5-5-7.5 8.5"/>
image-outline: same as images-outline
trash-outline: <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10.5 11v5.5M13.5 11v5.5"/>
pencil-outline: <path d="M15.5 4.5l4 4L9 19H5v-4z"/>
archive-outline: <rect x="3.5" y="4.5" width="17" height="4.5" rx="1"/><path d="M5 9v10.5h14V9M10 13h4"/>
warning (filled): <path d="M12 3.5L2.5 20h19z" fill="currentColor" stroke="none"/><path d="M12 10v4.5M12 17v.3" stroke="#ffffff" stroke-width="2"/>
star (filled): <path d="M12 3.5l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.8l-5.4 2.9 1.2-5.9L3.4 9.7l6-.7z" fill="currentColor"/>
star-outline: same path without fill
people-outline: <circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9.5" r="2.5"/><path d="M16.5 14.2c2.7.2 4.5 2 4.5 4.8"/>
person-outline: <circle cx="12" cy="8" r="3.8"/><path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"/>
settings-outline: <circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>
chatbubble-ellipses-outline: <path d="M12 4c4.7 0 8.5 3.1 8.5 7s-3.8 7-8.5 7c-1 0-2-.1-2.9-.4L4.5 20l1.2-3.6C4.3 15 3.5 13.1 3.5 11c0-3.9 3.8-7 8.5-7z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" stroke-width="2.4"/>
repeat-outline: <path d="M17 3l3 3-3 3M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 01-3 3H4"/>
scale-outline: <rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M7.5 10a6 6 0 019 0"/><path d="M12 10.5l1.5-2.5"/>
trending-up-outline: <path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>
swap-horizontal-outline: <path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4"/>
clipboard-outline: <rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6"/>
file-tray-stacked-outline: <path d="M4 8l2.5-4h11L20 8v12H4z"/><path d="M4 8h5a3 3 0 006 0h5M4 14h5a3 3 0 006 0h5"/>
color-wand-outline: <path d="M4 20L15 9M13 7l2-2 4 4-2 2"/><path d="M8 3v3M6.5 4.5h3M19 14v3M17.5 15.5h3"/>
mail-unread-outline: <rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6.5L20.5 7"/>
nutrition-outline: <path d="M12 7c-1-1-3-1.6-4.6-.8C5 7.5 4.6 11 5.6 14c1 3.2 3 5.8 4.6 5.8 1 0 1.2-.5 1.8-.5s.8.5 1.8.5c1.6 0 3.6-2.6 4.6-5.8 1-3 .6-6.5-1.8-7.8C15 5.4 13 6 12 7zM12 7c0-2 1-3.5 3-4"/>
lock-closed-outline: <rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/>
cloud-offline-outline: <path d="M7 18.5h10a4 4 0 00.6-7.95A6 6 0 006.3 9.6 4.5 4.5 0 007 18.5z"/><path d="M4 4l16 16"/>
compass-outline: <circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>
refresh-outline: <path d="M19.5 12a7.5 7.5 0 11-2.2-5.3M19.5 4v4.5H15"/>
sparkles: <path d="M10 3.5l1.6 4.4 4.4 1.6-4.4 1.6L10 15.5l-1.6-4.4L4 9.5l4.4-1.6zM18 13l.9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9z" fill="currentColor" stroke="none"/>
information-circle (filled): <circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none"/><path d="M12 11v5.5M12 7.8v.2" stroke="#ffffff" stroke-width="2"/>
ellipsis-horizontal: <path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="3"/>
albums-outline: <rect x="3.5" y="8" width="17" height="12.5" rx="2"/><path d="M6 5h12M8.5 2.5h7"/>
eye-outline: <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>

## Added for the revamp shell (master, Oct 2026)

sunny-outline (tab Today): <circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>
sunny (filled, active Today): <circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" stroke-width="2"/>
calendar (filled, active Plan): <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="currentColor"/><path d="M8 3v3.5M16 3v3.5"/><path d="M3.5 9.5h17" stroke="#ffffff"/>
cart (filled, active Shop): <circle cx="9" cy="20" r="1.5" fill="currentColor"/><circle cx="17.5" cy="20" r="1.5" fill="currentColor"/><path d="M2.5 3.5h3l2.4 11.5h11l2-8.5H6.6z" fill="currentColor"/>
barbell (filled, active Train): <path d="M2.5 12h19" stroke-width="2.2"/><rect x="5" y="7" width="3" height="10" rx="1" fill="currentColor"/><rect x="16" y="7" width="3" height="10" rx="1" fill="currentColor"/>
person-circle-outline (tab You): <circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.2c1.2-2 3.2-3 5.5-3s4.3 1 5.5 3"/>
person-circle (filled, active You): <circle cx="12" cy="12" r="9.5" fill="currentColor"/><circle cx="12" cy="10" r="3" fill="#ffffff" stroke="none"/><path d="M6.5 18.2c1.2-2 3.2-3 5.5-3s4.3 1 5.5 3" stroke="#ffffff" fill="#ffffff"/>
sparkles-outline (Ask Chef): <path d="M10 3.5l1.6 4.4 4.4 1.6-4.4 1.6L10 15.5l-1.6-4.4L4 9.5l4.4-1.6zM18 13l.9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9z"/>
home-outline (Household): <path d="M4 10.5L12 4l8 6.5V20H4z"/><path d="M9.5 20v-5.5h5V20"/>
library-outline (Exercises): <path d="M5 4v16M9 4v16"/><path d="M13 4.5l4.5 15.5"/><path d="M3.5 20h17"/>
options-outline (Gym settings, sliders): <path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>
help-circle-outline: <circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.3M12 17h.01" />
document-text-outline: <path d="M6 3.5h8l4 4V20.5H6z"/><path d="M14 3.5V8h4M9 12h6M9 15.5h6"/>
log-out-outline: <path d="M10 4.5H5.5v15H10"/><path d="M14.5 8l4 4-4 4M18.5 12H9"/>
timer-outline: <circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M10 2.5h4"/>
copy-outline: <rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5a1.5 1.5 0 00-1.5-1.5h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8"/>
ellipsis-circle-outline: <circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01" stroke-width="2.6"/>
share-outline: <path d="M12 3.5v11M8 7l4-3.5L16 7"/><path d="M7 11H5.5v9.5h13V11H17"/>
shield-checkmark-outline: <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-4.5"/>
notifications-outline: <path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>
lock-closed-outline: <rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/>
person-add-outline: <circle cx="9.5" cy="8" r="3.5"/><path d="M3 20c0-3.6 2.9-6 6.5-6 1.4 0 2.6.3 3.7.9M18 13v6M15 16h6"/>
ban-outline: <circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>
