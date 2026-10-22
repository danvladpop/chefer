package expo.modules.cheferresttimer

import android.app.ActivityManager
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

/** The rest as the native side knows it. Mirrors the JS `RestTimerState`. */
data class NativeRest(val endsAt: Long, val durationSec: Long, val label: String?)

/**
 * Owns what a rest needs outside the app (C1): the ongoing countdown
 * notification (lock screen, Skip / +30 s) and the on-time "Rest is over" alert.
 *
 * UX-GYM-10: expo-notifications' DATE trigger falls back to an INEXACT alarm
 * when the app may not schedule exact alarms (the default since Android 14),
 * which arrived ~2 min late. Here the alert uses, in order:
 *  1. `setExactAndAllowWhileIdle` when exact alarms are allowed (pre-12, or the
 *     user granted "Alarms & reminders") — survives the process being killed;
 *  2. otherwise `setExact` with an OnAlarmListener, which needs no permission
 *     (no SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM, so no Play declaration) and is
 *     exact while the process lives — plus an inexact while-idle alarm as a
 *     backstop in case the process dies; whichever comes first wins, the other
 *     is cancelled or ignored (`onRestOver` checks the stored end).
 * The JS stays the source of truth and calls `sync` on every change; lock-screen
 * actions record `lastActionAt` so a JS that wasn't running adopts them later.
 */
object RestTimerController {
  const val ADD_STEP_SEC = 30L
  const val ACTION_ALARM = "dev.chefer.resttimer.ALARM"
  const val ACTION_SKIP = "dev.chefer.resttimer.SKIP"
  const val ACTION_ADD = "dev.chefer.resttimer.ADD"
  const val EXTRA_ENDS_AT = "endsAt"

  // Same id and settings as the JS expo-notifications channel (rest-timer.ts),
  // so the user's per-channel choices carry over.
  private const val ALERT_CHANNEL_ID = "rest-timer"
  private const val COUNTDOWN_CHANNEL_ID = "rest-timer-countdown"
  private const val COUNTDOWN_NOTIFICATION_ID = 7301
  private const val ALERT_NOTIFICATION_ID = 7302
  private const val PREFS = "chefer.restTimer"
  private const val KEY_REST = "rest"
  private const val KEY_LAST_ACTION = "lastActionAt"
  private const val ALARM_TAG = "chefer:rest-over"
  // Android 16 "Live Update" (status-bar chip). Literal so it compiles on any SDK.
  private const val EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing"

  /** Set by the module while JS is listening; called on lock-screen actions. */
  @Volatile var onChange: (() -> Unit)? = null

  private val mainHandler = Handler(Looper.getMainLooper())
  private var listener: AlarmManager.OnAlarmListener? = null

  fun current(context: Context): NativeRest? {
    val raw = prefs(context).getString(KEY_REST, null) ?: return null
    return try {
      val json = JSONObject(raw)
      NativeRest(
        json.getLong("endsAt"),
        json.getLong("durationSec"),
        if (json.isNull("label")) null else json.getString("label"),
      )
    } catch (e: Exception) {
      null
    }
  }

  fun lastActionAt(context: Context): Long? =
    prefs(context).getLong(KEY_LAST_ACTION, 0L).takeIf { it > 0L }

  /** Makes the countdown notification and the alarm match `rest` (null = no rest). */
  @Synchronized
  fun sync(context: Context, rest: NativeRest?) {
    val app = context.applicationContext
    if (rest == null || rest.endsAt <= System.currentTimeMillis() + 1000) {
      store(app, null)
      cancelAlarms(app)
      NotificationManagerCompat.from(app).cancel(COUNTDOWN_NOTIFICATION_ID)
      return
    }
    store(app, rest)
    NotificationManagerCompat.from(app).cancel(ALERT_NOTIFICATION_ID)
    postCountdown(app, rest)
    scheduleAlarm(app, rest.endsAt)
  }

  fun skipFromLockScreen(context: Context) {
    markAction(context)
    sync(context, null)
    onChange?.invoke()
  }

  fun addFromLockScreen(context: Context) {
    val rest = current(context) ?: return
    val now = System.currentTimeMillis()
    markAction(context)
    sync(
      context,
      rest.copy(
        endsAt = maxOf(rest.endsAt, now) + ADD_STEP_SEC * 1000,
        durationSec = rest.durationSec + ADD_STEP_SEC,
      ),
    )
    onChange?.invoke()
  }

