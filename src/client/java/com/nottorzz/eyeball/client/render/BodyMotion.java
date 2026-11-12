package com.nottorzz.eyeball.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.nottorzz.eyeball.client.anim.FacePose;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Pose;
import org.joml.Quaternionf;

/**
 * Whole-body and head motion added on top of vanilla animations:
 * <ul>
 *     <li>hit stagger: the whole body tips back and sways, pivoting at the feet,</li>
 *     <li>Elmo bounces a little with every step,</li>
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
		if (data.elmo && state.walkAnimationSpeed > 0.01F) {
			float step = Math.abs(Mth.sin(state.walkAnimationPos * 0.6662F));
			poseStack.translate(0.0F, step * Math.min(state.walkAnimationSpeed, 1.0F) * 0.085F, 0.0F);
		}
		if (pose.leanX != 0.0F || pose.leanZ != 0.0F) {
			poseStack.last().rotate(new Quaternionf().rotateX(pose.leanX).rotateZ(pose.leanZ));
		}
	}

	/** Called at the end of {@code PlayerModel.setupAnim}, so it also runs at draw time. */
	public static void applyToModel(PlayerModel model, FaceRenderData data) {
		FacePose pose = data.pose;
		float nod = pose.headNod * (data.elmo ? 1.7F : 1.0F);
		model.head.xRot += pose.wobbleX + nod;
		model.head.yRot += pose.wobbleY + pose.headShake;
		model.head.zRot += pose.wobbleZ + pose.headRoll;
		if (data.elmo && data.characterSize != 1.0F) {
			model.head.xScale = data.characterSize;
			model.head.yScale = data.characterSize;
			model.head.zScale = data.characterSize;
		}
		if (data.elmo && (pose.talking || pose.scream > 0.01F)) {
			// Elmo talks with his arms a little (and flails them when he screams).
			float wave = Mth.sin(pose.time * 7.0F) * 0.12F * (1.0F - pose.scream);
			model.rightArm.zRot += wave + pose.scream * (0.55F + Mth.sin(pose.time * 31.0F) * 0.12F);
			model.leftArm.zRot -= wave + pose.scream * (0.55F + Mth.sin(pose.time * 29.0F) * 0.12F);
		}
	}

	private static boolean isUpright(AvatarRenderState state) {
		return (state.pose == Pose.STANDING || state.pose == Pose.CROUCHING)
			&& state.deathTime <= 0.0F && !state.isFallFlying && !state.isAutoSpinAttack && state.swimAmount <= 0.0F;
	}
}
