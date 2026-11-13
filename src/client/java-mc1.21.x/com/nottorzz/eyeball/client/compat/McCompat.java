package com.nottorzz.eyeball.client.compat;

import java.util.function.Function;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityFeatureRendererRegistrationCallback;
import net.minecraft.client.Camera;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.player.Player;
import org.jspecify.annotations.Nullable;

/**
 * Game calls whose names differ between Minecraft versions (Minecraft 1.21.11 version).
 * The same class exists for every supported version with the same methods.
 */
public final class McCompat {
	private McCompat() {
	}

	public static @Nullable Screen screen(Minecraft minecraft) {
		return minecraft.screen;
	}

	public static void setScreen(Minecraft minecraft, @Nullable Screen screen) {
		minecraft.setScreen(screen);
	}

	/** Shows a short message above the hotbar. */
	public static void overlayMessage(LocalPlayer player, Component message) {
		player.displayClientMessage(message, true);
	}

	public static KeyMapping registerKey(KeyMapping key) {
		return KeyBindingHelper.registerKeyBinding(key);
	}

	public static Camera camera(Minecraft minecraft) {
		return minecraft.gameRenderer.getMainCamera();
	}

	public static EntityType<Player> playerEntityType() {
		return EntityType.PLAYER;
	}

	/** Adds a render layer to both vanilla player renderers (wide and slim arms). */
	@SuppressWarnings("unchecked")
	public static void registerPlayerLayer(Function<RenderLayerParent<AvatarRenderState, PlayerModel>, RenderLayer<AvatarRenderState, PlayerModel>> factory) {
		LivingEntityFeatureRendererRegistrationCallback.EVENT.register((entityType, renderer, helper, context) -> {
			if (renderer instanceof AvatarRenderer<?> avatarRenderer) {
				helper.register(factory.apply((RenderLayerParent<AvatarRenderState, PlayerModel>) avatarRenderer));
			}
		});
	}

	/** Whether the HUD is hidden (F1). */
	public static boolean isHudHidden(Minecraft minecraft) {
		return minecraft.options.hideGui;
	}

	/** Toggles the HUD (F1). */
	public static void toggleHud(Minecraft minecraft) {
		minecraft.options.hideGui = !minecraft.options.hideGui;
	}
}
