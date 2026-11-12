package com.nottorzz.eyeball.client.config;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Every user setting. Serialised to {@code config/eyeball.json} by {@link ConfigManager}.
 * Changes take effect immediately because the renderer reads these fields every frame.
 */
public final class EyeBallConfig {
	public static final float EYE_SIZE_MIN = 0.5F, EYE_SIZE_MAX = 2.0F;
	public static final float PUPIL_SIZE_MIN = 0.5F, PUPIL_SIZE_MAX = 1.6F;
	public static final float MOUTH_SIZE_MIN = 0.5F, MOUTH_SIZE_MAX = 1.8F;
	public static final float BROW_SIZE_MIN = 0.5F, BROW_SIZE_MAX = 2.0F;
	public static final float ANIM_SPEED_MIN = 0.5F, ANIM_SPEED_MAX = 2.0F;
	public static final float SPIRAL_SPEED_MIN = 0.25F, SPIRAL_SPEED_MAX = 4.0F;
	public static final float REACTION_DURATION_MIN = 0.5F, REACTION_DURATION_MAX = 4.0F;
	public static final float REACTION_INTENSITY_MIN = 0.25F, REACTION_INTENSITY_MAX = 2.0F;
	public static final float EXPRESSION_INTENSITY_MIN = 0.0F, EXPRESSION_INTENSITY_MAX = 2.0F;
	public static final float EYE_SPACING_MIN = 0.7F, EYE_SPACING_MAX = 1.4F;
	public static final float CHARACTER_SIZE_MIN = 0.75F, CHARACTER_SIZE_MAX = 1.5F;

	// --- Modes ---
	public boolean googlyEyes = true;
	public boolean elmo = false;

	// --- Animations ---
	public boolean talkingAnimations = true;
	public boolean eyebrows = true;
	public boolean eyebrowAnimations = true;
	public boolean eyeMovement = true;
	public boolean blinking = true;
	public boolean voiceLipSync = true;

	// --- Hit reactions ---
	public boolean hitReactions = true;
	public boolean spiralEyes = true;
	public boolean headWobble = true;
	public boolean cartoonStars = true;
	/** Rotations per second. */
	public float spiralSpeed = 1.5F;
	/** Seconds. */
	public float reactionDuration = 1.6F;
	public float reactionIntensity = 1.0F;

	// --- Appearance ---
	public float eyeSize = 1.0F;
	public float pupilSize = 1.0F;
	public float mouthSize = 1.0F;
	public float eyebrowSize = 1.0F;
	public float eyeSpacing = 1.0F;
	public float characterSize = 1.0F;
	public float animationSpeed = 1.0F;
	public float expressionIntensity = 1.0F;

	// --- Targets (per effect, so Googly Eyes and Elmo are independently controllable) ---
	public boolean selfGoogly = true;
	public boolean selfElmo = true;
	public boolean everyoneGoogly = true;
	public boolean everyoneElmo = false;
	/** Show the looks other modded players chose (or the server applied). Needs the mod on the server. */
	public boolean showSyncedLooks = true;
	/** Tell the server which look you chose, so other modded players see it. */
	public boolean shareMyLook = true;
	/** Per-player overrides, keyed by UUID string. */
	public Map<String, PlayerOverride> playerOverrides = new LinkedHashMap<>();

	public static EyeBallConfig defaults() {
		return new EyeBallConfig();
	}

	public @Nullable PlayerOverride override(UUID player) {
		return this.playerOverrides.get(player.toString());
	}

	public PlayerOverride getOrCreateOverride(UUID player, String name) {
		PlayerOverride override = this.playerOverrides.computeIfAbsent(player.toString(), key -> new PlayerOverride());
		override.name = name;
		return override;
	}

	public void clearOverride(UUID player) {
		this.playerOverrides.remove(player.toString());
	}

