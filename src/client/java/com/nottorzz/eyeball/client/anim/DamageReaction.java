package com.nottorzz.eyeball.client.anim;

import com.nottorzz.eyeball.client.config.EyeBallConfig;
import java.util.Random;
import net.minecraft.util.Mth;

/**
 * The cartoon hit reaction: spinning spiral eyes, a head wobble that settles into a dizzy sway,
 * a stagger, cartoon stars, and finally a "blink" that turns the spirals back into normal eyes.
 * <p>
 * Timeline (progress 0..1 over "Damage Reaction Duration"):
 * <pre>
 *  0.00  hit: eyes pop bigger, spirals appear instantly, head snaps, body staggers
 *  0.00-0.70  spirals spin at full speed, dizzy sway, stars orbit
 *  0.70-0.90  spirals spin down
 *  0.88-1.00  recovery blink; at its midpoint (0.94) the spirals become normal eyes again
 * </pre>
 * Repeated hits extend the reaction and add more wobble.
 */
public final class DamageReaction {
	public static final float RECOVERY_START = 0.88F;
	public static final float SWITCH_BACK = 0.94F;
	private static final float TWO_PI = (float) (Math.PI * 2.0);

	private final Spring wobbleX = new Spring(0.0F);
	private final Spring wobbleY = new Spring(0.0F);
	private final Spring wobbleZ = new Spring(0.0F);
	private final Spring leanX = new Spring(0.0F);
	private final Spring leanZ = new Spring(0.0F);
	private final Spring stars = new Spring(0.0F);
	private final Random random;

	private int ticksLeft;
	private int totalTicks = 1;
	private int age;
	private float intensity = 1.0F;
	private float spiralAngle;
	private float previousSpiralAngle;
	private float starsAngle;
	private float previousStarsAngle;
	private boolean spiralEnabled = true;

	public DamageReaction(long seed) {
		this.random = new Random(seed ^ 0x2545F4914F6CDD1DL);
	}

	/**
	 * Starts (or extends) the reaction.
	 *
	 * @param strength 1 for an ordinary hit; bigger for explosions, smaller for small knocks
	 */
	public void trigger(float strength, EyeBallConfig config) {
		int duration = Math.max(6, Math.round(config.reactionDuration * 20.0F));
		this.intensity = Mth.clamp(strength * config.reactionIntensity, 0.2F, 2.6F);
		this.spiralEnabled = config.spiralEyes;
		if (this.ticksLeft > 0) {
			this.ticksLeft = Math.max(this.ticksLeft, duration * 3 / 4);
			this.totalTicks = Math.max(this.totalTicks, this.ticksLeft);
			// Keep the clock in the "spinning" part of the timeline.
			this.age = Math.min(this.age, this.totalTicks - this.ticksLeft);
		} else {
			this.ticksLeft = duration;
			this.totalTicks = duration;
			this.age = 0;
			this.spiralAngle = 0.0F;
			this.previousSpiralAngle = 0.0F;
		}
		if (config.headWobble) {
			float side = this.random.nextBoolean() ? 1.0F : -1.0F;
			this.wobbleZ.kick(side * 7.5F * this.intensity);
			this.wobbleY.kick(-side * 5.5F * this.intensity);
			this.wobbleX.kick(-5.0F * this.intensity);
			this.leanX.kick(3.4F * this.intensity);
			this.leanZ.kick(side * 1.6F * this.intensity);
		}
	}

	public boolean active() {
		return this.ticksLeft > 0;
	}

	public float intensity() {
		return this.intensity;
	}

	public float progress(float partialTick) {
		if (this.ticksLeft <= 0) {
			return 1.0F;
		}
		return Mth.clamp((this.age + partialTick) / this.totalTicks, 0.0F, 1.0F);
	}

