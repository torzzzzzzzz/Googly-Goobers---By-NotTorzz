package com.nottorzz.eyeball.client.anim;

import com.nottorzz.eyeball.Expression;
import com.nottorzz.eyeball.client.config.EyeBallConfig;
import java.util.UUID;
import net.minecraft.util.Mth;

/**
 * All animation state for one face. Combines the separate systems ({@link EyeAnimator},
 * {@link BrowAnimator}, {@link MouthAnimator}, {@link DamageReaction}) and decides which one is in
 * charge with a strict priority, so animations never fight each other:
 * <pre>
 *   1. Hit reaction (spiral eyes)      - highest
 *   2. Deliberate expression (keybind / command)
 *   3. Talking (chat or voice) with the expression detected from the message; screaming when the
 *      message is screamed or the voice is very loud for a moment
 *   4. Idle (looking around, blinking)
 * </pre>
 * Timers keep running underneath, so after a hit the face goes back to talking if the player is
 * still talking, otherwise to the normal face. Every value moves through springs, so even
 * priority switches blend smoothly.
 * <p>
 * Talking is deliberately over the top: a smooth "talk energy" envelope swells the eyes to about
 * 1.6x (pulsing with every stressed syllable), with a springy pop when talking starts and a smooth
 * shrink when it stops; the mouth opens wide in changing shapes; the brows bounce and the head nods
 * and sways. Screaming blends in even bigger trembling eyes, a huge oval mouth and a head shake.
 */
public final class FaceState {
	private static final float DT = 1.0F / 20.0F;
	private static final float TWO_PI = (float) (Math.PI * 2.0);
	private static final int VOICE_HOLD_TICKS = 5;

	/** Eye growth at full talk energy (with Eye Enlargement and Overall Exaggeration at 1). */
	static final float TALK_GROWTH = 0.5F;
	/** Extra growth on stressed syllables. */
	static final float SYLLABLE_GROWTH = 0.34F;
	/** Eye growth while screaming (on top of the screaming expression's own wide eyes). */
	static final float SCREAM_GROWTH = 0.9F;
	/** Size pop (spring impulse) when talking starts. */
	private static final float TALK_POP = 2.6F;
	private static final float SCREAM_POP = 2.0F;
	/** Voice loudness (0..1) that counts as yelling, and how long it must last to become a scream. */
	private static final float SCREAM_LEVEL = 0.88F;
	private static final float SCREAM_RELEASE_LEVEL = 0.7F;
	private static final int SCREAM_TICKS = 8;
	/** How long the face takes to cross-fade from one expression to the next (seconds). */
	private static final float BLEND_SECONDS = 0.3F;

	public final UUID id;
	private final EyeAnimator eyes;
	private final BrowAnimator brows = new BrowAnimator();
	private final MouthAnimator mouth;
	private final DamageReaction reaction;
	private final Spring headNod = new Spring(0.0F);
	private final Spring talkEnergy = new Spring(0.0F);
	private final Spring scream = new Spring(0.0F);
	/** The syllable accent, smoothed: drives the eye pulse, brow bounce and head nods. */
	private final Spring accentSmooth = new Spring(0.0F);
	private final float swayPhase;
	private final float rollPhase;

	private int age;
	private int talkTicks;
	private Expression talkExpression = Expression.TALKING;
	private int expressionTicks;
	private Expression expression = Expression.NEUTRAL;
	private float voiceLevel;
	private int voiceAge = Integer.MAX_VALUE;
	private int loudVoiceTicks;
	private boolean voiceScreaming;
	private int lastTalkStartAge = Integer.MIN_VALUE / 2;
	private Expression activeMood = Expression.NEUTRAL;
	private boolean wasTalking;
	private boolean wasScreaming;
	private float exaggeration = 1.0F;
	/** Eye size of the last talking expression; it fades out with the talk energy afterwards. */
	private float talkEyeScale = 1.0F;
	/** Cross-fade between expressions: every target blends instead of switching on the spot. */
	private Expression blendTarget = Expression.NEUTRAL;
	private ExpressionProfile blendFrom = ExpressionProfile.NEUTRAL;
	private ExpressionProfile currentProfile = ExpressionProfile.NEUTRAL;
	private float blend = 1.0F;

	/** Bookkeeping for {@link FaceAnimationManager}. */
	long lastRenderTick;
	long lastSeenTick;

	public FaceState(UUID id) {
		this.id = id;
		long seed = id.getMostSignificantBits() ^ Long.rotateLeft(id.getLeastSignificantBits(), 17);
		this.eyes = new EyeAnimator(seed);
		this.mouth = new MouthAnimator(seed);
		this.reaction = new DamageReaction(seed);
		this.swayPhase = (seed & 0xFF) / 255.0F * TWO_PI;
		this.rollPhase = ((seed >>> 8) & 0xFF) / 255.0F * TWO_PI;
	}

