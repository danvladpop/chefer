package expo.modules.cheferwidgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import java.util.Calendar
import org.json.JSONObject

/**
 * The Today home-screen widget (C4): the next planned meal and what is left of
 * today's targets. The app writes the snapshot (CheferWidgetsModule); this only
 * displays its strings, and says "Open Chefer" when it is missing or stale.
 */
class TodayWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val views = render(context)
    ids.forEach { manager.updateAppWidget(it, views) }
  }

  companion object {
    private const val PREFS = "chefer.widgets"
    const val KEY_SNAPSHOT = "today.snapshot"

    fun prefs(context: Context) =
      context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Local YYYY-MM-DD (java.time needs API 26; minSdk is 24). */
    private fun today(): String {
      val c = Calendar.getInstance()
      return String.format(
        java.util.Locale.US, "%04d-%02d-%02d",
        c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    }

    /** Redraws every placed Today widget from the stored snapshot. */
    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, TodayWidgetProvider::class.java))
      if (ids.isEmpty()) return
      val views = render(context)
      ids.forEach { manager.updateAppWidget(it, views) }
    }

    private fun render(context: Context): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.chefer_today_widget)
      val snapshot =
        prefs(context).getString(KEY_SNAPSHOT, null)?.let {
          try {
            JSONObject(it)
          } catch (e: Exception) {
            null
          }
        }?.takeIf { it.optInt("v") == 1 && it.optString("date") == today() }

      if (snapshot == null) {
        views.setTextViewText(R.id.chefer_widget_eyebrow, context.getString(R.string.chefer_today_widget_empty_eyebrow))
        views.setTextViewText(R.id.chefer_widget_title, context.getString(R.string.chefer_today_widget_empty_title))
        views.setViewVisibility(R.id.chefer_widget_detail, View.GONE)
        views.setOnClickPendingIntent(R.id.chefer_widget_root, openIntent(context, null))
        return views
      }
      views.setTextViewText(R.id.chefer_widget_eyebrow, snapshot.optString("eyebrow"))
      views.setTextViewText(R.id.chefer_widget_title, snapshot.optString("title"))
      val detail = if (snapshot.isNull("detail")) null else snapshot.optString("detail")
      views.setTextViewText(R.id.chefer_widget_detail, detail ?: "")
      views.setViewVisibility(R.id.chefer_widget_detail, if (detail.isNullOrEmpty()) View.GONE else View.VISIBLE)
      views.setOnClickPendingIntent(R.id.chefer_widget_root, openIntent(context, snapshot.optString("url")))
      return views
    }

    /** Opens Today through the app's deep link, or just the app. */
    private fun openIntent(context: Context, url: String?): PendingIntent? {
      val intent =
        if (!url.isNullOrEmpty()) {
          Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(context.packageName)
        } else {
          context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      return PendingIntent.getActivity(
        context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
  }
}
