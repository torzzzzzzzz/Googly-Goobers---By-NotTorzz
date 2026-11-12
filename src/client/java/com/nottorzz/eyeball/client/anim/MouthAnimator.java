package com.nottorzz.eyeball.client.anim;

import java.util.Random;
import net.minecraft.util.Mth;

/**
 * The talking mouth. While talking it opens and closes in syllables with random strength (and the
 * occasional pause for breath), or follows the real voice volume when Simple Voice Chat is used.
 * The mouth shape (width, smile/frown, round "O" vs flat-topped "D", teeth) blends smoothly
 * between expressions instead of switching instantly.
 */
public final class MouthAnimator {
	private static final float TWO_PI = (float) (Math.PI * 2.0);

	private final Spring open = new Spring(0.0F);
	private final Spring width = new Spring(1.0F);
	private final Spring smile = new Spring(ExpressionProfile.NEUTRAL.smile());
	private final Spring dShape = new Spring(0.0F);
	private final Spring teeth = new Spring(0.0F);
	private final Random random;
	private float syllablePhase;
	private float syllableStrength = 0.8F;
	private float accent;

	public MouthAnimator(long seed) {
		this.random = new Random(seed ^ 0x5DEECE66DL);
	}

	/**
	 * @param voiceLevel 0..1 voice loudness, or a negative value when not using voice
	 */
	public void tick(ExpressionProfile profile, float intensity, boolean talking, float voiceLevel, boolean dizzy,
					 float time, float speed, float dt) {
		this.open.beginTick();
		this.width.beginTick();
		this.smile.beginTick();
		this.dShape.beginTick();
		this.teeth.beginTick();

		float base = profile.mouthBase() * Math.max(intensity, dizzy ? 1.0F : 0.0F);
		float openTarget = base;
		this.accent = 0.0F;
		if (dizzy) {
			// Shocked, trembling open mouth.
			openTarget = profile.mouthBase() + Mth.sin(time * 31.0F) * 0.05F;
		} else if (talking) {
			if (voiceLevel >= 0.0F) {
				this.accent = voiceLevel;
				openTarget = base * 0.5F + voiceLevel * (0.4F + profile.talkAmplitude() * 0.7F);
			} else {
				this.syllablePhase += profile.talkRate() * speed * TWO_PI * dt;
				while (this.syllablePhase >= TWO_PI) {
					this.syllablePhase -= TWO_PI;
					this.syllableStrength = this.random.nextFloat() < 0.12F ? 0.15F : 0.55F + this.random.nextFloat() * 0.45F;
				}
				float envelope = (float) Math.pow(Math.max(0.0F, Mth.sin(this.syllablePhase)), 0.8);
				this.accent = envelope * this.syllableStrength;
				openTarget = base + profile.talkAmplitude() * this.syllableStrength * envelope * (0.55F + 0.45F * Math.min(intensity, 1.5F));
			}
		} else {
			this.syllablePhase = 0.0F;
		}

		this.open.step(Mth.clamp(openTarget, 0.0F, 1.0F), 11.0F * speed, 0.62F, dt);
		float widthTarget = ExpressionProfile.scaled(1.0F, profile.mouthWidth(), intensity) * (1.0F + this.accent * 0.07F);
		this.width.step(Mth.clamp(widthTarget, 0.4F, 1.9F), 6.0F * speed, 0.55F, dt);
		this.smile.step(Mth.clamp(ExpressionProfile.scaled(ExpressionProfile.NEUTRAL.smile(), profile.smile(), intensity), -1.2F, 1.2F), 5.0F * speed, 0.6F, dt);
		this.dShape.step(profile.dShape(), 6.0F * speed, 0.7F, dt);
		this.teeth.step(profile.teeth(), 7.0F * speed, 0.7F, dt);
	}

	/** 0..1, how strongly the current syllable is being "said" (drives brows and head nods). */
	public float accent() {
		return this.accent;
	}

	public void fill(FacePose pose, float partialTick) {
		pose.mouthOpen = Mth.clamp(this.open.get(partialTick), 0.0F, 1.0F);
		pose.mouthWidth = this.width.get(partialTick);
		pose.mouthSmile = this.smile.get(partialTick);
		pose.mouthDShape = Mth.clamp(this.dShape.get(partialTick), 0.0F, 1.0F);
		pose.mouthTeeth = Mth.clamp(this.teeth.get(partialTick), 0.0F, 1.0F);
	}
}
