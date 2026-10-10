@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package app.chezzflix.client

import android.app.Activity
import android.graphics.Color
import android.content.Context
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.SeekParameters
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.SubtitleView
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import kotlin.math.pow

@InvokeArg class SubArg { var url: String = ""; var lang: String? = null; var name: String? = null }
@InvokeArg class LoadArgs { var url: String = ""; var startMs: Long = 0; var pause: Boolean = true; var subs: Array<SubArg>? = null }
@InvokeArg class BoolArg { var value: Boolean = false }
@InvokeArg class SubStyleArg { var size: Double = 1.0; var font: String = "sans"; var color: String = "white"; var edge: String = "outline"; var background: Boolean = false }
@InvokeArg class NumArg { var value: Double = 0.0 }
@InvokeArg class NameArg { var name: String = "" }

/**
 * Chezzflix's Android video engine: Media3 ExoPlayer drawing into a surface BEHIND the (transparent) web view, like the Mac app's mpv.
 * It plays the original file (MKV, HEVC, Dolby/DTS passthrough where the device allows) and reports progress back to the page,
 * speaking the same small vocabulary as the mpv bridge (time-pos, duration, pause, paused-for-cache, eof-reached...).
 */
@TauriPlugin
class PlayerPlugin(private val activity: Activity) : Plugin(activity) {
  private val ui = Handler(Looper.getMainLooper())
  private var web: WebView? = null
  private var player: ExoPlayer? = null
  private var view: PlayerView? = null
  private val gain = GainProcessor()
  private var subStyle: SubStyleArg? = null
  private var loadedFired = false
  private var userVolume = 1.0
  private var muted = false
  private var gainDb = 0.0
  private var watchdogToken = 0
  private var nudges = 0

  override fun load(webView: WebView) { web = webView }

  // ---- setup ----
  private fun ensure(): ExoPlayer {
    player?.let { return it }
    val gainChain = DefaultAudioSink.DefaultAudioProcessorChain(gain)
    val factory = object : DefaultRenderersFactory(activity) {
      override fun buildAudioSink(context: Context, enableFloatOutput: Boolean, enableAudioTrackPlaybackParams: Boolean): AudioSink =
        DefaultAudioSink.Builder(context).setEnableFloatOutput(enableFloatOutput).setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams).setAudioProcessorChain(gainChain).build()
    }.setEnableDecoderFallback(true).setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
    val p = ExoPlayer.Builder(activity, factory).build()
    p.addListener(listener)
    p.setSeekParameters(SeekParameters.CLOSEST_SYNC)   // jump to the nearest keyframe: avoids the picture freezing while the decoder catches up to an exact spot
    player = p
    val v = PlayerView(activity).apply {
      useController = false
      resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
      setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
      setBackgroundColor(Color.BLACK)
      visibility = View.GONE
      player = p
    }
    view = v
    // Behind the web view (which is transparent): the page shows through where it has no content.
    val parent = web?.parent as? ViewGroup
    parent?.addView(v, 0, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    web?.setBackgroundColor(Color.TRANSPARENT)
    applySubStyle()
    ui.post(ticker)
    return p
  }

  private val ticker = object : Runnable {
    override fun run() {
      val p = player ?: return
      if (p.playbackState == Player.STATE_READY || p.playbackState == Player.STATE_BUFFERING) {
        emit("time-pos", p.currentPosition / 1000.0)
        emit("demuxer-cache-time", p.bufferedPosition / 1000.0)
        if (p.duration != C.TIME_UNSET) emit("duration", p.duration / 1000.0)
      }
      ui.postDelayed(this, 500)
    }
  }

  private fun emit(name: String, value: Any?) {
    trigger("prop", JSObject().put("name", name).put("value", value ?: JSONObject.NULL))
  }
  private fun event(name: String, vararg extra: Pair<String, Any?>) {
    val o = JSObject().put("event", name)
    for ((k, v) in extra) o.put(k, v ?: JSONObject.NULL)
    trigger("event", o)
  }

