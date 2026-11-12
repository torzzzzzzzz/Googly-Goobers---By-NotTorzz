package com.nottorzz.eyeball.client.anim;

/**
 * A damped spring, stepped once per game tick and interpolated with the partial tick when rendered.
 * This is what makes every facial movement smooth and bouncy instead of snapping between poses.
 * <p>
 * Integrated with semi-implicit Euler in sub-steps. The number of sub-steps grows with the spring's
 * stiffness and damping, so even the stiffest springs at 2x animation speed stay stable (with a
 * fixed small number of sub-steps a fast, well-damped spring like the mouth blows up).
 */
public final class Spring {
	private static final int MIN_SUBSTEPS = 4;
	private static final int MAX_SUBSTEPS = 64;
	/** Largest stable-and-accurate sub-step, as a fraction of the spring's period and damping time. */
	private static final float MAX_OMEGA_STEP = 0.35F;
	private static final float MAX_FRICTION_STEP = 0.7F;
	private static final float TWO_PI = (float) (Math.PI * 2.0);

	private float value;
	private float previous;
	private float velocity;

	public Spring(float initial) {
		this.snap(initial);
	}

	/** Jumps straight to a value with no motion. */
	public void snap(float target) {
		this.value = target;
		this.previous = target;
		this.velocity = 0.0F;
	}

	/** Must be called at the start of every tick, before {@link #step}. */
	public void beginTick() {
		this.previous = this.value;
	}

	/**
	 * Moves toward {@code target}.
	 *
	 * @param frequency oscillation frequency in Hz (higher = snappier)
	 * @param damping   damping ratio (1 = no overshoot, lower = bouncier)
	 * @param dt        seconds this step covers
	 */
	public void step(float target, float frequency, float damping, float dt) {
		float omega = TWO_PI * frequency;
		float stiffness = omega * omega;
		float friction = 2.0F * damping * omega;
		int substeps = (int) Math.ceil(Math.max(dt * omega / MAX_OMEGA_STEP, dt * friction / MAX_FRICTION_STEP));
		substeps = Math.clamp(substeps, MIN_SUBSTEPS, MAX_SUBSTEPS);
		float h = dt / substeps;
		for (int i = 0; i < substeps; i++) {
			this.velocity += (stiffness * (target - this.value) - friction * this.velocity) * h;
			this.value += this.velocity * h;
		}
		if (!Float.isFinite(this.value) || !Float.isFinite(this.velocity)) {
			// Never let a bad input break a face for good.
			this.value = Float.isFinite(target) ? target : this.previous;
			this.velocity = 0.0F;
		}
	}

	/** Adds instantaneous velocity (units per second). */
	public void kick(float impulse) {
		if (Float.isFinite(impulse)) {
			this.velocity += impulse;
		}
	}

	public float value() {
		return this.value;
	}

	public float velocity() {
		return this.velocity;
	}

	public void setValue(float value) {
		this.value = value;
	}

	public void setVelocity(float velocity) {
		this.velocity = velocity;
	}

	/** Value interpolated between the previous and the current tick. */
	public float get(float partialTick) {
		return this.previous + (this.value - this.previous) * partialTick;
	}
}