  /** The alarm fired (listener or backstop). Alerts only for the rest it was set for. */
  @Synchronized
  fun onRestOver(context: Context, endsAt: Long) {
    val app = context.applicationContext
    val rest = current(app) ?: return
    if (rest.endsAt != endsAt) return // a stale alarm for a changed rest
    store(app, null)
    cancelAlarms(app)
    val manager = NotificationManagerCompat.from(app)
    manager.cancel(COUNTDOWN_NOTIFICATION_ID)
    // In the app, the timer bar buzzes instead (as the JS alert never showed
    // in the foreground either).
    if (isAppInForeground() || !manager.areNotificationsEnabled()) return
    ensureChannels(app)
    val alert =
      NotificationCompat.Builder(app, ALERT_CHANNEL_ID)
        .setSmallIcon(R.drawable.chefer_rest_timer)
        .setColor(BRAND_COLOR)
        .setContentTitle("Rest is over")
        .setContentText("Time for your next set.")
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setAutoCancel(true)
        .setTimeoutAfter(10 * 60 * 1000L)
        .setContentIntent(openAppIntent(app))
        .build()
    try {
      manager.notify(ALERT_NOTIFICATION_ID, alert)
    } catch (e: SecurityException) {
      // POST_NOTIFICATIONS revoked between the check and the post.
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private val BRAND_COLOR = 0xFF944A00.toInt()

  private fun isAppInForeground(): Boolean {
    val info = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(info)
    return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun store(context: Context, rest: NativeRest?) {
    val editor = prefs(context).edit()
    if (rest == null) {
      editor.remove(KEY_REST)
    } else {
      editor.putString(
        KEY_REST,
        JSONObject()
          .put("endsAt", rest.endsAt)
          .put("durationSec", rest.durationSec)
          .put("label", rest.label ?: JSONObject.NULL)
          .toString(),
      )
    }
    editor.apply()
  }

  private fun markAction(context: Context) {
    prefs(context).edit().putLong(KEY_LAST_ACTION, System.currentTimeMillis()).apply()
  }

  private fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(ALERT_CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(ALERT_CHANNEL_ID, "Rest timer", NotificationManager.IMPORTANCE_HIGH).apply {
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 250, 150, 250)
        },
      )
    }
    if (manager.getNotificationChannel(COUNTDOWN_CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(COUNTDOWN_CHANNEL_ID, "Rest countdown", NotificationManager.IMPORTANCE_LOW).apply {
          description = "The running rest between sets, with Skip and +30 s."
          setShowBadge(false)
          setSound(null, null)
          enableVibration(false)
        },
      )
    }
  }

  private fun postCountdown(context: Context, rest: NativeRest) {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return
    ensureChannels(context)
    val builder =
      NotificationCompat.Builder(context, COUNTDOWN_CHANNEL_ID)
        .setSmallIcon(R.drawable.chefer_rest_timer)
        .setColor(BRAND_COLOR)
        .setContentTitle("Rest")
        .setContentText(rest.label?.let { "Next: $it" } ?: "Chefer workout")
        .setWhen(rest.endsAt)
        .setShowWhen(true)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setTimeoutAfter(maxOf(1000L, rest.endsAt - System.currentTimeMillis() + 1000))
        .setContentIntent(openAppIntent(context))
        .addAction(0, "+30 s", actionIntent(context, ACTION_ADD))
        .addAction(0, "Skip", actionIntent(context, ACTION_SKIP))
    builder.extras.putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true)
    try {
      manager.notify(COUNTDOWN_NOTIFICATION_ID, builder.build())
    } catch (e: SecurityException) {
      // POST_NOTIFICATIONS revoked between the check and the post.
    }
  }

  private fun scheduleAlarm(context: Context, endsAt: Long) {
    cancelAlarms(context)
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val backstop = alarmIntent(context, endsAt)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()) {
      alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, backstop)
      return
    }
    val onAlarm = AlarmManager.OnAlarmListener { onRestOver(context, endsAt) }
    listener = onAlarm
    alarms.setExact(AlarmManager.RTC_WAKEUP, endsAt, ALARM_TAG, onAlarm, mainHandler)
    alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, backstop)
  }

  private fun cancelAlarms(context: Context) {
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    listener?.let { alarms.cancel(it) }
    listener = null
    alarms.cancel(alarmIntent(context, 0L))
  }

  // One PendingIntent slot for the alarm (FLAG_UPDATE_CURRENT replaces its
  // extras), so cancel() with any endsAt cancels it.
  private fun alarmIntent(context: Context, endsAt: Long): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      1,
      Intent(context, RestTimerReceiver::class.java).setAction(ACTION_ALARM).putExtra(EXTRA_ENDS_AT, endsAt),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  private fun actionIntent(context: Context, action: String): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      if (action == ACTION_ADD) 2 else 3,
      Intent(context, RestTimerReceiver::class.java).setAction(action),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  private fun openAppIntent(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED
    return PendingIntent.getActivity(
      context, 4, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}
