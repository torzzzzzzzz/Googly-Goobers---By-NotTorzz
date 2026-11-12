package com.nottorzz.eyeball.client.anim;

import com.nottorzz.eyeball.Expression;
import java.util.EnumMap;
import java.util.Map;

/**
 * The look of each {@link Expression}: targets the springs move toward. "Expression Intensity"
 * scales every value's distance from {@link #NEUTRAL}.
 *
 * @param eyeScale      eyeball size multiplier
 * @param pupilScale    pupil size multiplier (small pupils = shocked, big = excited)
 * @param squint        0 = open, 1 = happy squint
 * @param browLift      eyebrow height in pixels (positive = up)
 * @param browAngle     eyebrow tilt in radians (positive = inner ends down = angry)
 * @param browAsym      one brow up, the other down (confused)
 * @param mouthBase     how open the mouth is when not mid-syllable (0..1)
 * @param talkAmplitude extra opening per syllable while talking (0..1)
 * @param mouthWidth    mouth width multiplier
 * @param smile         -1 = frown, 1 = big smile
 * @param dShape        0 = round "O" mouth, 1 = flat-topped "D" laughing mouth
 * @param teeth         0..1 how much of the teeth show (1 also shows the bottom row)
 * @param talkRate      syllables per second while talking
 * @param pupilLift     pupils drift up (+) or down (-), in eye-radius units
 */
public record ExpressionProfile(
	float eyeScale,
	float pupilScale,
	float squint,
	float browLift,
	float browAngle,
	float browAsym,
	float mouthBase,
	float talkAmplitude,
	float mouthWidth,
	float smile,
	float dShape,
	float teeth,
	float talkRate,
	float pupilLift
) {
	public static final ExpressionProfile NEUTRAL = new ExpressionProfile(
		1.0F, 1.0F, 0.0F, 0.0F, 0.0F, 0.0F, 0.0F, 0.6F, 1.0F, 0.35F, 0.0F, 0.0F, 6.5F, 0.0F);

	private static final Map<Expression, ExpressionProfile> PROFILES = new EnumMap<>(Expression.class);

	static {
		PROFILES.put(Expression.NEUTRAL, NEUTRAL);
		PROFILES.put(Expression.TALKING, new ExpressionProfile(
			1.05F, 1.0F, 0.0F, 0.25F, 0.0F, 0.0F, 0.05F, 0.65F, 1.0F, 0.3F, 0.1F, 0.25F, 6.5F, 0.0F));
		PROFILES.put(Expression.SMALL_TALK, new ExpressionProfile(
			1.0F, 1.0F, 0.0F, 0.15F, 0.0F, 0.0F, 0.0F, 0.32F, 0.7F, 0.25F, 0.0F, 0.0F, 7.5F, 0.0F));
		PROFILES.put(Expression.WIDE_OPEN, new ExpressionProfile(
			1.15F, 0.85F, 0.0F, 0.9F, -0.1F, 0.0F, 0.4F, 0.6F, 1.35F, 0.05F, 0.25F, 0.5F, 5.0F, 0.0F));
		PROFILES.put(Expression.SURPRISED, new ExpressionProfile(
			1.3F, 0.68F, 0.0F, 1.4F, -0.22F, 0.0F, 0.55F, 0.3F, 0.62F, 0.0F, 0.0F, 0.0F, 5.0F, 0.08F));
		PROFILES.put(Expression.EXCITED, new ExpressionProfile(
			1.18F, 1.18F, 0.0F, 0.95F, -0.12F, 0.0F, 0.32F, 0.5F, 1.3F, 0.95F, 0.75F, 0.65F, 7.5F, 0.05F));
		PROFILES.put(Expression.ANGRY, new ExpressionProfile(
			0.95F, 0.8F, 0.32F, -0.75F, 0.5F, 0.0F, 0.14F, 0.42F, 1.2F, -0.75F, 0.0F, 1.0F, 6.0F, 0.0F));
		PROFILES.put(Expression.LAUGHING, new ExpressionProfile(
			1.0F, 1.0F, 0.68F, 0.65F, -0.18F, 0.0F, 0.42F, 0.48F, 1.32F, 1.0F, 0.9F, 0.7F, 9.5F, 0.0F));
		PROFILES.put(Expression.HAPPY, new ExpressionProfile(
			1.04F, 1.05F, 0.22F, 0.45F, -0.12F, 0.0F, 0.04F, 0.4F, 1.12F, 0.85F, 0.3F, 0.2F, 6.5F, 0.0F));
		PROFILES.put(Expression.CONFUSED, new ExpressionProfile(
			1.04F, 0.92F, 0.0F, 0.3F, 0.15F, 1.0F, 0.04F, 0.35F, 0.72F, -0.3F, 0.0F, 0.0F, 5.0F, 0.3F));
		PROFILES.put(Expression.DIZZY, new ExpressionProfile(
			1.28F, 1.0F, 0.0F, 1.25F, -0.15F, 0.55F, 0.78F, 0.0F, 0.78F, -0.12F, 0.0F, 0.0F, 0.0F, 0.0F));
	}

	public static ExpressionProfile of(Expression expression) {
		return PROFILES.getOrDefault(expression, NEUTRAL);
	}

	/** Moves every value away from neutral by {@code intensity} (0 = neutral, 1 = as designed, 2 = double). */
	public static float scaled(float neutral, float value, float intensity) {
		return neutral + (value - neutral) * intensity;
	}
}
