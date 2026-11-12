package com.nottorzz.eyeball.client.mixin;

import com.nottorzz.eyeball.client.anim.FaceAnimationManager;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Every client receives a damage event for every visible entity (players, mobs, falling, fire,
 * ...), so hit reactions work for all players without any server support.
 */
@Mixin(LivingEntity.class)
public abstract class LivingEntityDamageMixin {
	@Inject(method = "handleDamageEvent", at = @At("HEAD"))
	private void eyeball$onDamage(DamageSource source, CallbackInfo ci) {
		LivingEntity self = (LivingEntity) (Object) this;
		if (self instanceof AbstractClientPlayer player && self.level().isClientSide()) {
			FaceAnimationManager.INSTANCE.onDamage(player, source);
		}
	}
}
