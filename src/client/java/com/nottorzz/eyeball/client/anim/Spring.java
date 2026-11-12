package com.nottorzz.eyeball.client.anim;

/**
 * A damped spring, stepped once per game tick and interpolated with the partial tick when rendered.
 * This is what makes every facial movement smooth and bouncy instead of snapping between poses.
 * <p>
 * Integrated with semi-implicit Euler in sub-steps, which stays stable for the stiff, wobbly
 * settings used by googly pupils.
 */
public final class Spring {
	private static final int SUBSTEPS = 4;
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
		float h = dt / SUBSTEPS;
		for (int i = 0; i < SUBSTEPS; i++) {
			this.velocity += (stiffness * (target - this.value) - friction * this.velocity) * h;
			this.value += this.velocity * h;
		}
	}

	/** Adds instantaneous velocity (units per second). */
	public void kick(float impulse) {
		this.velocity += impulse;
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
