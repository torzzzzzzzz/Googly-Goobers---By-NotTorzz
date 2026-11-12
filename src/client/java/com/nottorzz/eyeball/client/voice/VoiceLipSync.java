package com.nottorzz.eyeball.client.voice;

import com.nottorzz.eyeball.compat.voice.VoiceActivity;
import com.nottorzz.eyeball.client.anim.FaceAnimationManager;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;

/**
 * Feeds Simple Voice Chat loudness into the faces each tick, so mouths move while people actually
 * speak. Does nothing when Simple Voice Chat is not installed.
 */
public final class VoiceLipSync {
	private static final float SPEAKING_THRESHOLD = 0.08F;
	private static final boolean INSTALLED = FabricLoader.getInstance().isModLoaded("voicechat");

	private VoiceLipSync() {
	}

	public static boolean isAvailable() {
		return INSTALLED;
	}

	public static void tick(Minecraft minecraft) {
		// Readings only ever come from our Simple Voice Chat plugin (the in-game tests also feed
		// recorded loudness through the same path once they mark the plugin active).
		if (!(INSTALLED || VoiceActivity.isPluginActive()) || minecraft.player == null) {
			return;
		}
		VoiceActivity.forEachActive((speaker, level) -> {
			if (level < SPEAKING_THRESHOLD) {
				return;
			}
			if (VoiceActivity.LOCAL_MICROPHONE.equals(speaker)) {
				FaceAnimationManager.INSTANCE.onVoice(minecraft.player.getUUID(), level);
			} else {
				FaceAnimationManager.INSTANCE.onVoice(speaker, level);
			}
		});
	}
}
