package com.nottorzz.eyeball.client;

import com.nottorzz.eyeball.EyeBallMod;
import com.nottorzz.eyeball.client.anim.FaceAnimationManager;
import com.nottorzz.eyeball.client.config.ConfigManager;
import com.nottorzz.eyeball.client.input.EyeBallKeys;
import com.nottorzz.eyeball.client.network.ClientSync;
import com.nottorzz.eyeball.client.render.FaceRenderLayer;
import com.nottorzz.eyeball.client.render.elmo.ElmoRenderers;
import com.nottorzz.eyeball.client.talk.ChatTalkDetector;
import com.nottorzz.eyeball.client.voice.VoiceLipSync;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityRenderLayerRegistrationCallback;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;

/**
 * Client entrypoint. Wires together the separate systems:
 * configuration, animation ({@code anim}), rendering ({@code render}), the Elmo transformation
 * ({@code render.elmo}), chat and voice talking detection, keybinds and multiplayer sync.
 */
public final class EyeBallClient implements ClientModInitializer {
	@Override
	@SuppressWarnings("unchecked")
	public void onInitializeClient() {
		ConfigManager.load();
		ElmoRenderers.registerModelLayers();
		EyeBallKeys.register();
		ClientSync.init();
		ChatTalkDetector.init();

		// The face layer goes on both vanilla player renderers (wide and slim arms).
		LivingEntityRenderLayerRegistrationCallback.EVENT.register((entityType, renderer, helper, context) -> {
			if (renderer instanceof AvatarRenderer<?> avatarRenderer) {
				helper.register(new FaceRenderLayer((RenderLayerParent<AvatarRenderState, PlayerModel>) avatarRenderer));
			}
		});

		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			EyeBallKeys.tick(client);
			VoiceLipSync.tick(client);
			FaceAnimationManager.INSTANCE.tick(client);
		});
		EyeBallMod.LOGGER.info("EyeBall client ready (googly eyes: {}, Elmo: {})",
			ConfigManager.get().googlyEyes ? "on" : "off", ConfigManager.get().elmo ? "on" : "off");
	}
}
