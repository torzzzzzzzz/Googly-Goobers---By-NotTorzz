package com.nottorzz.eyeball.client.gui;

import com.nottorzz.eyeball.Appearance;
import com.nottorzz.eyeball.Expression;
import com.nottorzz.eyeball.client.anim.FaceInputs;
import com.nottorzz.eyeball.client.anim.FaceState;
import com.nottorzz.eyeball.client.config.EyeBallConfig;
import com.nottorzz.eyeball.client.render.FaceRenderData;
import java.util.UUID;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

/**
 * Drives the menu's preview character: its own face (separate from every real player), looping the
 * selected preview so you can see exactly how each effect looks with your current settings.
 * The preview ignores the main Googly Eyes switch (so you can preview before turning it on) but
 * follows every other setting.
 */
public final class PreviewController {
	private static final UUID PREVIEW_ID = UUID.fromString("e7eba11e-0000-4000-8000-000000000001");
	private static final Expression[] TALK_CYCLE = {
		Expression.TALKING, Expression.EXCITED, Expression.LAUGHING, Expression.SURPRISED, Expression.HAPPY
	};

	public enum Mode {
		GOOGLY("googly"),
		TALKING("talking"),
		SCREAMING("screaming"),
		BLINKING("blinking"),
		SURPRISED("surprised"),
		ANGRY("angry"),
		LAUGHING("laughing"),
		CONFUSED("confused"),
		SPIRAL("spiral");

		private final String key;

		Mode(String key) {
			this.key = key;
		}

		public Component label() {
			return Component.translatable("eyeball.preview." + this.key);
		}

		public boolean isHit() {
			return this == SPIRAL;
		}
	}

	private final FaceInputs inputs = new FaceInputs();
	private FaceState face = new FaceState(PREVIEW_ID);
	private Mode mode = Mode.GOOGLY;
	private int age;
	private int cycle;
	private int talkIndex;

	public Mode mode() {
		return this.mode;
	}

	public void setMode(Mode mode) {
		this.mode = mode;
		this.face = new FaceState(PREVIEW_ID);
		this.cycle = 0;
		this.talkIndex = 0;
	}

	public FaceState face() {
		return this.face;
	}

	public void tick(EyeBallConfig config) {
		this.age++;
		this.cycle++;
		float t = this.age / 20.0F;
		this.inputs.reset();
		// Gentle head motion so the googly pupils have something to react to.
		this.inputs.headYaw = Mth.sin(t * 0.8F) * 28.0F;
		this.inputs.headYawRelative = Mth.sin(t * 0.8F) * 18.0F;
		this.inputs.headPitch = Mth.sin(t * 0.55F) * 10.0F;
		// The preview character glances at you.
		this.inputs.glanceX = 0.0F;
		this.inputs.glanceY = 0.05F;

		switch (this.mode) {
			case TALKING -> {
				if (this.cycle % 64 == 1) {
					Expression expression = TALK_CYCLE[this.talkIndex++ % TALK_CYCLE.length];
					this.face.talk(expression, 54);
				}
			}
			case SCREAMING -> {
				// Scream for three seconds, then a short break so you can see it blend in and out.
				if (this.cycle % 84 == 1) {
					this.face.express(Expression.SCREAMING, 60);
				}
			}
			case LAUGHING -> {
				if (this.cycle % 64 == 1) {
					this.face.talk(Expression.LAUGHING, 54);
				}
			}
			case BLINKING -> {
				if (this.cycle % 22 == 1) {
					this.face.forceBlink();
				}
			}
			case SURPRISED -> {
				if (this.cycle % 70 == 1) {
					this.face.express(Expression.SURPRISED, 70);
				}
				if (this.cycle % 70 == 20) {
					this.face.talk(Expression.SURPRISED, 18);
				}
			}
			case ANGRY -> {
				if (this.cycle % 70 == 1) {
					this.face.express(Expression.ANGRY, 70);
					this.face.talk(Expression.ANGRY, 34);
				}
			}
			case CONFUSED -> {
				if (this.cycle % 70 == 1) {
					this.face.express(Expression.CONFUSED, 70);
				}
				if (this.cycle % 70 == 24) {
					this.face.talk(Expression.CONFUSED, 22);
				}
			}
			case SPIRAL -> {
				int loop = Math.round(config.reactionDuration * 20.0F) + 30;
				if (this.cycle % loop == 8) {
					this.face.hit(1.0F, config);
				}
			}
			default -> {
			}
		}
		this.face.tick(this.inputs, config);
	}

	/** Head turn relative to the body (degrees) used to pose the preview character. */
	public float headYaw() {
		return this.inputs.headYawRelative;
	}

	public float headPitch() {
		return this.inputs.headPitch;
	}

	public int age() {
		return this.age;
	}

	/** Face data for the preview character this frame. */
	public FaceRenderData renderData(float partialTick, EyeBallConfig config) {
		return new FaceRenderData(Appearance.GOOGLY, this.face.pose(partialTick, config), config, 0.0);
	}
}
