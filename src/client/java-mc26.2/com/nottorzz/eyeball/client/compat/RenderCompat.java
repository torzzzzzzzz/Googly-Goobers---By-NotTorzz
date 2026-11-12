package com.nottorzz.eyeball.client.compat;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.model.Model;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.rendertype.RenderType;

/**
 * Rendering calls whose signature differs between Minecraft versions (Minecraft 26.2 version).
 * In 26.2 model submissions take an extra block-breaking ("crumbling") overlay argument.
 */
public final class RenderCompat {
	private RenderCompat() {
	}

	public static <S> void submitModel(SubmitNodeCollector collector, Model<? super S> model, S state, PoseStack poseStack,
									   RenderType renderType, int lightCoords, int overlayCoords, int outlineColor) {
		collector.submitModel(model, state, poseStack, renderType, lightCoords, overlayCoords, outlineColor, null);
	}
}
