package com.nottorzz.eyeball.client.anim;

/**
 * A snapshot of a face at one render frame (already interpolated). The renderer only reads this,
 * and because rendering is deferred in 26.x a fresh snapshot is made per frame.
 * <p>
 * Index 0 is the eye/brow on the model's -X side (the player's right), index 1 the +X side.
 * Units: pixels of the 16-pixels-per-block player model, radians, and 0..1 amounts.
 */
public final class FacePose {
	// Eyes
	public final float[] eyeScale = {1.0F, 1.0F};
	/** Vertical squash: 1 = open, ~0.08 = closed (blink / squint). */
	public final float[] eyeOpen = {1.0F, 1.0F};
	/** Pupil offset inside the eye, -1..1 in both axes (a unit disc). */
	public final float[] pupilX = new float[2];
	public final float[] pupilY = new float[2];
	public float pupilScale = 1.0F;
	/** Extra vertical offset of both eyes (walk / jump bounce), pixels. */
	public float eyeBounce;
	/** True while the eyes show spinning spirals. */
	public boolean spiral;
	/** 0..1 how far the spiral has "grown" in (for the pop-in). */
	public float spiralGrow;
	public float spiralAngle;

	// Brows
	public final float[] browLift = new float[2];
	public final float[] browAngle = new float[2];

	// Mouth
	public float mouthOpen;
	public float mouthWidth = 1.0F;
	public float mouthSmile;
	public float mouthDShape;
	public float mouthTeeth;
	/** Elmo mouth: the open mouth shows a bit more depth. */
	public float mouthTremble;

	// Head and body motion
	public float wobbleX;
	public float wobbleY;
	public float wobbleZ;
	public float headNod;
	public float leanX;
	public float leanZ;
	public float bodyBounce;

	// Cartoon stars
	public float stars;
	public float starsAngle;

	/** Seconds, for small procedural details (e.g. star twinkle). */
	public float time;

	/** True while talking (used for head motion when talking). */
	public boolean talking;
}
