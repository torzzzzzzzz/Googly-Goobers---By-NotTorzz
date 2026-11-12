package com.nottorzz.eyeball.client.anim;

import net.minecraft.util.Mth;

/**
 * Oversized cartoon eyebrows: they rise and fall with each syllable, tilt for anger, go one-up
 * one-down for confusion, shoot up when surprised and wiggle when dizzy.
 */
public final class BrowAnimator {
	private final Spring[] lift = {new Spring(0.0F), new Spring(0.0F)};
	private final Spring[] angle = {new Spring(0.0F), new Spring(0.0F)};

	public void tick(ExpressionProfile profile, float intensity, boolean animate, boolean talking, float talkAccent,
					 boolean dizzy, float blinkClosedness, float time, float speed, float dt) {
		for (int i = 0; i < 2; i++) {
			this.lift[i].beginTick();
			this.angle[i].beginTick();
			float targetLift = 0.0F;
			float targetAngle = 0.0F;
			if (animate) {
				float side = i == 0 ? 1.0F : -0.65F;
				targetLift = profile.browLift() * intensity + profile.browAsym() * intensity * side * 0.95F;
				targetAngle = profile.browAngle() * intensity + profile.browAsym() * intensity * (i == 0 ? -0.2F : 0.24F);
				if (talking) {
					targetLift += 0.2F + talkAccent * 0.55F * Math.max(0.4F, intensity);
				}
				if (dizzy) {
					targetLift += Mth.sin(time * 13.0F + i * 2.1F) * 0.4F;
					targetAngle += Mth.sin(time * 8.5F + i * 1.3F) * 0.14F;
				}
				targetLift -= blinkClosedness * 0.22F;
			}
			this.lift[i].step(targetLift, 5.2F * speed, 0.42F, dt);
			this.angle[i].step(targetAngle, 4.6F * speed, 0.5F, dt);
		}
	}

	public void fill(FacePose pose, float partialTick) {
		for (int i = 0; i < 2; i++) {
			pose.browLift[i] = this.lift[i].get(partialTick);
			pose.browAngle[i] = this.angle[i].get(partialTick);
		}
	}
}
