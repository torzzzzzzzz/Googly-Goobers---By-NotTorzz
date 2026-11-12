package com.nottorzz.eyeball.client.anim;

import java.util.Random;
import net.minecraft.util.Mth;

/**
 * Googly-eye behaviour for one face:
 * <ul>
 *     <li>Pupils are loose discs: they follow where the player looks, glance at nearby players, lag
 *     behind head turns, drop when landing and bounce off the rim of the eye. Each eye has its own
 *     spring "personality", so they move independently and slightly out of sync.</li>
 *     <li>Random blinking (sometimes a double blink), happy squinting.</li>
 *     <li>Eye size pops (talking, surprise, getting hit) and a bounce when walking, jumping and landing.</li>
 * </ul>
 */
public final class EyeAnimator {
	public static final int BLINK_TICKS = 4;
	private static final float RIM_RESTITUTION = 0.45F;

	private final Spring[] pupilX = {new Spring(0.0F), new Spring(0.0F)};
	private final Spring[] pupilY = {new Spring(-0.1F), new Spring(-0.1F)};
	private final Spring[] eyeScale = {new Spring(1.0F), new Spring(1.0F)};
	private final Spring pupilScale = new Spring(1.0F);
	private final Spring squint = new Spring(0.0F);
	private final Spring bounce = new Spring(0.0F);
	private final float[] pupilFrequency = new float[2];
	private final float[] pupilDamping = new float[2];
	private final float crossEye;
	private final float asymmetry;
	private final int bigEye;
	private final Random random;

	private float blinkCooldown;
	private int blinkProgress = -1;
	private boolean doubleBlinkQueued;
	private int glanceTimer;
	private boolean glancing;
	private float glanceX;
	private float glanceY;
	private float lastHeadYaw = Float.NaN;
	private float lastYawSpeed;
	private double lastVelY;
	private boolean lastOnGround = true;

	public EyeAnimator(long seed) {
		this.random = new Random(seed);
		// Every player gets slightly different, goofy eyes.
		this.pupilFrequency[0] = 2.9F + this.random.nextFloat() * 0.8F;
		this.pupilFrequency[1] = 3.4F + this.random.nextFloat() * 0.9F;
		this.pupilDamping[0] = 0.2F + this.random.nextFloat() * 0.1F;
		this.pupilDamping[1] = 0.26F + this.random.nextFloat() * 0.12F;
		this.crossEye = (this.random.nextFloat() - 0.35F) * 0.16F;
		this.asymmetry = 0.05F + this.random.nextFloat() * 0.07F;
		this.bigEye = this.random.nextInt(2);
		this.blinkCooldown = 20 + this.random.nextInt(60);
		this.glanceTimer = 30 + this.random.nextInt(60);
	}

	/** Size multiplier for eye {@code i} from the per-player asymmetry. */
	public float asymmetryScale(int i) {
		return i == this.bigEye ? 1.0F + this.asymmetry : 1.0F - this.asymmetry * 0.45F;
	}

