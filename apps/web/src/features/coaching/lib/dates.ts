// Coaching dates ("2 Oct", "Wed 30 Sep") come from the one shared formatter in
// `@chefer/utils`, so web and mobile read the same and "Sept" never appears.
export { formatDayWithWeekday, formatShortDay, weekdayIndexOf, weekdayName } from '@chefer/utils';
