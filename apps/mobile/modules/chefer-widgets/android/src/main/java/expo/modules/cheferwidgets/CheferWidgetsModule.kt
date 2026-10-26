package expo.modules.cheferwidgets

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Home-screen widget data (C4, next store build): stores Today's snapshot
// (JSON built in src/features/widget/today-widget-snapshot.ts) where
// TodayWidgetProvider reads it, then redraws the placed widgets. The JS
// feature-detects this module; older binaries never call it.
class CheferWidgetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CheferWidgets")

    AsyncFunction("setTodaySnapshot") { json: String? ->
      val context = requireNotNull(appContext.reactContext) { "React context is not available" }
      val editor = TodayWidgetProvider.prefs(context).edit()
      if (json == null) editor.remove(TodayWidgetProvider.KEY_SNAPSHOT) else editor.putString(TodayWidgetProvider.KEY_SNAPSHOT, json)
      editor.commit()
      TodayWidgetProvider.refreshAll(context)
    }
  }
}
