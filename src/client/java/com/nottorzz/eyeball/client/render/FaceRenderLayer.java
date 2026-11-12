package com.nottorzz.eyeball.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.nottorzz.eyeball.EyeBallMod;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;
import org.joml.Quaternionf;

/**
 * Draws the cartoon face on a player model. Attached to every player renderer (wide and slim arms)
 * and to the Elmo renderer.
 * <p>
 * The geometry is built in the head bone's own space (root transform, then head transform, exactly
 * like vanilla head layers), so the face follows every head rotation, crouch, swim and animation,
 * and other mods that pose the head. It is submitted as custom geometry with an entity cutout
 * render type, so it gets normal entity lighting, fog and the glowing outline.
 */
public final class FaceRenderLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
	public static final Identifier WHITE_TEXTURE = EyeBallMod.id("textures/entity/white.png");
	private static final RenderType RENDER_TYPE = RenderTypes.entityCutout(WHITE_TEXTURE);

	/** Statistics for the performance test. */
	private static long submittedFaces;
	private static long submitNanos;

	public FaceRenderLayer(RenderLayerParent<AvatarRenderState, PlayerModel> renderer) {
		super(renderer);
	}

	@Override
	public void submit(PoseStack poseStack, SubmitNodeCollector collector, int lightCoords, AvatarRenderState state, float yRot, float xRot) {
		FaceRenderData data = state.getData(FaceRenderData.KEY);
		if (data == null || state.isInvisible || state.isSpectator) {
			return;
		}
		PlayerModel model = this.getParentModel();
		if (!model.head.visible) {
			return;
		}
		long start = System.nanoTime();
		FaceAnchor anchor = data.elmo ? FaceAnchor.ELMO : FaceAnchor.PLAYER;
		float forward = headwearOffset(state, data);

		poseStack.pushPose();
		model.root().translateAndRotate(poseStack);
		model.head.translateAndRotate(poseStack);
		poseStack.scale(1.0F / 16.0F, 1.0F / 16.0F, 1.0F / 16.0F);
		poseStack.translate(0.0F, anchor.headCenterY(), anchor.frontZ() - forward);
		// Model space -> face space: u = +x, v = up, w = out of the face.
		// (Pose.rotate is used directly because it exists in every supported Minecraft version.)
		poseStack.last().rotate(new Quaternionf().rotateX(Mth.PI));
		if (!data.elmo && data.characterSize != 1.0F) {
			poseStack.scale(data.characterSize, data.characterSize, data.characterSize);
		}
		collector.submitCustomGeometry(poseStack, RENDER_TYPE,
			(pose, buffer) -> FaceMeshBuilder.build(new MeshWriter(pose, buffer, lightCoords), data, anchor));
		poseStack.popPose();
		submittedFaces++;
		submitNanos += System.nanoTime() - start;
	}

	/** Pushes the face forward when something is worn on the head, so the eyes stay on top. */
	private static float headwearOffset(AvatarRenderState state, FaceRenderData data) {
		if (data.elmo) {
			return 0.0F;
		}
		if (state.wornHeadType != null || !state.headItem.isEmpty()) {
			return 1.3F;
		}
		if (!state.headEquipment.isEmpty()) {
			return 1.05F;
		}
		return 0.0F;
	}

	public static long submittedFaces() {
		return submittedFaces;
	}

	public static long submitNanos() {
		return submitNanos;
	}
}
