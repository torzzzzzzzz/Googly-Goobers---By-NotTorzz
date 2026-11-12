package com.nottorzz.eyeball.client.anim;

import com.nottorzz.eyeball.Appearance;
import com.nottorzz.eyeball.Expression;
import com.nottorzz.eyeball.client.config.ConfigManager;
import com.nottorzz.eyeball.client.config.EyeBallConfig;
import com.nottorzz.eyeball.client.render.FaceRenderData;
import com.nottorzz.eyeball.client.target.TargetResolver;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Owns one {@link FaceState} per player and drives them.
 * <p>
 * Performance rules:
 * <ul>
 *     <li>A face is only simulated while it was rendered in the last two seconds, or while
 *     something is still playing (talking, a hit reaction). Players out of sight cost nothing.</li>
 *     <li>States of players who left are dropped after a few seconds; everything is cleared on disconnect.</li>
 *     <li>Nothing runs in the background: all work happens on the client tick and while rendering.</li>
 * </ul>
 * Client thread only.
 */
public final class FaceAnimationManager {
	public static final FaceAnimationManager INSTANCE = new FaceAnimationManager();
	private static final int VISIBLE_GRACE_TICKS = 40;
	private static final int FORGET_AFTER_TICKS = 100;
	private static final double GLANCE_RANGE = 12.0;

	private final Map<UUID, FaceState> states = new HashMap<>();
	private final FaceInputs inputs = new FaceInputs();
	private long tick;
	/** Faces simulated during the last tick (exposed for the performance test). */
	private int simulatedLastTick;

	private FaceAnimationManager() {
	}

	// ------------------------------------------------------------------ ticking

	public void tick(Minecraft minecraft) {
		ClientLevel level = minecraft.level;
		if (level == null) {
			if (!this.states.isEmpty()) {
				this.states.clear();
			}
			return;
		}
		if (minecraft.isPaused()) {
			return;
		}
		this.tick++;
		EyeBallConfig config = ConfigManager.get();
		int simulated = 0;
		Iterator<Map.Entry<UUID, FaceState>> iterator = this.states.entrySet().iterator();
		while (iterator.hasNext()) {
			FaceState state = iterator.next().getValue();
			Player player = level.getPlayerByUUID(state.id);
			if (!(player instanceof AbstractClientPlayer clientPlayer)) {
				if (this.tick - state.lastSeenTick > FORGET_AFTER_TICKS) {
					iterator.remove();
				}
				continue;
			}
			state.lastSeenTick = this.tick;
			boolean visible = this.tick - state.lastRenderTick <= VISIBLE_GRACE_TICKS;
			if (!visible && !state.isBusy()) {
				continue;
			}
			this.gatherInputs(minecraft, clientPlayer, this.inputs);
			state.tick(this.inputs, config);
			simulated++;
		}
		this.simulatedLastTick = simulated;
	}

	private void gatherInputs(Minecraft minecraft, AbstractClientPlayer player, FaceInputs in) {
		in.reset();
		in.headYaw = player.getYHeadRot();
		in.headYawRelative = Mth.wrapDegrees(player.getYHeadRot() - player.yBodyRot);
		in.headPitch = player.getXRot();
		in.velX = player.getX() - player.xo;
		in.velY = player.getY() - player.yo;
		in.velZ = player.getZ() - player.zo;
		in.onGround = player.onGround();
		in.walkSpeed = player.walkAnimation.speed();
		in.walkPosition = player.walkAnimation.position();
		in.crouching = player.isCrouching();

		// Look at the camera (you!) when close, otherwise at the nearest other player.
		Vec3 eye = player.getEyePosition();
		Vec3 target = null;
		Vec3 camera = minecraft.gameRenderer.mainCamera().position();
		boolean selfInFirstPerson = player == minecraft.getCameraEntity() && !minecraft.gameRenderer.mainCamera().isDetached();
		if (!selfInFirstPerson && camera.distanceToSqr(eye) < GLANCE_RANGE * GLANCE_RANGE && camera.distanceToSqr(eye) > 0.04) {
			target = camera;
		} else {
			double best = GLANCE_RANGE * GLANCE_RANGE;
			for (Player other : player.level().players()) {
				if (other == player) {
					continue;
				}
				double distance = other.distanceToSqr(player);
				if (distance < best) {
					best = distance;
					target = other.getEyePosition();
				}
			}
		}
		if (target != null) {
			Vec3 d = target.subtract(eye);
			double horizontal = Math.sqrt(d.x * d.x + d.z * d.z);
			float yawTo = (float) (Mth.atan2(d.z, d.x) * Mth.RAD_TO_DEG) - 90.0F;
			float relativeYaw = Mth.wrapDegrees(yawTo - player.getYHeadRot());
			float pitchTo = (float) (-(Mth.atan2(d.y, horizontal) * Mth.RAD_TO_DEG));
			float relativePitch = pitchTo - player.getXRot();
			if (Math.abs(relativeYaw) < 100.0F) {
				in.glanceX = -Mth.clamp(relativeYaw / 50.0F, -1.0F, 1.0F) * 0.85F;
				in.glanceY = Mth.clamp(-relativePitch / 50.0F, -1.0F, 1.0F) * 0.65F;
			}
		}
	}

