@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package app.chezzflix.client

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.exp

/**
 * Volume boost applied to the decoded audio itself (with a look-ahead limiter so loud peaks never clip), instead of a system audio effect.
 * The system effect could silence the output on TV boxes and stayed attached afterwards; this only touches the samples, so 0 dB is a plain copy
 * and Dolby/DTS passthrough (which never reaches this stage) is simply left alone.
 */
class GainProcessor : BaseAudioProcessor() {
  @Volatile var linear = 1.0f

  // ---- loudness measurement (feeds auto leveling) ----
  // The picture is the same as the desktop's: average the power of 0.4-second blocks, ignoring near-silence, and report it in dB.
  // It is an unweighted estimate, so it is only meant to compare titles with each other, not to match a loudness meter exactly.
  private var blockLen = 1
  private var acc = 0.0
  private var cnt = 0
  private val lock = Any()
  private var sumPower = 0.0
  private var blocks = 0

  fun resetMeasure() = synchronized(lock) { acc = 0.0; cnt = 0; sumPower = 0.0; blocks = 0 }
  /** Approximate loudness in LUFS-like dB so far, or null until there is enough audio to say. */
  fun loudness(): Double? = synchronized(lock) { if (blocks >= 3) 10.0 * log10(sumPower / blocks) - 0.7 else null }
  private fun measure(v: Float) {
    acc += (v * v).toDouble()
    if (++cnt >= blockLen) {
      val p = acc / cnt
      if (p > 1e-6) synchronized(lock) { sumPower += p; blocks++ }   // gate: -60 dBFS
      acc = 0.0; cnt = 0
    }
  }

