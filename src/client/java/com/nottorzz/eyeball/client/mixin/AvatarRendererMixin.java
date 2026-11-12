package com.nottorzz.eyeball.client.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import com.nottorzz.eyeball.client.anim.FaceAnimationManager;
import com.nottorzz.eyeball.client.render.BodyMotion;
import com.nottorzz.eyeball.client.render.FaceRenderData;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.world.entity.Avatar;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Attaches the face to each player's render state, and adds the hit stagger / Elmo walk bounce. */
@Mixin(AvatarRenderer.class)
public abstract class AvatarRendererMixin {
	@Inject(
		method = "extractRenderState(Lnet/minecraft/world/entity/Avatar;Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;F)V",
		at = @At("TAIL")
	)
	private void eyeball$extractFace(Avatar entity, AvatarRenderState state, float partialTicks, CallbackInfo ci) {
		if (entity instanceof AbstractClientPlayer player) {
			FaceAnimationManager.INSTANCE.extract(player, state, partialTicks);
		}
	}

	@Inject(
		method = "setupRotations(Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;Lcom/mojang/blaze3d/vertex/PoseStack;FF)V",
		at = @At("TAIL")
	)
	private void eyeball$bodyMotion(AvatarRenderState state, PoseStack poseStack, float bodyRot, float entityScale, CallbackInfo ci) {
		FaceRenderData data = state.getData(FaceRenderData.KEY);
		if (data != null) {
			BodyMotion.applyToBody(state, poseStack, data);
		}
	}
}
