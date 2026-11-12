package com.nottorzz.eyeball.client.anim;

import java.util.Random;
import net.minecraft.util.Mth;

/**
 * The talking mouth. While talking it opens and closes in syllables of random strength (with the
 * occasional pause for breath), or follows the real voice volume when Simple Voice Chat is used.
 * <p>
 * Every syllable gets its own mouth shape, chosen by how strongly it is said: loud syllables get the
 * big shapes (a huge "AH", a round "OH"), quiet ones the small shapes (a wide "EE" grin, a pursed
 * "OO"). The shape is blended with the current expression, so an angry mouth still shows its teeth
 * and a laughing mouth stays a big "D". Screaming holds the mouth wide open in a huge trembling oval.
 * All values move through springs, so shapes and expressions blend instead of switching.
 */
public final class MouthAnimator {
	private static final float TWO_PI = (float) (Math.PI * 2.0);
	/** The opening stays linear up to here, then eases off towards {@link #MAX_OPEN}. */
	private static final float SOFT_KNEE = 0.9F;
	/** Largest opening (1 = the face's normal maximum, more only with the sliders turned up). */
	public static final float MAX_OPEN = 1.3F;
	/** Fastest the mouth may open or close in one tick (at 1x animation speed): a bit above ordinary lip flaps. */
	private static final float MAX_STEP = 0.7F;

	/** Mouth shapes used while talking. */
	enum Shape {
		//       open   width  dShape teeth  round
		AH(1.0F, 1.1F, 0.3F, 0.45F, 0.0F),
		OH(0.86F, 0.72F, 0.0F, 0.0F, 1.0F),
		EH(0.66F, 1.04F, 0.35F, 0.55F, 0.0F),
		EE(0.46F, 1.22F, 0.7F, 0.95F, 0.0F),
		OO(0.36F, 0.56F, 0.0F, 0.0F, 1.0F);

		final float open;
		final float width;
		final float dShape;
		final float teeth;
		final float round;

		Shape(float open, float width, float dShape, float teeth, float round) {
			this.open = open;
			this.width = width;
			this.dShape = dShape;
			this.teeth = teeth;
			this.round = round;
		}
	}

	private final Spring open = new Spring(0.0F);
	private final Spring width = new Spring(1.0F);
	private final Spring smile = new Spring(ExpressionProfile.NEUTRAL.smile());
	private final Spring dShape = new Spring(0.0F);
	private final Spring teeth = new Spring(0.0F);
	/**
	 * The widest the mouth has been recently: follows the opening up quickly and comes back down
	 * slowly. The face layout keeps the eyes clear of this, so big eyes sit still above a flapping
	 * mouth instead of bobbing with every syllable.
	 */
	private final Spring reach = new Spring(0.0F);
	private final Random random;
	private float syllablePhase;
	private float syllableStrength = 0.8F;
	private Shape shape = Shape.AH;
	private int voiceShapeTimer;
	private boolean syllableStarted;
	private float accent;

	public MouthAnimator(long seed) {
		this.random = new Random(seed ^ 0x5DEECE66DL);
	}