	// ------------------------------------------------------------------ events

	/** Starts talking. If already talking (e.g. chat + server relay of the same message) it just extends. */
	public void talk(Expression detected, int ticks) {
		boolean duplicate = this.age - this.lastTalkStartAge < 30 && this.talkTicks > 0;
		boolean newMessage = !duplicate && this.talkTicks > 0;
		this.talkTicks = duplicate ? Math.max(this.talkTicks, ticks) : ticks;
		// A duplicate (the server relay of a message this client already read) only adds detail. An
		// older server relays expressions it doesn't know (like screaming) as neutral: keep ours then.
		if (!duplicate || detected != Expression.TALKING && detected != Expression.NEUTRAL) {
			this.talkExpression = detected == Expression.NEUTRAL ? Expression.TALKING : detected;
		}
		this.lastTalkStartAge = this.age;
		if (detected == Expression.SURPRISED || detected == Expression.EXCITED) {
			this.eyes.pop(2.5F);
		} else if (newMessage) {
			// A new message while still talking: a smaller re-pop.
			this.eyes.pop(1.4F * this.exaggeration);
		}
	}

	/** Holds a deliberate expression for a while (keybinds, /eyeball expression, menu preview). */
	public void express(Expression expression, int ticks) {
		this.expression = expression;
		this.expressionTicks = ticks;
		if (expression == Expression.SURPRISED) {
			this.eyes.pop(3.5F);
		}
	}

	public void hit(float strength, EyeBallConfig config) {
		if (!config.hitReactions) {
			return;
		}
		this.reaction.trigger(strength, config);
		this.eyes.pop(4.5F * Math.min(strength * config.reactionIntensity, 1.6F));
		this.eyes.shakePupils(9.0F);
	}

	/** Live voice loudness from Simple Voice Chat (0..1). */
	public void voice(float level) {
		this.voiceLevel = Math.max(level, this.voiceLevel * 0.6F);
		this.voiceAge = 0;
	}

	public void forceBlink() {
		if (!this.eyes.isBlinking()) {
			this.eyes.startBlink();
		}
	}

	// ------------------------------------------------------------------ state

	public boolean isTalking(EyeBallConfig config) {
		return config.talkingAnimations && (this.talkTicks > 0 || this.voiceActive());
	}

	public boolean isReacting() {
		return this.reaction.active();
	}

	public Expression activeMood() {
		return this.activeMood;
	}

	/** True while something is still playing that should advance even when nobody is looking. */
	public boolean isBusy() {
		return this.talkTicks > 0 || this.expressionTicks > 0 || this.reaction.settling() || this.voiceActive()
			|| this.talkEnergy.value() > 0.01F || this.scream.value() > 0.01F;
	}

	public int talkTicksLeft() {
		return this.talkTicks;
	}

	/** True while a very loud voice (yelling into the microphone) turns talking into screaming. */
	public boolean isVoiceScreaming() {
		return this.voiceScreaming;
	}

	private boolean voiceActive() {
		return this.voiceAge <= VOICE_HOLD_TICKS;
	}

	// ------------------------------------------------------------------ simulation

