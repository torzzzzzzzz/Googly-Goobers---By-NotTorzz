package com.nottorzz.eyeball.client;

import com.nottorzz.eyeball.EyeBallMod;
import com.nottorzz.eyeball.client.anim.FaceAnimationManager;
import com.nottorzz.eyeball.client.compat.McCompat;
import com.nottorzz.eyeball.client.config.ConfigManager;
import com.nottorzz.eyeball.client.input.EyeBallKeys;
import com.nottorzz.eyeball.client.network.ClientSync;
import com.nottorzz.eyeball.client.render.FaceRenderLayer;
import com.nottorzz.eyeball.client.talk.ChatTalkDetector;
import com.nottorzz.eyeball.client.voice.VoiceLipSync;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;

/**
 * Googly Goobers client entrypoint. Wires together the separate systems:
 * configuration, animation ({@code anim}), rendering ({@code render}), chat and voice talking
 * detection, keybinds and multiplayer sync.
 */
public final class EyeBallClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ConfigManager.load();
		EyeBallKeys.register();
		ClientSync.init();
		ChatTalkDetector.init();

		// The face layer goes on both vanilla player renderers (wide and slim arms).
		McCompat.registerPlayerLayer(FaceRenderLayer::new);

		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			EyeBallKeys.tick(client);
			VoiceLipSync.tick(client);
			FaceAnimationManager.INSTANCE.tick(client);
		});
		EyeBallMod.LOGGER.info("Googly Goobers client ready (googly eyes: {})", ConfigManager.get().googlyEyes ? "on" : "off");
	}
}
