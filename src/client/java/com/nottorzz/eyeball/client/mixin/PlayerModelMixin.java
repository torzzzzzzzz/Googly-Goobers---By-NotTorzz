package com.nottorzz.eyeball.client.mixin;

import com.nottorzz.eyeball.client.render.BodyMotion;
import com.nottorzz.eyeball.client.render.FaceRenderData;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Head wobble / talking nods. Done inside {@code setupAnim} because 26.x re-runs it when the model
 * is actually drawn, and because armour models run it too, so helmets wobble along.
 */
@Mixin(PlayerModel.class)
public abstract class PlayerModelMixin {
	@Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;)V", at = @At("TAIL"))
	private void eyeball$headMotion(AvatarRenderState state, CallbackInfo ci) {
		FaceRenderData data = state.getData(FaceRenderData.KEY);
		if (data != null) {
			BodyMotion.applyToModel((PlayerModel) (Object) this, data);
		}
	}
}
