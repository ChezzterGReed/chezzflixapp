@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package app.chezzflix.client

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.tanh

/**
 * Volume boost applied to the decoded audio itself (with a soft limiter so loud peaks never clip hard), instead of a system audio effect.
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
    return inputAudioFormat
  }

  override fun queueInput(inputBuffer: ByteBuffer) {
    val n = inputBuffer.remaining()
    if (n == 0) return
    val out = replaceOutputBuffer(n)
    val g = linear
    inputBuffer.order(ByteOrder.nativeOrder()); out.order(ByteOrder.nativeOrder())
    // Measure the audio as it arrives (before any gain), then pass it on.
    val look = inputBuffer.duplicate().order(ByteOrder.nativeOrder())
    if (inputAudioFormat.encoding == C.ENCODING_PCM_16BIT) { while (look.remaining() >= 2) measure(look.short / 32768f) }
    else { while (look.remaining() >= 4) measure(look.float) }
    if (g == 1.0f) { out.put(inputBuffer) }
    else if (inputAudioFormat.encoding == C.ENCODING_PCM_16BIT) {
      while (inputBuffer.remaining() >= 2) out.putShort(limit16(inputBuffer.short * g))
    } else {
      while (inputBuffer.remaining() >= 4) out.putFloat(limitF(inputBuffer.float * g))
    }
    out.flip()
  }

  private fun limit16(v: Float): Short {
    val a = abs(v)
    if (a <= KNEE16) return v.toInt().toShort()
    val s = KNEE16 + (32767f - KNEE16) * tanh((a - KNEE16) / (32767f - KNEE16))
    return (if (v < 0) -s else s).toInt().toShort()
  }
  private fun limitF(v: Float): Float {
    val a = abs(v)
    if (a <= KNEEF) return v
    val s = KNEEF + (1f - KNEEF) * tanh((a - KNEEF) / (1f - KNEEF))
    return if (v < 0) -s else s
  }
  private companion object { const val KNEE16 = 24000f; const val KNEEF = 0.73f }
}