  override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
    if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT && inputAudioFormat.encoding != C.ENCODING_PCM_FLOAT) throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
    blockLen = (inputAudioFormat.sampleRate * 0.4).toInt().coerceAtLeast(1) * inputAudioFormat.channelCount.coerceAtLeast(1)
    ch = inputAudioFormat.channelCount.coerceAtLeast(1)
    look = (inputAudioFormat.sampleRate * 0.005).toInt().coerceAtLeast(2)               // 5 ms of look-ahead
    relAlpha = (1.0 - exp(-1.0 / (0.12 * inputAudioFormat.sampleRate))).toFloat()        // gain comes back up over about 120 ms
    gainAlpha = (1.0 - exp(-1.0 / (0.02 * inputAudioFormat.sampleRate))).toFloat()       // changes to the boost glide over about 20 ms
    allocate()
    return inputAudioFormat
  }

  // ---- the limiter ----
  // A look-ahead peak limiter: it turns the gain DOWN smoothly just before a loud peak instead of squashing the peak itself (a waveshaper
  // such as tanh adds harmonics to everything above its knee, which is what made big boosts sound harsh). Same idea as ffmpeg's alimiter:
  // the gain needed per frame is released slowly, its minimum over the next 5 ms is taken, and that is averaged over 5 ms, so the output
  // can never pass the ceiling and the gain never changes abruptly. It costs 5 ms of delay, and only runs while a boost is on.
  private var ch = 2
  private var look = 240
  private var relAlpha = 0.001f
  private var gainAlpha = 0.001f
  private var ring = FloatArray(0)      // the delayed audio: `look` frames
  private var mring = FloatArray(0)     // the last `look` values of the look-ahead minimum
  private var dqIdx = LongArray(0)      // sliding-window minimum (monotonic queue)
  private var dqVal = FloatArray(0)
  private var dqHead = 0L
  private var dqTail = 0L
  private var sum = 0.0
  private var env = 1f
  private var gSmooth = 1f
  private var frameNo = 0L
  private var active = false
  private var tmp = FloatArray(0)
  private var tmpOut = FloatArray(0)

  private fun allocate() {
    ring = FloatArray(look * ch); mring = FloatArray(look) { 1f }
    dqIdx = LongArray(look + 1); dqVal = FloatArray(look + 1); dqHead = 0; dqTail = 0
    sum = look.toDouble(); env = 1f; frameNo = 0; active = false
    tmp = FloatArray(ch); tmpOut = FloatArray(ch)
  }

  /** Pushes one frame (already in -1..1, before gain) in and writes the frame that is now due out into tmpOut. */
  private fun limitFrame(target: Float) {
    gSmooth += (target - gSmooth) * gainAlpha
    var peak = 0f
    for (c in 0 until ch) { val v = tmp[c] * gSmooth; tmp[c] = v; val a = abs(v); if (a > peak) peak = a }
    val need = if (peak > CEIL) CEIL / peak else 1f
    env = minOf(need, env + (1f - env) * relAlpha)
    val cap = (look + 1).toLong()
    while (dqTail > dqHead && dqVal[((dqTail - 1) % cap).toInt()] >= env) dqTail--
    dqIdx[(dqTail % cap).toInt()] = frameNo; dqVal[(dqTail % cap).toInt()] = env; dqTail++
    while (dqIdx[(dqHead % cap).toInt()] <= frameNo - look) dqHead++
    val m = dqVal[(dqHead % cap).toInt()]
    val mi = (frameNo % look).toInt()
    sum += m - mring[mi]; mring[mi] = m
    val avg = (sum / look).toFloat()
    val slot = mi * ch
    for (c in 0 until ch) ring[slot + c] = tmp[c]
    val due = frameNo - (look - 1)
    val o = (((frameNo + 1) % look).toInt()) * ch
    if (due >= 0) {
      val fade = if (due < look) (due + 1f) / look else 1f   // the first audio after switching on fades in, so no click
      for (c in 0 until ch) tmpOut[c] = ring[o + c] * avg * fade
    } else for (c in 0 until ch) tmpOut[c] = 0f
    frameNo++
  }

  override fun queueInput(inputBuffer: ByteBuffer) {
    val n = inputBuffer.remaining()
    if (n == 0) return
    val g = linear
    inputBuffer.order(ByteOrder.nativeOrder())
    // Measure the audio as it arrives (before any gain), then pass it on.
    val look16 = inputBuffer.duplicate().order(ByteOrder.nativeOrder())
    if (inputAudioFormat.encoding == C.ENCODING_PCM_16BIT) { while (look16.remaining() >= 2) measure(look16.short / 32768f) }
    else { while (look16.remaining() >= 4) measure(look16.float) }
    val out = replaceOutputBuffer(n)
    out.order(ByteOrder.nativeOrder())
    if (g == 1.0f && !active) { out.put(inputBuffer); out.flip(); return }   // 0 dB and never boosted: a plain copy
    if (!active) { active = true; gSmooth = g }
    val is16 = inputAudioFormat.encoding == C.ENCODING_PCM_16BIT
    val frameBytes = ch * (if (is16) 2 else 4)
    while (inputBuffer.remaining() >= frameBytes) {
      for (c in 0 until ch) tmp[c] = if (is16) inputBuffer.short / 32768f else inputBuffer.float
      limitFrame(g)
      for (c in 0 until ch) {
        if (is16) out.putShort((tmpOut[c] * 32768f).coerceIn(-32768f, 32767f).toInt().toShort()) else out.putFloat(tmpOut[c])
      }
    }
    if (inputBuffer.hasRemaining()) out.put(inputBuffer)   // (a partial frame at the end of a buffer: pass it through)
    out.flip()
  }

  /** End of the stream: let the last few milliseconds held in the delay come out. */
  override fun onQueueEndOfStream() {
    if (!active) return
    val is16 = inputAudioFormat.encoding == C.ENCODING_PCM_16BIT
    val out = replaceOutputBuffer((look - 1) * ch * (if (is16) 2 else 4)).order(ByteOrder.nativeOrder())
    for (c in 0 until ch) tmp[c] = 0f
    for (i in 0 until look - 1) {
      for (c in 0 until ch) tmp[c] = 0f
      limitFrame(linear)
      for (c in 0 until ch) { if (is16) out.putShort((tmpOut[c] * 32768f).coerceIn(-32768f, 32767f).toInt().toShort()) else out.putFloat(tmpOut[c]) }
    }
    out.flip()
  }

  override fun onFlush() { allocate() }   // a seek or a new file: start clean
  override fun onReset() { allocate() }

  private companion object { const val CEIL = 0.97f }
}
