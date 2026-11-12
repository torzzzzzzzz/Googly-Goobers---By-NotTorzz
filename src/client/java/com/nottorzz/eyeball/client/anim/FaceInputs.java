package com.nottorzz.eyeball.client.anim;

/**
 * What a face needs to know about its owner each tick (head motion, movement, ground contact).
 * Filled from a real player by {@link FaceAnimationManager}, or synthesised by the menu preview.
 */
public final class FaceInputs {
	/** Head yaw relative to the body, degrees. */
	public float headYawRelative;
	/** Absolute head yaw, degrees (used for turn speed). */
	public float headYaw;
	/** Pitch, degrees (positive = looking down). */
	public float headPitch;
	/** Vertical movement this tick, blocks. */
	public double velY;
	public boolean onGround = true;
	public float walkSpeed;
	public float walkPosition;
	public boolean crouching;
	/** Where something interesting is, relative to the face, in eye-radius units; NaN when nothing. */
	public float glanceX = Float.NaN;
	public float glanceY = Float.NaN;

	public void reset() {
		this.headYawRelative = 0.0F;
		this.headYaw = 0.0F;
		this.headPitch = 0.0F;
		this.velY = 0.0;
		this.onGround = true;
		this.walkSpeed = 0.0F;
		this.walkPosition = 0.0F;
		this.crouching = false;
		this.glanceX = Float.NaN;
		this.glanceY = Float.NaN;
	}
}
