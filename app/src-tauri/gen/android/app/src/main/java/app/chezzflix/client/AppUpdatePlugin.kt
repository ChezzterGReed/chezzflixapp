package app.chezzflix.client

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

@InvokeArg class UrlArg { var url: String = ""; var sha256: String? = null }

/**
 * Self-update for the sideloaded Android app: read the update feed, download the new APK, hand it to Android's installer.
 * (Android never lets an app install itself silently; the person confirms on the system screen.)
 */
@TauriPlugin
class AppUpdatePlugin(private val activity: Activity) : Plugin(activity) {
  private val apk get() = File(activity.cacheDir, "updates/Chezzflix-update.apk")

  private fun open(url: String): HttpURLConnection =
    (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 15_000; readTimeout = 30_000; instanceFollowRedirects = true
      setRequestProperty("User-Agent", "Chezzflix-Android"); setRequestProperty("Accept", "application/json, */*")
    }

  /** GET a small text file (the update feed). Done here because the web view can't read it across origins. */
  @Command fun fetchText(invoke: Invoke) {
    val a = invoke.parseArgs(UrlArg::class.java)
    Thread {
      try {
        val c = open(a.url)
        val code = c.responseCode
        val body = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        invoke.resolve(JSObject().put("status", code).put("body", body))
      } catch (e: Exception) { invoke.reject(e.message ?: "Couldn't reach the update server") }
    }.start()
  }

  @Command fun download(invoke: Invoke) {
    val a = invoke.parseArgs(UrlArg::class.java)
    Thread {
      try {
        val c = open(a.url)
        if (c.responseCode !in 200..299) { invoke.reject("The update server answered ${c.responseCode}"); return@Thread }
        val total = c.contentLengthLong
        val f = apk; f.parentFile?.mkdirs(); if (f.exists()) f.delete()
        val md = MessageDigest.getInstance("SHA-256")
        var got = 0L; var lastEmit = 0L
        c.inputStream.use { input -> f.outputStream().use { out ->
          val buf = ByteArray(64 * 1024)
          while (true) {
            val n = input.read(buf); if (n < 0) break
            out.write(buf, 0, n); md.update(buf, 0, n); got += n
            val now = System.currentTimeMillis()
            if (now - lastEmit > 250) { lastEmit = now; trigger("progress", JSObject().put("received", got).put("total", total)) }
          }
        } }
        trigger("progress", JSObject().put("received", got).put("total", total))
        val sum = md.digest().joinToString("") { "%02x".format(it) }
        if (!a.sha256.isNullOrBlank() && !sum.equals(a.sha256, ignoreCase = true)) { f.delete(); invoke.reject("The download didn't match its checksum, so it was discarded."); return@Thread }
        invoke.resolve(JSObject().put("path", f.absolutePath).put("sha256", sum))
      } catch (e: Exception) { invoke.reject(e.message ?: "Download failed") }
    }.start()
  }

  /** Opens Android's installer for the downloaded APK (first it may ask you to allow installs from Chezzflix). */
  @Command fun install(invoke: Invoke) {
    activity.runOnUiThread {
      try {
        if (!activity.packageManager.canRequestPackageInstalls()) {
          val i = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          try { activity.startActivity(i) } catch (_: ActivityNotFoundException) { /* some TV builds hide this screen; the page explains the manual route */ }
          invoke.resolve(JSObject().put("needsPermission", true)); return@runOnUiThread
        }
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", apk)
        val i = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(i)
        invoke.resolve(JSObject().put("needsPermission", false))
      } catch (e: Exception) { invoke.reject(e.message ?: "Couldn't open the installer") }
    }
  }
}