  private val listener = object : Player.Listener {
    override fun onPlaybackStateChanged(state: Int) {
      val p = player ?: return
      emit("paused-for-cache", state == Player.STATE_BUFFERING)
      if (state == Player.STATE_READY) {
        if (p.duration != C.TIME_UNSET) emit("duration", p.duration / 1000.0)
        emit("time-pos", p.currentPosition / 1000.0)
        if (!loadedFired) { loadedFired = true; event("loaded") }
      }
      if (state == Player.STATE_ENDED) { emit("eof-reached", true); event("end", "reason" to 0) }
    }
    override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) { emit("pause", !playWhenReady) }
    override fun onPlayerError(error: PlaybackException) {
      event("end", "reason" to 4)
      event("error", "message" to "${error.errorCodeName}: ${error.message ?: "playback failed"}")
    }
  }

  /**
   * Some TV decoders show the first frame and then stop drawing while the audio carries on (it cures itself with a seek).
   * A moment after playback starts, if time moved but almost no new frames were drawn, nudge the player exactly as a seek would.
   */
  private fun armWatchdog() {
    val token = ++watchdogToken
    val p = player ?: return
    val frames0 = p.videoDecoderCounters?.renderedOutputBufferCount ?: -1
    val pos0 = p.currentPosition
    ui.postDelayed({
      val pl = player ?: return@postDelayed
      if (token != watchdogToken || !pl.playWhenReady || pl.playbackState != Player.STATE_READY) return@postDelayed
      val frames1 = pl.videoDecoderCounters?.renderedOutputBufferCount ?: -1
      // Only for real video (not audio-only files), and never more than a few nudges per title.
      if (pl.videoFormat != null && frames0 >= 0 && nudges < 3 && pl.currentPosition - pos0 > 900 && frames1 - frames0 <= 2) {
        nudges++
        pl.seekTo(pl.currentPosition)
        armWatchdog()   // check again after the nudge
      }
    }, 1600)
  }

  private fun applySubStyle() {
    val st = subStyle ?: return
    val sv = view?.subtitleView ?: return
    val fg = if (st.color == "yellow") Color.rgb(255, 230, 0) else Color.WHITE
    val edge = when (st.edge) { "shadow" -> CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW; "none" -> CaptionStyleCompat.EDGE_TYPE_NONE; else -> CaptionStyleCompat.EDGE_TYPE_OUTLINE }
    val face = when (st.font) { "serif" -> Typeface.SERIF; "mono" -> Typeface.MONOSPACE; else -> Typeface.SANS_SERIF }
    sv.setApplyEmbeddedStyles(true)   // styled subtitles (.ass) keep their own look; this applies to plain text ones (.srt etc.)
    sv.setFractionalTextSize(SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * st.size.toFloat())
    sv.setStyle(CaptionStyleCompat(fg, if (st.background) Color.argb(190, 0, 0, 0) else Color.TRANSPARENT, Color.TRANSPARENT, edge, Color.BLACK, face))
  }
  private fun applyVolume() {
    // The boost (up or down) is applied to the samples themselves; this is just the volume setting.
    player?.volume = if (muted) 0f else userVolume.coerceIn(0.0, 1.0).toFloat()
  }

  private fun onUi(invoke: Invoke, work: () -> Unit) {
    activity.runOnUiThread { try { work(); invoke.resolve() } catch (e: Exception) { invoke.reject(e.message ?: "player error") } }
  }

  // ---- commands ----
  @Command fun loadMedia(invoke: Invoke) {
    val a = invoke.parseArgs(LoadArgs::class.java)
    onUi(invoke) {
      val p = ensure()
      loadedFired = false; nudges = 0
      view?.visibility = View.VISIBLE
      val item = MediaItem.Builder().setUri(a.url).apply {
        val subs = a.subs?.map { s ->
          MediaItem.SubtitleConfiguration.Builder(android.net.Uri.parse(s.url)).setMimeType(guessSubMime(s.url)).setLanguage(s.lang).setLabel(s.name).build()
        }
        if (!subs.isNullOrEmpty()) setSubtitleConfigurations(subs)
      }.build()
      p.setMediaItem(item, a.startMs)
      p.playWhenReady = !a.pause
      p.prepare()
      emit("pause", a.pause)
    }
  }

  private fun guessSubMime(url: String) = when {
    url.contains(".srt", true) -> MimeTypes.APPLICATION_SUBRIP
    url.contains(".vtt", true) -> MimeTypes.TEXT_VTT
    url.contains(".ass", true) || url.contains(".ssa", true) -> MimeTypes.TEXT_SSA
    else -> MimeTypes.APPLICATION_SUBRIP
  }

  @Command fun setPause(invoke: Invoke) { val a = invoke.parseArgs(BoolArg::class.java); onUi(invoke) { player?.playWhenReady = !a.value; if (!a.value) armWatchdog() } }
  @Command fun seek(invoke: Invoke) { val a = invoke.parseArgs(NumArg::class.java); onUi(invoke) { player?.seekTo((a.value * 1000).toLong()) } }
  @Command fun setVolume(invoke: Invoke) { val a = invoke.parseArgs(NumArg::class.java); onUi(invoke) { userVolume = a.value; applyVolume(); emit("volume", userVolume * 100) } }
  @Command fun setMute(invoke: Invoke) { val a = invoke.parseArgs(BoolArg::class.java); onUi(invoke) { muted = a.value; applyVolume(); emit("mute", muted) } }
  // 0 dB is exactly off: the samples pass through untouched.
  @Command fun setGain(invoke: Invoke) { val a = invoke.parseArgs(NumArg::class.java); onUi(invoke) { gainDb = a.value; gain.linear = if (kotlin.math.abs(gainDb) < 0.05) 1.0f else 10.0.pow(gainDb.coerceIn(-12.0, 12.0) / 20.0).toFloat() } }
  @Command fun setKeepAwake(invoke: Invoke) { val a = invoke.parseArgs(BoolArg::class.java); onUi(invoke) { web?.keepScreenOn = a.value } }   // no screensaver while watching
  @Command fun setSubStyle(invoke: Invoke) { val a = invoke.parseArgs(SubStyleArg::class.java); onUi(invoke) { subStyle = a; applySubStyle() } }

  @Command fun stop(invoke: Invoke) {
    onUi(invoke) {
      player?.stop(); player?.clearMediaItems()
      view?.visibility = View.GONE
      loadedFired = false
    }
  }

  @Command fun getProp(invoke: Invoke) {
    val a = invoke.parseArgs(NameArg::class.java)
    activity.runOnUiThread {
      val p = player
      val out = JSObject()
      when (a.name) {
        "time-pos" -> out.put("value", (p?.currentPosition ?: 0L) / 1000.0)
        "duration" -> out.put("value", if (p == null || p.duration == C.TIME_UNSET) JSONObject.NULL else p.duration / 1000.0)
        "audio-params/hr-channels" -> {
          val n = p?.audioFormat?.channelCount ?: 0
          out.put("value", when (n) { 0 -> JSONObject.NULL; 1 -> "mono"; 2 -> "stereo"; 6 -> "5.1"; 8 -> "7.1"; else -> "${n}ch" })
        }
        else -> out.put("value", JSONObject.NULL)
      }
      invoke.resolve(out)
    }
  }

  // ---- tracks ----
  private data class Ref(val group: Tracks.Group, val type: Int)
  private fun groups(): List<Pair<Int, Tracks.Group>> {
    val t = player?.currentTracks ?: return emptyList()
    var a = 0; var s = 0
    return t.groups.mapNotNull { g ->
      when (g.type) { C.TRACK_TYPE_AUDIO -> (++a) to g; C.TRACK_TYPE_TEXT -> (++s) to g; else -> null }
    }
  }
  private fun channelsLabel(n: Int) = when (n) { 1 -> "1.0"; 2 -> "2.0"; 6 -> "5.1"; 8 -> "7.1"; 0 -> "" else -> "${n}ch" }

  @Command fun tracks(invoke: Invoke) {
    activity.runOnUiThread {
      val list = JSArray()
      val t = player?.currentTracks
      if (t != null) {
        var a = 0; var s = 0
        for (g in t.groups) {
          if (g.type != C.TRACK_TYPE_AUDIO && g.type != C.TRACK_TYPE_TEXT) continue
          val isAudio = g.type == C.TRACK_TYPE_AUDIO
          val f = g.getTrackFormat(0)
          val id = if (isAudio) ++a else ++s
          list.put(JSObject()
            .put("id", id).put("type", if (isAudio) "audio" else "sub")
            .put("title", f.label ?: JSONObject.NULL).put("lang", f.language ?: JSONObject.NULL)
            .put("codec", (f.sampleMimeType ?: f.codecs ?: "").substringAfter('/').substringAfter("x-").uppercase())
            .put("channels", if (isAudio) channelsLabel(f.channelCount) else JSONObject.NULL)
            .put("selected", g.isSelected)
            .put("default", (f.selectionFlags and C.SELECTION_FLAG_DEFAULT) != 0)
            .put("forced", (f.selectionFlags and C.SELECTION_FLAG_FORCED) != 0)
            .put("external", false))
        }
      }
      invoke.resolve(JSObject().put("tracks", list))
    }
  }

  @Command fun selectAudio(invoke: Invoke) {
    val a = invoke.parseArgs(NumArg::class.java)
    onUi(invoke) {
      val g = groups().firstOrNull { it.second.type == C.TRACK_TYPE_AUDIO && it.first == a.value.toInt() }?.second ?: return@onUi
      val p = player ?: return@onUi
      p.trackSelectionParameters = p.trackSelectionParameters.buildUpon().setOverrideForType(TrackSelectionOverride(g.mediaTrackGroup, 0)).build()
    }
  }

  /** id <= 0 turns subtitles off. */
  @Command fun selectSubtitle(invoke: Invoke) {
    val a = invoke.parseArgs(NumArg::class.java)
    onUi(invoke) {
      val p = player ?: return@onUi
      val b = p.trackSelectionParameters.buildUpon()
      if (a.value <= 0) b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
      else {
        val g = groups().firstOrNull { it.second.type == C.TRACK_TYPE_TEXT && it.first == a.value.toInt() }?.second ?: return@onUi
        b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false).setOverrideForType(TrackSelectionOverride(g.mediaTrackGroup, 0))
      }
      p.trackSelectionParameters = b.build()
    }
  }

  override fun onPause() { activity.runOnUiThread { player?.playWhenReady = false } }
  override fun onDestroy() { activity.runOnUiThread { ui.removeCallbacksAndMessages(null); player?.release(); player = null } }
}
