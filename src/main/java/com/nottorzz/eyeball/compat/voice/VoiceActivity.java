package com.nottorzz.eyeball.compat.voice;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiConsumer;

/**
 * Thread-safe store of "how loud is this player talking right now", fed by Simple Voice Chat's
 * audio threads and read on the client tick. Pure Java so it is safe to load on any side.
 */
public final class VoiceActivity {
	/** A level reading older than this is treated as silence. */
	public static final long STALE_NANOS = 250_000_000L;
	/** Key used for the local microphone (mapped to the local player's UUID when read). */
	public static final UUID LOCAL_MICROPHONE = new UUID(0L, 0L);

	private static final Map<UUID, Reading> READINGS = new ConcurrentHashMap<>();
	private static volatile boolean pluginActive;

	private VoiceActivity() {
	}

	public static void markPluginActive() {
		pluginActive = true;
	}

	/** True once Simple Voice Chat has loaded our plugin. */
	public static boolean isPluginActive() {
		return pluginActive;
	}

	public static void report(UUID speaker, short[] samples) {
		if (speaker == null || samples == null || samples.length == 0) {
			return;
		}
		READINGS.put(speaker, new Reading(loudness(samples), System.nanoTime()));
	}

	/** Visits every speaker heard recently with a 0..1 loudness. Old readings are dropped. */
	public static void forEachActive(BiConsumer<UUID, Float> consumer) {
		long now = System.nanoTime();
		READINGS.entrySet().removeIf(entry -> now - entry.getValue().nanos > STALE_NANOS * 8);
		for (Map.Entry<UUID, Reading> entry : READINGS.entrySet()) {
			if (now - entry.getValue().nanos <= STALE_NANOS) {
				consumer.accept(entry.getKey(), entry.getValue().level);
			}
		}
	}

	public static void clear() {
		READINGS.clear();
	}

	/**
	 * Converts 16-bit PCM samples to a 0..1 loudness: RMS in decibels, mapped so that quiet room
	 * noise (about -50 dBFS) is 0 and loud speech (about -12 dBFS) is 1.
	 */
	public static float loudness(short[] samples) {
		double sum = 0.0;
		for (short sample : samples) {
			sum += (double) sample * sample;
		}
		double rms = Math.sqrt(sum / samples.length) / 32768.0;
		if (rms <= 1.0e-6) {
			return 0.0F;
		}
		double db = 20.0 * Math.log10(rms);
		return (float) Math.clamp((db + 50.0) / 38.0, 0.0, 1.0);
	}

	private record Reading(float level, long nanos) {
	}
}
