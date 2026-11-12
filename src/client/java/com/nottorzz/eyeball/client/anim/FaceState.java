package com.nottorzz.eyeball.client.anim;

import com.nottorzz.eyeball.Expression;
import com.nottorzz.eyeball.client.config.EyeBallConfig;
import java.util.UUID;

/**
 * All animation state for one face. Combines the separate systems ({@link EyeAnimator},
 * {@link BrowAnimator}, {@link MouthAnimator}, {@link DamageReaction}) and decides which one is in
 * charge with a strict priority, so animations never fight each other:
 * <pre>
 *   1. Hit reaction (spiral eyes)      - highest
 *   2. Deliberate expression (keybind / command)
 *   3. Talking (chat or voice) with the expression detected from the message
 *   4. Idle (looking around, blinking)
 * </pre>
 * Timers keep running underneath, so after a hit the face goes back to talking if the player is
 * still talking, otherwise to the normal face. Every value moves through springs, so even
 * priority switches blend smoothly.
 */
public final class FaceState {
	private static final float DT = 1.0F / 20.0F;
	private static final int VOICE_HOLD_TICKS = 5;

	public final UUID id;
	private final EyeAnimator eyes;
	private final BrowAnimator brows = new BrowAnimator();
	private final MouthAnimator mouth;
	private final DamageReaction reaction;
	private final Spring headNod = new Spring(0.0F);

	private int age;
	private int talkTicks;
	private Expression talkExpression = Expression.TALKING;
	private int expressionTicks;
	private Expression expression = Expression.NEUTRAL;
	private float voiceLevel;
	private int voiceAge = Integer.MAX_VALUE;
	private int lastTalkStartAge = Integer.MIN_VALUE / 2;
	private Expression activeMood = Expression.NEUTRAL;

	/** Bookkeeping for {@link FaceAnimationManager}. */
	long lastRenderTick;
	long lastSeenTick;

	public FaceState(UUID id) {
		this.id = id;
		long seed = id.getMostSignificantBits() ^ Long.rotateLeft(id.getLeastSignificantBits(), 17);
		this.eyes = new EyeAnimator(seed);
		this.mouth = new MouthAnimator(seed);
		this.reaction = new DamageReaction(seed);
	}

	// ------------------------------------------------------------------ events

	/** Starts talking. If already talking (e.g. chat + server relay of the same message) it just extends. */
	public void talk(Expression detected, int ticks) {
		boolean duplicate = this.age - this.lastTalkStartAge < 30 && this.talkTicks > 0;
		this.talkTicks = duplicate ? Math.max(this.talkTicks, ticks) : ticks;
		if (!duplicate || detected != Expression.TALKING) {
			this.talkExpression = detected;
		}
		this.lastTalkStartAge = this.age;
		if (detected == Expression.SURPRISED || detected == Expression.EXCITED) {
			this.eyes.pop(2.5F);
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
		return this.talkTicks > 0 || this.expressionTicks > 0 || this.reaction.settling() || this.voiceActive();
	}

	public int talkTicksLeft() {
		return this.talkTicks;
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

		this.headNod.beginTick();
		boolean reacting = this.reaction.active() && config.hitReactions;
		boolean talking = this.isTalking(config);

		// ---- Priority: hit reaction > deliberate expression > talking > idle ----
		Expression mood;
		if (reacting) {
			mood = Expression.DIZZY;
		} else if (this.expressionTicks > 0) {
			mood = this.expression;
		} else if (talking) {
			mood = this.talkExpression;
		} else {
			mood = Expression.NEUTRAL;
		}
		this.activeMood = mood;
		ExpressionProfile profile = ExpressionProfile.of(mood);
		// While reacting the talking mouth is paused (timers keep running underneath).
		boolean mouthTalks = !reacting && (talking || mood == Expression.LAUGHING);
		float profileIntensity = reacting ? 1.0F : intensity;

		float voice = this.voiceActive() && config.voiceLipSync ? this.voiceLevel : -1.0F;
		this.mouth.tick(profile, profileIntensity, mouthTalks, voice, reacting, time, speed, DT);
		float accent = this.mouth.accent();

		float eyePop = 0.0F;
		if (reacting) {
			eyePop = 0.22F * Math.min(this.reaction.intensity(), 1.8F);
		} else if (mouthTalks) {
			eyePop = 0.04F + accent * 0.05F;
		}
		boolean spiral = this.reaction.spiralVisible(0.0F);
		boolean blinkAllowed = config.blinking && !spiral && mood != Expression.SURPRISED;
		this.eyes.tick(in, profile, profileIntensity, eyePop, config.eyeMovement, blinkAllowed, speed, DT);
		this.brows.tick(profile, profileIntensity, config.eyebrowAnimations, mouthTalks, accent, reacting,
			this.eyes.blinkClosedness(0.0F), time, speed, DT);
		this.reaction.tick(config, speed, DT);

		// Head moves when talking: little nods on stressed syllables.
		float nodTarget = mouthTalks ? accent * 0.12F * Math.max(0.5F, intensity) : 0.0F;
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
		return pose;
	}

}