	// ------------------------------------------------------------------ rendering

	/** Called while extracting a player's render state: attaches this frame's face (or nothing). */
	public void extract(AbstractClientPlayer player, AvatarRenderState renderState, float partialTick) {
		int flags = TargetResolver.resolve(player);
		if (flags == Appearance.NONE) {
			// Render states are created fresh every frame, so there is nothing to clear.
			return;
		}
		FaceState state = this.stateFor(player.getUUID());
		state.lastRenderTick = this.tick;
		EyeBallConfig config = ConfigManager.get();
		renderState.setData(FaceRenderData.KEY,
			new FaceRenderData(flags, state.pose(partialTick, config), config, renderState.distanceToCameraSq, 0.0F));
	}

	public FaceState stateFor(UUID player) {
		FaceState state = this.states.get(player);
		if (state == null) {
			state = new FaceState(player);
			state.lastRenderTick = this.tick;
			state.lastSeenTick = this.tick;
			this.states.put(player, state);
		}
		return state;
	}

	public @Nullable FaceState existingState(UUID player) {
		return this.states.get(player);
	}

	// ------------------------------------------------------------------ events

	/** A player said something in chat. */
	public void onChat(UUID player, String message) {
		EyeBallConfig config = ConfigManager.get();
		if (!config.talkingAnimations || !this.isPresent(player)) {
			return;
		}
		this.stateFor(player).talk(ExpressionDetector.detect(message), ExpressionDetector.talkTicks(message));
	}

	/** Talking relayed by a modded server (works even when the server reformats chat). */
	public void onTalk(UUID player, Expression expression, int ticks) {
		if (!ConfigManager.get().talkingAnimations || !this.isPresent(player)) {
			return;
		}
		this.stateFor(player).talk(expression, ticks);
	}

	public void onExpression(UUID player, Expression expression, int ticks) {
		if (!this.isPresent(player)) {
			return;
		}
		this.stateFor(player).express(expression, ticks);
	}

	public void onReaction(UUID player, float strength) {
		if (!this.isPresent(player)) {
			return;
		}
		this.stateFor(player).hit(strength, ConfigManager.get());
	}

	/** A player took damage (from any source: players, mobs, falling, fire, ...). */
	public void onDamage(AbstractClientPlayer player, @Nullable DamageSource source) {
		float strength = 1.0F;
		if (source != null) {
			if (source.is(DamageTypeTags.IS_EXPLOSION)) {
				strength = 1.4F;
			} else if (source.is(DamageTypeTags.IS_FALL)) {
				strength = 0.9F;
			} else if (source.is(DamageTypeTags.IS_FIRE)) {
				strength = 0.75F;
			}
		}
		this.stateFor(player.getUUID()).hit(strength, ConfigManager.get());
	}

	public void onVoice(UUID player, float level) {
		if (!ConfigManager.get().voiceLipSync || !ConfigManager.get().talkingAnimations || !this.isPresent(player)) {
			return;
		}
		this.stateFor(player).voice(level);
	}

	public void clear() {
		this.states.clear();
	}

	public int simulatedLastTick() {
		return this.simulatedLastTick;
	}

	public int trackedFaces() {
		return this.states.size();
	}

	private boolean isPresent(UUID player) {
		Minecraft minecraft = Minecraft.getInstance();
		return minecraft.level != null && minecraft.level.getPlayerByUUID(player) != null;
	}
}