	public void tick(FaceInputs in, ExpressionProfile profile, float intensity, float eyePop, boolean eyeMovement,
					 boolean blinkAllowed, float speed, float dt) {
		for (int i = 0; i < 2; i++) {
			this.pupilX[i].beginTick();
			this.pupilY[i].beginTick();
			this.eyeScale[i].beginTick();
		}
		this.pupilScale.beginTick();
		this.squint.beginTick();
		this.bounce.beginTick();

		// --- Motion that the "loose" pupils react to ---
		float yawSpeed = Float.isNaN(this.lastHeadYaw) ? 0.0F : Mth.wrapDegrees(in.headYaw - this.lastHeadYaw);
		float yawAcceleration = Mth.clamp(yawSpeed - this.lastYawSpeed, -40.0F, 40.0F);
		double velYChange = in.velY - this.lastVelY;
		boolean landed = !this.lastOnGround && in.onGround && this.lastVelY < -0.15;
		boolean jumped = this.lastOnGround && !in.onGround && in.velY > 0.18;
		float landingImpact = landed ? (float) Math.min(1.2, -this.lastVelY * 1.6) : 0.0F;
		this.lastHeadYaw = in.headYaw;
		this.lastYawSpeed = yawSpeed;
		this.lastVelY = in.velY;
		this.lastOnGround = in.onGround;

		// --- Glances: now and then look at something nearby, or just look around ---
		if (--this.glanceTimer <= 0) {
			this.glancing = !this.glancing || this.random.nextFloat() < 0.35F;
			if (this.glancing) {
				if (!Float.isNaN(in.glanceX) && this.random.nextFloat() < 0.65F) {
					this.glanceX = in.glanceX;
					this.glanceY = in.glanceY;
				} else {
					this.glanceX = (this.random.nextFloat() * 2.0F - 1.0F) * 0.75F;
					this.glanceY = (this.random.nextFloat() * 2.0F - 1.0F) * 0.5F;
				}
				this.glanceTimer = Math.round((12 + this.random.nextInt(26)) / speed);
			} else {
				this.glanceTimer = Math.round((25 + this.random.nextInt(60)) / speed);
			}
		}

		// --- Pupil targets ---
		float targetX = 0.0F;
		float targetY = -0.1F;
		if (eyeMovement) {
			// Turned head -> pupils look even further that way (exaggerated "following the look").
			targetX = -Mth.clamp(in.headYawRelative / 65.0F, -1.0F, 1.0F) * 0.6F;
			targetY = Mth.clamp(-in.headPitch / 65.0F, -1.0F, 1.0F) * 0.62F - 0.12F;
			if (this.glancing) {
				targetX = Mth.lerp(0.75F, targetX, this.glanceX);
				targetY = Mth.lerp(0.75F, targetY, this.glanceY);
			}
			targetY += profile.pupilLift() * intensity;
		}

		float pupilFreqScale = (float) Math.sqrt(speed);
		for (int i = 0; i < 2; i++) {
			if (eyeMovement) {
				float personality = i == 0 ? 1.0F : 0.82F;
				// Inertia: the head turns, the pupils stay behind for a moment.
				this.pupilX[i].kick(yawAcceleration * 0.28F * personality);
				this.pupilY[i].kick((float) (-velYChange * 30.0) * personality);
				if (in.walkSpeed > 0.05F && in.onGround) {
					// A little jiggle on every step.
					float step = Mth.cos(in.walkPosition * 0.6662F * 2.0F + i * 0.9F);
					this.pupilY[i].kick(step * in.walkSpeed * 1.4F);
				}
			}
			float cross = i == 0 ? this.crossEye : -this.crossEye;
			this.pupilX[i].step(targetX + cross, this.pupilFrequency[i] * pupilFreqScale, this.pupilDamping[i], dt);
			this.pupilY[i].step(targetY, this.pupilFrequency[i] * pupilFreqScale, this.pupilDamping[i], dt);
			this.keepInsideEye(i);
		}

		// --- Sizes ---
		float scaleTarget = ExpressionProfile.scaled(1.0F, profile.eyeScale(), intensity) + eyePop;
		for (int i = 0; i < 2; i++) {
			if (landed) {
				this.eyeScale[i].kick(-landingImpact * 2.6F);
			}
			this.eyeScale[i].step(scaleTarget * this.asymmetryScale(i), 3.6F * speed, 0.32F, dt);
		}
		this.pupilScale.step(ExpressionProfile.scaled(1.0F, profile.pupilScale(), intensity), 4.0F * speed, 0.5F, dt);
		this.squint.step(Mth.clamp(profile.squint() * intensity, 0.0F, 0.85F), 5.0F * speed, 0.7F, dt);

		// --- Bounce: bob with each step, lag behind jumps, squash on landing ---
		float walkBob = in.onGround ? Mth.sin(in.walkPosition * 0.6662F * 2.0F) * Math.min(in.walkSpeed, 1.0F) * 0.45F : 0.0F;
		if (jumped) {
			this.bounce.kick(-11.0F);
		}
		if (landed) {
			this.bounce.kick(-landingImpact * 24.0F);
		}
		this.bounce.step(walkBob, 5.0F * speed, 0.3F, dt);

		// --- Blinking ---
		if (this.blinkProgress >= 0) {
			this.blinkProgress++;
			if (this.blinkProgress >= BLINK_TICKS) {
				this.blinkProgress = -1;
				if (this.doubleBlinkQueued) {
					this.doubleBlinkQueued = false;
					this.blinkCooldown = 3;
				}
			}
		} else if (blinkAllowed) {
			// Faster animation speed = more frequent blinks.
			this.blinkCooldown -= speed;
			if (this.blinkCooldown <= 0.0F) {
				this.startBlink();
			}
		}
	}

