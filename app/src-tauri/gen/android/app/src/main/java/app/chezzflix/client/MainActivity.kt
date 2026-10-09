package app.chezzflix.client

import android.graphics.Color
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var web: WebView? = null

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
    webView.setBackgroundColor(Color.TRANSPARENT)      // lets a native video surface behind the page show through
    webView.defaultFocusHighlightEnabled = false      // no system outline around the page when the remote moves focus
    webView.settings.mediaPlaybackRequiresUserGesture = false
    webView.settings.useWideViewPort = true             // honour the page's viewport width
    webView.settings.loadWithOverviewMode = true
    webView.isFocusable = true; webView.isFocusableInTouchMode = true
    webView.requestFocus()                               // so the very first remote press reaches the page
  }
}