	public void tick(FaceInputs in, EyeBallConfig config) {
		this.age++;
		float speed = config.animationSpeed;
		float time = this.age * DT * speed;
		float intensity = config.expressionIntensity;
		float ex = config.exaggeration;
		this.exaggeration = ex;
		float eyeGrowth = config.eyeEnlargement * ex;
		float mouthAmount = config.mouthOpening * ex;

		this.headNod.beginTick();
		this.talkEnergy.beginTick();
		this.scream.beginTick();
		this.accentSmooth.beginTick();
		boolean reacting = this.reaction.active() && config.hitReactions;
		boolean talking = this.isTalking(config);
		boolean voiceUsed = this.voiceActive() && config.voiceLipSync && config.talkingAnimations;
		this.updateVoiceScream(voiceUsed);

		// ---- Priority: hit reaction > deliberate expression > talking > idle ----
		Expression mood;
		if (reacting) {
			mood = Expression.DIZZY;
		} else if (this.expressionTicks > 0) {
			mood = this.expression;
		} else if (talking && this.voiceScreaming) {
			mood = Expression.SCREAMING;
		} else if (talking) {
			// Chat decides the face; talking only by voice uses the normal talking face.
			mood = this.talkTicks > 0 ? this.talkExpression : Expression.TALKING;
		} else {
			mood = Expression.NEUTRAL;
		}
		this.activeMood = mood;
		if (mood != this.blendTarget) {
			this.blendFrom = this.currentProfile;
			this.blendTarget = mood;
			this.blend = 0.0F;
		}
		this.blend = Math.min(1.0F, this.blend + DT * speed / BLEND_SECONDS);
		float fade = this.blend * this.blend * (3.0F - 2.0F * this.blend);
		ExpressionProfile profile = ExpressionProfile.lerp(this.blendFrom, ExpressionProfile.of(mood), fade);
		this.currentProfile = profile;
		boolean screaming = !reacting && mood == Expression.SCREAMING;
		// While reacting the talking mouth is paused (timers keep running underneath).
		boolean mouthTalks = !reacting && (talking || mood == Expression.LAUGHING || screaming);
		float profileIntensity = reacting ? 1.0F : intensity;

		// Smooth blends: the scream fades in and out, and "talk energy" rises quickly (overshooting a
		// little, for a pop) but falls slowly with no overshoot (the eyes shrink back smoothly).
		this.scream.step(screaming ? 1.0F : 0.0F, (screaming ? 4.5F : 2.6F) * speed, screaming ? 0.6F : 1.0F, DT);
		float energyTarget = mouthTalks ? 1.0F : 0.0F;
		if (energyTarget > this.talkEnergy.value()) {
			this.talkEnergy.step(energyTarget, 3.0F * speed, 0.6F, DT);
		} else {
			this.talkEnergy.step(energyTarget, 1.5F * speed, 1.0F, DT);
		}
		float energy = Mth.clamp(this.talkEnergy.value(), 0.0F, 1.3F);
		float screamAmount = Mth.clamp(this.scream.value(), 0.0F, 1.0F);

		// Pop when talking (or screaming) starts. A hit in the middle of talking does not count as a
		// new start, so talking that resumes after a hit just swells back smoothly.
		if (!reacting) {
			if (mouthTalks && !this.wasTalking) {
				this.eyes.pop(TALK_POP * eyeGrowth);
				if (config.eyeMovement) {
					this.eyes.shakePupils(2.5F * ex);
				}
			}
			if (screaming && !this.wasScreaming) {
				this.eyes.pop(SCREAM_POP * eyeGrowth);
				if (config.eyeMovement) {
					this.eyes.shakePupils(5.0F * ex);
				}
			}
			this.wasTalking = mouthTalks;
			this.wasScreaming = screaming;
		}

		float voice = voiceUsed ? this.voiceLevel : -1.0F;
		this.mouth.tick(profile, profileIntensity, mouthTalks, voice, reacting, screamAmount, mouthAmount, time, speed, DT);
		// While talking the accent follows the syllables; afterwards it eases out with the talk energy.
		if (mouthTalks) {
			this.accentSmooth.step(this.mouth.accent(), 9.0F * speed, 0.65F, DT);
		} else {
			this.accentSmooth.step(0.0F, 1.8F * speed, 1.0F, DT);
		}
		float accent = Mth.clamp(this.accentSmooth.value(), 0.0F, 1.2F);
		if (mouthTalks && config.eyeMovement && this.mouth.syllableStarted()) {
			// Googly pupils jiggle with the words.
			this.eyes.shakePupils(1.6F * ex * (0.4F + this.mouth.syllableStrength()));
		}
		if (screaming && config.eyeMovement && (this.age & 1) == 0) {
			this.eyes.shakePupils(1.3F * ex);
		}

		// Eye size: talking and screaming growth come from smooth envelopes, so when a hit (or the end
		// of talking) switches them off the eyes shrink back instead of jumping.
		float talkGrowth = (TALK_GROWTH + SYLLABLE_GROWTH * accent) * energy;
		float growth = eyeGrowth * Mth.lerp(screamAmount, talkGrowth, SCREAM_GROWTH);
		if (reacting) {
			growth = Math.max(growth, 0.22F * Math.min(this.reaction.intensity(), 1.8F));
		}
		float expressionEyes = ExpressionProfile.scaled(1.0F, profile.eyeScale(), profileIntensity);
		if (mouthTalks) {
			this.talkEyeScale = expressionEyes;
		} else if (!reacting && this.expressionTicks <= 0) {
			// The talking expression's own eye size (e.g. surprised) fades out with the talk energy.
			growth += (this.talkEyeScale - expressionEyes) * Mth.clamp(energy, 0.0F, 1.0F);
		}
		boolean spiral = this.reaction.spiralVisible(0.0F);
		boolean blinkAllowed = config.blinking && !spiral && mood != Expression.SURPRISED && mood != Expression.SCREAMING;
		if (!config.blinking) {
			// Turning blinking off also stops a blink that is happening right now.
			this.eyes.cancelBlink();
		}
		// After talking the eyes deflate gently (no springy undershoot); otherwise they stay bouncy.
		boolean relaxing = !mouthTalks && !reacting && energy > 0.01F;
		this.eyes.tick(in, profile, profileIntensity, growth, relaxing ? 0.8F : 0.36F, config.eyeMovement, blinkAllowed, speed, DT);
		this.brows.tick(profile, profileIntensity, config.eyebrowAnimations, mouthTalks, accent, reacting,
			this.eyes.blinkClosedness(0.0F), screamAmount, ex, time, speed, DT);
		this.reaction.tick(config, speed, DT);

		// The head nods on stressed syllables and is thrown back while screaming.
		float nodTarget = mouthTalks ? accent * 0.15F * ex * Math.max(0.5F, intensity) * (1.0F - screamAmount) : 0.0F;
		nodTarget -= 0.14F * ex * screamAmount;
		this.headNod.step(nodTarget, 6.0F * speed, 0.5F, DT);

		// Real-time timers keep running whatever is on top.
		if (this.talkTicks > 0) {
			this.talkTicks--;
		}
		if (this.expressionTicks > 0) {
			this.expressionTicks--;
		}
		if (this.voiceAge < Integer.MAX_VALUE) {
			this.voiceAge++;
			if (!this.voiceActive()) {
				this.voiceLevel = 0.0F;
			}
		}
	}

