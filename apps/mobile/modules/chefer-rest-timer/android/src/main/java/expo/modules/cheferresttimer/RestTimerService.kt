package expo.modules.cheferresttimer

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Keeps the app's process unfrozen while a rest runs, so the exact rest-over
 * alarm (an OnAlarmListener, which the OS drops when it freezes an app) fires
 * on time. Its notification IS the countdown notification. Type shortService:
 * no extra permission or prompt, but the OS stops it after ~3 min
 * (`onTimeout`); a longer rest then keeps its countdown and falls back to the
 * backstop alarm.
 */
class RestTimerService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val rest = RestTimerController.current(this)
    val notification = rest?.let { RestTimerController.buildCountdown(this, it) }
    if (rest == null || notification == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    try {
      ServiceCompat.startForeground(
        this,
        RestTimerController.COUNTDOWN_NOTIFICATION_ID,
        notification,
        if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE else 0,
      )
    } catch (e: Exception) {
      // Not allowed now (e.g. started from the background): the plain countdown
      // notification is already posted and the backstop alarm still fires.
      stopSelf()
    }
    return START_NOT_STICKY
  }

  // ~3 min cap reached: keep the countdown on screen, stop keeping the process alive.
  override fun onTimeout(startId: Int) = detach()

  override fun onTimeout(startId: Int, fgsType: Int) = detach()

  private fun detach() {
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
    stopSelf()
  }

  companion object {
    @Volatile private var running = false

    /** Starts the service if it isn't running (from a foreground app or a notification action). */
    fun keepAlive(context: Context) {
      if (running) return
      try {
        ContextCompat.startForegroundService(context, Intent(context, RestTimerService::class.java))
        running = true
      } catch (e: Exception) {
        // ForegroundServiceStartNotAllowedException and friends: degrade to the plain notification.
      }
    }

    fun stop(context: Context) {
      running = false
      context.stopService(Intent(context, RestTimerService::class.java))
    }
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }
}