	/** Copies every value from {@code other} (used by "Reset to Defaults" and when loading). */
	public void copyFrom(EyeBallConfig other) {
		this.googlyEyes = other.googlyEyes;
		this.elmo = other.elmo;
		this.talkingAnimations = other.talkingAnimations;
		this.eyebrows = other.eyebrows;
		this.eyebrowAnimations = other.eyebrowAnimations;
		this.eyeMovement = other.eyeMovement;
		this.blinking = other.blinking;
		this.voiceLipSync = other.voiceLipSync;
		this.hitReactions = other.hitReactions;
		this.spiralEyes = other.spiralEyes;
		this.headWobble = other.headWobble;
		this.cartoonStars = other.cartoonStars;
		this.spiralSpeed = other.spiralSpeed;
		this.reactionDuration = other.reactionDuration;
		this.reactionIntensity = other.reactionIntensity;
		this.eyeSize = other.eyeSize;
		this.pupilSize = other.pupilSize;
		this.mouthSize = other.mouthSize;
		this.eyebrowSize = other.eyebrowSize;
		this.eyeSpacing = other.eyeSpacing;
		this.characterSize = other.characterSize;
		this.animationSpeed = other.animationSpeed;
		this.expressionIntensity = other.expressionIntensity;
		this.selfGoogly = other.selfGoogly;
		this.selfElmo = other.selfElmo;
		this.everyoneGoogly = other.everyoneGoogly;
		this.everyoneElmo = other.everyoneElmo;
		this.showSyncedLooks = other.showSyncedLooks;
		this.shareMyLook = other.shareMyLook;
		this.playerOverrides = new LinkedHashMap<>();
		if (other.playerOverrides != null) {
			other.playerOverrides.forEach((key, value) -> this.playerOverrides.put(key, value.copy()));
		}
	}

	/** Repairs values from a hand-edited or outdated file. */
	public void sanitize() {
		this.spiralSpeed = clamp(this.spiralSpeed, SPIRAL_SPEED_MIN, SPIRAL_SPEED_MAX, 1.5F);
		this.reactionDuration = clamp(this.reactionDuration, REACTION_DURATION_MIN, REACTION_DURATION_MAX, 1.6F);
		this.reactionIntensity = clamp(this.reactionIntensity, REACTION_INTENSITY_MIN, REACTION_INTENSITY_MAX, 1.0F);
		this.eyeSize = clamp(this.eyeSize, EYE_SIZE_MIN, EYE_SIZE_MAX, 1.0F);
		this.pupilSize = clamp(this.pupilSize, PUPIL_SIZE_MIN, PUPIL_SIZE_MAX, 1.0F);
		this.mouthSize = clamp(this.mouthSize, MOUTH_SIZE_MIN, MOUTH_SIZE_MAX, 1.0F);
		this.eyebrowSize = clamp(this.eyebrowSize, BROW_SIZE_MIN, BROW_SIZE_MAX, 1.0F);
		this.eyeSpacing = clamp(this.eyeSpacing, EYE_SPACING_MIN, EYE_SPACING_MAX, 1.0F);
		this.characterSize = clamp(this.characterSize, CHARACTER_SIZE_MIN, CHARACTER_SIZE_MAX, 1.0F);
		this.animationSpeed = clamp(this.animationSpeed, ANIM_SPEED_MIN, ANIM_SPEED_MAX, 1.0F);
		this.expressionIntensity = clamp(this.expressionIntensity, EXPRESSION_INTENSITY_MIN, EXPRESSION_INTENSITY_MAX, 1.0F);
		if (this.playerOverrides == null) {
			this.playerOverrides = new LinkedHashMap<>();
		}
		this.playerOverrides.values().removeIf(override -> override == null || override.isEmpty());
		this.playerOverrides.keySet().removeIf(key -> {
			try {
				UUID.fromString(key);
				return false;
			} catch (IllegalArgumentException e) {
				return true;
			}
		});
	}

	private static float clamp(float value, float min, float max, float fallback) {
		if (Float.isNaN(value) || Float.isInfinite(value)) {
			return fallback;
		}
		return Math.clamp(value, min, max);
	}

	/** Explicit per-player choice. {@code null} means "use the global targets". */
	public static final class PlayerOverride {
		public String name = "";
		public @Nullable Boolean googly;
		public @Nullable Boolean elmo;

		public boolean isEmpty() {
			return this.googly == null && this.elmo == null;
		}

		public PlayerOverride copy() {
			PlayerOverride copy = new PlayerOverride();
			copy.name = this.name;
			copy.googly = this.googly;
			copy.elmo = this.elmo;
			return copy;
		}
	}
}