	/** Yelling into the microphone for a moment turns talking into screaming (with some hysteresis). */
	private void updateVoiceScream(boolean voiceUsed) {
		if (!voiceUsed) {
			this.loudVoiceTicks = 0;
			this.voiceScreaming = false;
			return;
		}
		if (this.voiceLevel >= SCREAM_LEVEL) {
			this.loudVoiceTicks = Math.min(this.loudVoiceTicks + 1, 30);
		} else if (!this.voiceScreaming || this.voiceLevel < SCREAM_RELEASE_LEVEL) {
			this.loudVoiceTicks = Math.max(this.loudVoiceTicks - 3, 0);
		}
		this.voiceScreaming = this.voiceScreaming ? this.loudVoiceTicks > 0 : this.loudVoiceTicks >= SCREAM_TICKS;
	}

	/** Builds an interpolated snapshot for rendering. */
	public FacePose pose(float partialTick, EyeBallConfig config) {
		FacePose pose = new FacePose();
		float recovery = config.hitReactions ? this.reaction.recoveryClosedness(partialTick) : 0.0F;
		this.eyes.fill(pose, partialTick, recovery);
		this.brows.fill(pose, partialTick);
		this.mouth.fill(pose, partialTick);
		if (config.hitReactions) {
			this.reaction.fill(pose, partialTick);
		}
		if (!config.headWobble) {
			pose.wobbleX = pose.wobbleY = pose.wobbleZ = 0.0F;
			pose.leanX = pose.leanZ = 0.0F;
		}
		if (!config.cartoonStars) {
			pose.stars = 0.0F;
		}
		pose.headNod = this.headNod.get(partialTick);
		pose.time = (this.age + partialTick) * DT;
		pose.talking = this.isTalking(config);
		pose.talkEnergy = Mth.clamp(this.talkEnergy.get(partialTick), 0.0F, 1.3F);
		pose.scream = Mth.clamp(this.scream.get(partialTick), 0.0F, 1.0F);

		// Procedural head motion, evaluated per frame so it stays smooth at any frame rate:
		// a lazy sway while talking, a fast shake while screaming.
		float t = (this.age + partialTick) * DT * config.animationSpeed;
		float ex = config.exaggeration;
		float talkSway = Math.min(pose.talkEnergy, 1.0F) * (1.0F - pose.scream);
		pose.headShake = ex * (0.06F * talkSway * Mth.sin(t * 2.3F + this.swayPhase)
			+ 0.1F * pose.scream * Mth.sin(t * TWO_PI * 6.5F));
		pose.headRoll = ex * (0.05F * talkSway * Mth.sin(t * 1.7F + this.rollPhase)
			+ 0.035F * pose.scream * Mth.sin(t * TWO_PI * 4.1F));
		if (pose.scream > 0.0F) {
			// Trembling eyes.
			for (int i = 0; i < 2; i++) {
				pose.eyeScale[i] = Math.min(EyeAnimator.MAX_SCALE,
					pose.eyeScale[i] * (1.0F + 0.035F * pose.scream * ex * Mth.sin(t * TWO_PI * 9.0F + i * 1.9F)));
			}
		}
		return pose;
	}
}