	/**
	 * @param intensity  "Expression Intensity" (how strongly the expression's own shape shows)
	 * @param voiceLevel 0..1 voice loudness, or a negative value when not using voice
	 * @param scream     0..1 how much of the screaming face is showing
	 * @param amount     "Mouth Opening" x "Overall Exaggeration": how wide talking and screaming open the mouth
	 */
	public void tick(ExpressionProfile profile, float intensity, boolean talking, float voiceLevel, boolean dizzy,
					 float scream, float amount, float time, float speed, float dt) {
		this.open.beginTick();
		this.reach.beginTick();
		this.width.beginTick();
		this.smile.beginTick();
		this.dShape.beginTick();
		this.teeth.beginTick();
		this.syllableStarted = false;

		float base = profile.mouthBase() * Math.max(intensity, dizzy ? 1.0F : 0.0F);
		// The scream's huge mouth also follows the Mouth Opening slider.
		base *= Mth.lerp(scream, 1.0F, Mth.clamp(0.55F + 0.45F * amount, 0.35F, 1.4F));
		float openTarget = base;
		this.accent = 0.0F;
		// How much the per-syllable shapes may change this expression's mouth: strong expressions
		// (laughing, angry, screaming) mostly keep their own mouth.
		float shapeMix = 0.0F;
		if (talking && !dizzy) {
			shapeMix = (1.0F - Mth.clamp(Math.abs(profile.smile()) * 0.4F + profile.dShape() * 0.5F, 0.0F, 0.7F)) * (1.0F - scream);
		}
		if (dizzy) {
			// Shocked, trembling open mouth.
			openTarget = profile.mouthBase() + Mth.sin(time * 31.0F) * 0.05F;
		} else if (talking) {
			float shapeOpen = Mth.lerp(shapeMix, 0.8F, this.shape.open);
			if (voiceLevel >= 0.0F) {
				// Real voice: louder = wider, and a new mouth shape every few ticks.
				if (--this.voiceShapeTimer <= 0) {
					this.syllableStrength = voiceLevel;
					this.pickShape(voiceLevel);
					this.voiceShapeTimer = 2 + this.random.nextInt(3);
					this.syllableStarted = true;
				}
				this.accent = voiceLevel;
				float loudness = (float) Math.pow(voiceLevel, 0.85);
				openTarget = base * 0.5F + amount * (0.1F + 0.9F * loudness) * shapeOpen * (0.35F + profile.talkAmplitude() * 0.8F);
			} else {
				this.syllablePhase += profile.talkRate() * speed * TWO_PI * dt;
				while (this.syllablePhase >= TWO_PI) {
					this.syllablePhase -= TWO_PI;
					this.syllableStrength = this.random.nextFloat() < 0.12F ? 0.15F : 0.55F + this.random.nextFloat() * 0.45F;
					this.pickShape(this.syllableStrength);
					this.syllableStarted = true;
				}
				float envelope = (float) Math.pow(Math.max(0.0F, Mth.sin(this.syllablePhase)), 0.8);
				this.accent = envelope * this.syllableStrength;
				openTarget = base + profile.talkAmplitude() * this.syllableStrength * envelope * shapeOpen
					* amount * (0.55F + 0.45F * Math.min(intensity, 1.5F));
			}
			if (scream > 0.0F) {
				// A screaming mouth never closes: it trembles wide open.
				this.accent = Math.max(this.accent, scream * (0.6F + 0.25F * Mth.sin(time * 23.0F)));
				openTarget = Math.max(openTarget, base * (0.94F + 0.06F * Mth.sin(time * 41.0F)));
			}
		} else {
			this.syllablePhase = 0.0F;
			this.voiceShapeTimer = 0;
		}

		this.open.step(softClamp(Math.max(0.0F, openTarget)), 11.0F * speed, 0.6F, dt);
		this.open.limitStep(MAX_STEP * speed);
		float opened = Math.max(0.0F, this.open.value());
		if (opened > this.reach.value()) {
			this.reach.step(opened * 1.06F, 9.0F * speed, 1.0F, dt);
		} else {
			// Hold while talking (so the eyes stay put between syllables), let go smoothly afterwards.
			this.reach.step(opened, (talking ? 0.25F : 1.6F) * speed, 1.0F, dt);
		}
		float widthTarget = ExpressionProfile.scaled(1.0F, profile.mouthWidth(), intensity)
			* Mth.lerp(shapeMix, 1.0F, this.shape.width) * (1.0F + this.accent * 0.08F);
		this.width.step(Mth.clamp(widthTarget, 0.4F, 1.9F), 7.0F * speed, 0.55F, dt);
		float smileTarget = ExpressionProfile.scaled(ExpressionProfile.NEUTRAL.smile(), profile.smile(), intensity)
			* (1.0F - 0.45F * shapeMix * this.shape.round);
		this.smile.step(Mth.clamp(smileTarget, -1.2F, 1.2F), 5.0F * speed, 0.6F, dt);
		this.dShape.step(Mth.lerp(shapeMix * 0.8F, profile.dShape(), this.shape.dShape), 6.5F * speed, 0.7F, dt);
		this.teeth.step(Math.max(profile.teeth(), this.shape.teeth * shapeMix * 0.85F), 7.0F * speed, 0.7F, dt);
	}

	/** Loud syllables get the big shapes, quiet ones the small shapes. */
	private void pickShape(float strength) {
		float r = this.random.nextFloat();
		if (strength >= 0.8F) {
			this.shape = r < 0.45F ? Shape.AH : r < 0.75F ? Shape.OH : Shape.EH;
		} else if (strength >= 0.5F) {
			this.shape = r < 0.3F ? Shape.EH : r < 0.55F ? Shape.AH : r < 0.78F ? Shape.EE : Shape.OH;
		} else {
			this.shape = r < 0.45F ? Shape.OO : r < 0.8F ? Shape.EE : Shape.EH;
		}
	}

	/** Linear up to the knee, then eases off so the biggest settings never look clipped. */
	static float softClamp(float value) {
		if (value <= SOFT_KNEE) {
			return value;
		}
		float range = MAX_OPEN - SOFT_KNEE;
		return SOFT_KNEE + range * (float) Math.tanh((value - SOFT_KNEE) / range);
	}

	/** 0..1, how strongly the current syllable is being "said" (drives eyes, brows and head nods). */
	public float accent() {
		return this.accent;
	}

	/** True on the tick a new syllable (or, with voice, a new mouth shape) starts. */
	public boolean syllableStarted() {
		return this.syllableStarted;
	}

	public float syllableStrength() {
		return this.syllableStrength;
	}

	public void fill(FacePose pose, float partialTick) {
		pose.mouthOpen = Mth.clamp(this.open.get(partialTick), 0.0F, MAX_OPEN);
		pose.mouthReach = Mth.clamp(this.reach.get(partialTick), 0.0F, MAX_OPEN * 1.1F);
		pose.mouthWidth = this.width.get(partialTick);
		pose.mouthSmile = this.smile.get(partialTick);
		pose.mouthDShape = Mth.clamp(this.dShape.get(partialTick), 0.0F, 1.0F);
		pose.mouthTeeth = Mth.clamp(this.teeth.get(partialTick), 0.0F, 1.0F);
		// A really wide-open round mouth shows the little uvula at the back (cartoon scream).
		float wide = Mth.clamp((pose.mouthOpen - 0.62F) / 0.3F, 0.0F, 1.0F);
		pose.mouthUvula = wide * wide * (3.0F - 2.0F * wide) * Mth.clamp(1.0F - 1.6F * pose.mouthDShape, 0.0F, 1.0F);
	}
}
