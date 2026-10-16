package app.chezzflix.client

import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var web: WebView? = null

  // The remote's fast-forward and rewind buttons: the web view doesn't turn them into key events, so hand them to the page (it steps on a tap and glides when held).
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val k = when (event.keyCode) { KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "ff"; KeyEvent.KEYCODE_MEDIA_REWIND -> "rw"; else -> null }
    val w = web
    if (k != null && w != null) {
      val down = event.action == KeyEvent.ACTION_DOWN
      w.evaluateJavascript("window.__chezzMediaKey&&window.__chezzMediaKey('$k',$down,${event.repeatCount > 0})", null)
      return true
    }
    return super.dispatchKeyEvent(event)
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) web?.requestFocus()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // The remote's Back button goes to the app first (closes menus, goes back a screen). Only when the app has nothing to go back to does it leave.
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val w = web
        if (w == null) { finishAfterTransition(); return }
        w.evaluateJavascript("window.__chezzBack ? window.__chezzBack() : false") { handled ->
          if (handled != "true") { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
        }
      }
    })
  }

  override fun onWebViewCreate(webView: WebView) {
    web = webView
    webView.setBackgroundColor(0xFF0A0A0D.toInt())      // dark until video plays (PlayerPlugin then makes it transparent); never a white flash
    webView.defaultFocusHighlightEnabled = false      // no system outline around the page when the remote moves focus
    webView.settings.mediaPlaybackRequiresUserGesture = false
    webView.settings.useWideViewPort = true             // honour the page's viewport width
    webView.settings.loadWithOverviewMode = true
    webView.isFocusable = true; webView.isFocusableInTouchMode = true
    webView.requestFocus()                               // so the very first remote press reaches the page
  }
}
