package com.nottorzz.eyeball.client.mixin;

import com.llamalad7.mixinextras.sugar.Local;
import com.nottorzz.eyeball.Appearance;
import com.nottorzz.eyeball.client.render.FaceRenderData;
import com.nottorzz.eyeball.client.render.elmo.ElmoRenderer;
import com.nottorzz.eyeball.client.render.elmo.ElmoRenderers;
import com.nottorzz.eyeball.client.target.TargetResolver;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Routes transformed players to the Elmo renderer. Only players who are Elmo on this screen are
 * affected; everything else goes through vanilla untouched.
 */
@Mixin(EntityRenderDispatcher.class)
public abstract class EntityRenderDispatcherMixin {
	@Inject(method = "getRenderer(Lnet/minecraft/world/entity/Entity;)Lnet/minecraft/client/renderer/entity/EntityRenderer;",
		at = @At("HEAD"), cancellable = true)
	@SuppressWarnings({"unchecked", "rawtypes"})
	private <T extends Entity> void eyeball$elmoForEntity(T entity, CallbackInfoReturnable<EntityRenderer<? super T, ?>> cir) {
		if (entity instanceof AbstractClientPlayer player && Appearance.elmo(TargetResolver.resolve(player))) {
			ElmoRenderer renderer = ElmoRenderers.get();
			if (renderer != null) {
				cir.setReturnValue((EntityRenderer) renderer);
			}
		}
	}

	@Inject(method = "getRenderer(Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;)Lnet/minecraft/client/renderer/entity/player/AvatarRenderer;",
		at = @At("HEAD"), cancellable = true)
	private void eyeball$elmoForState(AvatarRenderState state, CallbackInfoReturnable<AvatarRenderer<?>> cir) {
		FaceRenderData data = state.getData(FaceRenderData.KEY);
		if (data != null && data.elmo) {
			ElmoRenderer renderer = ElmoRenderers.get();
			if (renderer != null) {
				cir.setReturnValue(renderer);
			}
		}
	}

	@Inject(method = "onResourceManagerReload", at = @At("TAIL"))
	private void eyeball$rebuildElmo(ResourceManager resourceManager, CallbackInfo ci, @Local EntityRendererProvider.Context context) {
		ElmoRenderers.rebuild(context);
	}
}