	public void startBlink() {
		this.blinkProgress = 0;
		this.blinkCooldown = Math.round(45 + this.random.nextInt(80));
		this.doubleBlinkQueued = this.random.nextFloat() < 0.18F;
	}

	/** Eye size "pop" impulse (getting hit, sudden surprise). */
	public void pop(float strength) {
		for (Spring spring : this.eyeScale) {
			spring.kick(strength);
		}
	}

	/** Shakes the pupils (getting hit). */
	public void shakePupils(float strength) {
		for (int i = 0; i < 2; i++) {
			this.pupilX[i].kick((this.random.nextFloat() * 2.0F - 1.0F) * strength);
			this.pupilY[i].kick((this.random.nextFloat() * 2.0F - 1.0F) * strength);
		}
	}

	/** 0 = open, 1 = shut. */
	public float blinkClosedness(float partialTick) {
		if (this.blinkProgress < 0) {
			return 0.0F;
		}
		float t = Mth.clamp((this.blinkProgress + partialTick) / BLINK_TICKS, 0.0F, 1.0F);
		return (float) Math.pow(Mth.sin(t * Mth.PI), 0.7);
	}

	public boolean isBlinking() {
		return this.blinkProgress >= 0;
	}

	public void fill(FacePose pose, float partialTick, float extraClosedness) {
		float closed = Math.max(this.blinkClosedness(partialTick), extraClosedness);
		float squintAmount = this.squint.get(partialTick);
		for (int i = 0; i < 2; i++) {
			pose.eyeScale[i] = Math.max(0.2F, this.eyeScale[i].get(partialTick));
			pose.eyeOpen[i] = Math.max(0.06F, (1.0F - 0.55F * squintAmount) * (1.0F - 0.93F * closed));
			pose.pupilX[i] = this.pupilX[i].get(partialTick);
			pose.pupilY[i] = this.pupilY[i].get(partialTick);
		}
		pose.pupilScale = this.pupilScale.get(partialTick);
		pose.eyeBounce = this.bounce.get(partialTick);
	}

	private void keepInsideEye(int i) {
		float x = this.pupilX[i].value();
		float y = this.pupilY[i].value();
		float distSq = x * x + y * y;
		if (distSq <= 1.0F) {
			return;
		}
		float dist = (float) Math.sqrt(distSq);
		float nx = x / dist;
		float ny = y / dist;
		this.pupilX[i].setValue(nx);
		this.pupilY[i].setValue(ny);
		// Bounce off the rim like a real googly eye.
		float vx = this.pupilX[i].velocity();
		float vy = this.pupilY[i].velocity();
		float radial = vx * nx + vy * ny;
		if (radial > 0.0F) {
			this.pupilX[i].setVelocity(vx - (1.0F + RIM_RESTITUTION) * radial * nx);
			this.pupilY[i].setVelocity(vy - (1.0F + RIM_RESTITUTION) * radial * ny);
		}
	}
}
