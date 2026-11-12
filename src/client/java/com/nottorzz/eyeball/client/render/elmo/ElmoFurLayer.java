package com.nottorzz.eyeball.client.render.elmo;

import com.mojang.blaze3d.vertex.PoseStack;
import com.nottorzz.eyeball.client.compat.RenderCompat;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;

/**
 * Draws the fur shells: three slightly inflated copies of the Elmo model, each with a sparser
 * strand texture. Each copy runs the same {@code setupAnim} as the body, so the fur moves with it.
 */
public final class ElmoFurLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
	private final ElmoModel[] shells;

	public ElmoFurLayer(RenderLayerParent<AvatarRenderState, PlayerModel> renderer, ElmoModel[] shells) {
		super(renderer);
		this.shells = shells;
	}

	@Override
	public void submit(PoseStack poseStack, SubmitNodeCollector collector, int lightCoords, AvatarRenderState state, float yRot, float xRot) {
		if (state.isInvisible) {
			return;
		}
		int overlay = LivingEntityRenderer.getOverlayCoords(state, 0.0F);
		for (int i = 0; i < this.shells.length; i++) {
			RenderCompat.submitModel(collector, this.shells[i], state, poseStack, RenderTypes.entityCutout(ElmoRenderer.FUR_TEXTURES[i]),
				lightCoords, overlay, state.outlineColor);
		}
	}
}