	public void tick(EyeBallConfig config, float speed, float dt) {
		this.wobbleX.beginTick();
		this.wobbleY.beginTick();
		this.wobbleZ.beginTick();
		this.leanX.beginTick();
		this.leanZ.beginTick();
		this.stars.beginTick();
		this.previousSpiralAngle = this.spiralAngle;
		this.previousStarsAngle = this.starsAngle;

		boolean active = this.ticksLeft > 0;
		float progress = this.progress(0.0F);
		float swayX = 0.0F;
		float swayZ = 0.0F;
		if (active && config.headWobble) {
			float remaining = 1.0F - progress;
			float sway = 0.17F * this.intensity * remaining;
			float phase = this.age * 0.42F * speed;
			swayZ = Mth.sin(phase) * sway;
			swayX = Mth.cos(phase) * sway * 0.45F;
		}
		this.wobbleZ.step(swayZ, 2.6F, 0.17F, dt);
		this.wobbleX.step(swayX, 2.4F, 0.2F, dt);
		this.wobbleY.step(0.0F, 2.2F, 0.2F, dt);
		this.leanX.step(0.0F, 1.7F, 0.3F, dt);
		this.leanZ.step(0.0F, 1.5F, 0.3F, dt);
		if (!config.headWobble) {
			this.wobbleX.snap(0.0F);
			this.wobbleY.snap(0.0F);
			this.wobbleZ.snap(0.0F);
			this.leanX.snap(0.0F);
			this.leanZ.snap(0.0F);
		}

		if (active) {
			float spin = config.spiralSpeed * TWO_PI / 20.0F;
			if (progress > 0.7F) {
				spin *= Math.max(0.12F, 1.0F - (progress - 0.7F) / 0.3F);
			}
			this.spiralAngle += spin;
			if (this.spiralAngle > 10000.0F) {
				float wrap = (float) (Math.floor(this.spiralAngle / TWO_PI) * TWO_PI);
				this.spiralAngle -= wrap;
				this.previousSpiralAngle -= wrap;
			}
			this.age++;
			this.ticksLeft--;
		}

		boolean showStars = active && config.cartoonStars && progress < 0.9F;
		this.stars.step(showStars ? 1.0F : 0.0F, 4.5F, 0.55F, dt);
		this.starsAngle += 2.8F / 20.0F * speed;
		if (this.starsAngle > 10000.0F) {
			float wrap = (float) (Math.floor(this.starsAngle / TWO_PI) * TWO_PI);
			this.starsAngle -= wrap;
			this.previousStarsAngle -= wrap;
		}
	}

	/** Spiral eyes are shown from the hit until the middle of the recovery blink. */
	public boolean spiralVisible(float partialTick) {
		return this.ticksLeft > 0 && this.spiralEnabled && this.progress(partialTick) < SWITCH_BACK;
	}

	/** Extra eye closedness for the recovery blink at the end of the reaction. */
	public float recoveryClosedness(float partialTick) {
		if (this.ticksLeft <= 0 || !this.spiralEnabled) {
			return 0.0F;
		}
		float p = this.progress(partialTick);
		if (p < RECOVERY_START) {
			return 0.0F;
		}
		float t = (p - RECOVERY_START) / (1.0F - RECOVERY_START);
		return (float) Math.pow(Mth.sin(Mth.clamp(t, 0.0F, 1.0F) * Mth.PI), 0.7);
	}

	public void fill(FacePose pose, float partialTick) {
		pose.spiral = this.spiralVisible(partialTick);
		pose.spiralGrow = Mth.clamp((this.age + partialTick) / 3.0F, 0.0F, 1.0F);
		pose.spiralAngle = Mth.lerp(partialTick, this.previousSpiralAngle, this.spiralAngle);
		pose.wobbleX = this.wobbleX.get(partialTick);
		pose.wobbleY = this.wobbleY.get(partialTick);
		pose.wobbleZ = this.wobbleZ.get(partialTick);
		pose.leanX = this.leanX.get(partialTick);
		pose.leanZ = this.leanZ.get(partialTick);
		pose.stars = Math.max(0.0F, this.stars.get(partialTick));
		pose.starsAngle = Mth.lerp(partialTick, this.previousStarsAngle, this.starsAngle);
	}

	/** True while anything is still visibly moving (keeps the face ticking off-screen until it settles). */
	public boolean settling() {
		return this.ticksLeft > 0
			|| Math.abs(this.wobbleZ.value()) > 0.002F || Math.abs(this.leanX.value()) > 0.002F || this.stars.value() > 0.01F;
	}
}
