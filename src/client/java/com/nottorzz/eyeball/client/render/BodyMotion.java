package com.nottorzz.eyeball.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.nottorzz.eyeball.client.anim.FacePose;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.world.entity.Pose;
import org.joml.Quaternionf;

/**
 * Whole-body and head motion added on top of vanilla animations:
 * <ul>
 *     <li>hit stagger: the whole body tips back and sways, pivoting at the feet,</li>
 *     <li>head wobble after a hit, head nods and a lazy sway while talking, and a fast head shake
 *     (with the head thrown back) while screaming.</li>
 * </ul>
 * Applied to the pose stack / model parts (never to the entity), so it is purely visual.
 */
public final class BodyMotion {
	private BodyMotion() {
	}

	/** Called at the end of the renderer's body rotation setup (origin at the feet). */
	public static void applyToBody(AvatarRenderState state, PoseStack poseStack, FaceRenderData data) {
		if (!isUpright(state)) {
			return;
		}
		FacePose pose = data.pose;
		if (pose.leanX != 0.0F || pose.leanZ != 0.0F) {
			poseStack.last().rotate(new Quaternionf().rotateX(pose.leanX).rotateZ(pose.leanZ));
		}
	}

	/** Called at the end of {@code PlayerModel.setupAnim}, so it also runs at draw time. */
	public static void applyToModel(PlayerModel model, FaceRenderData data) {
		FacePose pose = data.pose;
		model.head.xRot += pose.wobbleX + pose.headNod;
		model.head.yRot += pose.wobbleY + pose.headShake;
		model.head.zRot += pose.wobbleZ + pose.headRoll;
	}

	private static boolean isUpright(AvatarRenderState state) {
		return (state.pose == Pose.STANDING || state.pose == Pose.CROUCHING)
			&& state.deathTime <= 0.0F && !state.isFallFlying && !state.isAutoSpinAttack && state.swimAmount <= 0.0F;
	}
}
